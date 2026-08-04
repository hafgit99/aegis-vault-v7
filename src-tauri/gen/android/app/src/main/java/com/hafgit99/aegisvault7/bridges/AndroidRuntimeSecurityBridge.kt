package com.hafgit99.aegisvault7.bridges

import android.webkit.JavascriptInterface
import com.hafgit99.aegisvault7.security.RuntimeSecurityPosture

class AndroidRuntimeSecurityBridge(
    private val securityPosture: RuntimeSecurityPosture
) {
    @JavascriptInterface
    fun getPosture(): String = getRuntimeRiskSignals()

    @JavascriptInterface
    fun getRuntimeRiskSignals(): String = securityPosture.getRuntimeRiskSignals().toString()
}
