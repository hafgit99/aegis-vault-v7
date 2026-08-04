package com.hafgit99.aegisvault7.model

import android.view.autofill.AutofillId
import org.json.JSONObject

data class PendingSave(val requestId: String, val bytes: ByteArray)

data class AndroidImportFile(val name: String, val contents: String)

data class AutofillSaveCandidate(
    val requestId: String,
    val createdAt: Long,
    val title: String,
    val username: String,
    val password: String,
    val url: String?,
    val appPackage: String?,
    val webDomain: String?,
    val payloadUri: String? = null,
    val payloadToken: String? = null,
) {
    fun requiresUriResolution(): Boolean =
        payloadUri != null && payloadToken != null

    fun toJson(): JSONObject {
        val base = JSONObject()
            .put("requestId", requestId)
            .put("createdAt", createdAt)
            .put("source", "android-autofill-save")
            .put("title", title)
            .put("username", username)
            .put("password", password)
            .put("url", url)
            .put("appPackage", appPackage)
            .put("webDomain", webDomain)

        if (payloadUri != null) base.put("payloadUri", payloadUri)
        if (payloadToken != null) base.put("payloadToken", payloadToken)
        return base
    }
}

data class AutofillLaunchRequest(
    val requestId: String,
    val createdAt: Long,
    val appPackage: String?,
    val webDomain: String?,
    val usernameIds: ArrayList<AutofillId>,
    val passwordIds: ArrayList<AutofillId>,
) {
    fun isFresh(now: Long = System.currentTimeMillis()): Boolean {
        val ageMs = now - createdAt
        return ageMs in 0..AUTOFILL_REQUEST_MAX_AGE_MS
    }

    fun toJson(): JSONObject =
        JSONObject()
            .put("requestId", requestId)
            .put("createdAt", createdAt)
            .put("source", "android-autofill")
            .put("appPackage", appPackage)
            .put("webDomain", webDomain)
            .put("usernameFieldCount", usernameIds.size)
            .put("passwordFieldCount", passwordIds.size)
            .put("fillableFieldCount", usernameIds.size + passwordIds.size)

    companion object {
        const val AUTOFILL_REQUEST_MAX_AGE_MS = 2 * 60 * 1000L
    }
}
