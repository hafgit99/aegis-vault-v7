package com.hafgit99.aegisvault7.bridges

import android.content.Intent
import android.webkit.JavascriptInterface
import com.hafgit99.aegisvault7.MainActivity

class AndroidFileBridge(
    private val activity: MainActivity,
    private val onSaveText: (requestId: String, defaultFilename: String, mimeType: String, contents: String) -> Unit,
    private val onSaveBase64: (requestId: String, defaultFilename: String, mimeType: String, contentsBase64: String) -> Unit,
    private val onOpenFile: (requestId: String) -> Unit,
) {
    @JavascriptInterface
    fun saveTextFile(requestId: String, defaultFilename: String, mimeType: String, contents: String) {
        activity.runOnUiThread {
            onSaveText(requestId, defaultFilename, mimeType, contents)
        }
    }

    @JavascriptInterface
    fun saveBase64File(requestId: String, defaultFilename: String, mimeType: String, contentsBase64: String) {
        activity.runOnUiThread {
            onSaveBase64(requestId, defaultFilename, mimeType, contentsBase64)
        }
    }

    @JavascriptInterface
    fun openTextFile(requestId: String) {
        activity.runOnUiThread {
            onOpenFile(requestId)
        }
    }
}
