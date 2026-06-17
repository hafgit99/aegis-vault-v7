package com.hafgit99.aegisvault7

import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.service.autofill.FillResponse
import android.service.autofill.AutofillService
import android.service.autofill.FillCallback
import android.service.autofill.FillRequest
import android.service.autofill.SaveCallback
import android.service.autofill.SaveRequest
import android.text.InputType
import android.view.autofill.AutofillId
import android.app.assist.AssistStructure
import android.widget.RemoteViews
import androidx.annotation.RequiresApi

@RequiresApi(Build.VERSION_CODES.O)
class AegisAutofillService : AutofillService() {
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
      callback.onSuccess(null)
      return
    }

    val authenticationIds = loginFields.allIds().toTypedArray()
    @Suppress("DEPRECATION")
    val response = FillResponse.Builder()
      .setAuthentication(authenticationIds, createAuthenticationIntent().intentSender, createAuthenticationPresentation())
      .build()

    callback.onSuccess(response)
  }

  override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
    callback.onSuccess()
  }

  private fun collectLoginFields(structure: AssistStructure): LoginFields {
    val fields = LoginFields()

    for (windowIndex in 0 until structure.windowNodeCount) {
      traverseNode(structure.getWindowNodeAt(windowIndex).rootViewNode, fields)
    }

    return fields
  }

  private fun traverseNode(node: AssistStructure.ViewNode, fields: LoginFields) {
    val autofillId = node.autofillId
    if (autofillId != null) {
      when {
        isPasswordField(node) -> fields.passwordIds.add(autofillId)
        isUsernameField(node) -> fields.usernameIds.add(autofillId)
      }
    }

    for (childIndex in 0 until node.childCount) {
      traverseNode(node.getChildAt(childIndex), fields)
    }
  }

  private fun isPasswordField(node: AssistStructure.ViewNode): Boolean {
    val tokens = node.searchTokens()
    if (tokens.any { it.contains("password") || it == "passwd" || it == "pwd" }) return true

    val variation = node.inputType and InputType.TYPE_MASK_VARIATION
    return variation == InputType.TYPE_TEXT_VARIATION_PASSWORD ||
      variation == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD ||
      variation == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD ||
      variation == InputType.TYPE_NUMBER_VARIATION_PASSWORD
  }

  private fun isUsernameField(node: AssistStructure.ViewNode): Boolean {
    val tokens = node.searchTokens()
    return tokens.any {
      it.contains("username") ||
        it == "user" ||
        it.contains("email") ||
        it.contains("e-mail") ||
        it.contains("login") ||
        it.contains("account")
    }
  }

  private fun AssistStructure.ViewNode.searchTokens(): List<String> {
    val values = mutableListOf<String>()
    values.addAll(autofillHints?.toList().orEmpty())
    values.add(hint?.toString().orEmpty())
    values.add(idEntry.orEmpty())
    values.add(className?.toString().orEmpty())
    return values
      .flatMap { it.split(' ', '_', '-', '.', ':', '/', '\\') }
      .map { it.trim().lowercase() }
      .filter { it.isNotBlank() }
  }

  private fun createAuthenticationIntent(): PendingIntent {
    val intent = Intent(this, MainActivity::class.java).apply {
      action = ACTION_AUTOFILL_AUTHENTICATE
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }

    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    return PendingIntent.getActivity(this, AUTOFILL_AUTH_REQUEST_CODE, intent, flags)
  }

  private fun createAuthenticationPresentation(): RemoteViews {
    return RemoteViews(packageName, android.R.layout.simple_list_item_1).apply {
      setTextViewText(android.R.id.text1, getString(R.string.autofill_unlock_prompt))
    }
  }

  private data class LoginFields(
    val usernameIds: MutableList<AutofillId> = mutableListOf(),
    val passwordIds: MutableList<AutofillId> = mutableListOf(),
  ) {
    fun hasFillableLogin(): Boolean = passwordIds.isNotEmpty() && (usernameIds.isNotEmpty() || passwordIds.size == 1)

    fun allIds(): List<AutofillId> = (usernameIds + passwordIds).distinct()
  }

  companion object {
    private const val AUTOFILL_AUTH_REQUEST_CODE = 7201
    private const val ACTION_AUTOFILL_AUTHENTICATE = "com.hafgit99.aegisvault7.action.AUTOFILL_AUTHENTICATE"
  }
}
