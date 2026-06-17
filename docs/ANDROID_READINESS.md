# Android Readiness Plan

This document tracks the Android preparation path for Aegis Vault 7. Android is not treated as a simple resize of the desktop app because the vault stores secrets, encrypted attachments, remembered Secret Key state, and backup files.

## Current Status

- Tauri Android CLI is available through `@tauri-apps/cli`.
- Android bundle metadata exists in `src-tauri/tauri.conf.json`.
- Android launcher icons are present under `src-tauri/icons/android`.
- The generated Android project is initialized under `src-tauri/gen/android`.
- The universal debug APK build has been validated locally.
- The `aarch64` debug APK has been installed and smoke-tested on a physical Android device.
- The main Android activity sets `FLAG_SECURE` to block normal screenshots, screen recordings, and task-switcher previews on supported system surfaces.
- Android backup export, plaintext export, encrypted import, and attachment download flows use the system document picker bridge so users choose the destination or source file explicitly.
- Android document picker requests now fail closed with a safety timeout if the native bridge never calls back, surface native picker errors, and treat user cancellation as an explicit `false`/`null` result.
- Android remembered Secret Key state and biometric metadata now prefer an Android Keystore AES-GCM secure storage bridge, with browser storage kept as fallback and migration source.
- Android vault database persistence uses the Tauri app-data command path, which resolves to app-private storage on Android. When this native write succeeds, localStorage keeps only a desktop/mobile-managed setup marker instead of the encrypted row payload.
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
npm run android:device:install
npm run android:device:launch
npm run android:device:status
npm run android:device:smoke
```

On this Windows workstation, Android builds also require the Android Studio JBR, SDK, and NDK environment variables to be available before invoking the build scripts.

Use `android:build:apk:debug:aarch64` for normal phone smoke tests. The generic `android:build:apk:debug` command creates a universal debug APK that bundles `arm64-v8a`, `armeabi-v7a`, `x86`, and `x86_64` native libraries; it is useful for broad compatibility checks but is expected to be much larger.

The target-specific APK commands run `android:clean:jni` first because Tauri/Gradle can leave native library symlinks from previous multi-architecture builds under `src-tauri/gen/android/app/src/main/jniLibs`. Cleaning those ignored intermediates prevents stale ABIs from being packed into a later single-target APK.

Local size baseline from this workstation:

- Universal debug APK: about 438 MiB after bundling four ABIs.
- Clean `aarch64` debug APK: about 120 MiB with only `arm64-v8a`.

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
- `npm run android:build:apk:debug:aarch64`
- `npm run android:device:smoke`
- Optional compatibility check: `npm run android:build:apk:debug`

The device smoke gate installs the current debug APK, launches `com.hafgit99.aegisvault7.debug`, waits for the process to become visible, and fails if Android reports a non-private app data directory.

Manual smoke checklist for the first debug APK:

- First-run setup creates a vault with master password and Secret Key.
- Emergency kit download path is either available or clearly unavailable with Android-specific guidance.
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

## Storage And Security Decisions

Android needs explicit decisions before release:

- Vault database persistence uses the native Tauri app-data command path on Android and should be regression-tested on release candidate devices.
- Remembered Secret Key is routed through the Android Keystore-backed secure storage bridge when running inside the Android WebView.
- Biometric metadata is routed through the Android Keystore-backed secure storage bridge when available. The biometric prompt/wrapping design still needs final release review.
- Attachment storage should remain app-private and must survive app restart.
- Backup export/import now uses Android document picker/storage access APIs and needs broader regression testing.
- Android document picker cancellation, native errors, and no-callback timeout behavior are covered by repeatable unit tests.
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

## Release Boundary

Android should remain internal/debug-only until:

- Storage adapter behavior is validated on release candidate devices, especially Android app-private vault persistence after restart.
- Android backup/import/export flows are tested on a real device.
- Android biometric behavior is Keystore-backed or explicitly disabled with clear copy.
- A mobile smoke checklist is run on every release candidate.
- APK/AAB signing plan is documented.
