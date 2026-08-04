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
 */
class SecureStorageKeyStore(private val context: Context) {

    @Volatile
    private var cachedSecureStorageKey: SecretKey? = null

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
        private const val SECURE_STORAGE_CIPHER = "AES/GCM/NoPadding"
        private const val SECURE_STORAGE_LOG_TAG = "AegisSecureStorage"
    }
}
