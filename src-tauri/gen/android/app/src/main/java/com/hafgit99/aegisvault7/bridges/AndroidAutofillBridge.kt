package com.hafgit99.aegisvault7.bridges

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.service.autofill.Dataset
import android.service.autofill.FillResponse
import android.util.Log
import android.view.autofill.AutofillManager
import android.view.autofill.AutofillValue
import android.webkit.JavascriptInterface
import android.widget.RemoteViews
import com.hafgit99.aegisvault7.MainActivity
import com.hafgit99.aegisvault7.R
import com.hafgit99.aegisvault7.model.AutofillLaunchRequest
import com.hafgit99.aegisvault7.model.AutofillSaveCandidate
import com.hafgit99.aegisvault7.security.SecureTempFileStorage
import java.nio.charset.StandardCharsets
import org.json.JSONObject

class AndroidAutofillBridge(
    private val activity: MainActivity,
    private val getPendingAutofillRequest: () -> AutofillLaunchRequest?,
    private val setPendingAutofillRequest: (AutofillLaunchRequest?) -> Unit,
    private val getPendingAutofillSaveCandidate: () -> AutofillSaveCandidate?,
    private val setPendingAutofillSaveCandidate: (AutofillSaveCandidate?) -> Unit,
) {
    @JavascriptInterface
    fun isSupported(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
        return activity.getSystemService(AutofillManager::class.java)?.isAutofillSupported == true
    }

    @JavascriptInterface
    fun isEnabled(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
        return activity.getSystemService(AutofillManager::class.java)?.hasEnabledAutofillServices() == true
    }

    @JavascriptInterface
    fun openSettings(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false

        return try {
            activity.startActivity(Intent(Settings.ACTION_REQUEST_SET_AUTOFILL_SERVICE))
            true
        } catch (_: Exception) {
            try {
                activity.startActivity(Intent(Settings.ACTION_INPUT_METHOD_SETTINGS))
                true
            } catch (error: Exception) {
                Log.w(AUTOFILL_LOG_TAG, "Failed to launch Android Autofill settings intent: ${error.message}")
                false
            }
        }
    }

    @JavascriptInterface
    fun getPendingRequest(): String? {
        val current = getPendingAutofillRequest() ?: return null
        if (!current.isFresh()) {
            setPendingAutofillRequest(null)
            return null
        }
        return current.toJson().toString()
    }

    @JavascriptInterface
    fun clearPendingRequest(requestId: String): Boolean {
        val current = getPendingAutofillRequest() ?: return true
        if (current.requestId != requestId) {
            Log.w(
                AUTOFILL_LOG_TAG,
                "clearPendingRequest mismatch: pendingRequestId=${current.requestId}, requestedId=$requestId"
            )
            return false
        }
        setPendingAutofillRequest(null)
        return true
    }

    @JavascriptInterface
    fun getPendingSaveCandidate(): String? {
        return getPendingAutofillSaveCandidate()?.toJson()?.toString()
    }

    @JavascriptInterface
    fun resolveEncryptedSavePayload(requestId: String): String? {
        val current = getPendingAutofillSaveCandidate() ?: return null
        if (current.requestId != requestId) return null
        if (!current.requiresUriResolution()) {
            return current.toJson().toString()
        }

        val token = current.payloadToken ?: return null
        val plaintext = try {
            SecureTempFileStorage(activity).consume(token)
        } catch (error: Exception) {
            Log.w(AUTOFILL_LOG_TAG, "Failed to resolve encrypted save payload: ${error.message ?: "unknown"}")
            null
        }

        val resolved = if (plaintext != null) {
            try {
                val parsed = JSONObject(String(plaintext, StandardCharsets.UTF_8))
                current.copy(
                    password = parsed.optString("password", ""),
                    title = parsed.optString("title", current.title).ifBlank { current.title },
                    username = parsed.optString("username", current.username).ifBlank { current.username },
                    url = parsed.optString("url", current.url.orEmpty()).ifBlank { current.url },
                )
            } catch (error: Exception) {
                Log.w(AUTOFILL_LOG_TAG, "Decrypted payload was not valid JSON: ${error.message ?: "unknown"}")
                null
            }
        } else {
            null
        }

        if (resolved == null) {
            setPendingAutofillSaveCandidate(null)
            return null
        }

        setPendingAutofillSaveCandidate(resolved)
        return resolved.toJson().toString()
    }

    @JavascriptInterface
    fun clearPendingSaveCandidate(requestId: String): Boolean {
        val current = getPendingAutofillSaveCandidate() ?: return true
        if (current.requestId != requestId) return false
        try {
            SecureTempFileStorage(activity).purge()
        } catch (error: Exception) {
            Log.w(AUTOFILL_LOG_TAG, "Temp file purge failed: ${error.message ?: "unknown"}")
        }
        setPendingAutofillSaveCandidate(null)
        return true
    }

    @JavascriptInterface
    fun completePendingRequest(requestId: String, username: String, password: String, label: String): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false

        val current = getPendingAutofillRequest() ?: return false
        if (current.requestId != requestId) return false
        if (!current.isFresh()) {
            setPendingAutofillRequest(null)
            return false
        }
        if (current.passwordIds.isEmpty()) return false

        return try {
            val presentationLabel = label.ifBlank { "Aegis Vault" }
            val datasetBuilder = Dataset.Builder(createAutofillPresentation(presentationLabel))
            current.usernameIds.forEach { autofillId ->
                datasetBuilder.setValue(autofillId, AutofillValue.forText(username))
            }
            current.passwordIds.forEach { autofillId ->
                datasetBuilder.setValue(autofillId, AutofillValue.forText(password))
            }

            val response = FillResponse.Builder()
                .addDataset(datasetBuilder.build())
                .build()

            val result = Intent().putExtra(AutofillManager.EXTRA_AUTHENTICATION_RESULT, response)
            activity.setResult(Activity.RESULT_OK, result)
            Log.i(
                AUTOFILL_LOG_TAG,
                "Autofill audit event [COMPLETED]: requestId=$requestId appPackage=${current.appPackage ?: "unknown"} webDomain=${current.webDomain ?: "unknown"} usernameFields=${current.usernameIds.size} passwordFields=${current.passwordIds.size}"
            )
            setPendingAutofillRequest(null)
            activity.finish()
            true
        } catch (error: Exception) {
            Log.e(
                AUTOFILL_LOG_TAG,
                "Autofill audit event [ERROR]: completePendingRequest failed for requestId=$requestId: ${error.message}",
                error
            )
            false
        }
    }

    private fun createAutofillPresentation(label: String): RemoteViews {
        return RemoteViews(activity.packageName, android.R.layout.simple_list_item_1).apply {
            setTextViewText(android.R.id.text1, label)
        }
    }

    companion object {
        private const val AUTOFILL_LOG_TAG = "AegisAutofill"
    }
}
