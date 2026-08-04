# Aegis Vault 7

Aegis Vault 7 is a local-first password manager and secure vault built with React, TypeScript, WebCrypto, wa-sqlite, OPFS migration support, Tauri, and WebExtension APIs. Designed for zero-knowledge local-first security across Desktop (Windows, Linux, macOS), Android, and WebExtension platforms.

Sensitive data stays completely under the user's control: vault data is encrypted locally using AES-256-GCM and Argon2id, metadata is masked at rest in SQLite, injected extension elements are isolated inside closed Shadow DOM boundaries, and release builds are protected by automated quality gates, integrity manifests, and physical device evidence.

## Current Status

- **Desktop Application**: Active development and local release builds via Tauri. Windows local release packaging (MSI + NSIS setup installers) is verified; Linux and macOS build targets are supported.
- **Android Application**: Signed APK / AAB workflow active with physical-device smoke testing, safe-area UI layout, Android Autofill service, native document picker backup/import, `FLAG_SECURE` screenshot prevention, and Keystore-backed biometric authentication.
- **Browser Extension**: Manifest V3 extension for Chrome and Firefox (XPI packaging & signing flow). Features closed Shadow DOM UI isolation, AI/heuristic anti-phishing engine (Punycode, Unicode confusables, typo-squatting detection), and 30-second clipboard auto-clearing.
- **Security Hardening & Recent Architecture Improvements**:
  - **At-Rest Metadata Masking**: SQLite `vault_items` table masks `title`, `username_db`, `password_db`, and `notes_db` as `'[encrypted: aes-256-gcm]'` at rest. Plaintext titles and metadata exist solely inside AES-256-GCM encrypted payloads (`enc_metadata`).
  - **Multi-ABI Android Native Packaging**: Configured ABI splits supporting `arm64-v8a`, `armeabi-v7a`, and `x86_64` for maximum device and emulator compatibility.
  - **Modular Android Architecture**: Native Android bridge refactored into clean `bridges/`, `crypto/`, `security/`, and `model/` packages.
  - **Encrypted Autofill Transport**: Parolası `AegisAutofillService` tarafından Intent extras yerine donanım destekli AES-256-GCM `SecureTempFileStorage` + `FileProvider` URI üzerinden güvenle aktarılır.
  - **Argon2id KDF Parameter Parity**: Single source of truth parameters (32 MiB memoryKiB, 3 iterations, 1 parallelism, 32-byte key) strictly enforced across Rust native KDF and Web Crypto WASM engine.
  - **Referential Storage Integrity**: Real-time referential integrity audit (`auditAttachmentIntegrity`) and orphan attachment purging (`purgeOrphanedAttachments`) between `wa-sqlite` and `IndexedDB`.
  - **OOM Protection & Log Rotation**: 25 MB payload pre-check guards on file and database I/O, plus 5 MB size-capped log rotation strategy (`RotationStrategy::KeepOne`).
  - **Closed Shadow DOM Extension Isolation**: Extension dropdowns, phishing banners, and save prompts render inside `<aegis-autofill-host>` closed Shadow DOM.
  - **Transient Credential Memory Zeroing**: Content script password memory expires after 15s max, background worker credentials auto-wipe after 120s with explicit zeroing timers.
  - **Popup Clipboard Auto-Clear**: Copying passwords from extension popup automatically zeroes the clipboard after 30 seconds.
- **Internationalization (i18n)**: Complete Turkish (TR), English (EN), and Chinese (ZH) localization across Web, Desktop, Android (native `strings.xml`), and Extension interfaces.

## Release Candidate Boundaries

| Target | Current release position | Public release blocker |
| --- | --- | --- |
| Windows desktop | MSI & NSIS setup installer builds and release evidence flows are active. | Public artifacts should be signed with release certificate. |
| Linux desktop | Artifacts can be compiled from Tauri workflow with PipeWire/D-Bus screen recording monitor. | Runtime smoke on target Linux distributions. |
| macOS desktop | DMG / App bundle build pipeline available. | Code signing & Apple notarization validation. |
| Android | Multi-ABI signed APK evidence and physical-device validation active across 64-bit and 32-bit devices. | Device regression matrix across Android 12-15. |
| Browser extension | Chrome MV3 & Firefox signed XPI packaging available. | Native messaging host integration tests per release. |
| iOS / iPadOS | Planned support track documented in `docs/IOS_READINESS.md`. | Requires macOS Xcode build environment, iOS Rust targets, and device smoke. |

## Core Features

- **Zero-Knowledge Encrypted Storage**: Logins, payment cards, secure keys/API secrets, WebAuthn passkeys, identities, and secure notes.
- **AES-256-GCM & Argon2id Key Derivation**: Modern KDF (32 MiB memory, 3 iterations) with WebCrypto CSPRNG and Rust native acceleration.
- **At-Rest Metadata Encryption**: Titles, usernames, passwords, and notes masked in SQLite database rows.
- **Account Secret Key & Master Password**: Dual-factor credential protection during vault unlock.
- **Emergency Kit**: Cryptographic emergency recovery kit generated during setup or exported from Settings.
- **Native Document Picker**: Encrypted backup export/import, plain JSON export, Emergency Kit generation, and attachment download.
- **Android Autofill Provider**: Native integration with target matching, user confirmation, and stale request cancellation.
- **Closed Shadow DOM Browser Extension**: Autofill dropdown, anti-phishing banner, and save credential prompt isolated from web page JS inspection.
- **Smart Password & Diceware Generator**: Cryptographically unbiased random password and Diceware passphrase generation.
- **RFC 6238 TOTP Engine**: Built-in 2FA authenticator with live countdown and progress indicators.
- **wa-sqlite OPFS Engine**: Local-first SQLite database running over Origin Private File System with referential attachment integrity.

## Security Architecture

Aegis Vault 7 enforces a strict local-first security architecture:

1. **Master Credential & KDF**: Vault master key is derived via Argon2id (or WebCrypto PBKDF2 fallback) using the Master Password + Account Secret Key.
2. **At-Rest Field Encryption**: All sensitive fields (`title`, `username`, `password`, `notes`, custom fields, TOTP keys) are serialized into JSON and encrypted with AES-256-GCM before database write. The SQLite column values for `title`, `username_db`, `password_db`, and `notes_db` contain static masking tokens (`[encrypted: aes-256-gcm]`).
3. **Extension DOM Isolation**: Extension content script injects a closed Shadow Root (`shadowHost.attachShadow({ mode: 'closed' })`). Host page DOM scripts cannot inspect or access `.shadowRoot` or any inner DOM nodes containing account titles/usernames.
4. **Memory Hygiene**: Memory objects storing plaintext credentials implement explicit property zeroing (`password = '', username = ''`) and auto-wipe timers (15s in content script, 120s in service worker background, 30s clipboard auto-clear).
5. **Screen & Privacy Protection**: `FLAG_SECURE` enabled on Android to block screenshots, screen recording, and task switcher preview leaks.
6. **Air-Gap Network Policy**: Outbound network requests are strictly blocked by default. HIBP checks use 5-character SHA-1 prefix k-anonymity queries without disclosing account data.

## Requirements

- Node.js 22 or newer
- npm
- Rust stable toolchain (for Tauri desktop builds)
- Android Studio / Android SDK / NDK (for Android APK builds)

## Verification & Testing

Run TypeScript validation:

```bash
npm run typecheck
```

Run the full unit test suite:

```bash
npm run test:unit
```

Run test coverage report:

```bash
npm run test:coverage
```

### Test Suite Status

Latest local verification metrics:

| Metric | Status |
| --- | --- |
| **TypeScript Typecheck** | **0 errors (clean)** |
| **Unit Test Files** | **148 passed (148)** |
| **Unit Tests** | **1152 passed (1152)** |
| **Android Kotlin Unit Tests** | **Passed (`AutofillModelsTest.kt`)** |
| **Statements Coverage** | **91.20%** |
| **Branches Coverage** | **83.29%** |
| **Functions Coverage** | **88.07%** |
| **Lines Coverage** | **93.03%** |

## Desktop Builds

Build the Tauri desktop app:

```bash
npm run desktop:build
```

Local release helper commands are available:

```bash
npm run desktop:release:gate
npm run desktop:release:gate -- --skip-desktop-build
npm run desktop:release:gate:dry
npm run desktop:release:version:check
npm run desktop:release:signing:report
npm run desktop:release:evidence
npm run desktop:release:evidence -- --require-completed-checklist
npm run desktop:release:evidence:summary -- --final
npm run desktop:release:import -- --platform <linux|macos> --source <extracted-artifact-dir>
npm run desktop:release:notes
npm run release:local
npm run release:windows
npm run release:linux
npm run release:macos
```

The desktop release gate runs lint, version consistency checks, unit tests, web build, extension build, Tauri desktop build, release evidence collection, signing report generation, release notes generation, and evidence verification for the current host platform.

## Android Builds

Debug APK for device smoke testing:

```bash
npm run android:build:apk:debug:aarch64
```

Install/launch/smoke on a connected device:

```bash
npm run android:device:doctor
npm run android:device:smoke
npm run android:device:security -- --launch
```

Release gate and evidence collection:

```bash
npm run android:release:gate
npm run android:release:gate -- --signed --evidence
npm run android:release:evidence:verify
npm run android:release:evidence:summary
npm run android:release:notes
npm run android:release:evidence:verify -- --dir release-local/android/<timestamp> --require-device --require-fresh-install --require-signed --require-completed-checklist
npm run android:release:report -- --strict
```

Signed release builds require local signing configuration. Keep keystore material outside git; this repo ignores `.secrets/` for that purpose.

## Browser Extension

Firefox extension package/sign flow:

```bash
npm run build:extension
npm run package:firefox:xpi
npm run sign:firefox:xpi
```

See `FIREFOX_XPI.md` for AMO signing notes.

## Release Evidence

Release candidate evidence is written under `release-local/` and normally includes:

- Android release report or desktop release metadata
- metadata and dirty-tree status
- SHA-256 checksums
- copied APK/AAB or desktop installer artifacts
- optional device doctor/security output
- manual Android or desktop smoke checklist copy
- generated desktop `DESKTOP_SIGNATURES.md` and `RELEASE_NOTES.md` when applicable

Do not publish a release candidate if the evidence metadata reports a dirty working tree unless it is an intentional internal-only diagnostic build.

## Project Structure

```text
assets/                   App icons and visual assets
docs/                     Security, release, Android readiness, and quality docs
scripts/                  Release, Android, extension, and evidence scripts
src/                      React/TypeScript web & desktop application
  components/             UI components, feature panels, and modals
  hooks/                  Vault state, lock, auto-lock, and UI hooks
  i18n/                   Turkish (TR), English (EN), and Chinese (ZH) localization
  lib/                    Crypto, wa-sqlite OPFS, import/export, Android bridges, audit logic
  types.ts                Shared TypeScript model interfaces
src-extension/            Manifest V3 browser extension (content scripts, background worker, popup)
src-tauri/                Tauri desktop and Android native Rust code & configuration
tests/                    Playwright E2E tests and security smoke tests
```

## Documentation Index

- `docs/ROADMAP.md` - current roadmap and completed phases
- `docs/SECURITY_NOTES.md` - security implementation notes and residual review items
- `docs/THREAT_MODEL.md` - threat model and mitigations
- `docs/QUALITY_GATES.md` - test, coverage, mutation, and release gates
- `docs/ANDROID_READINESS.md` - Android release readiness plan
- `docs/RELEASE_PLAN.md` - desktop and release packaging plan
- `docs/PUBLIC_RELEASE_BLOCKERS.md` - current public-distribution blockers from the final readiness gate
- `CHANGELOG.md` - release history and notable changes
- `FIREFOX_XPI.md` - Firefox XPI packaging/signing notes

## Responsible Use

Aegis Vault stores sensitive credentials. Always use verified local builds, keep your Master Password and Emergency Kit safely offline, and verify artifact SHA-256 checksums before deploying across your devices.
