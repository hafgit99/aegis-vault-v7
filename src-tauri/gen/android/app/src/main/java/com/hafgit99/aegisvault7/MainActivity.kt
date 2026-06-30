package com.hafgit99.aegisvault7

import android.app.Activity
import android.content.Intent
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.os.Bundle
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
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject

class MainActivity : TauriActivity() {
  private var webViewRef: WebView? = null
  private var pendingSave: PendingSave? = null
  private var pendingOpenRequestId: String? = null
  private var pendingAutofillRequest: AutofillLaunchRequest? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
    enableEdgeToEdge()
    captureAutofillIntent(intent)
    super.onCreate(savedInstanceState)
  }

  @Suppress("DEPRECATION")
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    captureAutofillIntent(intent)
    notifyAutofillIntent()
  }

  override fun onResume() {
    super.onResume()
    notifyAutofillIntent()
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    webViewRef = webView
    webView.addJavascriptInterface(AndroidFileBridge(), "AegisAndroidFiles")
    webView.addJavascriptInterface(AndroidSecureStorageBridge(), "AegisAndroidSecureStorage")
    webView.addJavascriptInterface(AndroidAutofillBridge(), "AegisAndroidAutofill")
    webView.post { notifyAutofillIntent() }
    webView.postDelayed({ notifyAutofillIntent() }, 250)
    webView.postDelayed({ notifyAutofillIntent() }, 1000)
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
      contentResolver.openOutputStream(uri, "wt")?.use { output ->
        output.write(save.bytes)
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
      val contents = contentResolver.openInputStream(uri)?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }
        ?: throw IllegalStateException("Selected file could not be opened.")
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

  private fun notifyAutofillIntent() {
    val payload = pendingAutofillRequest?.toJson()?.toString() ?: "null"
    val script = "window.__aegisAndroidAutofill && window.__aegisAndroidAutofill.onRequest($payload)"
    evaluateOnWebView(script)
  }

  private fun jsonStringOrNull(value: String?): String {
    return if (value == null) "null" else JSONObject.quote(value)
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

        pendingSave = PendingSave(requestId, contents.toByteArray(Charsets.UTF_8))
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

        try {
          pendingSave = PendingSave(requestId, Base64.decode(contentsBase64, Base64.DEFAULT))
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
          val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/json", "text/csv", "text/plain", "application/octet-stream"))
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
      } catch (_: Exception) {
        null
      }
    }

    @JavascriptInterface
    fun setItem(key: String, value: String): Boolean {
      return try {
        securePreferences()
          .edit()
          .putString(preferenceKey(key), encryptSecureValue(value))
          .apply()
        true
      } catch (_: Exception) {
        false
      }
    }

    @JavascriptInterface
    fun removeItem(key: String): Boolean {
      return try {
        securePreferences().edit().remove(preferenceKey(key)).apply()
        true
      } catch (_: Exception) {
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
          startActivity(Intent(Settings.ACTION_SETTINGS))
          true
        } catch (_: Exception) {
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
      if (current.requestId != requestId) return false
      pendingAutofillRequest = null
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
          "Returned authenticated Autofill response requestId=$requestId usernameFields=${current.usernameIds.size} passwordFields=${current.passwordIds.size}"
        )
        pendingAutofillRequest = null
        finish()
        true
      } catch (_: Exception) {
        false
      }
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

  private fun getOrCreateSecureStorageKey(): SecretKey {
    val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
    val existingKey = keyStore.getKey(SECURE_STORAGE_KEY_ALIAS, null)
    if (existingKey is SecretKey) return existingKey

    val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
    val keySpec = KeyGenParameterSpec.Builder(
      SECURE_STORAGE_KEY_ALIAS,
      KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
    )
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setRandomizedEncryptionRequired(true)
      .setUserAuthenticationRequired(false)
      .build()

    keyGenerator.init(keySpec)
    return keyGenerator.generateKey()
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
    private const val AUTOFILL_REQUEST_MAX_AGE_MS = 5 * 60 * 1000L
    private const val AUTOFILL_LOG_TAG = "AegisAutofill"
  }
}
