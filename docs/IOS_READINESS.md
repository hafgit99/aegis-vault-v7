# Aegis Vault 7 iOS / iPadOS Readiness Plan

Aegis Vault 7 should start iOS support as a staged platform enablement effort, not as an immediate public release. Tauri 2 supports mobile targets, but iOS builds require a macOS host, full Xcode, iOS Rust targets, CocoaPods, and Apple signing/provisioning material.

## Current Position

- Status: planned platform track.
- Target window: 2026 Q4 readiness spike, then release-candidate work after desktop and Android evidence gates remain stable.
- Current host limitation: this Windows development machine cannot run `tauri ios init` or produce iOS builds because Tauri iOS development requires macOS with full Xcode.
- Existing reuse: the React UI, WebCrypto flows, wa-sqlite backend, i18n, safe-area work, and biometric abstraction are already close to mobile-ready.
- Main unknowns: iOS secure storage behavior, document picker/save UX, local database persistence, Face ID/Touch ID behavior, App Store signing, and iOS/iPadOS autofill extension feasibility.

## Official Tauri Requirements Snapshot

Tauri's current prerequisite documentation states that iOS development is macOS-only and requires full Xcode, not only Command Line Tools. The iOS Rust targets are:

```bash
rustup target add aarch64-apple-ios x86_64-apple-ios aarch64-apple-ios-sim
```

Tauri's current iOS signing documentation requires Apple Developer enrollment, a registered bundle identifier, certificate, and provisioning profile. Automatic signing uses App Store Connect API variables; manual signing uses `IOS_CERTIFICATE`, `IOS_CERTIFICATE_PASSWORD`, and `IOS_MOBILE_PROVISION`.

Primary references:

- https://v2.tauri.app/start/prerequisites/#ios
- https://v2.tauri.app/distribute/sign/ios/

## Repository Commands

Run locally on any host to see readiness status:

```bash
npm run ios:readiness
```

Run on macOS CI/local Mac when iOS work begins:

```bash
npm run ios:readiness:strict
npm run ios:init
npm run ios:build
```

`ios:readiness:strict` intentionally blocks on non-macOS hosts or missing Xcode/CocoaPods/Rust targets. Signing material is reported separately because simulator/dev spikes may not need final App Store signing on day one.

## Phase 1: Platform Bootstrap

Goal: make the existing app compile into an iOS shell without changing product claims.

Checklist:

- Use a macOS host with full Xcode installed and opened once.
- Install iOS Rust targets.
- Install CocoaPods.
- Run `npm run ios:readiness:strict`.
- Run `npm run ios:init` and review generated files under `src-tauri/gen/ios`.
- Keep generated iOS project changes small and reviewable.
- Confirm app identifier remains `com.hafgit99.aegisvault7` or intentionally decide a separate iOS identifier.

## Phase 2: Runtime Compatibility

Goal: verify that vault behavior survives iOS WebView constraints.

Checklist:

- Setup -> unlock -> lock -> restart persistence.
- wa-sqlite persistence on iOS WebView.
- Emergency Kit export flow.
- Encrypted backup export/import flow.
- Attachment download/save UX.
- Screenshot/task-switcher privacy equivalent where available.
- Safe-area layout on iPhone and iPad.
- Three-language UI review: TR, EN, ZH.

## Phase 3: Security and Identity

Goal: reach parity with Android security posture where iOS APIs allow it.

Checklist:

- Face ID / Touch ID through `@tauri-apps/plugin-biometric`.
- iOS Keychain-backed storage decision for remembered Secret Key and biometric metadata.
- Background lock behavior.
- Clipboard clearing behavior.
- Airgap/HIBP network policy verification.
- No-JS-Master-String gate remains green.

## Phase 4: Distribution Evidence

Goal: prepare release evidence equivalent to Android and desktop.

Checklist:

- Create `ios:release:gate` only after a successful bootstrap build exists.
- Add iOS evidence folder under `release-local/ios/<timestamp>`.
- Add iOS manual smoke checklist.
- Add signing report for automatic or manual signing.
- Require final summary before any public TestFlight/App Store distribution.

## Release Boundary

Until these gates exist and pass, iOS/iPadOS must be described as planned support only. It should not be advertised as available, and it should not be grouped with Android signed APK evidence.
