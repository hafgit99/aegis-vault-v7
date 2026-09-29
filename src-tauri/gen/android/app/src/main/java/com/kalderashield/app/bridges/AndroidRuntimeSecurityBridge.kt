ackage com.kalderashield.app.bridges

import android.webkit.JavascriptInterface
import com.kalderashield.app.security.RuntimeSecurityPosture

class AndroidRuntimeSecurityBridge(
    private val securityPosture: RuntimeSecurityPosture
) {
    @JavascriptInterface
    fun getPosture(): String = getRuntimeRiskSignals()

    @JavascriptInterface
    fun getRuntimeRiskSignals(): String = securityPosture.getRuntimeRiskSignals().toString()
}
