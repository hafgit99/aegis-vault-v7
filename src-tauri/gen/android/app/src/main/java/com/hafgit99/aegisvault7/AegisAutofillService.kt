package com.hafgit99.aegisvault7

import android.os.Build
import android.service.autofill.AutofillService
import android.service.autofill.FillCallback
import android.service.autofill.FillRequest
import android.service.autofill.SaveCallback
import android.service.autofill.SaveRequest
import androidx.annotation.RequiresApi

@RequiresApi(Build.VERSION_CODES.O)
class AegisAutofillService : AutofillService() {
  override fun onFillRequest(
    request: FillRequest,
    cancellationSignal: android.os.CancellationSignal,
    callback: FillCallback,
  ) {
    callback.onSuccess(null)
  }

  override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
    callback.onSuccess()
  }
}
