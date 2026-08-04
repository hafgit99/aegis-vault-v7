package com.hafgit99.aegisvault7

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.service.autofill.AutofillService
import android.service.autofill.FillCallback
import android.service.autofill.FillRequest
import android.service.autofill.FillResponse
import android.service.autofill.SaveCallback
import android.service.autofill.SaveInfo
import android.service.autofill.SaveRequest
import android.text.InputType
import android.util.Log
import android.view.View
import android.view.autofill.AutofillId
import android.app.assist.AssistStructure
import android.widget.RemoteViews
import androidx.annotation.RequiresApi
import androidx.core.content.FileProvider
import com.hafgit99.aegisvault7.security.SecureTempFileStorage
import org.json.JSONObject

@RequiresApi(Build.VERSION_CODES.O)
class AegisAutofillService : AutofillService() {
  private val requestCodeCounter = java.util.concurrent.atomic.AtomicInteger(1000)
  override fun onFillRequest(
    request: FillRequest,
    cancellationSignal: android.os.CancellationSignal,
    callback: FillCallback,
  ) {
    if (cancellationSignal.isCanceled) {
      callback.onSuccess(null)
      return
    }

    val structure = request.fillContexts.lastOrNull()?.structure
    val loginFields = structure?.let { collectLoginFields(it) }
    if (loginFields == null || !loginFields.hasFillableLogin()) {
      Log.i(
        AUTOFILL_LOG_TAG,
        "FillRequest ignored package=${loginFields?.appPackage ?: structure?.activityComponent?.packageName ?: "unknown"} " +
          "domain=${loginFields?.webDomain ?: "unknown"} usernameFields=${loginFields?.usernameIds?.size ?: 0} " +
          "passwordFields=${loginFields?.passwordIds?.size ?: 0} fillableFields=${loginFields?.allIds()?.size ?: 0}"
      )
      callback.onSuccess(null)
      return
    }

    Log.i(
      AUTOFILL_LOG_TAG,
      "FillRequest accepted package=${loginFields.appPackage ?: "unknown"} domain=${loginFields.webDomain ?: "unknown"} " +
        "usernameFields=${loginFields.usernameIds.size} passwordFields=${loginFields.passwordIds.size} fillableFields=${loginFields.allIds().size}"
    )

    val authenticationIds = loginFields.allIds().toTypedArray()
    @Suppress("DEPRECATION")
    val response = FillResponse.Builder()
      .setAuthentication(authenticationIds, createAuthenticationIntent(loginFields).intentSender, createAuthenticationPresentation())
      .setSaveInfo(createSaveInfo(loginFields))
      .build()

    callback.onSuccess(response)
  }

  override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
    val structure = request.fillContexts.lastOrNull()?.structure
    val candidate = structure?.let { collectSaveCandidate(it) }

    if (candidate == null || candidate.password.isBlank()) {
      Log.i(AUTOFILL_LOG_TAG, "SaveRequest ignored; no password value was available")
      callback.onSuccess()
      return
    }

    val createdAt = System.currentTimeMillis()
    val requestId = "android-autofill-save-$createdAt"

    try {
      val (payloadUri, token) = stashEncryptedPayload(requestId, candidate)
        ?: run {
          Log.w(AUTOFILL_LOG_TAG, "SaveRequest could not stage encrypted payload")
          callback.onSuccess()
          return
        }

      val intent = Intent(this, MainActivity::class.java).apply {
        action = ACTION_AUTOFILL_SAVE
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        // The Intent now carries only non-sensitive metadata. The password
        // travels through the FileProvider URI + decryption token and never
        // touches the Binder transaction buffer.
        putExtra(EXTRA_AUTOFILL_SAVE_REQUEST_ID, requestId)
        putExtra(EXTRA_AUTOFILL_SAVE_CREATED_AT, createdAt)
        putExtra(EXTRA_AUTOFILL_SAVE_TITLE, candidate.title())
        putExtra(EXTRA_AUTOFILL_SAVE_USERNAME, candidate.username)
        putExtra(EXTRA_AUTOFILL_SAVE_PAYLOAD_URI, payloadUri.toString())
        putExtra(EXTRA_AUTOFILL_SAVE_PAYLOAD_TOKEN, token)
        putExtra(EXTRA_AUTOFILL_SAVE_URL, candidate.url())
        putExtra(EXTRA_AUTOFILL_APP_PACKAGE, candidate.appPackage)
        putExtra(EXTRA_AUTOFILL_WEB_DOMAIN, candidate.webDomain)
      }
      startActivity(intent)
      Log.i(
        AUTOFILL_LOG_TAG,
        "SaveRequest forwarded to Aegis package=${candidate.appPackage ?: "unknown"} " +
          "domain=${candidate.webDomain ?: "unknown"} payload=encrypted",
      )
    } catch (error: Exception) {
      Log.w(AUTOFILL_LOG_TAG, "SaveRequest could not launch Aegis: ${error.message ?: "unknown"}")
    }

    callback.onSuccess()
  }

  /**
   * Writes [candidate] to a short-lived AES-256-GCM encrypted file inside the
   * app's private cache directory and returns a FileProvider URI plus a
   * decryption token. Returns null if staging fails for any reason, in which
   * case the caller must abort the autofill save flow to avoid leaking the
   * password through alternative channels.
   */
  private fun stashEncryptedPayload(
    requestId: String,
    candidate: SaveCandidate,
  ): Pair<Uri, String>? {
    val tempStorage = SecureTempFileStorage(applicationContext)

    val payload = JSONObject().apply {
      put("requestId", requestId)
      put("title", candidate.title())
      put("username", candidate.username)
      put("password", candidate.password)
      put("url", candidate.url())
      put("appPackage", candidate.appPackage ?: JSONObject.NULL)
      put("webDomain", candidate.webDomain ?: JSONObject.NULL)
    }

    val (token, cacheFile) = try {
      tempStorage.stashWithFile(payload.toString().toByteArray(Charsets.UTF_8))
    } catch (error: Exception) {
      Log.w(AUTOFILL_LOG_TAG, "Failed to encrypt save payload: ${error.message ?: "unknown"}")
      return null
    }

    val authority = "${packageName}.fileprovider"
    val uri = try {
      FileProvider.getUriForFile(applicationContext, authority, cacheFile)
    } catch (error: Exception) {
      Log.w(AUTOFILL_LOG_TAG, "FileProvider URI build failed: ${error.message ?: "unknown"}")
      cacheFile.delete()
      return null
    }

    return uri to token
  }

  private fun collectLoginFields(structure: AssistStructure): LoginFields {
    val fields = LoginFields(appPackage = structure.activityComponent?.packageName)

    for (windowIndex in 0 until structure.windowNodeCount) {
      traverseNode(structure.getWindowNodeAt(windowIndex).rootViewNode, fields)
    }

    return fields
  }

  private fun collectSaveCandidate(structure: AssistStructure): SaveCandidate {
    val candidate = SaveCandidate(appPackage = structure.activityComponent?.packageName)

    for (windowIndex in 0 until structure.windowNodeCount) {
      traverseSaveNode(structure.getWindowNodeAt(windowIndex).rootViewNode, candidate)
    }

    return candidate
  }

  private fun traverseNode(node: AssistStructure.ViewNode, fields: LoginFields, depth: Int = 0) {
    if (depth > MAX_TRAVERSAL_DEPTH) return

    val domain = extractDomainFromNode(node)
    if (fields.webDomain.isNullOrBlank() && !domain.isNullOrBlank()) {
      fields.webDomain = domain
    }

    val autofillId = node.autofillId
    if (autofillId != null && node.visibility == View.VISIBLE) {
      when {
        isPasswordField(node) -> fields.passwordIds.add(autofillId)
        isUsernameField(node) -> fields.usernameIds.add(autofillId)
      }
    }

    for (childIndex in 0 until node.childCount) {
      traverseNode(node.getChildAt(childIndex), fields, depth + 1)
    }
  }

  private fun traverseSaveNode(node: AssistStructure.ViewNode, candidate: SaveCandidate, depth: Int = 0) {
    if (depth > MAX_TRAVERSAL_DEPTH) return

    val domain = extractDomainFromNode(node)
    if (candidate.webDomain.isNullOrBlank() && !domain.isNullOrBlank()) {
      candidate.webDomain = domain
    }

    val value = node.autofillValue?.takeIf { it.isText }?.textValue?.toString().orEmpty()
    if (value.isNotBlank()) {
      when {
        isPasswordField(node) && candidate.password.isBlank() -> candidate.password = value
        isUsernameField(node) && candidate.username.isBlank() -> candidate.username = value.trim()
      }
    }

    for (childIndex in 0 until node.childCount) {
      traverseSaveNode(node.getChildAt(childIndex), candidate, depth + 1)
    }
  }

  private fun extractDomainFromNode(node: AssistStructure.ViewNode): String? {
    node.webDomain?.trim()?.takeIf { it.isNotBlank() }?.let { return it }

    node.htmlInfo?.attributes?.forEach { attr ->
      val name = attr?.first ?: ""
      val value = attr?.second ?: ""
      val key = name.lowercase()
      if (key == "host" || key == "domain" || key == "data-domain" || key == "action") {
        val parsed = parseHostFromUrl(value)
        if (!parsed.isNullOrBlank()) return parsed
      }
    }
    return null
  }

  private fun parseHostFromUrl(raw: String): String? {
    return try {
      val uri = Uri.parse(if (raw.startsWith("http")) raw else "https://$raw")
      uri.host?.trim()?.takeIf { it.isNotBlank() }
    } catch (_: Exception) {
      null
    }
  }

  private fun isPasswordField(node: AssistStructure.ViewNode): Boolean {
    val hints = node.autofillHints?.map { it.lowercase() }.orEmpty()
    if (hints.any { it.contains("password") || it.contains("credential") }) return true

    val variation = node.inputType and InputType.TYPE_MASK_VARIATION
    val isPasswordType = variation == InputType.TYPE_TEXT_VARIATION_PASSWORD ||
      variation == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD ||
      variation == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD ||
      variation == InputType.TYPE_NUMBER_VARIATION_PASSWORD

    if (isPasswordType) return true

    val tokens = node.searchTokens()
    val negativeTokens = setOf("reset", "forgot", "link", "button", "change")
    if (tokens.any { token -> negativeTokens.any { neg -> token == neg } }) return false

    return tokens.any { it == "password" || it == "passwd" || it == "pwd" || it.contains("pass_word") }
  }

  private fun isUsernameField(node: AssistStructure.ViewNode): Boolean {
    val hints = node.autofillHints?.map { it.lowercase() }.orEmpty()
    if (hints.any { it.contains("username") || it.contains("email") }) return true

    val tokens = node.searchTokens()
    val negativeTokens = setOf("agent", "profile", "avatar", "icon", "image", "button", "search", "header")
    if (tokens.any { token -> negativeTokens.any { neg -> token.contains(neg) } }) return false

    return tokens.any {
      it == "username" ||
        it == "user" ||
        it == "email" ||
        it == "e-mail" ||
        it == "login" ||
        it == "account" ||
        it.contains("user_name") ||
        it.contains("email_address")
    }
  }

  private fun AssistStructure.ViewNode.searchTokens(): List<String> {
    val values = mutableListOf<String>()
    values.addAll(autofillHints?.toList().orEmpty())
    values.add(hint?.toString().orEmpty())
    values.add(idEntry.orEmpty())

    val cls = className?.toString().orEmpty()
    if (cls.contains("Edit", ignoreCase = true) || cls.contains("Input", ignoreCase = true)) {
      values.add(cls)
    }

    htmlInfo?.attributes?.forEach { attribute ->
      values.add(attribute.first.orEmpty())
      values.add(attribute.second.orEmpty())
    }
    return values
      .flatMap { it.split(' ', '_', '-', '.', ':', '/', '\\') }
      .map { it.trim().lowercase() }
      .filter { it.isNotBlank() }
  }

  private fun createAuthenticationIntent(loginFields: LoginFields): PendingIntent {
    val createdAt = System.currentTimeMillis()
    val requestId = "android-autofill-$createdAt"
    val intent = Intent(this, MainActivity::class.java).apply {
      action = ACTION_AUTOFILL_AUTHENTICATE
      putExtra(EXTRA_AUTOFILL_REQUEST_ID, requestId)
      putExtra(EXTRA_AUTOFILL_CREATED_AT, createdAt)
      putExtra(EXTRA_AUTOFILL_APP_PACKAGE, loginFields.appPackage)
      putExtra(EXTRA_AUTOFILL_WEB_DOMAIN, loginFields.webDomain)
      putParcelableArrayListExtra(EXTRA_AUTOFILL_USERNAME_IDS, ArrayList(loginFields.usernameIds))
      putParcelableArrayListExtra(EXTRA_AUTOFILL_PASSWORD_IDS, ArrayList(loginFields.passwordIds))
    }

    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    val requestCode = requestCodeCounter.incrementAndGet()
    return PendingIntent.getActivity(this, requestCode, intent, flags)
  }

  private fun createSaveInfo(loginFields: LoginFields): SaveInfo {
    val requiredIds = loginFields.passwordIds.distinct().toTypedArray()
    val builder = SaveInfo.Builder(SaveInfo.SAVE_DATA_TYPE_PASSWORD, requiredIds)
    val optionalIds = loginFields.usernameIds.distinct().toTypedArray()
    if (optionalIds.isNotEmpty()) builder.setOptionalIds(optionalIds)
    return builder.build()
  }

  private fun createAuthenticationPresentation(): RemoteViews {
    return RemoteViews(packageName, android.R.layout.simple_list_item_1).apply {
      setTextViewText(android.R.id.text1, getString(R.string.autofill_unlock_prompt))
    }
  }

  private data class LoginFields(
    val usernameIds: MutableList<AutofillId> = mutableListOf(),
    val passwordIds: MutableList<AutofillId> = mutableListOf(),
    var appPackage: String? = null,
    var webDomain: String? = null,
  ) {
    fun hasFillableLogin(): Boolean = passwordIds.isNotEmpty() && (usernameIds.isNotEmpty() || passwordIds.size == 1)

    fun allIds(): List<AutofillId> = (usernameIds + passwordIds).distinct()
  }

  private data class SaveCandidate(
    var username: String = "",
    var password: String = "",
    var appPackage: String? = null,
    var webDomain: String? = null,
  ) {
    fun title(): String = webDomain ?: appPackage ?: "Aegis Login"
    fun url(): String = webDomain?.let { if (it.startsWith("http")) it else "https://$it" }.orEmpty()
  }

  companion object {
    private const val AUTOFILL_LOG_TAG = "AegisAutofill"
    private const val MAX_TRAVERSAL_DEPTH = 50
    const val ACTION_AUTOFILL_AUTHENTICATE = "com.hafgit99.aegisvault7.action.AUTOFILL_AUTHENTICATE"
    const val ACTION_AUTOFILL_SAVE = "com.hafgit99.aegisvault7.action.AUTOFILL_SAVE"
    const val EXTRA_AUTOFILL_REQUEST_ID = "com.hafgit99.aegisvault7.extra.AUTOFILL_REQUEST_ID"
    const val EXTRA_AUTOFILL_CREATED_AT = "com.hafgit99.aegisvault7.extra.AUTOFILL_CREATED_AT"
    const val EXTRA_AUTOFILL_APP_PACKAGE = "com.hafgit99.aegisvault7.extra.AUTOFILL_APP_PACKAGE"
    const val EXTRA_AUTOFILL_WEB_DOMAIN = "com.hafgit99.aegisvault7.extra.AUTOFILL_WEB_DOMAIN"
    const val EXTRA_AUTOFILL_USERNAME_IDS = "com.hafgit99.aegisvault7.extra.AUTOFILL_USERNAME_IDS"
    const val EXTRA_AUTOFILL_PASSWORD_IDS = "com.hafgit99.aegisvault7.extra.AUTOFILL_PASSWORD_IDS"
    const val EXTRA_AUTOFILL_SAVE_REQUEST_ID = "com.hafgit99.aegisvault7.extra.AUTOFILL_SAVE_REQUEST_ID"
    const val EXTRA_AUTOFILL_SAVE_CREATED_AT = "com.hafgit99.aegisvault7.extra.AUTOFILL_SAVE_CREATED_AT"
    const val EXTRA_AUTOFILL_SAVE_TITLE = "com.hafgit99.aegisvault7.extra.AUTOFILL_SAVE_TITLE"
    const val EXTRA_AUTOFILL_SAVE_USERNAME = "com.hafgit99.aegisvault7.extra.AUTOFILL_SAVE_USERNAME"
    /**
     * Deprecated. Older autofill builds wrote the plaintext password to the
     * intent extras under this key. Newer builds must use
     * [EXTRA_AUTOFILL_SAVE_PAYLOAD_URI] + [EXTRA_AUTOFILL_SAVE_PAYLOAD_TOKEN]
     * so the password never leaves the FileProvider-controlled cache file.
     */
    const val EXTRA_AUTOFILL_SAVE_PASSWORD = "com.hafgit99.aegisvault7.extra.AUTOFILL_SAVE_PASSWORD"
    const val EXTRA_AUTOFILL_SAVE_PAYLOAD_URI = "com.hafgit99.aegisvault7.extra.AUTOFILL_SAVE_PAYLOAD_URI"
    const val EXTRA_AUTOFILL_SAVE_PAYLOAD_TOKEN = "com.hafgit99.aegisvault7.extra.AUTOFILL_SAVE_PAYLOAD_TOKEN"
    const val EXTRA_AUTOFILL_SAVE_URL = "com.hafgit99.aegisvault7.extra.AUTOFILL_SAVE_URL"
  }
}
