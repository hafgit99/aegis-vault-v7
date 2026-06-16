# Android Readiness Plan

This document tracks the Android preparation path for Aegis Vault 7. Android is not treated as a simple resize of the desktop app because the vault stores secrets, encrypted attachments, remembered Secret Key state, and backup files.

## Current Status

- Tauri Android CLI is available through `@tauri-apps/cli`.
- Android bundle metadata exists in `src-tauri/tauri.conf.json`.
- Android launcher icons are present under `src-tauri/icons/android`.
- The generated Android project has not been initialized in this checkout yet.
- Desktop storage uses Tauri app-data persistence plus a local fallback marker.
- Browser/mobile web storage still relies on IndexedDB/localStorage/OPFS-style APIs.
- Native file dialogs are implemented only for Windows desktop; Android import/export/download needs its own storage UX.

## NPM Commands

```bash
npm run android:init
npm run android:dev
npm run android:run
npm run android:build
npm run android:build:apk
npm run android:build:apk:debug
```

On this Windows workstation, Android builds also require the Android Studio JBR, SDK, and NDK environment variables to be available before invoking the build scripts.

## Phase 1: Readiness Gate

Before treating Android as a product target, verify:

- `npm run typecheck`
- `npm run test:unit`
- `npm run build`
- `npm run android:init`
- `npm run android:build:apk:debug`

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

- Vault database persistence should use an Android-safe app-private store, not a browser-only assumption.
- Remembered Secret Key should be protected through Android Keystore or an equivalent Tauri/mobile secure storage plugin.
- Biometric unlock should use Android BiometricPrompt/Keystore-backed wrapping, not WebAuthn assumptions.
- Attachment storage should remain app-private and must survive app restart.
- Backup export/import should use Android document picker/storage access APIs.
- Plain JSON export should be reviewed again for Android before public release.
- Screenshots/task-switcher previews should be evaluated for sensitive UI leakage.

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

- Storage adapter decisions are implemented.
- Android backup/import/export flows are tested on a real device.
- Android biometric behavior is either implemented or explicitly disabled with clear copy.
- A mobile smoke checklist is run on every release candidate.
- APK/AAB signing plan is documented.
