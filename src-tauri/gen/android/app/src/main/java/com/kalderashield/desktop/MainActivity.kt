package com.kalderashield.desktop

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
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import com.kalderashield.desktop.bridges.AndroidAutofillBridge
import com.kalderashield.desktop.bridges.AndroidBiometricKeyStoreBridge
import com.kalderashield.desktop.bridges.AndroidFileBridge
import com.kalderashield.desktop.bridges.AndroidRuntimeSecurityBridge
import com.kalderashield.desktop.bridges.AndroidSecureStorageBridge
import com.kalderashield.desktop.crypto.SecureStorageKeyStore
import com.kalderashield.desktop.model.AndroidImportFile
import com.kalderashield.desktop.model.AutofillLaunchRequest
import com.kalderashield.desktop.model.AutofillSaveCandidate
import com.kalderashield.desktop.model.PendingSave
import com.kalderashield.desktop.security.AutofillRequestRegistry
import com.kalderashield.desktop.security.AutofillSecurityLog
import com.kalderashield.desktop.security.RuntimeSecurityPosture
import org.json.JSONObject

class MainActivity : TauriActivity() {
  private var webViewRef: WebView? = null
  private var pendingSave: PendingSave? = null
  private var pendingOpenRequestId: String? = null

  /**
   * K-1: opaque registry keys handed over by `KalderaShieldAutofillService`, NOT
   * Autofill request objects. The objects themselves stay in
   * [AutofillRequestRegistry] so nothing about the requesting app can be
   * substituted at the Intent boundary.
   */
  private var pendingAutofillRequestId: String? = null
  private var pendingAutofillSaveCandidateId: String? = null

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
      getPendingAutofillRequest = { currentAutofillRequest() },
      setPendingAutofillRequest = { request ->
        // K-1: the bridge may only ever hand back a request that came from the
        // registry. Accepting a foreign object here would reintroduce the very
        // injection point the registry removes.
        val currentId = pendingAutofillRequestId
        when {
          request == null -> {
            pendingAutofillRequestId = null
            AutofillRequestRegistry.consumeFillRequest(currentId)
          }
          request.requestId == currentId -> AutofillRequestRegistry.replaceFillRequest(request)
          else -> Log.w(
            AUTOFILL_LOG_TAG,
            "Rejected autofill request substitution: pendingRequestId=$currentId " +
              "offeredRequestId=${request.requestId}"
          )
        }
      },
      getPendingAutofillSaveCandidate = { currentAutofillSaveCandidate() },
      setPendingAutofillSaveCandidate = { candidate ->
        val currentId = pendingAutofillSaveCandidateId
        when {
          candidate == null -> {
            pendingAutofillSaveCandidateId = null
            AutofillRequestRegistry.consumeSaveCandidate(currentId)
          }
          candidate.requestId == currentId -> AutofillRequestRegistry.replaceSaveCandidate(candidate)
          else -> Log.w(
            AUTOFILL_LOG_TAG,
            "Rejected autofill save candidate substitution: pendingRequestId=$currentId " +
              "offeredRequestId=${candidate.requestId}"
          )
        }
      }
    )

    val securityBridge = AndroidRuntimeSecurityBridge(runtimePosture)

    // RUST-O4: biometric-bound wrapping key bridge (wrap/unwrap only; opaque handle transport)
    val biometricKeyBridge = AndroidBiometricKeyStoreBridge(this, secureKeyStore, ::evaluateOnWebView)

    webView.addJavascriptInterface(fileBridge, "KalderaShieldAndroidFiles")
    webView.addJavascriptInterface(secureStorageBridge, "KalderaShieldAndroidSecureStorage")
    webView.addJavascriptInterface(autofillBridge, "KalderaShieldAndroidAutofill")
    webView.addJavascriptInterface(securityBridge, "KalderaShieldAndroidSecurity")
    webView.addJavascriptInterface(biometricKeyBridge, "KalderaShieldAndroidBiometric")

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
    val script = "window.__KalderaShieldAndroidFiles && window.__KalderaShieldAndroidFiles.resolveSave(" +
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
    val script = "window.__KalderaShieldAndroidFiles && window.__KalderaShieldAndroidFiles.resolveOpen(" +
      "${JSONObject.quote(requestId)}, $payload, ${jsonStringOrNull(error)})"
    evaluateOnWebView(script)
  }

  private fun evaluateOnWebView(script: String) {
    val webView = webViewRef ?: return
    webView.post {
      webView.evaluateJavascript(script, null)
    }
  }

  /**
   * K-1: the Autofill Intent is now only a routing hint. Everything that
   * matters — `appPackage`, `webDomain`, the `AutofillId` lists, the save
   * candidate and its encrypted payload reference — is read from
   * [AutofillRequestRegistry], which only `KalderaShieldAutofillService` can write.
   *
   * The previous implementation built `AutofillLaunchRequest` /
   * `AutofillSaveCandidate` straight from Intent extras. `MainActivity` used to
   * be `android:exported="true"` (it carried the LAUNCHER intent-filter), so
   * any app on the device could forge `ACTION_AUTOFILL_AUTHENTICATE` with a
   * `webDomain` of its choosing, wait for the user to approve the resulting
   * fill UI, and read the selected credential out of its own
   * `onActivityResult`. The same root cause allowed forged save intents to
   * poison the vault and — because this Activity is `singleTask` — to replace
   * a genuine in-flight request.
   *
   * Both are now closed: this Activity is `android:exported="false"` (the
   * LAUNCHER filter moved to `LauncherActivity`), and even a delivered intent
   * cannot invent a request because an unregistered id is rejected.
   */
  @Suppress("NewApi")
  private fun captureAutofillIntent(intent: Intent?) {
    val action = intent?.action ?: return
    // `KalderaShieldAutofillService` extends `AutofillService`, which is API 26+, while
    // minSdk is 24. Lint flags these three references as NewApi.
    //
    // They are safe: every constant used here is a Kotlin `const val`, so the
    // compiler substitutes the literal at the call site and no runtime
    // reference to `KalderaShieldAutofillService` survives in this method. This is
    // called on every launch (onCreate/onNewIntent), so an actual class load
    // here would crash every app start on API 24/25 — which is exactly why the
    // inlining is documented rather than left implicit.
    //
    // The manifest keeps the service behind `BIND_AUTOFILL_SERVICE` with
    // `tools:targetApi="o"`, so the framework never binds it below API 26.
    val requestId = intent.getStringExtra(KalderaShieldAutofillService.EXTRA_REQUEST_ID)

    when (action) {
      KalderaShieldAutofillService.ACTION_AUTOFILL_AUTHENTICATE -> {
        if (AutofillRequestRegistry.findFillRequest(requestId) == null) {
          // Unknown or expired id: drop the launch and tell JS there is no
          // request, instead of synthesising one from untrusted extras.
          AutofillSecurityLog.unroutableIntent(action, requestId)
          pendingAutofillRequestId = null
          return
        }
        pendingAutofillRequestId = requestId
      }

      KalderaShieldAutofillService.ACTION_AUTOFILL_SAVE -> {
        if (AutofillRequestRegistry.findSaveCandidate(requestId) == null) {
          AutofillSecurityLog.unroutableIntent(action, requestId)
          pendingAutofillSaveCandidateId = null
          return
        }
        pendingAutofillSaveCandidateId = requestId
      }

      else -> return
    }
  }

  private fun currentAutofillRequest(): AutofillLaunchRequest? =
    AutofillRequestRegistry.findFillRequest(pendingAutofillRequestId)

  private fun currentAutofillSaveCandidate(): AutofillSaveCandidate? =
    AutofillRequestRegistry.findSaveCandidate(pendingAutofillSaveCandidateId)

  private fun purgeStaleAutofillRequests() {
    // Reading through the registry is already freshness-gated: an expired id
    // resolves to null and is evicted there, so there is nothing to mirror
    // here any more.
    if (pendingAutofillRequestId != null && currentAutofillRequest() == null) {
      pendingAutofillRequestId = null
    }
    if (pendingAutofillSaveCandidateId != null && currentAutofillSaveCandidate() == null) {
      pendingAutofillSaveCandidateId = null
    }
  }

  private fun notifyAutofillIntent() {
    purgeStaleAutofillRequests()
    val payload = currentAutofillRequest()?.toJson()?.toString() ?: "null"
    val script = "window.__KalderaShieldAndroidAutofill && window.__KalderaShieldAndroidAutofill.onRequest($payload)"
    evaluateOnWebView(script)
  }

  private fun notifyAutofillSaveCandidate() {
    val payload = currentAutofillSaveCandidate()?.toJson()?.toString() ?: "null"
    val script = "window.__KalderaShieldAndroidAutofill && window.__KalderaShieldAndroidAutofill.onSave($payload)"
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
    private const val AUTOFILL_LOG_TAG = "KalderaShieldAutofill"

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
