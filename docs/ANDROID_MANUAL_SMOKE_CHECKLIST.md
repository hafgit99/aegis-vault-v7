# Android Manual Smoke Checklist

Use this checklist for every Android release candidate that may be shared outside local development. Keep the completed copy with the release evidence folder.

Candidate:

- Evidence folder:
- Version:
- Commit:
- APK file:
- APK SHA-256:
- Device model:
- Android version / SDK:
- Build type:
- Fresh install used:
- Active Autofill provider:
- Tester:
- Date:

Evidence boundary:

- Complete the checklist copy generated inside `release-local/android/<timestamp>/` for the exact APK under review.
- Mark `N/A` only when hardware or OS support is unavailable, and record the reason in Notes.
- Final shareable candidates should pass `npm run android:release:evidence:verify -- --dir release-local/android/<timestamp> --require-device --require-fresh-install --require-signed --require-completed-checklist`.

## Evidence Files

- [ ] Evidence folder contains the signed APK/AAB candidate.
- [ ] Evidence folder contains `metadata.json`.
- [ ] Evidence folder contains `SHA256SUMS.txt`.
- [ ] Evidence folder contains the strict Android release report.
- [ ] Evidence folder contains `android-device-doctor.txt` for device-tested candidates.
- [ ] Evidence folder contains `android-device-security.txt` for device-tested candidates.
- [ ] APK SHA-256 recorded above matches the evidence checksum.
- [ ] Working tree was clean when evidence was generated, or dirty status is explicitly accepted for local-only testing.

## Setup And Unlock

- [ ] Fresh install opens the master password setup flow.
- [ ] Fresh install was performed with `npm run android:release:gate -- --device --fresh-install` or an equivalent signed-release command.
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

## Biometric Production Approval Matrix

Complete this section before any public Android release notes, website copy, README text, or store listing claims production-grade biometric unlock support. Until this matrix is approved, describe Android biometric unlock as release-candidate validation only.

- Biometric production claim status: blocked
- Biometric matrix reviewer:
- Biometric matrix completed date:
- Pixel evidence:
- Samsung evidence:
- Xiaomi evidence:
- Android 12 evidence:
- Android 13 evidence:
- Android 14 evidence:
- Android 15 evidence:

Required biometric matrix checks:

- [ ] Pixel-class device: enable biometric while unlocked, restart app, biometric unlock succeeds, cancel path is localized/non-crashing, disable removes local biometric state.
- [ ] Samsung device: enable biometric while unlocked, restart app, biometric unlock succeeds, cancel path is localized/non-crashing, disable removes local biometric state.
- [ ] Xiaomi/HyperOS or MIUI device: enable biometric while unlocked, restart app, biometric unlock succeeds, cancel path is localized/non-crashing, disable removes local biometric state.
- [ ] Android 12 coverage records OEM/model, SDK/API level, biometric hardware type, result, tester, and evidence folder or screenshot/video reference.
- [ ] Android 13 coverage records OEM/model, SDK/API level, biometric hardware type, result, tester, and evidence folder or screenshot/video reference.
- [ ] Android 14 coverage records OEM/model, SDK/API level, biometric hardware type, result, tester, and evidence folder or screenshot/video reference.
- [ ] Android 15 coverage records OEM/model, SDK/API level, biometric hardware type, result, tester, and evidence folder or screenshot/video reference.
- [ ] Biometric production claim status above is changed to approved only after all required OEM and Android-version rows pass.

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
- [ ] New-site registration save prompt opens Aegis with title, username, password, and URL prefilled for review.
- [ ] If Chrome does not show Aegis, Chrome/Android password manager priority was changed and the result is recorded in Notes.
- [ ] Vivaldi behavior is recorded as PASS, FAIL, or N/A with reason.

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
- N/A reasons:
- Browser Autofill notes:
- Biometric device notes:
- Follow-up screenshots/videos:
