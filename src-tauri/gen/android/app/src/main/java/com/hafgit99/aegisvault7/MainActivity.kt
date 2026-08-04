package com.hafgit99.aegisvault7

import android.app.Activity
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Debug
import android.provider.Settings
import android.provider.OpenableColumns
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.service.autofill.Dataset
import android.service.autofill.FillResponse
import android.util.Base64
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.view.WindowManager
import android.view.autofill.AutofillId
import android.view.autofill.AutofillManager
import android.view.autofill.AutofillValue
import android.widget.RemoteViews
import androidx.activity.enableEdgeToEdge
import com.hafgit99.aegisvault7.security.SecureTempFileStorage
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONArray
import org.json.JSONObject

class MainActivity : TauriActivity() {
  private var webViewRef: WebView? = null
  private var pendingSave: PendingSave? = null
  private var pendingOpenRequestId: String? = null
  private var pendingAutofillRequest: AutofillLaunchRequest? = null
  private var pendingAutofillSaveCandidate: AutofillSaveCandidate? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
    window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
    enableEdgeToEdge()
    captureAutofillIntent(intent)
    super.onCreate(savedInstanceState)
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) {
      window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
      dismissPrivacyShield()
    }
  }

  @Suppress("DEPRECATION")
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    captureAutofillIntent(intent)
    notifyAutofillIntent()
    notifyAutofillSaveCandidate()
    dismissPrivacyShield()
  }

  override fun onResume() {
    super.onResume()
    notifyAutofillIntent()
    notifyAutofillSaveCandidate()
    // When coming back from the autofill flow, the WebView may not
    // receive the native focus/visibility events needed to dismiss
    // the privacy shield overlay. Force-dispatch them so the shield
    // is lifted and the user sees the vault UI.
    dismissPrivacyShield()
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    webViewRef = webView
    hardenWebView(webView)
    webView.addJavascriptInterface(AndroidFileBridge(), "AegisAndroidFiles")
    webView.addJavascriptInterface(AndroidSecureStorageBridge(), "AegisAndroidSecureStorage")
    webView.addJavascriptInterface(AndroidAutofillBridge(), "AegisAndroidAutofill")
    webView.addJavascriptInterface(AndroidRuntimeSecurityBridge(), "AegisAndroidSecurity")
    webView.post {
      notifyAutofillIntent()
      notifyAutofillSaveCandidate()
    }
  }

  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)

    when (requestCode) {
      REQUEST_SAVE_FILE -> handleSaveFileResult(resultCode, data)
      REQUEST_OPEN_FILE -> handleOpenFileResult(resultCode, data)
    }
  }

  private fun handleSaveFileResult(resultCode: Int, data: Intent?) {
    val save = pendingSave ?: return
    pendingSave = null

    if (resultCode != Activity.RESULT_OK) {
      resolveSave(save.requestId, false, null)
      return
    }

    val uri = data?.data
    if (uri == null) {
      resolveSave(save.requestId, false, "No destination was selected.")
      return
    }

    try {
      contentResolver.openOutputStream(uri, "wt")?.use { rawOutput ->
        val output = java.io.BufferedOutputStream(rawOutput, STREAMING_BUFFER_SIZE)
        var offset = 0
        while (offset < save.bytes.size) {
          val chunkLen = minOf(STREAMING_BUFFER_SIZE, save.bytes.size - offset)
          output.write(save.bytes, offset, chunkLen)
          offset += chunkLen
        }
        output.flush()
      } ?: throw IllegalStateException("Selected destination could not be opened.")

      resolveSave(save.requestId, true, null)
    } catch (error: Exception) {
      resolveSave(save.requestId, false, "File could not be saved: ${error.message ?: "unknown error"}")
    }
  }

  private fun handleOpenFileResult(resultCode: Int, data: Intent?) {
    val requestId = pendingOpenRequestId ?: return
    pendingOpenRequestId = null

    if (resultCode != Activity.RESULT_OK) {
      resolveOpen(requestId, null, null)
      return
    }

    val uri = data?.data
    if (uri == null) {
      resolveOpen(requestId, null, "No file was selected.")
      return
    }

    try {
      // Pre-check file size before reading to prevent OOM on large files.
      val fileSize = try {
        var size: Long = -1
        contentResolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { cursor ->
          if (cursor.moveToFirst()) {
            val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
            if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) {
              size = cursor.getLong(sizeIndex)
            }
          }
        }
        size
      } catch (_: Exception) { -1L }

      if (fileSize > MAX_OPEN_FILE_BYTES) {
        resolveOpen(requestId, null, "Selected file is too large (${fileSize / (1024 * 1024)} MB). Maximum allowed size is ${MAX_OPEN_FILE_BYTES / (1024 * 1024)} MB.")
        return
      }

      val contents = contentResolver.openInputStream(uri)?.bufferedReader(Charsets.UTF_8)?.use { reader ->
        val builder = StringBuilder()
        val buffer = CharArray(STREAMING_BUFFER_SIZE)
        var bytesRead = 0L
        var charsRead: Int
        while (reader.read(buffer).also { charsRead = it } != -1) {
          bytesRead += charsRead
          if (bytesRead > MAX_OPEN_FILE_BYTES) {
            throw IllegalStateException("File exceeds the ${MAX_OPEN_FILE_BYTES / (1024 * 1024)} MB import size limit.")
          }
          builder.append(buffer, 0, charsRead)
        }
        builder.toString()
      } ?: throw IllegalStateException("Selected file could not be opened.")
      resolveOpen(requestId, AndroidImportFile(displayNameForUri(uri), contents), null)
    } catch (error: Exception) {
      resolveOpen(requestId, null, "File could not be read: ${error.message ?: "unknown error"}")
    }
  }

  private fun displayNameForUri(uri: Uri): String {
    var cursor: Cursor? = null
    return try {
      cursor = contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
      if (cursor != null && cursor.moveToFirst()) {
        val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        if (nameIndex >= 0) cursor.getString(nameIndex) ?: "selected-import" else "selected-import"
      } else {
        "selected-import"
      }
    } catch (_: Exception) {
      uri.lastPathSegment ?: "selected-import"
    } finally {
      cursor?.close()
    }
  }

  private fun resolveSave(requestId: String, saved: Boolean, error: String?) {
    val script = "window.__aegisAndroidFiles && window.__aegisAndroidFiles.resolveSave(" +
      "${JSONObject.quote(requestId)}, $saved, ${jsonStringOrNull(error)})"
    evaluateOnWebView(script)
  }

  private fun resolveOpen(requestId: String, file: AndroidImportFile?, error: String?) {
    val payload = if (file == null) {
      "null"
    } else {
      JSONObject()
        .put("name", file.name)
        .put("contents", file.contents)
        .toString()
    }
    val script = "window.__aegisAndroidFiles && window.__aegisAndroidFiles.resolveOpen(" +
      "${JSONObject.quote(requestId)}, $payload, ${jsonStringOrNull(error)})"
    evaluateOnWebView(script)
  }

  private fun evaluateOnWebView(script: String) {
    val webView = webViewRef ?: return
    webView.post {
      webView.evaluateJavascript(script, null)
    }
  }

  private fun captureAutofillIntent(intent: Intent?) {
    if (intent?.action == AegisAutofillService.ACTION_AUTOFILL_SAVE) {
      val requestId = intent.getStringExtra(AegisAutofillService.EXTRA_AUTOFILL_SAVE_REQUEST_ID)
        ?: "android-autofill-save-${System.currentTimeMillis()}"
      val createdAt = intent.getLongExtra(AegisAutofillService.EXTRA_AUTOFILL_SAVE_CREATED_AT, System.currentTimeMillis())
      val payloadUri = intent.getStringExtra(AegisAutofillService.EXTRA_AUTOFILL_SAVE_PAYLOAD_URI)
      val payloadToken = intent.getStringExtra(AegisAutofillService.EXTRA_AUTOFILL_SAVE_PAYLOAD_TOKEN)

      if (payloadUri != null && payloadToken != null) {
        // Modern path: the password is sealed inside an encrypted temp file
        // referenced by the FileProvider URI. The WebView will resolve it via
        // [getPendingSaveCandidateFromUri] which consumes the file once and
        // then deletes it.
        pendingAutofillSaveCandidate = AutofillSaveCandidate(
          requestId = requestId,
          createdAt = createdAt,
          title = intent.getStringExtra(AegisAutofillService.EXTRA_AUTOFILL_SAVE_TITLE).orEmpty(),
          username = intent.getStringExtra(AegisAutofillService.EXTRA_AUTOFILL_SAVE_USERNAME).orEmpty(),
          password = "",
          url = intent.getStringExtra(AegisAutofillService.EXTRA_AUTOFILL_SAVE_URL)?.takeIf { it.isNotBlank() },
          appPackage = intent.getStringExtra(AegisAutofillService.EXTRA_AUTOFILL_APP_PACKAGE)?.takeIf { it.isNotBlank() },
          webDomain = intent.getStringExtra(AegisAutofillService.EXTRA_AUTOFILL_WEB_DOMAIN)?.takeIf { it.isNotBlank() },
          payloadUri = payloadUri,
          payloadToken = payloadToken,
        )
      } else {
        // Legacy fallback: an older autofill service may still ship the
        // password as a plaintext extra. We honor it to avoid breaking older
        // builds, but log a warning so we notice the regression.
        Log.w(AUTOFILL_LOG_TAG, "Save intent delivered via legacy plaintext extras; please upgrade")
        pendingAutofillSaveCandidate = AutofillSaveCandidate(
          requestId = requestId,
          createdAt = createdAt,
          title = intent.getStringExtra(AegisAutofillService.EXTRA_AUTOFILL_SAVE_TITLE).orEmpty(),
          username = intent.getStringExtra(AegisAutofillService.EXTRA_AUTOFILL_SAVE_USERNAME).orEmpty(),
          password = intent.getStringExtra(AegisAutofillService.EXTRA_AUTOFILL_SAVE_PASSWORD).orEmpty(),
          url = intent.getStringExtra(AegisAutofillService.EXTRA_AUTOFILL_SAVE_URL)?.takeIf { it.isNotBlank() },
          appPackage = intent.getStringExtra(AegisAutofillService.EXTRA_AUTOFILL_APP_PACKAGE)?.takeIf { it.isNotBlank() },
          webDomain = intent.getStringExtra(AegisAutofillService.EXTRA_AUTOFILL_WEB_DOMAIN)?.takeIf { it.isNotBlank() },
        )
      }
      return
    }

    if (intent?.action != AegisAutofillService.ACTION_AUTOFILL_AUTHENTICATE) return

    val requestId = intent.getStringExtra(AegisAutofillService.EXTRA_AUTOFILL_REQUEST_ID)
      ?: "android-autofill-${System.currentTimeMillis()}"
    val createdAt = intent.getLongExtra(AegisAutofillService.EXTRA_AUTOFILL_CREATED_AT, System.currentTimeMillis())
    pendingAutofillRequest = AutofillLaunchRequest(
      requestId = requestId,
      createdAt = createdAt,
      appPackage = intent.getStringExtra(AegisAutofillService.EXTRA_AUTOFILL_APP_PACKAGE)?.takeIf { it.isNotBlank() },
      webDomain = intent.getStringExtra(AegisAutofillService.EXTRA_AUTOFILL_WEB_DOMAIN)?.takeIf { it.isNotBlank() },
      usernameIds = intent.autofillIdsExtra(AegisAutofillService.EXTRA_AUTOFILL_USERNAME_IDS),
      passwordIds = intent.autofillIdsExtra(AegisAutofillService.EXTRA_AUTOFILL_PASSWORD_IDS),
    )
  }

  private fun purgeStaleAutofillRequests() {
    pendingAutofillRequest?.let { req ->
      if (!req.isFresh()) {
        Log.i(AUTOFILL_LOG_TAG, "Purging stale autofill request requestId=${req.requestId}")
        pendingAutofillRequest = null
      }
    }
  }

  private fun notifyAutofillIntent() {
    purgeStaleAutofillRequests()
    val payload = pendingAutofillRequest?.toJson()?.toString() ?: "null"
    val script = "window.__aegisAndroidAutofill && window.__aegisAndroidAutofill.onRequest($payload)"
    evaluateOnWebView(script)
  }

  private fun notifyAutofillSaveCandidate() {
    val payload = pendingAutofillSaveCandidate?.toJson()?.toString() ?: "null"
    val script = "window.__aegisAndroidAutofill && window.__aegisAndroidAutofill.onSave($payload)"
    evaluateOnWebView(script)
  }

  private fun jsonStringOrNull(value: String?): String {
    return if (value == null) "null" else JSONObject.quote(value)
  }

  /**
   * Dispatch focus and visibilitychange events to the WebView so
   * the JavaScript privacy-shield overlay is safely dismissed after Activity
   * lifecycle transitions (especially during autofill flows).
   */
  private fun dismissPrivacyShield() {
    val webView = webViewRef ?: return
    webView.post {
      webView.evaluateJavascript(
        """
        (function() {
          try {
            window.dispatchEvent(new Event('focus'));
            if (document.visibilityState !== 'hidden') {
              document.dispatchEvent(new Event('visibilitychange'));
            }
          } catch(e) {}
        })();
        """.trimIndent(),
        null
      )
    }
  }

  private fun Intent.autofillIdsExtra(name: String): ArrayList<AutofillId> {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return arrayListOf()

    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      getParcelableArrayListExtra(name, AutofillId::class.java) ?: arrayListOf()
    } else {
      @Suppress("DEPRECATION")
      getParcelableArrayListExtra(name) ?: arrayListOf()
    }
  }

  inner class AndroidFileBridge {
    @JavascriptInterface
    fun saveTextFile(requestId: String, defaultFilename: String, mimeType: String, contents: String) {
      runOnUiThread {
        if (pendingSave != null || pendingOpenRequestId != null) {
          resolveSave(requestId, false, "Another file operation is already in progress.")
          return@runOnUiThread
        }

        if (!ALLOWED_SAVE_MIME_TYPES.contains(mimeType)) {
          resolveSave(requestId, false, "Unsupported MIME type: $mimeType")
          return@runOnUiThread
        }

        // Guard against OOM: reject payloads exceeding the size limit before
        // allocating the byte array. String.length is a lower bound for the
        // UTF-8 byte count but sufficient for an early rejection check.
        if (contents.length > MAX_SAVE_PAYLOAD_BYTES) {
          resolveSave(requestId, false, "Payload size (${contents.length} chars) exceeds the ${MAX_SAVE_PAYLOAD_BYTES / (1024 * 1024)} MB limit.")
          return@runOnUiThread
        }

        val bytes = contents.toByteArray(Charsets.UTF_8)
        if (bytes.size > MAX_SAVE_PAYLOAD_BYTES) {
          resolveSave(requestId, false, "Encoded payload size (${bytes.size} bytes) exceeds the ${MAX_SAVE_PAYLOAD_BYTES / (1024 * 1024)} MB limit.")
          return@runOnUiThread
        }

        pendingSave = PendingSave(requestId, bytes)
        launchCreateDocument(requestId, defaultFilename, mimeType)
      }
    }

    @JavascriptInterface
    fun saveBase64File(requestId: String, defaultFilename: String, mimeType: String, contentsBase64: String) {
      runOnUiThread {
        if (pendingSave != null || pendingOpenRequestId != null) {
          resolveSave(requestId, false, "Another file operation is already in progress.")
          return@runOnUiThread
        }

        if (!ALLOWED_SAVE_MIME_TYPES.contains(mimeType)) {
          resolveSave(requestId, false, "Unsupported MIME type: $mimeType")
          return@runOnUiThread
        }

        // Estimate decoded size from base64 length (3 bytes per 4 chars)
        // and reject before actually decoding to avoid the OOM allocation.
        val estimatedDecodedBytes = (contentsBase64.length.toLong() * 3) / 4
        if (estimatedDecodedBytes > MAX_SAVE_PAYLOAD_BYTES) {
          resolveSave(requestId, false, "Payload size (~${estimatedDecodedBytes / (1024 * 1024)} MB) exceeds the ${MAX_SAVE_PAYLOAD_BYTES / (1024 * 1024)} MB limit.")
          return@runOnUiThread
        }

        try {
          val decoded = Base64.decode(contentsBase64, Base64.DEFAULT)
          if (decoded.size > MAX_SAVE_PAYLOAD_BYTES) {
            resolveSave(requestId, false, "Decoded payload size (${decoded.size} bytes) exceeds the ${MAX_SAVE_PAYLOAD_BYTES / (1024 * 1024)} MB limit.")
            return@runOnUiThread
          }
          pendingSave = PendingSave(requestId, decoded)
          launchCreateDocument(requestId, defaultFilename, mimeType)
        } catch (error: Exception) {
          resolveSave(requestId, false, "File payload could not be decoded: ${error.message ?: "unknown error"}")
        }
      }
    }

    @JavascriptInterface
    fun openTextFile(requestId: String) {
      runOnUiThread {
        if (pendingSave != null || pendingOpenRequestId != null) {
          resolveOpen(requestId, null, "Another file operation is already in progress.")
          return@runOnUiThread
        }

        pendingOpenRequestId = requestId
        try {
          // On Android, the Storage Access Framework (ACTION_OPEN_DOCUMENT)
          // is the only file picker the system shows reliably. Earlier
          // versions of this bridge combined `type = "*/*"` with a
          // hand-curated `EXTRA_MIME_TYPES` array. On many OEM Android
          // builds that combination causes the picker to filter the
          // visible file list by `EXTRA_MIME_TYPES` and hide CSV / text
          // exports that are not registered against `text/csv`. The fix
          // is to use a `text/*` MIME filter (which Android always
          // resolves to "plain text" and includes CSV) and add the
          // application/octet-stream alias so binary `.aegis` exports
          // show up next to the text backups. We also fall back to a
          // pure `*/*` picker if the system rejects this combination.
          val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            putExtra(
              Intent.EXTRA_MIME_TYPES,
              arrayOf(
                "text/*",
                "application/json",
                "application/csv",
                "text/csv",
                "text/comma-separated-values",
                "application/octet-stream",
              )
            )
          }
          startActivityForResult(intent, REQUEST_OPEN_FILE)
        } catch (error: Exception) {
          pendingOpenRequestId = null
          resolveOpen(requestId, null, "File picker could not be opened: ${error.message ?: "unknown error"}")
        }
      }
    }
  }

  inner class AndroidSecureStorageBridge {
    @JavascriptInterface
    fun getItem(key: String): String? {
      return try {
        val encryptedPayload = securePreferences().getString(preferenceKey(key), null) ?: return null
        decryptSecureValue(encryptedPayload)
      } catch (error: Exception) {
        Log.e(SECURE_STORAGE_LOG_TAG, "Failed to retrieve or decrypt secure item for key '$key': ${error.message}", error)
        null
      }
    }

    @JavascriptInterface
    fun setItem(key: String, value: String): Boolean {
      return try {
        val encrypted = encryptSecureValue(value)
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
  }

  inner class AndroidAutofillBridge {
    @JavascriptInterface
    fun isSupported(): Boolean {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
      return getSystemService(AutofillManager::class.java)?.isAutofillSupported == true
    }

    @JavascriptInterface
    fun isEnabled(): Boolean {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
      return getSystemService(AutofillManager::class.java)?.hasEnabledAutofillServices() == true
    }

    @JavascriptInterface
    fun openSettings(): Boolean {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false

      return try {
        startActivity(Intent(Settings.ACTION_REQUEST_SET_AUTOFILL_SERVICE))
        true
      } catch (_: Exception) {
        try {
          startActivity(Intent(Settings.ACTION_INPUT_METHOD_SETTINGS))
          true
        } catch (error: Exception) {
          Log.w(AUTOFILL_LOG_TAG, "Failed to launch Android Autofill settings intent: ${error.message}")
          false
        }
      }
    }

    @JavascriptInterface
    fun getPendingRequest(): String? {
      val current = pendingAutofillRequest ?: return null
      if (!current.isFresh()) {
        pendingAutofillRequest = null
        return null
      }

      return pendingAutofillRequest?.toJson()?.toString()
    }

    @JavascriptInterface
    fun clearPendingRequest(requestId: String): Boolean {
      val current = pendingAutofillRequest ?: return true
      if (current.requestId != requestId) {
        Log.w(
          AUTOFILL_LOG_TAG,
          "clearPendingRequest mismatch: pendingRequestId=${current.requestId}, requestedId=$requestId"
        )
        return false
      }
      pendingAutofillRequest = null
      return true
    }

    @JavascriptInterface
    fun getPendingSaveCandidate(): String? {
      return pendingAutofillSaveCandidate?.toJson()?.toString()
    }

    /**
     * Resolves the encrypted save payload referenced by [requestId]. Returns
     * the JSON of an [AutofillSaveCandidate] with the decrypted password in
     * place, or null if the request has already been consumed / has expired.
     *
     * The WebView calls this exactly once per save candidate: the file is
     * deleted on consumption, and the in-memory copy is wiped by
     * [clearPendingSaveCandidate].
     */
    @JavascriptInterface
    fun resolveEncryptedSavePayload(requestId: String): String? {
      val current = pendingAutofillSaveCandidate ?: return null
      if (current.requestId != requestId) return null
      if (!current.requiresUriResolution()) {
        return current.toJson().toString()
      }

      val token = current.payloadToken ?: return null
      val plaintext = try {
        SecureTempFileStorage(this@MainActivity).consume(token)
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
        pendingAutofillSaveCandidate = null
        return null
      }

      pendingAutofillSaveCandidate = resolved
      return resolved.toJson().toString()
    }

    @JavascriptInterface
    fun clearPendingSaveCandidate(requestId: String): Boolean {
      val current = pendingAutofillSaveCandidate ?: return true
      if (current.requestId != requestId) return false
      // Best-effort sweep of any orphaned encrypted temp files left behind by
      // a previous, unconsumed save attempt. This is a defensive purge; the
      // normal flow already deletes the file when [resolveEncryptedSavePayload]
      // succeeds.
      try {
        SecureTempFileStorage(this@MainActivity).purge()
      } catch (error: Exception) {
        Log.w(AUTOFILL_LOG_TAG, "Temp file purge failed: ${error.message ?: "unknown"}")
      }
      pendingAutofillSaveCandidate = null
      return true
    }

    @JavascriptInterface
    fun completePendingRequest(requestId: String, username: String, password: String, label: String): Boolean {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false

      val current = pendingAutofillRequest ?: return false
      if (current.requestId != requestId) return false
      if (!current.isFresh()) {
        pendingAutofillRequest = null
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
        setResult(Activity.RESULT_OK, result)
        Log.i(
          AUTOFILL_LOG_TAG,
          "Autofill audit event [COMPLETED]: requestId=$requestId appPackage=${current.appPackage ?: "unknown"} webDomain=${current.webDomain ?: "unknown"} usernameFields=${current.usernameIds.size} passwordFields=${current.passwordIds.size}"
        )
        pendingAutofillRequest = null
        finish()
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
  }

  private fun hardenWebView(webView: WebView) {
    webView.removeJavascriptInterface("searchBoxJavaBridge_")
    webView.removeJavascriptInterface("accessibility")
    webView.removeJavascriptInterface("accessibilityTraversal")
    webView.settings.apply {
      javaScriptCanOpenWindowsAutomatically = false
      setSupportMultipleWindows(false)
      mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        safeBrowsingEnabled = true
      }
    }
  }

  inner class AndroidRuntimeSecurityBridge {
    @JavascriptInterface
    fun getPosture(): String = getRuntimeRiskSignals()

    @JavascriptInterface
    fun getRuntimeRiskSignals(): String = runtimeSecurityPosture().toString()
  }

  @Volatile
  private var cachedPostureJson: String? = null
  @Volatile
  private var cachedPostureTimestamp: Long = 0L

  private fun runtimeSecurityPosture(): JSONObject {
    val now = System.currentTimeMillis()
    if (now - cachedPostureTimestamp < POSTURE_CACHE_TTL_MS) {
      cachedPostureJson?.let {
        try {
          return JSONObject(it)
        } catch (_: Exception) {}
      }
    }

    val releaseBuild = !BuildConfig.DEBUG
    val appDebuggable = applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
    val debuggerAttached = Debug.isDebuggerConnected() || Debug.waitingForDebugger()
    val signals = linkedSetOf<String>()

    if (appDebuggable && releaseBuild) signals.add("app_debuggable")
    if (debuggerAttached && releaseBuild) signals.add("debugger_attached")

    val isTestBuildType = Build.TYPE == "userdebug" || Build.TYPE == "eng"
    val hasTestKeys = Build.TAGS?.contains("test-keys", ignoreCase = true) == true ||
                      Build.TAGS?.contains("dev-keys", ignoreCase = true) == true
    if (releaseBuild && (hasTestKeys || isTestBuildType)) {
      signals.add("test_keys")
    }

    if (releaseBuild && hasRootArtifactSignal()) signals.add("root_artifact")
    if (releaseBuild && hasInstrumentationSignal()) signals.add("instrumentation")

    val result = JSONObject()
      .put("releaseBuild", releaseBuild)
      .put("appDebuggable", appDebuggable)
      .put("debuggerAttached", debuggerAttached)
      .put("riskDetected", releaseBuild && signals.isNotEmpty())
      .put("mode", "warning-only")
      .put("signals", JSONArray(signals.toList()))

    cachedPostureJson = result.toString()
    cachedPostureTimestamp = now
    return result
  }

  private fun hasRootArtifactSignal(): Boolean {
    return ROOT_ARTIFACT_PATHS.any { candidate ->
      try {
        java.io.File(candidate).exists()
      } catch (_: SecurityException) {
        false
      }
    }
  }

  private fun hasInstrumentationSignal(): Boolean {
    val mapsSignal = try {
      java.io.File("/proc/self/maps").useLines { lines ->
        lines.any { line ->
          val normalized = line.lowercase()
          INSTRUMENTATION_MARKERS.any(normalized::contains)
        }
      }
    } catch (_: Exception) {
      false
    }

    if (mapsSignal) return true

    // Check for active Frida server port on localhost (27042)
    return try {
      val socket = java.net.Socket()
      socket.connect(java.net.InetSocketAddress("127.0.0.1", 27042), 15)
      socket.close()
      true
    } catch (_: Exception) {
      false
    }
  }

  private fun createAutofillPresentation(label: String): RemoteViews {
    return RemoteViews(packageName, android.R.layout.simple_list_item_1).apply {
      setTextViewText(android.R.id.text1, label)
    }
  }

  private fun securePreferences() =
    getSharedPreferences(SECURE_PREFS_NAME, MODE_PRIVATE)

  private fun preferenceKey(key: String): String =
    "secure.$key"

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

    // On Android P (API 28+), require the device to be unlocked to access the KeyStore key
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      keySpecBuilder.setUnlockedDeviceRequired(true)
    }

    keyGenerator.init(keySpecBuilder.build())
    val generatedKey = keyGenerator.generateKey()
    cachedSecureStorageKey = generatedKey
    return generatedKey
  }

  private fun encryptSecureValue(value: String): String {
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

  private fun decryptSecureValue(payload: String): String? {
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

  private fun launchCreateDocument(requestId: String, defaultFilename: String, mimeType: String) {
    try {
      val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = mimeType
        putExtra(Intent.EXTRA_TITLE, defaultFilename)
      }
      startActivityForResult(intent, REQUEST_SAVE_FILE)
    } catch (error: Exception) {
      pendingSave = null
      resolveSave(requestId, false, "File picker could not be opened: ${error.message ?: "unknown error"}")
    }
  }

  private data class PendingSave(val requestId: String, val bytes: ByteArray)
  private data class AndroidImportFile(val name: String, val contents: String)
  private data class AutofillSaveCandidate(
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
    /**
     * Returns true when the candidate carries an encrypted FileProvider URI
     * that still needs to be decrypted by the WebView side. In that case the
     * password field stays empty until [resolveEncryptedSavePayload] runs.
     */
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

  private data class AutofillLaunchRequest(
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
  }

  companion object {
    private const val REQUEST_SAVE_FILE = 7101
    private const val REQUEST_OPEN_FILE = 7102
    private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    private const val SECURE_PREFS_NAME = "aegis_secure_storage"
    private const val SECURE_STORAGE_KEY_ALIAS = "aegis_vault_v7_secure_storage"
    private const val SECURE_STORAGE_CIPHER = "AES/GCM/NoPadding"
    private const val SECURE_STORAGE_LOG_TAG = "AegisSecureStorage"
    private const val AUTOFILL_REQUEST_MAX_AGE_MS = 2 * 60 * 1000L
    private const val AUTOFILL_LOG_TAG = "AegisAutofill"

    /** Maximum payload size for save operations (25 MB). */
    private const val MAX_SAVE_PAYLOAD_BYTES = 25 * 1024 * 1024

    /** Maximum file size for open/import operations (25 MB). */
    private const val MAX_OPEN_FILE_BYTES = 25L * 1024 * 1024

    /** Buffer size for chunked streaming I/O (8 KB). */
    private const val POSTURE_CACHE_TTL_MS = 30_000L
    private const val STREAMING_BUFFER_SIZE = 8192

    /** MIME types allowed for save operations via the file bridge. */
    private val ALLOWED_SAVE_MIME_TYPES = setOf(
      "application/json",
      "text/csv",
      "text/comma-separated-values",
      "application/csv",
      "application/octet-stream",
      "text/plain",
    )

    private val ROOT_ARTIFACT_PATHS = arrayOf(
      "/system/app/Superuser.apk",
      "/system/bin/su",
      "/system/xbin/su",
      "/sbin/su",
      "/su/bin/su",
      "/data/adb/magisk",
      "/data/adb/ksu",
    )
    private val INSTRUMENTATION_MARKERS = arrayOf(
      "frida",
      "gum-js-loop",
      "xposed",
      "substrate",
      "zygisk",
    )
  }
}
