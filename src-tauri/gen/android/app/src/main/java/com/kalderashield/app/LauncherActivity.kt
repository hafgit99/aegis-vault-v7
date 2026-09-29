ackage com.kalderashield.app

import android.app.Activity
import android.content.Intent
import android.os.Bundle

/**
 * K-1 — the only exported entry point into the app.
 *
 * ## Why the trampoline exists
 *
 * `MainActivity` used to hold the `MAIN`/`LAUNCHER` intent-filter, which
 * forces `android:exported="true"` on Android 12+ (an Activity with an
 * intent-filter and no explicit `exported` fails to install). An exported
 * Activity is reachable by **any** app on the device, and `MainActivity` used
 * to build its Autofill state from Intent extras — so a hostile app could
 * forge `ACTION_AUTOFILL_AUTHENTICATE`, name a `webDomain` of its choosing, and
 * collect the credential the user approved through its own `onActivityResult`.
 *
 * Moving the LAUNCHER filter here means `MainActivity` can be
 * `android:exported="false"`. The system can still reach it: the Autofill
 * `PendingIntent` and the `startActivity` call in `KalderaShieldAutofillService` both
 * originate inside this app (and the PendingIntent is executed by the system
 * on our behalf), and a non-exported Activity is always launchable by its own
 * application.
 *
 * ## What this class deliberately does NOT do
 *
 * It forwards nothing. It accepts no extras, copies no extras, and starts
 * `MainActivity` with a bare intent, so there is no path by which a launcher's
 * extras can reach the Autofill code. If a future caller tries to pass data
 * through here, that is the regression to look for.
 *
 * `noHistory` + `excludeFromRecents` keep the trampoline out of the recents
 * list and out of the back stack, so the user only ever sees `MainActivity`.
 */
class LauncherActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        startActivity(
            Intent(this, MainActivity::class.java).apply {
                // Forward nothing from the launching intent. Autofill requests
                // reach MainActivity through AutofillRequestRegistry, never
                // through Intent extras.
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            },
        )
        finish()
        overridePendingTransition(0, 0)
    }
}
