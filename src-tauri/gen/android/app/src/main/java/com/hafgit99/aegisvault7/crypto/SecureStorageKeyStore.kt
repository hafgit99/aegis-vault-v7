package com.hafgit99.aegisvault7.crypto

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject

/**
 * Thread-safe wrapper around Android KeyStore for AES-256-GCM encrypted
 * preference storage used by Aegis Vault.
 *
 * Two distinct keys are managed:
 *  - The general-purpose AES-GCM key encrypts non-sensitive metadata and is
 *    intentionally NOT auth-bound so normal reads do not require a prompt.
 *  - The biometric-bound AES-GCM key (RUST-O4) wraps the biometric wrapping
 *    secret: it requires strong biometric authentication (BiometricPrompt +
 *    CryptoObject) and is invalidated on biometric enrollment changes, so a
 *    rooted attacker cannot silently swap the key to read the wrapped secret.
 */
class SecureStorageKeyStore(private val context: Context) {

    @Volatile
    private var cachedSecureStorageKey: SecretKey? = null

    @Volatile
    private var cachedBiometricWrappingKey: SecretKey? = null

    val isBiometricWrappingKeyAvailable: Boolean
        get() {
            return try {
                val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
                keyStore.containsAlias(SECURE_STORAGE_BIOMETRIC_ALIAS)
            } catch (error: Exception) {
                Log.w(SECURE_STORAGE_LOG_TAG, "Failed to query biometric key availability: ${error.message}")
                false
            }
        }

    @Synchronized
    private fun getOrCreateSecureStorageKey(): SecretKey {
        cachedSecureStorageKey?.let { return it }

        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        val existingKey = keyStore.getKey(SECURE_STORAGE_KEY_ALIAS, null)
        if (existingKey is SecretKey) {
            cachedSecureStorageKey = existingKey
            return existingKey
        }

        val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        val keySpecBuilder = KeyGenParameterSpec.Builder(
            SECURE_STORAGE_KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            keySpecBuilder.setUnlockedDeviceRequired(true)
        }

        keyGenerator.init(keySpecBuilder.build())
        val generatedKey = keyGenerator.generateKey()
        cachedSecureStorageKey = generatedKey
        return generatedKey
    }

    /**
     * Creates or loads the biometric-bound wrapping key. The key is tied to
     * strong biometric authentication: every cipher operation must be backed by
     * a fresh authentication token from a BiometricPrompt CryptoObject, and the
     * key is permanently invalidated when a biometric is enrolled/removed.
     */
    @Synchronized
    private fun getOrCreateBiometricWrappingKey(): SecretKey {
        cachedBiometricWrappingKey?.let { return it }

        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        val existingKey = keyStore.getKey(SECURE_STORAGE_BIOMETRIC_ALIAS, null)
        if (existingKey is SecretKey) {
            cachedBiometricWrappingKey = existingKey
            return existingKey
        }

        val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        val builder = KeyGenParameterSpec.Builder(
            SECURE_STORAGE_BIOMETRIC_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .setUserAuthenticationRequired(true)
            .setInvalidatedByBiometricEnrollment(true)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            builder.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
        } else {
            builder.setUserAuthenticationValidityDurationSeconds(-1)
        }

        keyGenerator.init(builder.build())
        val generated = keyGenerator.generateKey()
        cachedBiometricWrappingKey = generated
        return generated
    }

    /**
     * Returns a Cipher initialized in [mode] backed by the biometric-bound key.
     * For [Cipher.ENCRYPT_MODE] a fresh IV is generated (available via [Cipher.getIV]).
     * For [Cipher.DECRYPT_MODE] [ivBase64] is required to reconstruct the GCM spec.
     * The caller must perform doFinal only after a successful BiometricPrompt
     * authentication so the key's auth requirement is satisfied.
     */
    fun newBiometricCipher(mode: Int, ivBase64: String? = null): Cipher {
        val cipher = Cipher.getInstance(SECURE_STORAGE_CIPHER)
        val key = getOrCreateBiometricWrappingKey()
        if (mode == Cipher.DECRYPT_MODE) {
            val ivBytes = ivBase64?.let { Base64.decode(it, Base64.NO_WRAP) }
                ?: throw IllegalArgumentException("Decrypt mode requires an IV")
            cipher.init(mode, key, GCMParameterSpec(GCM_TAG_LENGTH_BITS, ivBytes))
        } else {
            cipher.init(mode, key)
        }
        return cipher
    }

    /** Permanently invalidates the biometric-bound key (e.g. on protection disable). */
    fun deleteBiometricWrappingKey() {
        try {
            val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
            if (keyStore.containsAlias(SECURE_STORAGE_BIOMETRIC_ALIAS)) {
                keyStore.deleteEntry(SECURE_STORAGE_BIOMETRIC_ALIAS)
            }
            cachedBiometricWrappingKey = null
        } catch (error: Exception) {
            Log.e(SECURE_STORAGE_LOG_TAG, "Failed to delete biometric wrapping key: ${error.message}", error)
        }
    }

    fun encryptSecureValue(value: String): String {
        val cipher = Cipher.getInstance(SECURE_STORAGE_CIPHER)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateSecureStorageKey())
        val ciphertext = cipher.doFinal(value.toByteArray(StandardCharsets.UTF_8))

        return JSONObject()
            .put("version", 1)
            .put("cipher", "AndroidKeyStore AES-256-GCM")
            .put("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .put("ciphertext", Base64.encodeToString(ciphertext, Base64.NO_WRAP))
            .toString()
    }

    fun decryptSecureValue(payload: String): String? {
        val json = JSONObject(payload)
        val version = json.optInt("version", 1)
        return when (version) {
            1 -> decryptV1Payload(json)
            else -> {
                Log.e(SECURE_STORAGE_LOG_TAG, "Unsupported secure storage payload version: $version")
                null
            }
        }
    }

    private fun decryptV1Payload(json: JSONObject): String {
        val iv = Base64.decode(json.getString("iv"), Base64.NO_WRAP)
        val ciphertext = Base64.decode(json.getString("ciphertext"), Base64.NO_WRAP)
        val cipher = Cipher.getInstance(SECURE_STORAGE_CIPHER)
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateSecureStorageKey(), GCMParameterSpec(128, iv))
        val plaintext = cipher.doFinal(ciphertext)
        return String(plaintext, StandardCharsets.UTF_8)
    }

    companion object {
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val SECURE_STORAGE_KEY_ALIAS = "aegis_vault_v7_secure_storage"
        private const val SECURE_STORAGE_BIOMETRIC_ALIAS = "aegis_vault_v7_biometric_wrapping"
        private const val SECURE_STORAGE_CIPHER = "AES/GCM/NoPadding"
        private const val GCM_TAG_LENGTH_BITS = 128
        private const val SECURE_STORAGE_LOG_TAG = "AegisSecureStorage"
    }
}
