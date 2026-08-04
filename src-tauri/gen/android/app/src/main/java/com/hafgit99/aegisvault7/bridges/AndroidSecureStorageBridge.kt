package com.hafgit99.aegisvault7.bridges

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import android.webkit.JavascriptInterface
import com.hafgit99.aegisvault7.crypto.SecureStorageKeyStore

class AndroidSecureStorageBridge(
    private val context: Context,
    private val keyStore: SecureStorageKeyStore
) {
    private fun securePreferences(): SharedPreferences =
        context.getSharedPreferences(SECURE_PREFS_NAME, Context.MODE_PRIVATE)

    private fun preferenceKey(key: String): String =
        "secure.$key"

    @JavascriptInterface
    fun getItem(key: String): String? {
        return try {
            val encryptedPayload = securePreferences().getString(preferenceKey(key), null) ?: return null
            keyStore.decryptSecureValue(encryptedPayload)
        } catch (error: Exception) {
            Log.e(SECURE_STORAGE_LOG_TAG, "Failed to retrieve or decrypt secure item for key '$key': ${error.message}", error)
            null
        }
    }

    @JavascriptInterface
    fun setItem(key: String, value: String): Boolean {
        return try {
            val encrypted = keyStore.encryptSecureValue(value)
            securePreferences()
                .edit()
                .putString(preferenceKey(key), encrypted)
                .apply()
            true
        } catch (error: Exception) {
            Log.e(SECURE_STORAGE_LOG_TAG, "Failed to encrypt or store secure item for key '$key': ${error.message}", error)
            false
        }
    }

    @JavascriptInterface
    fun removeItem(key: String): Boolean {
        return try {
            securePreferences().edit().remove(preferenceKey(key)).apply()
            true
        } catch (error: Exception) {
            Log.e(SECURE_STORAGE_LOG_TAG, "Failed to remove secure item for key '$key': ${error.message}", error)
            false
        }
    }

    companion object {
        private const val SECURE_PREFS_NAME = "aegis_secure_storage"
        private const val SECURE_STORAGE_LOG_TAG = "AegisSecureStorage"
    }
}
