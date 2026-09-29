package com.kalderashield.desktop

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
import com.kalderashield.desktop.model.AutofillLaunchRequest
import com.kalderashield.desktop.model.AutofillSaveCandidate
import com.kalderashield.desktop.security.AutofillRequestRegistry
import com.kalderashield.desktop.security.SecureTempFileStorage
import java.util.UUID
import org.json.JSONObject

@RequiresApi(Build.VERSION_CODES.O)
class KalderaShieldAutofillService : AutofillService() {
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
    val requestId = newAutofillRequestId(SAVE_REQUEST_PREFIX)

    try {
      val (payloadUri, token) = stashEncryptedPayload(requestId, candidate)
        ?: run {
          Log.w(AUTOFILL_LOG_TAG, "SaveRequest could not stage encrypted payload")
          callback.onSuccess()
          return
        }

      // K-1: the candidate is registered in our own address space and the
      // Intent carries nothing but the opaque id. Title, username, url,
      // appPackage, webDomain and the encrypted payload reference all stay
      // inside the process, so a forged ACTION_AUTOFILL_SAVE can no longer
      // poison the vault with attacker-chosen values.
      val saveCandidate = AutofillSaveCandidate(
        requestId = requestId,
        createdAt = createdAt,
        title = candidate.title(),
        username = candidate.username,
        password = "",
        url = candidate.url().takeIf { it.isNotBlank() },
        appPackage = candidate.appPackage,
        webDomain = candidate.webDomain,
        payloadUri = payloadUri.toString(),
        payloadToken = token,
      )
      AutofillRequestRegistry.registerSaveCandidate(saveCandidate)

      val intent = Intent(this, MainActivity::class.java).apply {
        action = ACTION_AUTOFILL_SAVE
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        putExtra(EXTRA_REQUEST_ID, requestId)
        putExtra(EXTRA_REQUEST_CREATED_AT, createdAt)
      }
      startActivity(intent)
      Log.i(
        AUTOFILL_LOG_TAG,
        "SaveRequest forwarded to KalderaShield package=${candidate.appPackage ?: "unknown"} " +
          "domain=${candidate.webDomain ?: "unknown"} payload=encrypted requestId=$requestId",
      )
    } catch (error: Exception) {
      AutofillRequestRegistry.consumeSaveCandidate(requestId)
      Log.w(AUTOFILL_LOG_TAG, "SaveRequest could not launch KalderaShield: ${error.message ?: "unknown"}")
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
    val requestId = newAutofillRequestId(FILL_REQUEST_PREFIX)

    // K-1: the request is registered in our own address space, and the Intent
    // carries ONLY the opaque id. `appPackage` and `webDomain` come from the
    // AssistStructure the system handed us, so they can no longer be chosen by
    // whoever launched the Activity — which is what made the forged-intent
    // phishing UI (and the credential handed back through setResult) possible.
    AutofillRequestRegistry.registerFillRequest(
      AutofillLaunchRequest(
        requestId = requestId,
        createdAt = createdAt,
        appPackage = loginFields.appPackage,
        webDomain = loginFields.webDomain,
        usernameIds = ArrayList(loginFields.usernameIds),
        passwordIds = ArrayList(loginFields.passwordIds),
      ),
    )

    val intent = Intent(this, MainActivity::class.java).apply {
      action = ACTION_AUTOFILL_AUTHENTICATE
      putExtra(EXTRA_REQUEST_ID, requestId)
      putExtra(EXTRA_REQUEST_CREATED_AT, createdAt)
    }

    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    val requestCode = requestCodeCounter.incrementAndGet()
    return PendingIntent.getActivity(this, requestCode, intent, flags)
  }

  /**
   * K-1: request ids must not be guessable. The previous scheme was
   * `"android-autofill-$createdAt"`, i.e. a millisecond timestamp that any app
   * could predict; the registry is the real boundary now, but an unpredictable
   * id means a leaked or logged id is not enough to ride a genuine request.
   */
  private fun newAutofillRequestId(prefix: String): String =
    "$prefix-${UUID.randomUUID()}"

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
    fun title(): String = webDomain ?: appPackage ?: "KalderaShield Login"
    fun url(): String = webDomain?.let { if (it.startsWith("http")) it else "https://$it" }.orEmpty()
  }

  companion object {
    private const val AUTOFILL_LOG_TAG = "KalderaShieldAutofill"
    private const val MAX_TRAVERSAL_DEPTH = 50
    private const val FILL_REQUEST_PREFIX = "android-autofill"
    private const val SAVE_REQUEST_PREFIX = "android-autofill-save"

    /**
     * K-1: these two actions are now only a ROUTING HINT that tells
     * `MainActivity` which registry to consult. They are deliberately not a
     * capability — every request is still resolved through
     * `AutofillRequestRegistry`, and an id that is not registered is rejected.
     *
     * They are kept (rather than removed) because `MainActivity` still needs
     * to know whether it was launched for a fill or a save; the Activity is
     * `android:exported="false"`, so only the system — executing a
     * `PendingIntent` this service created — can deliver them.
     */
    const val ACTION_AUTOFILL_AUTHENTICATE = "com.kalderashield.desktop.action.AUTOFILL_AUTHENTICATE"
    const val ACTION_AUTOFILL_SAVE = "com.kalderashield.desktop.action.AUTOFILL_SAVE"

    /**
     * The ONLY extras the Autofill Intents carry. Both are routing metadata:
     * the id is an opaque 128-bit registry key and the timestamp is for audit
     * logging.
     *
     * K-1 removed the previous extras entirely, including the deprecated
     * `EXTRA_AUTOFILL_SAVE_PASSWORD` plaintext-password path, the
     * `AutofillId` parcelable lists, and the attacker-controllable
     * `EXTRA_AUTOFILL_APP_PACKAGE` / `EXTRA_AUTOFILL_WEB_DOMAIN` /
     * `EXTRA_AUTOFILL_SAVE_TITLE` / `EXTRA_AUTOFILL_SAVE_USERNAME` /
     * `EXTRA_AUTOFILL_SAVE_URL` values. A live code path that accepts a
     * plaintext password from an Intent is an attack surface, not a
     * compatibility feature.
     */
    const val EXTRA_REQUEST_ID = "com.kalderashield.desktop.extra.AUTOFILL_REQUEST_ID"
    const val EXTRA_REQUEST_CREATED_AT = "com.kalderashield.desktop.extra.AUTOFILL_CREATED_AT"
  }
}
