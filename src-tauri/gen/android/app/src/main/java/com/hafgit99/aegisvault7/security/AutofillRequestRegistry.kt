package com.hafgit99.aegisvault7.security

import com.hafgit99.aegisvault7.model.AutofillLaunchRequest
import com.hafgit99.aegisvault7.model.AutofillSaveCandidate

/**
 * K-1 — process-global Autofill request registry.
 *
 * ## Why this exists
 *
 * `MainActivity` used to be `android:exported="true"` (it carried the LAUNCHER
 * intent-filter) and it built its Autofill state directly from Intent extras:
 *
 * ```
 * if (intent?.action != AegisAutofillService.ACTION_AUTOFILL_AUTHENTICATE) return
 * pendingAutofillRequest = AutofillLaunchRequest(
 *   requestId = intent.getStringExtra(EXTRA_AUTOFILL_REQUEST_ID),
 *   webDomain = intent.getStringExtra(EXTRA_AUTOFILL_WEB_DOMAIN),
 *   passwordIds = intent.autofillIdsExtra(EXTRA_AUTOFILL_PASSWORD_IDS),
 *   ...
 * )
 * ```
 *
 * `ACTION_AUTOFILL_AUTHENTICATE` is only a string constant, so any app on the
 * device could forge that intent, name any `webDomain` it liked, and receive
 * the selected credential back through its own `onActivityResult`
 * (`AndroidAutofillBridge.completePendingRequest` -> `setResult(RESULT_OK,
 * EXTRA_AUTHENTICATION_RESULT)`). The same root cause let a forged
 * `ACTION_AUTOFILL_SAVE` poison the vault, and — because `MainActivity` is
 * `singleTask` — let an attacker *replace* a genuine pending request.
 *
 * ## The rule this type enforces
 *
 * The Intent is now only a **routing hint carrying an opaque request id**.
 * The authoritative request object lives here, in the app's own address
 * space, and is written by exactly one caller: `AegisAutofillService`, which
 * is the only component the system ever invokes with a real
 * `FillRequest`/`SaveRequest` and the only one that can read the
 * `AssistStructure` the `appPackage`/`webDomain` are derived from.
 *
 * Consequences:
 *  - A forged intent cannot invent an `appPackage` or `webDomain`; an unknown
 *    id resolves to `null` and is rejected.
 *  - Ids are 128-bit random (`UUID.randomUUID()`), so they cannot be guessed
 *    or replayed across app launches.
 *  - `appPackage`/`webDomain` can no longer be substituted at the Activity
 *    boundary, which is what the phishing-UI half of the attack needed.
 *
 * ## Same-process requirement
 *
 * This is an in-memory registry, so the service and the activity MUST run in
 * one process. Neither declares `android:process`, so Android runs them in the
 * app's default process. `security:android-autofill-boundary` fails the build
 * if a component ever declares `android:process`, and it also fails if any
 * file other than `AegisAutofillService.kt` calls a mutating method here.
 *
 * If the process is killed between the fill request and the Activity launch,
 * the registry is empty and the request is simply refused — the user retries
 * the fill. That is the intended fail-closed behaviour.
 */
object AutofillRequestRegistry {
    private val lock = Any()

    /**
     * Insertion-ordered so the oldest entry is the first eviction candidate.
     * Bounded so a hostile or buggy client that fires many fill requests
     * without ever launching the Activity cannot grow this without limit.
     */
    private const val MAX_ENTRIES = 8

    private val fillRequests = LinkedHashMap<String, AutofillLaunchRequest>()
    private val saveCandidates = LinkedHashMap<String, AutofillSaveCandidate>()

    // ---------------------------------------------------------------------
    // Write side — AegisAutofillService ONLY.
    // ---------------------------------------------------------------------

    /**
     * @return the stored request id, so the caller can build the Intent that
     *         routes to the Activity without duplicating id generation.
     */
    fun registerFillRequest(request: AutofillLaunchRequest): String {
        synchronized(lock) {
            evictExpiredLocked(fillRequests, { it.createdAt }, request.createdAt)
            fillRequests[request.requestId] = request
            trimLocked(fillRequests)
        }
        return request.requestId
    }

    fun registerSaveCandidate(candidate: AutofillSaveCandidate): String {
        synchronized(lock) {
            evictExpiredLocked(saveCandidates, { it.createdAt }, candidate.createdAt)
            saveCandidates[candidate.requestId] = candidate
            trimLocked(saveCandidates)
        }
        return candidate.requestId
    }

    // ---------------------------------------------------------------------
    // Read side — MainActivity and the JS bridge.
    // ---------------------------------------------------------------------

    /** Read-only peek. Returns `null` for unknown or expired ids. */
    fun findFillRequest(requestId: String?, now: Long = System.currentTimeMillis()): AutofillLaunchRequest? {
        if (requestId.isNullOrBlank()) return null
        return synchronized(lock) {
            val request = fillRequests[requestId]
            when {
                request == null -> {
                    AutofillSecurityLog.unknownRequest("fill", requestId)
                    null
                }
                !request.isFresh(now) -> {
                    // A stale entry is a bug or a replay attempt; drop it and
                    // report the miss rather than serving old field ids.
                    fillRequests.remove(requestId)
                    AutofillSecurityLog.staleRequest("fill", requestId)
                    null
                }
                else -> request
            }
        }
    }

    fun findSaveCandidate(requestId: String?, now: Long = System.currentTimeMillis()): AutofillSaveCandidate? {
        if (requestId.isNullOrBlank()) return null
        return synchronized(lock) {
            val candidate = saveCandidates[requestId]
            when {
                candidate == null -> {
                    AutofillSecurityLog.unknownRequest("save", requestId)
                    null
                }
                now - candidate.createdAt !in 0..AutofillLaunchRequest.AUTOFILL_REQUEST_MAX_AGE_MS -> {
                    saveCandidates.remove(requestId)
                    AutofillSecurityLog.staleRequest("save", requestId)
                    null
                }
                else -> candidate
            }
        }
    }

    /**
     * Remove a request once it has been resolved (filled, cancelled, or
     * rejected). Returns true when an entry was actually removed, which the
     * JS bridge surfaces so a mismatched id is visible instead of silent.
     */
    fun consumeFillRequest(requestId: String?): Boolean {
        if (requestId.isNullOrBlank()) return false
        return synchronized(lock) { fillRequests.remove(requestId) != null }
    }

    fun consumeSaveCandidate(requestId: String?): Boolean {
        if (requestId.isNullOrBlank()) return false
        return synchronized(lock) { saveCandidates.remove(requestId) != null }
    }

    /**
     * Replace a request with an equivalent instance. Used only by the Activity
     * to re-assert the object it already owns; an id that is not registered is
     * refused, so this cannot be used to plant a foreign request.
     */
    fun replaceFillRequest(request: AutofillLaunchRequest): Boolean {
        return synchronized(lock) {
            if (!fillRequests.containsKey(request.requestId)) return false
            fillRequests[request.requestId] = request
            true
        }
    }

    /**
     * Replace a save candidate with its resolved (decrypted) form so the
     * plaintext never has to live in two places at once.
     */
    fun replaceSaveCandidate(candidate: AutofillSaveCandidate): Boolean {
        return synchronized(lock) {
            if (!saveCandidates.containsKey(candidate.requestId)) return false
            saveCandidates[candidate.requestId] = candidate
            true
        }
    }

    /** Test/diagnostic helper: how many entries are currently held. */
    fun size(): Int = synchronized(lock) { fillRequests.size + saveCandidates.size }

    fun clear() {
        synchronized(lock) {
            fillRequests.clear()
            saveCandidates.clear()
        }
    }

    // ---------------------------------------------------------------------

    private fun <T> evictExpiredLocked(
        store: LinkedHashMap<String, T>,
        createdAtOf: (T) -> Long,
        now: Long,
    ) {
        val iterator = store.entries.iterator()
        while (iterator.hasNext()) {
            val entry = iterator.next()
            if (now - createdAtOf(entry.value) > AutofillLaunchRequest.AUTOFILL_REQUEST_MAX_AGE_MS) {
                iterator.remove()
            }
        }
    }

    private fun <T> trimLocked(store: LinkedHashMap<String, T>) {
        while (store.size > MAX_ENTRIES) {
            val oldest = store.keys.firstOrNull() ?: return
            store.remove(oldest)
        }
    }
}
