# Android Readiness Plan

This document tracks the Android preparation path for Aegis Vault 7. Android is not treated as a simple resize of the desktop app because the vault stores secrets, encrypted attachments, remembered Secret Key state, and backup files.

## Current Status

- Tauri Android CLI is available through `@tauri-apps/cli`.
- Android bundle metadata exists in `src-tauri/tauri.conf.json`.
- Android launcher icons are present under `src-tauri/icons/android`.
- The generated Android project is initialized under `src-tauri/gen/android`.
- The Android manifest disables OS backup for the vault app data with `android:allowBackup="false"` and `android:fullBackupContent="false"`.
- The universal debug APK build has been validated locally.
- The `aarch64` debug APK has been installed and smoke-tested on a physical Android device.
- The main Android activity sets `FLAG_SECURE` to block normal screenshots, screen recordings, and task-switcher previews on supported system surfaces.
- Android Emergency Kit, backup export, plaintext export, encrypted import, and attachment download flows use the system document picker bridge so users choose the destination or source file explicitly.
- Android document picker requests now fail closed with a safety timeout if the native bridge never calls back, surface native picker errors, and treat user cancellation as an explicit `false`/`null` result.
- Android remembered Secret Key state and biometric metadata now prefer an Android Keystore AES-GCM secure storage bridge, with browser storage kept as fallback and migration source.
- Android native biometric registration requires the Android Keystore-backed secure storage bridge and will not fall back to IndexedDB for native wrapping metadata.
- Android vault database persistence uses the Tauri app-data command path, which resolves to app-private storage on Android. When this native write succeeds, localStorage keeps only a desktop/mobile-managed setup marker instead of the encrypted row payload.
- Android Autofill is registered through a native `AutofillService` and a WebView bridge. The service detects likely login forms from non-secret field metadata, presents an authenticated Aegis entry point, prioritizes package/domain matches, requires explicit user approval, and returns credentials only through the active Android Autofill session.
- Desktop storage uses Tauri app-data persistence plus a local fallback marker.
- Browser/mobile web storage still relies on IndexedDB/localStorage/OPFS-style APIs.
- Native file dialogs are implemented for Windows desktop, while Android uses its generated project bridge and Android document intents.

## NPM Commands

```bash
npm run android:init
npm run android:dev
npm run android:run
npm run android:clean:jni
npm run android:build
npm run android:build:apk
npm run android:build:apk:debug
npm run android:build:apk:debug:aarch64
npm run android:build:apk:aarch64
npm run android:release:gate
npm run android:release:evidence
npm run android:release:evidence:verify
npm run android:release:version:check
npm run android:release:signing:check
npm run android:release:report
npm run android:device:doctor
npm run android:device:install
npm run android:device:launch
npm run android:device:status
npm run android:device:smoke
npm run android:device:security
```

On this Windows workstation, Android builds also require the Android Studio JBR, SDK, and NDK environment variables to be available before invoking the build scripts.

Use `android:build:apk:debug:aarch64` for normal phone smoke tests. The generic `android:build:apk:debug` command creates a universal debug APK that bundles `arm64-v8a`, `armeabi-v7a`, `x86`, and `x86_64` native libraries; it is useful for broad compatibility checks but is expected to be much larger.

The target-specific APK commands run `android:clean:jni` first because Tauri/Gradle can leave native library symlinks from previous multi-architecture builds under `src-tauri/gen/android/app/src/main/jniLibs`. Cleaning those ignored intermediates prevents stale ABIs from being packed into a later single-target APK.

Use `npm run android:release:report` after APK/AAB builds to record artifact size, SHA-256, package metadata, requested permissions, backup settings, cleartext traffic status, native ABI metadata, APK signature verification, signer certificate SHA-256, Autofill service protection, and FileProvider export status. Add `-- --strict` when warnings should fail the command. The report now focuses on the latest candidate artifact for the active build type (`debug` by default, `release` with `-- --signed`) so stale universal APKs left in Gradle output folders do not pollute the release decision.

Use `npm run android:device:doctor` before device testing to diagnose SDK/ADB setup, authorized USB devices, APK presence, installed package state, app-private data directory, and active Autofill provider status. Add `-- --enable-autofill` on a local debug device when the test reinstall resets the active Android Autofill provider; some OEM Android builds reject shell activation and still require manual provider selection.

Use `npm run android:release:gate` for the normal internal release candidate gate. It runs lint, version consistency checks, web build, target-specific Android debug APK build, and strict artifact reporting against the latest candidate artifact. Add `-- --device` when a USB-debugging device is connected and the candidate should also be diagnosed, installed, launched, smoke-tested, and checked with the Android device security doctor. Add `-- --device --fresh-install` when the candidate must first uninstall the selected package and prove the first-run setup flow from a clean app-data state. Add `-- --evidence` to copy APK/AAB artifacts, SHA-256 sums, metadata, and the strict report under `release-local/android/<timestamp>/`. Evidence mode now immediately runs `android:release:evidence:verify`, which checks metadata cleanliness, artifact hashes/sizes, report/checklist consistency, and required device/fresh-install/signed evidence when those gate flags are used. When `--device --evidence` are used together, the evidence folder also includes `android-device-doctor.txt` and `android-device-security.txt` after the install/launch smoke step. Add `-- --device --evidence --enable-autofill` for local Autofill regression passes; if Android rejects shell activation, manually select Aegis as the Autofill provider after install and rerun `npm run android:device:doctor`.

Shareable evidence requires a clean working tree. For local experiments only, `npm run android:release:gate -- --evidence --allow-dirty` records dirty status in `metadata.json` and still writes the evidence folder. Evidence metadata also records whether the candidate was tested with `--fresh-install`.

Every evidence folder includes only the latest candidate APK/AAB for the active build type plus a candidate-prefilled copy of `docs/ANDROID_MANUAL_SMOKE_CHECKLIST.md`. Complete that copy for backup/import, attachment, biometric, Autofill, safe-area, and mobile UI release checks. To audit an existing evidence folder later, run `npm run android:release:evidence:verify -- --dir release-local/android/<timestamp>` and add `--require-device`, `--require-fresh-install`, `--require-signed`, or `--require-completed-checklist` when reviewing final candidate evidence.

Use `npm run android:release:signing:check` before public release builds. Release signing is configured from environment variables so private keys and passwords never need to be committed:

```powershell
$env:AEGIS_ANDROID_KEYSTORE_PATH='C:\secure\aegis-vault-release.jks'
$env:AEGIS_ANDROID_KEY_ALIAS='aegis-vault'
$env:AEGIS_ANDROID_KEYSTORE_PASSWORD='<secret>'
$env:AEGIS_ANDROID_KEY_PASSWORD='<secret>'
```

The keystore file should preferably live outside the repository. If you keep it in a local `.secrets/` folder for convenience, keep that folder ignored, never stage it, and back it up separately in a password manager or offline storage. The repository ignores `.secrets/` and common Android signing files such as `.jks`, `.keystore`, `.p12`, `.pfx`, `keystore.properties`, and `key.properties`.

Create a local release keystore outside the repository with Android Studio JBR `keytool`:

```powershell
$secureDir = "$env:USERPROFILE\AegisVaultKeys"
New-Item -ItemType Directory -Force -Path $secureDir | Out-Null
& "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -v -storetype PKCS12 -keystore "$secureDir\aegis-vault-release.p12" -alias aegis-vault -keyalg RSA -keysize 4096 -validity 10000
```

Use unique, saved passwords for the keystore and key. Losing this keystore means future Android updates cannot be signed with the same identity.

For a signed APK candidate, set the signing environment and run:

```bash
npm run android:release:gate -- --signed --evidence
```

Local size baseline from this workstation:

- Universal debug APK: about 438 MiB after bundling four ABIs.
- Current target-specific debug APK should report a single native ABI: `arm64-v8a`.

Local device smoke baseline from this workstation:

- Device model: `2311DRK48G`.
- Device ABI: `arm64-v8a`.
- Debug package: `com.hafgit99.aegisvault7.debug`.
- APK install through `adb install -r` succeeded.
- App launch through `am start` succeeded.
- Process was running after launch and no immediate `FATAL EXCEPTION` appeared in the sampled logcat output.
- `android:device:smoke` now waits for delayed process startup and verifies the debug package data directory is app-private at `/data/user/0/com.hafgit99.aegisvault7.debug`.

## Phase 1: Readiness Gate

Before treating Android as a product target, verify:

- `npm run typecheck`
- `npm run test:unit`
- `npm run build`
- `npm run android:init`
- `npm run android:release:gate`
- `npm run android:device:doctor` before connected-device testing
- `npm run android:release:gate -- --device` when a physical device is connected
- `npm run android:release:gate -- --device --fresh-install` before sharing a release candidate that must prove first-run setup
- `npm run android:release:gate -- --device --evidence --enable-autofill` for local Autofill evidence after reinstall
- `npm run android:device:security -- --launch` to capture foreground, app-private storage, `FLAG_SECURE`, and crash-log evidence
- Optional compatibility check: `npm run android:build:apk:debug`

The device smoke gate installs the latest debug or release APK for the selected mode, optionally uninstalls the selected package first with `--fresh-install`, launches the expected package (`com.hafgit99.aegisvault7.debug` for debug or `com.hafgit99.aegisvault7` for release), waits for the process to become visible, and fails if Android reports a non-private app data directory.

Manual smoke checklist for the first debug APK:

- First-run setup creates a vault with master password and Secret Key.
- Emergency kit opens Android document picker and writes the kit to the user-selected destination.
- Unlock works after app restart.
- Wrong master password and wrong Secret Key are rejected.
- Create, edit, favorite, search, and delete a login item.
- Move an item to trash and restore it.
- Add an attachment, download/open it, delete it, then verify the card metadata updates.
- Export encrypted `.aegis` backup.
- Import encrypted `.aegis` backup.
- Change master password and verify existing items and attachments remain readable.
- Auto-lock clears the active session.
- Clipboard copy/clear behavior works under Android WebView.
- Turkish, English, and Chinese UI remain readable on phone-sized screens.
- Android settings can open the system Autofill provider selection screen and list Aegis Vault Autofill as a selectable service on Android 8.0+.
- Android Autofill can recognize login-like forms, show an Aegis authentication option, promote matching vault records, require approval, and fill supported browsers/apps.

## Android Release Candidate Checklist

Run this checklist before every APK/AAB candidate that may be shared outside local development.

### Build And Size

- Build target-specific debug smoke APK: `npm run android:build:apk:debug:aarch64`.
- Run the internal gate: `npm run android:release:gate`.
- For shareable candidates, run `npm run android:release:gate -- --evidence`; the gate verifies the generated evidence folder before it can complete, then archive `release-local/android/<timestamp>/`.
- Before publishing or sending a final APK outside trusted testing, complete the copied checklist and run `npm run android:release:evidence:verify -- --dir release-local/android/<timestamp> --require-device --require-fresh-install --require-signed --require-completed-checklist`.
- Confirm `metadata.json` reports `"dirty": false` before sharing any APK/AAB outside local development.
- Run `npm run android:release:signing:check` before building a signed release candidate.
- Build release APK/AAB with signing configuration when release keys are ready. Use `npm run android:release:gate -- --signed --evidence` for artifact evidence, and add `--device` only when a physical device should install/test the signed release package `com.hafgit99.aegisvault7`. Add `--fresh-install` for the final clean-install smoke pass.
- Run `npm run android:release:report -- --strict` and store the output with the release candidate notes; for signed release candidates use `npm run android:release:report -- --strict --signed`.
- Confirm the release artifact does not contain stale multi-ABI debug libraries; `android:release:report -- --strict` now reports and gates native ABI count.
- Record artifact sizes:
  - Universal debug APK is expected to be large because it contains multiple ABIs.
  - `aarch64` debug APK should remain close to the current local baseline unless a native dependency changes.
  - Release APK/AAB should be compared against the latest clean release candidate, not the universal debug APK.

### Manifest And Permissions

- Verify requested permissions stay minimal. Current expected runtime permission surface: `android.permission.INTERNET`.
- Verify `android:usesCleartextTraffic` is `false` for release builds.
- Verify `android:allowBackup="false"` and `android:fullBackupContent="false"` remain present.
- Verify `AegisAutofillService` remains protected by `android.permission.BIND_AUTOFILL_SERVICE`.
- Verify `FileProvider` remains `exported="false"` and `grantUriPermissions="true"`.

### Device Security

- Verify `FLAG_SECURE` blocks screenshots, screen recording, and task-switcher previews on the target device.
- Send app to background and return:
  - Sensitive content should be shielded immediately.
  - Vault should not require master password again before the configured background lock delay unless Android kills the process.
- Verify manual Lock Vault always clears the active session immediately.
- Verify clipboard copy still clears according to the app policy.

### Backup, Import, And Attachments

- Emergency Kit download opens Android document picker and lets the user choose the destination.
- Encrypted `.aegis` export opens Android document picker and lets the user choose the destination.
- Plain `.json` export requires explicit confirmation and opens Android document picker.
- Import opens Android document picker, handles cancellation cleanly, and imports a valid encrypted `.aegis` backup.
- Attachment download opens Android document picker and writes a readable file.
- Attachment delete updates the vault card and survives app restart.

### Biometric And Secret Storage

- Biometric enable succeeds only when an active vault session exists.
- Biometric metadata and remembered Secret Key prefer Android Keystore secure storage.
- Biometric unsupported/cancelled/error paths show localized user-facing messages.
- Disable biometric removes local biometric unlock state.

### Autofill

- Aegis Vault Autofill appears as a selectable Android Autofill provider.
- Aloha/browser baseline: Aegis prompt appears, matching record is promoted, approval fills username/password.
- Chrome baseline: if Google Password Manager has priority, switch Chrome to fill with another app; verify Aegis prompt then appears and fills.
- Mismatched records require the second confirmation before filling.
- Stale Autofill requests expire and do not fill credentials.

### Safe-Area And Mobile UI

- Lock screen language selector does not overlap system status icons.
- Dashboard header, sidebar, bottom lock action, settings, donation, trash, security analysis, and password manager views respect top/bottom safe areas.
- New password modal remains usable on a phone viewport; category tabs and save/cancel actions are reachable.
- Vault detail view is not an overly long unstructured block and the mobile back action remains visible.

### Settings Flow

- Auto-lock selection persists after restart.
- Android Autofill settings button opens the system provider screen or shows a localized unsupported message.
- Emergency Kit is available from Settings after unlock and can be recreated without storing the master password in the kit.
- Master password change warns before re-encryption and keeps existing records readable.
- Destructive reset requires explicit confirmation.

## Storage And Security Decisions

Android needs explicit decisions before release:

- Vault database persistence uses the native Tauri app-data command path on Android and should be regression-tested on release candidate devices.
- Remembered Secret Key is routed through the Android Keystore-backed secure storage bridge when running inside the Android WebView.
- Biometric metadata is routed through the Android Keystore-backed secure storage bridge when available, and native biometric registration is blocked if that bridge is unavailable. The biometric prompt/wrapping design still needs final release review on target devices.
- Attachment storage should remain app-private and must survive app restart.
- Emergency Kit, backup export/import, and attachment download now use Android document picker/storage access APIs and need release-candidate device regression testing.
- Android document picker cancellation, native errors, and no-callback timeout behavior are covered by repeatable unit tests.
- Android Autofill must not release credentials until package/domain matching, vault unlock state, and explicit user approval are implemented and tested.
- Plain JSON export should be reviewed again for Android before public release.
- `FLAG_SECURE` is enabled, but screenshots/task-switcher previews should still be manually verified on release candidate devices.

## Adapter Work Required

The app should move toward explicit platform adapters:

- `VaultPersistenceAdapter`
  - Browser fallback
  - Desktop app-data adapter
  - Android app-private adapter
- `SecureSecretAdapter`
  - Browser memory/session-only fallback
  - Desktop keychain candidate
  - Android Keystore candidate
- `FileTransferAdapter`
  - Browser download/input fallback
  - Desktop native dialog adapter
  - Android document picker/share-sheet adapter
- `BiometricAdapter`
  - WebAuthn/browser implementation
  - Android BiometricPrompt implementation
- `AutofillAdapter`
  - Android Autofill service registration
  - Package/domain-aware credential matching
  - User-approved fill response flow

## Release Boundary

Android should remain internal/debug-only until:

- Storage adapter behavior is validated on release candidate devices, especially Android app-private vault persistence after restart.
- Android backup/import/export flows are tested on a real device.
- Android biometric behavior is Keystore-backed or explicitly disabled with clear copy.
- Android Autofill package/domain matching and user approval are implemented with regression coverage.
- A mobile smoke checklist is run on every release candidate.
- APK/AAB signing plan is documented.
