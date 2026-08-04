package com.hafgit99.aegisvault7

import android.app.Activity
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Debug
import android.provider.OpenableColumns
import android.util.Base64
import android.util.Log
import android.view.WindowManager
import android.view.autofill.AutofillId
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import com.hafgit99.aegisvault7.bridges.AndroidAutofillBridge
import com.hafgit99.aegisvault7.bridges.AndroidFileBridge
import com.hafgit99.aegisvault7.bridges.AndroidRuntimeSecurityBridge
import com.hafgit99.aegisvault7.bridges.AndroidSecureStorageBridge
import com.hafgit99.aegisvault7.crypto.SecureStorageKeyStore
import com.hafgit99.aegisvault7.model.AndroidImportFile
import com.hafgit99.aegisvault7.model.AutofillLaunchRequest
import com.hafgit99.aegisvault7.model.AutofillSaveCandidate
import com.hafgit99.aegisvault7.model.PendingSave
import com.hafgit99.aegisvault7.security.RuntimeSecurityPosture
import org.json.JSONObject

class MainActivity : TauriActivity() {
  private var webViewRef: WebView? = null
  private var pendingSave: PendingSave? = null
  private var pendingOpenRequestId: String? = null
  private var pendingAutofillRequest: AutofillLaunchRequest? = null
  private var pendingAutofillSaveCandidate: AutofillSaveCandidate? = null

  private lateinit var secureKeyStore: SecureStorageKeyStore
  private lateinit var runtimePosture: RuntimeSecurityPosture

  override fun onCreate(savedInstanceState: Bundle?) {
    WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
    window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
    enableEdgeToEdge()

    secureKeyStore = SecureStorageKeyStore(this)
    runtimePosture = RuntimeSecurityPosture(this)

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
    dismissPrivacyShield()
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    webViewRef = webView
    hardenWebView(webView)

    val fileBridge = AndroidFileBridge(
      activity = this,
      onSaveText = { reqId, filename, mime, contents -> saveTextFile(reqId, filename, mime, contents) },
      onSaveBase64 = { reqId, filename, mime, base64 -> saveBase64File(reqId, filename, mime, base64) },
      onOpenFile = { reqId -> openTextFile(reqId) }
    )

    val secureStorageBridge = AndroidSecureStorageBridge(this, secureKeyStore)

    val autofillBridge = AndroidAutofillBridge(
      activity = this,
      getPendingAutofillRequest = { pendingAutofillRequest },
      setPendingAutofillRequest = { pendingAutofillRequest = it },
      getPendingAutofillSaveCandidate = { pendingAutofillSaveCandidate },
      setPendingAutofillSaveCandidate = { pendingAutofillSaveCandidate = it }
    )

    val securityBridge = AndroidRuntimeSecurityBridge(runtimePosture)

    webView.addJavascriptInterface(fileBridge, "AegisAndroidFiles")
    webView.addJavascriptInterface(secureStorageBridge, "AegisAndroidSecureStorage")
    webView.addJavascriptInterface(autofillBridge, "AegisAndroidAutofill")
    webView.addJavascriptInterface(securityBridge, "AegisAndroidSecurity")

    webView.post {
      notifyAutofillIntent()
      notifyAutofillSaveCandidate()
    }
  }

  @Suppress("DEPRECATION")
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
        @Suppress("DEPRECATION")
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

  private fun saveTextFile(requestId: String, defaultFilename: String, mimeType: String, contents: String) {
    if (pendingSave != null || pendingOpenRequestId != null) {
      resolveSave(requestId, false, "Another file operation is already in progress.")
      return
    }

    if (!ALLOWED_SAVE_MIME_TYPES.contains(mimeType)) {
      resolveSave(requestId, false, "Unsupported MIME type: $mimeType")
      return
    }

    if (contents.length > MAX_SAVE_PAYLOAD_BYTES) {
      resolveSave(requestId, false, "Payload size (${contents.length} chars) exceeds the ${MAX_SAVE_PAYLOAD_BYTES / (1024 * 1024)} MB limit.")
      return
    }

    val bytes = contents.toByteArray(Charsets.UTF_8)
    if (bytes.size > MAX_SAVE_PAYLOAD_BYTES) {
      resolveSave(requestId, false, "Encoded payload size (${bytes.size} bytes) exceeds the ${MAX_SAVE_PAYLOAD_BYTES / (1024 * 1024)} MB limit.")
      return
    }

    pendingSave = PendingSave(requestId, bytes)
    launchCreateDocument(requestId, defaultFilename, mimeType)
  }

  private fun saveBase64File(requestId: String, defaultFilename: String, mimeType: String, contentsBase64: String) {
    if (pendingSave != null || pendingOpenRequestId != null) {
      resolveSave(requestId, false, "Another file operation is already in progress.")
      return
    }

    if (!ALLOWED_SAVE_MIME_TYPES.contains(mimeType)) {
      resolveSave(requestId, false, "Unsupported MIME type: $mimeType")
      return
    }

    val estimatedDecodedBytes = (contentsBase64.length.toLong() * 3) / 4
    if (estimatedDecodedBytes > MAX_SAVE_PAYLOAD_BYTES) {
      resolveSave(requestId, false, "Payload size (~${estimatedDecodedBytes / (1024 * 1024)} MB) exceeds the ${MAX_SAVE_PAYLOAD_BYTES / (1024 * 1024)} MB limit.")
      return
    }

    try {
      val decoded = Base64.decode(contentsBase64, Base64.DEFAULT)
      if (decoded.size > MAX_SAVE_PAYLOAD_BYTES) {
        resolveSave(requestId, false, "Decoded payload size (${decoded.size} bytes) exceeds the ${MAX_SAVE_PAYLOAD_BYTES / (1024 * 1024)} MB limit.")
        return
      }
      pendingSave = PendingSave(requestId, decoded)
      launchCreateDocument(requestId, defaultFilename, mimeType)
    } catch (error: Exception) {
      resolveSave(requestId, false, "File payload could not be decoded: ${error.message ?: "unknown error"}")
    }
  }

  @Suppress("DEPRECATION")
  private fun openTextFile(requestId: String) {
    if (pendingSave != null || pendingOpenRequestId != null) {
      resolveOpen(requestId, null, "Another file operation is already in progress.")
      return
    }

    pendingOpenRequestId = requestId
    try {
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

  @Suppress("DEPRECATION")
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

  companion object {
    private const val REQUEST_SAVE_FILE = 7101
    private const val REQUEST_OPEN_FILE = 7102
    private const val AUTOFILL_LOG_TAG = "AegisAutofill"

    private const val MAX_SAVE_PAYLOAD_BYTES = 25 * 1024 * 1024
    private const val MAX_OPEN_FILE_BYTES = 25L * 1024 * 1024
    private const val STREAMING_BUFFER_SIZE = 8192

    private val ALLOWED_SAVE_MIME_TYPES = setOf(
      "application/json",
      "text/csv",
      "text/comma-separated-values",
      "application/csv",
      "application/octet-stream",
      "text/plain",
    )
  }
}
