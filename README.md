# Aegis Vault 7

Aegis Vault 7 is a local-first password manager and secure vault built with React, TypeScript, WebCrypto, SQLite/OPFS, and Tauri. It is designed for desktop-first use today, with an Android release candidate path already in active validation.

The project focuses on keeping sensitive data under the user's control: vault data is encrypted locally, recovery material is saved through explicit file picker flows, and release candidates are gated by repeatable tests, artifact checks, and device smoke evidence.

## Current Status

- Desktop application: active development and local release builds through Tauri.
- Android application: signed APK workflow is active, with physical-device smoke testing, safe-area fixes, Autofill support, document picker backup/import, FLAG_SECURE screenshot protection, and Emergency Kit save flow validated.
- Browser extension: Firefox XPI packaging/signing flow is available for the desktop companion experience.
- Internationalization: Turkish, English, and Chinese UI strings are maintained in the app.
- CI note: GitHub Actions can be disabled when quota is unavailable; local release scripts and the private build repository path are documented for Windows, Linux, macOS, and Android candidates.

## Core Features

- Local-first encrypted vault for logins, payment cards, passkeys/API keys, identities, and secure notes.
- Master password plus Account Secret Key setup flow.
- Emergency Kit generation during setup and from Settings after unlock.
- Android document picker integration for Emergency Kit, encrypted backup export, plain JSON export, encrypted import, and attachment download.
- Android Autofill provider with explicit vault unlock, target matching, user approval, and stale-request handling.
- Password generator with character and Diceware modes.
- RFC 6238-compatible TOTP generation.
- Security audit for weak, reused, and breached-password risk signals.
- Attachment encryption and legacy attachment migration.
- Retention-based trash and restore flow.
- Donation page with crypto address display and QR support.

## Security Model

Aegis Vault 7 is designed as a local-first vault. The main security assumptions are:

- The vault is protected by a master password and Account Secret Key.
- Key derivation uses Argon2id for modern vault data.
- Record and backup encryption use authenticated encryption through WebCrypto-backed primitives.
- Cryptographic randomness requires WebCrypto CSPRNG; insecure random fallbacks are not used.
- TOTP follows RFC 6238 with Base32 secret decoding and HMAC-based generation.
- Android remembered Secret Key and biometric metadata prefer the Android Keystore-backed secure storage bridge.
- Android sensitive screens use FLAG_SECURE to block screenshots and task-switcher previews on supported devices.
- Network access is intentionally narrow; HIBP checks use the k-anonymity range API path where enabled.

Security claims are intentionally conservative. See `docs/SECURITY_NOTES.md` and `docs/THREAT_MODEL.md` before positioning the app for public release.

## Android Release Readiness

Android is no longer just a future target; it is in internal release candidate validation.

Important Android work already in place:

- Real app icon applied to Android builds.
- Safe-area layout fixes for lock screen, dashboard, menu, Settings, item detail, and modal screens.
- Signed APK build path verified locally.
- APK artifact reporting, SHA-256 evidence, ABI checks, and signing checks.
- Physical-device smoke scripts for install, launch, package status, private data directory, and runtime security checks.
- Android Autofill diagnostics and browser-specific validation notes.
- Document picker save/open bridge with timeout, cancellation, and native-error handling.
- Emergency Kit save path validated on device.

Primary docs:

- `docs/ANDROID_READINESS.md`
- `docs/ANDROID_MANUAL_SMOKE_CHECKLIST.md`
- `docs/QUALITY_GATES.md`

## Project Structure

```text
.github/                  GitHub workflow definitions when enabled
assets/                   App icons and visual assets
docs/                     Security, release, Android readiness, and quality docs
scripts/                  Release, Android, extension, and evidence scripts
src/                      React/TypeScript application
  components/             UI components and feature panels
  hooks/                  App state, vault, lock, and UI hooks
  i18n/                   Turkish, English, and Chinese translations
  lib/                    Crypto, storage, import/export, Android bridges, audit logic
  types.ts                Shared TypeScript model types
src-tauri/                Tauri desktop and Android configuration/native code
tests/e2e/                Playwright smoke tests
```

## Requirements

- Node.js 22 or newer
- npm
- Rust stable toolchain for Tauri desktop builds
- Android Studio / Android SDK / NDK for Android builds
- Java runtime from Android Studio for Android build commands

## Development

Install dependencies:

```bash
npm install
```

Run the web development server:

```bash
npm run dev
```

Run the desktop development app:

```bash
npm run desktop:dev
```

## Verification

Run TypeScript validation:

```bash
npm run lint
```

Run the full unit suite:

```bash
npm run test:unit
```

Run production web build:

```bash
npm run build
```

Run the critical library mutation gate:

```bash
npm run test:mutation:core
```

Run the dedicated importer mutation gate:

```bash
npm run test:mutation:importer
```

Run the importer helper mutation gate:

```bash
npm run test:mutation:importer:helpers
```

Run the storage bridge mutation gate:

```bash
npm run test:mutation:storage
```

Run the vault storage orchestration mutation gate:

```bash
npm run test:mutation:storage:orchestration
```

Run Playwright smoke tests when the browser test environment is prepared:

```bash
npm run test:e2e
```

Latest local verification before this README update:

- `npm run lint` passed.
- `npm run test:unit` passed: 94 test files, 673 tests.
- `npm run test:coverage` passed: 94 test files, 673 tests.
- `npm run build` passed.
- `npm run test:mutation:core` passed: 460 mutants, 81.74% mutation score.
- `npm run test:mutation:importer` passed: 682 mutants, 80.35% mutation score.
- `npm run test:mutation:importer:helpers` passed: 288 mutants, 87.85% mutation score.
- `npm run test:mutation:storage` passed: 131 mutants, 90.84% mutation score.
- `npm run test:mutation:storage:orchestration` passed: 242 mutants, 88.43% mutation score.

## Coverage

![Statements](https://img.shields.io/badge/statements-96.55%25-brightgreen)
![Branches](https://img.shields.io/badge/branches-90.25%25-green)
![Functions](https://img.shields.io/badge/functions-93.67%25-brightgreen)
![Lines](https://img.shields.io/badge/lines-96.55%25-brightgreen)

Coverage was generated locally with `npm run test:coverage`.

| Metric | Coverage |
| --- | ---: |
| Statements | 96.55% |
| Branches | 90.25% |
| Functions | 93.67% |
| Lines | 96.55% |

| Suite | Result |
| --- | ---: |
| Test files | 94 passed |
| Tests | 673 passed |
| Core mutation score | 81.74% passed |
| Importer mutation score | 80.35% passed |
| Importer helper mutation score | 87.85% passed |
| Storage bridge mutation score | 90.84% passed |
| Storage orchestration mutation score | 88.43% passed |

## Desktop Builds

Build the Tauri desktop app:

```bash
npm run desktop:build
```

Local release helper commands are available:

```bash
npm run release:local
npm run release:windows
npm run release:linux
npm run release:macos
```

Linux and macOS artifacts can also be produced from the private build repository workflow when available.

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

- Android release report
- metadata and dirty-tree status
- SHA-256 checksums
- copied APK/AAB artifacts
- optional device doctor/security output
- manual Android smoke checklist copy

Do not publish a release candidate if the evidence metadata reports a dirty working tree unless it is an intentional internal-only diagnostic build.

## Documentation Index

- `docs/ROADMAP.md` - current roadmap and completed phases
- `docs/SECURITY_NOTES.md` - security implementation notes and residual review items
- `docs/THREAT_MODEL.md` - threat model and mitigations
- `docs/QUALITY_GATES.md` - test, coverage, mutation, and release gates
- `docs/ANDROID_READINESS.md` - Android release readiness plan
- `docs/RELEASE_PLAN.md` - desktop and release packaging plan
- `FIREFOX_XPI.md` - Firefox XPI packaging/signing notes

## Responsible Use

Aegis Vault stores highly sensitive credentials. Use only trusted builds, keep your master password and Emergency Kit offline, and verify release artifacts before sharing them outside your own devices.
