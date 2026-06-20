# Android Manual Smoke Checklist

Use this checklist for every Android release candidate that may be shared outside local development. Keep the completed copy with the release evidence folder.

Candidate:

- Version:
- Commit:
- Device model:
- Android version / SDK:
- Build type:
- Tester:
- Date:

## Setup And Unlock

- [ ] Fresh install opens the master password setup flow.
- [ ] New vault setup creates a master password and Secret Key.
- [ ] Emergency kit opens Android document picker and saves to the selected destination.
- [ ] Unlock succeeds with the correct master password and Secret Key.
- [ ] Wrong master password is rejected.
- [ ] Wrong Secret Key is rejected.
- [ ] App restart preserves encrypted vault state and unlock works again.

## Vault Items

- [ ] Create a login item.
- [ ] Edit title, username, password, URL, notes, category, and favorite state.
- [ ] Search finds the expected item.
- [ ] Item detail view is usable on phone viewport.
- [ ] Move item to trash.
- [ ] Restore item from trash.
- [ ] Permanently delete a test item from trash.

## Attachments

- [ ] Add a small text attachment to a vault item.
- [ ] Add an image/PDF attachment to a vault item.
- [ ] Download an attachment through Android document picker.
- [ ] Downloaded attachment opens and content is readable.
- [ ] Delete an attachment and verify item metadata updates.
- [ ] Restart app and verify remaining attachments still show correctly.

## Backup And Import

- [ ] Export encrypted `.aegis` backup through Android document picker.
- [ ] Exported `.aegis` file is visible at the chosen destination.
- [ ] Import a valid encrypted `.aegis` backup.
- [ ] Import cancellation returns cleanly with no crash.
- [ ] Wrong backup password is rejected.
- [ ] Plain `.json` export requires explicit warning/confirmation.
- [ ] Plain `.json` export writes only after user chooses a destination.

## Security Controls

- [ ] Screenshot is blocked on sensitive screens.
- [ ] Task switcher preview hides sensitive content.
- [ ] Manual lock clears the active vault session.
- [ ] Backgrounding immediately shields sensitive content.
- [ ] Returning before configured auto-lock delay does not unnecessarily require unlock.
- [ ] Returning after configured auto-lock delay requires unlock.
- [ ] Clipboard copy works and clears according to app policy.

## Biometric And Secret Storage

- [ ] Biometric enable succeeds only while vault is unlocked.
- [ ] Biometric unlock works after app restart.
- [ ] Biometric cancellation shows a localized non-crashing message.
- [ ] Disabling biometric removes local biometric unlock state.
- [ ] Remembered Secret Key behavior matches the selected setting.

## Autofill

- [ ] Aegis appears in Android Autofill provider settings.
- [ ] Aegis is selected as the active Autofill provider.
- [ ] `npm run android:device:doctor` reports active Autofill provider as PASS.
- [ ] Aloha/browser login form shows Aegis fill prompt.
- [ ] Chrome login form shows Aegis fill prompt after Google Password Manager priority is disabled.
- [ ] Matching vault record is promoted.
- [ ] Mismatched record requires second confirmation.
- [ ] Approved fill writes username and password into the target form.
- [ ] Stale Autofill request does not fill credentials.

## Mobile UI

- [ ] Lock screen language selector does not overlap the system status bar.
- [ ] Dashboard header respects safe area.
- [ ] Sidebar lock action does not overlap bottom navigation/system controls.
- [ ] New password modal category selector is reachable.
- [ ] Settings page is not a single unusable long block.
- [ ] Security Analysis, Password Manager, Donation, and Trash views are usable on phone.
- [ ] Turkish, English, and Chinese text remain readable.

## Notes

- Blocking issues:
- Non-blocking issues:
- Follow-up screenshots/videos:
