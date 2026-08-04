package com.hafgit99.aegisvault7.security

import android.content.Context
import android.content.pm.ApplicationInfo
import android.os.Build
import android.os.Debug
import com.hafgit99.aegisvault7.BuildConfig
import org.json.JSONArray
import org.json.JSONObject

/**
 * Handles runtime security posture checks including root detection, debugger detection,
 * test key inspection, and Frida/instrumentation detection with 30s result caching.
 */
class RuntimeSecurityPosture(private val context: Context) {

    @Volatile
    private var cachedPostureJson: String? = null

    @Volatile
    private var cachedPostureTimestamp: Long = 0L

    fun getRuntimeRiskSignals(): JSONObject {
        val now = System.currentTimeMillis()
        if (now - cachedPostureTimestamp < POSTURE_CACHE_TTL_MS) {
            cachedPostureJson?.let {
                try {
                    return JSONObject(it)
                } catch (_: Exception) {}
            }
        }

        val releaseBuild = !BuildConfig.DEBUG
        val appDebuggable = (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
        val debuggerAttached = Debug.isDebuggerConnected() || Debug.waitingForDebugger()
        val signals = linkedSetOf<String>()

        if (appDebuggable && releaseBuild) signals.add("app_debuggable")
        if (debuggerAttached && releaseBuild) signals.add("debugger_attached")

        val isTestBuildType = Build.TYPE == "userdebug" || Build.TYPE == "eng"
        val hasTestKeys = Build.TAGS?.contains("test-keys", ignoreCase = true) == true ||
            Build.TAGS?.contains("dev-keys", ignoreCase = true) == true
        if (releaseBuild && (hasTestKeys || isTestBuildType)) {
            signals.add("test_keys")
        }

        if (releaseBuild && hasRootArtifactSignal()) signals.add("root_artifact")
        if (releaseBuild && hasInstrumentationSignal()) signals.add("instrumentation")

        val result = JSONObject()
            .put("releaseBuild", releaseBuild)
            .put("appDebuggable", appDebuggable)
            .put("debuggerAttached", debuggerAttached)
            .put("riskDetected", releaseBuild && signals.isNotEmpty())
            .put("mode", "warning-only")
            .put("signals", JSONArray(signals.toList()))

        cachedPostureJson = result.toString()
        cachedPostureTimestamp = now
        return result
    }

    private fun hasRootArtifactSignal(): Boolean {
        return ROOT_ARTIFACT_PATHS.any { candidate ->
            try {
                java.io.File(candidate).exists()
            } catch (_: SecurityException) {
                false
            }
        }
    }

    private fun hasInstrumentationSignal(): Boolean {
        val mapsSignal = try {
            java.io.File("/proc/self/maps").useLines { lines ->
                lines.any { line ->
                    val normalized = line.lowercase()
                    INSTRUMENTATION_MARKERS.any(normalized::contains)
                }
            }
        } catch (_: Exception) {
            false
        }

        if (mapsSignal) return true

        // Check for active Frida server port on localhost (27042)
        return try {
            val socket = java.net.Socket()
            socket.connect(java.net.InetSocketAddress("127.0.0.1", 27042), 15)
            socket.close()
            true
        } catch (_: Exception) {
            false
        }
    }

    companion object {
        private const val POSTURE_CACHE_TTL_MS = 30_000L

        private val ROOT_ARTIFACT_PATHS = arrayOf(
            "/system/app/Superuser.apk",
            "/system/bin/su",
            "/system/xbin/su",
            "/sbin/su",
            "/su/bin/su",
            "/data/adb/magisk",
            "/data/adb/ksu",
        )

        private val INSTRUMENTATION_MARKERS = arrayOf(
            "frida",
            "gum-js-loop",
            "xposed",
            "substrate",
            "zygisk",
        )
    }
}
