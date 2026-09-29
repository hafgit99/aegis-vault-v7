package com.kalderashield.desktop.bridges

import android.webkit.JavascriptInterface
import com.kalderashield.desktop.security.RuntimeSecurityPosture

class AndroidRuntimeSecurityBridge(
    private val securityPosture: RuntimeSecurityPosture
) {
    @JavascriptInterface
    fun getPosture(): String = getRuntimeRiskSignals()

    @JavascriptInterface
    fun getRuntimeRiskSignals(): String = securityPosture.getRuntimeRiskSignals().toString()
}
