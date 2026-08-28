package com.hafgit99.aegisvault7.bridges

import android.util.Base64
import android.util.Log
import android.webkit.JavascriptInterface
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.hafgit99.aegisvault7.crypto.SecureStorageKeyStore
import java.util.concurrent.Executor
import javax.crypto.Cipher
import org.json.JSONObject

/**
 * Bridges the biometric-bound AndroidKeyStore wrapping key (RUST-O4) to the
 * WebView frontend. Exposes only opaque-wrap operations: `wrap`/`unwrap`
 * exchange base64 payloads and an opaque JSON handle. Both run Android's
 * BiometricPrompt with a CryptoObject so the OS auth token is cryptographically
 * bound to the key; cancellation/failure rejects fail-closed.
 */
class AndroidBiometricKeyStoreBridge(
    private val activity: FragmentActivity,
    private val keyStore: SecureStorageKeyStore,
    private val onEvaluateJs: (String) -> Unit,
) {
    private val executor: Executor = ContextCompat.getMainExecutor(activity)

    @JavascriptInterface
    fun isAvailable(): Boolean = keyStore.isBiometricWrappingKeyAvailable

    @JavascriptInterface
    fun clear(): Boolean {
        keyStore.deleteBiometricWrappingKey()
        return true
    }

    @JavascriptInterface
    fun wrap(plaintextB64: String, callbackId: String) {
        val plaintext: ByteArray = try {
            Base64.decode(plaintextB64, Base64.NO_WRAP)
        } catch (error: Exception) {
            reject(callbackId, "Invalid base64 plaintext")
            return
        }
        activity.runOnUiThread {
            try {
                val cipher = keyStore.newBiometricCipher(Cipher.ENCRYPT_MODE)
                val prompt = newPrompt(callbackId, cipher, plaintext, isWrap = true)
                prompt.authenticate(promptInfo(), BiometricPrompt.CryptoObject(cipher))
            } catch (error: Exception) {
                reject(callbackId, "Encrypt setup failed: ${error.message}")
            }
        }
    }

    @JavascriptInterface
    fun unwrap(handleJson: String, callbackId: String) {
        val ivBase64: String
        val ciphertext: ByteArray
        try {
            val handle = JSONObject(handleJson)
            if (handle.optInt("v", 0) != 2) throw IllegalArgumentException("Unsupported handle version")
            ivBase64 = handle.getString("iv")
            ciphertext = Base64.decode(handle.getString("ct"), Base64.NO_WRAP)
        } catch (error: Exception) {
            reject(callbackId, "Invalid wrapped handle: ${error.message}")
            return
        }
        activity.runOnUiThread {
            try {
                val cipher = keyStore.newBiometricCipher(Cipher.DECRYPT_MODE, ivBase64)
                val prompt = newPrompt(callbackId, cipher, ciphertext, isWrap = false)
                prompt.authenticate(promptInfo(), BiometricPrompt.CryptoObject(cipher))
            } catch (error: Exception) {
                reject(callbackId, "Decrypt setup failed: ${error.message}")
            }
        }
    }

    private fun newPrompt(callbackId: String, cipher: Cipher, input: ByteArray, isWrap: Boolean): BiometricPrompt {
        return BiometricPrompt(
            activity,
            executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    val cryptoCipher = result.cryptoObject?.cipher
                    try {
                        if (cryptoCipher == null) throw IllegalStateException("No cipher in auth result")
                        val output = cryptoCipher.doFinal(input)
                        // BUGFIX (RUST-O4 follow-up): only the wrap result is an
                        // opaque JSON handle. A decrypt cipher ALWAYS has a
                        // non-null IV (it is set explicitly via GCMParameterSpec),
                        // so wrapping the unwrap result in the same envelope
                        // corrupted the secret and broke every Android unlock
                        // with an integrity failure on the JS side.
                        val value = if (isWrap) {
                            JSONObject()
                                .put("v", 2)
                                .put("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
                                .put("ct", Base64.encodeToString(output, Base64.NO_WRAP))
                                .toString()
                        } else {
                            Base64.encodeToString(output, Base64.NO_WRAP)
                        }
                        resolve(callbackId, value)
                    } catch (error: Exception) {
                        reject(callbackId, "Biometric crypto operation failed: ${error.message}")
                    }
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    reject(callbackId, if (isCancellation(errorCode, errString)) "cancelled" else "Biometric failed: $errString")
                }

                override fun onAuthenticationFailed() {
                    // NOT terminal: BiometricPrompt keeps the dialog open so the
                    // user can retry in place. Rejecting here would fail the JS
                    // promise while the prompt is still on screen.
                    Log.w("AegisBiometric", "Biometric attempt not recognized; awaiting retry")
                }
            }
        )
    }

    private fun promptInfo(): BiometricPrompt.PromptInfo =
        BiometricPrompt.PromptInfo.Builder()
            .setTitle("Aegis Vault")
            .setSubtitle("Confirm your identity to access your vault")
            .setNegativeButtonText("Cancel")
            .setAllowedAuthenticators(androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .build()

    private fun isCancellation(code: Int, message: CharSequence): Boolean {
        val msg = message.toString().lowercase()
        return code == BiometricPrompt.ERROR_NEGATIVE_BUTTON ||
            code == BiometricPrompt.ERROR_USER_CANCELED ||
            msg.contains("cancel")
    }

    private fun resolve(callbackId: String, value: String) {
        val script = "window.__aegisBiometric && window.__aegisBiometric.resolve(" +
            "${JSONObject.quote(callbackId)}, ${JSONObject.quote(value)})"
        onEvaluateJs(script)
    }

    private fun reject(callbackId: String, message: String) {
        Log.w("AegisBiometric", "Biometric bridge rejection: $message")
        val script = "window.__aegisBiometric && window.__aegisBiometric.reject(" +
            "${JSONObject.quote(callbackId)}, ${JSONObject.quote(message)})"
        onEvaluateJs(script)
    }
}