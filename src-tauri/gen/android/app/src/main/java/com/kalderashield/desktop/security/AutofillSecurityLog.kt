ckage com.kalderashield.desktop.security

import android.util.Log

/**
 * K-1 — one audit sink for Autofill request-registry rejections.
 *
 * The registry is the component that decides whether a request is real, so
 * every rejection it makes is a security-relevant event and must be visible in
 * logcat. Keeping the calls here (rather than inline `Log.i` at each site)
 * guarantees the tag stays stable for `android-device-security.cjs`, which
 * greps for it when auditing a connected device.
 */
internal object AutofillSecurityLog {
    private const val TAG = "KalderaShieldAutofill"

    /** The id resolved to nothing: the Intent was not produced by our service. */
    fun unknownRequest(kind: String, requestId: String?) {
        Log.w(
            TAG,
            "Autofill audit event [REJECTED]: unknown $kind requestId=${requestId.orPlaceholder()} " +
                "reason=no-registry-entry (intent was not produced by KalderaShieldAutofillService)",
        )
    }

    /** The id resolved, but the request is past its freshness window. */
    fun staleRequest(kind: String, requestId: String?) {
        Log.w(
            TAG,
            "Autofill audit event [REJECTED]: expired $kind requestId=${requestId.orPlaceholder()} " +
                "reason=stale-registry-entry",
        )
    }

    /** A routable autofill action arrived without a registry entry behind it. */
    fun unroutableIntent(action: String?, requestId: String?) {
        Log.w(
            TAG,
            "Autofill audit event [REJECTED]: unroutable action=${action ?: "<none>"} " +
                "requestId=${requestId.orPlaceholder()} reason=not-registered",
        )
    }

    private fun String?.orPlaceholder(): String = this?.takeIf { it.isNotBlank() } ?: "<none>"
}
