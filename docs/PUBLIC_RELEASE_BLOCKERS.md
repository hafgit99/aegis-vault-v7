# Public Release Blockers

This document tracks the current blockers that keep Aegis Vault 7 artifacts in internal release-candidate status instead of public distribution status.

Generated from:

```bash
npm run release:readiness:final
```

Latest final readiness result:

- Overall status: BLOCKED
- Android standard evidence: available, but final distribution is blocked.
- Windows standard evidence: available, but final distribution is blocked.
- Linux standard evidence: available, but final distribution is blocked.
- macOS standard evidence: available, but final distribution is blocked.
- iOS / iPadOS readiness: blocked on Windows host; requires macOS/Xcode.

## Android

Final distribution is blocked until the exact APK candidate has:

- Device evidence.
- Fresh-install evidence.
- `android-device-doctor.txt`.
- `android-device-security.txt`.
- Completed tester field in the copied Android manual smoke checklist.
- All Android checklist items checked for the candidate.
- Completed biometric production matrix before making production biometric claims:
  - Biometric production claim status.
  - Matrix reviewer.
  - Matrix completed date.
  - Pixel evidence.
  - Samsung evidence.
  - Xiaomi evidence.
  - Android 12 evidence.
  - Android 13 evidence.
  - Android 14 evidence.
  - Android 15 evidence.

Until these are complete, Android artifacts remain internal candidates even when signed.

## Windows

Final distribution is blocked until the Windows evidence folder has:

- Completed tester field in `release-local/windows/DESKTOP_MANUAL_SMOKE_CHECKLIST.md`.
- All Windows manual smoke checklist items checked.
- Public release signing decision completed.

Unsigned Windows artifacts are internal candidates only.

## Linux

Final distribution is blocked until the Linux evidence folder has:

- Completed tester field in `release-local/linux/DESKTOP_MANUAL_SMOKE_CHECKLIST.md`.
- All Linux manual smoke checklist items checked on a real Linux target or VM.

Linux artifacts are internal candidates until runtime smoke is completed on Linux.

## macOS

Final distribution is blocked until the macOS evidence folder has:

- Completed tester field in `release-local/macos/DESKTOP_MANUAL_SMOKE_CHECKLIST.md`.
- All macOS manual smoke checklist items checked on a real macOS target.
- macOS signing/notarization decision completed before public distribution.

macOS artifacts are internal candidates until runtime smoke and signing/notarization validation are complete.

## iOS / iPadOS

iOS / iPadOS is intentionally blocked in this Windows workspace.

Required macOS bootstrap:

```bash
rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios
brew install cocoapods
npm run ios:init
npm run ios:build
```

Public iOS claims require macOS with full Xcode, iOS signing/provisioning, and real device or simulator smoke evidence.

## Next Practical Release Steps

1. Complete Android final evidence on the connected physical device with signed APK, fresh install, device doctor, device security, and checklist.
2. Complete Windows manual smoke checklist for the exact Windows artifacts.
3. Keep Linux/macOS internal-only until runtime smoke is performed on target platforms.
4. Keep iOS/iPadOS as roadmap until macOS/Xcode bootstrap is available.
