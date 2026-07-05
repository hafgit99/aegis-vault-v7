# Aegis Vault 7 â€” 7.0.1.0 Release Candidate Release Notes

- **Version:** 7.0.1.0
- **Channel:** Release Candidate (internal validation)
- **Release notes revision:** 2026-07-04
- **Latest verified implementation commit:** `5835305`
- **Branch:** `main`
- **Working tree clean at generation:** yes

## Overview

Aegis Vault 7 7.0.1.0 is the Release Candidate hardening milestone. It closes the major security and Android smoke work and adds repeatable release gates, evidence collection, and an audit-ready security package. Aegis Vault 7 is a local-first password manager and secure vault built with React, TypeScript, WebCrypto, SQLite/OPFS, and Tauri, with an Android release candidate path in active validation.

These notes consolidate the desktop, Android, security gate, wa-sqlite, and known-limitation status into a single user- and auditor-facing document. Per-platform evidence notes are still generated under `release-local/<platform>/` by the release gates.

## Desktop

- **Windows** is the primary desktop validation path. The local release gate and manual evidence flow are active; public release additionally requires signed artifacts and a completed manual smoke checklist.
- **Linux and macOS** artifacts can be produced/imported through the private build workflow. Standard artifact evidence now passes after regenerating platform release notes and signing reports; runtime smoke is **deferred** because no target Linux/macOS hardware is available in this workspace, so those artifacts remain **internal candidates only** until platform runtime smoke, manual checklist evidence, and (for macOS) signing/notarization are completed.
- The desktop release gate (`npm run desktop:release:gate`) runs: lint, version consistency, unit tests, web build, extension build, Tauri desktop build, artifact collection, signing report, release notes generation, and evidence verification.
- Desktop artifacts: Windows NSIS setup `.exe` + MSI `.msi` + portable `.exe`; Linux `.deb` + AppImage; macOS `.dmg` + `.app`. Each candidate ships `metadata.json`, `SHA256SUMS.txt`, `DESKTOP_SIGNATURES.md`, and a copied manual smoke checklist under `release-local/<platform>/`.
- Windows builds enable native screen-capture protection via `SetWindowDisplayAffinity`.

## Android

- The **signed Android release gate passed** on a physical `arm64-v8a` device with `--signed --device --fresh-install --evidence`.
  - Evidence folder: `release-local/android/2026-07-01T12-41-48-852Z`
  - Commit: `1df341ec15938da9dad2a8304181dc902013b242`
  - APK size: 12.99 MiB
  - APK SHA-256: `d5ac727a75b13e8c88f08265d74a60f966fa2ad153c6188a51597e7e3395da9c`
- Validated flows: Autofill fill + save, `FLAG_SECURE` screenshot/task-switcher protection, document picker (Emergency Kit, encrypted backup export, plain JSON export, encrypted import, attachment download), safe-area mobile UI, app-private vault persistence via Tauri app-data, and Android Keystore-backed secure storage for remembered Secret Key / biometric metadata.
- Android remains an **internal candidate**: the completed checklist and biometric/device-regression claims must stay current for each candidate, and Autofill behavior remains browser/provider-dependent (Chrome may require disabling Google Password Manager Autofill or selecting Aegis as the active provider).

## Security Gate â€” No-JS-Master-String Final Gate

Aegis Vault 7 enforces a strict, automated boundary so the plain-text master password string does not materialize during routine flows (CRUD, settings, attachment retrieval).

- **Scan target:** recursively scans all source files (`.ts`, `.tsx`, `.js`, `.jsx`) in `src/`.
- **Forbidden patterns:** `withActiveMasterPassword`, `getActiveMasterPassword`, `masterPasswordPlain`, `passwordPlain`, `deriveEncryptionKey`.
- **Allowlist enforced:** only authorized boundary files are permitted (core session, setup/rotation/migration, legacy attachment migration, OS biometric wrapper, and storage engines). Test files are excluded from the gate but covered by the unit suite.
- **Strict occurrence bounds:** every allowlisted file is restricted to an exact baseline count. Any unauthorized file, or any occurrence exceeding its baseline, fails the build and the unit suite.
- **How to run:** `npm run security:no-js-master-string` (standalone) and `npm run test:unit` (integrated as a blocking step).
- **Supporting controls:** Argon2id master-password verification, WebCrypto AES-GCM for records/backups/attachments, HKDF-SHA-256 vault session key routing (so routine storage no longer re-materializes the master string), Tauri CSP plus production air-gap network policy, HIBP k-anonymity range checks, clipboard safe-clear, and constant-time IPC token comparison. Full classification of remaining references is in `SECURITY_AUDIT_PACKAGE/MASTER_STRING_CLASSIFICATION.md`. Platform WebAuthn passkey management now includes strict RP ID validation, Settings-based create/authenticate/delete actions, and last-used/sign-count persistence without reopening the JS master-string boundary.

## wa-sqlite

- The **wa-sqlite final gate** (`npm run wa-sqlite:final:gate`) groups the checks required before wa-sqlite can be considered for default active-backend promotion.
- Latest focused unit run: **9 files, 128 tests passed**; Playwright `wa-sqlite` smoke is included unless `--skip-e2e` is passed.
- Coverage: promotion writes/restore of the active backend marker, app-initialization restored-repository routing (unlock, backup reads, import writes), forged/malformed marker fallback to OPFS, per-profile database/VFS separation, OPFSâ†’wa-sqlite migration parity/rollback/reopen, fail-closed behavior on smoke/dry-run/readiness/hydration/marker failures, and migration UI promotion/blocker outcomes.
- **Status: still explicitly gated.** wa-sqlite is **opt-in migration-only** and is **NOT the default backend** in this release. Making it the default is a separate release decision requiring a target-host gate pass, post-promotion Android smoke, and post-promotion backup/import/export validation.

## Quality Gates & Validation

- **Unit suite baseline:** 129 test files and 998 tests passing in the latest recorded full release-gate run.
- **E2E smoke:** 24 passing Chromium scenarios (setup/unlock, item lifecycle, reload persistence, mobile viewport, wa-sqlite migration UI, Emergency Kit, donation, TR/EN/ZH language switching, encrypted import/export, plain JSON export).
- **Coverage baseline:** lines 91.23%, statements 90.05%, functions 90.49%, branches 82.16%. Current thresholds remain 90 / 90 / 85 / 80 and pass in the latest local coverage gate.
- **Mutation gates:** core 460 mutants / 81.74% score; importer 682 / 80.35%; importer helpers 288 / 87.85%. (Storage and storage-orchestration gates are documented in `docs/QUALITY_GATES.md`.)
- Full gate inventory and thresholds live in `docs/QUALITY_GATES.md`.

## Release Evidence & Verification

- Every candidate is produced through platform release gates (`npm run desktop:release:gate` / `npm run android:release:gate`) that collect `metadata.json`, `SHA256SUMS.txt`, signing reports, and manual smoke checklists under `release-local/`.
- Do **not** publish a candidate whose `metadata.json` reports a dirty working tree, except for intentional internal-only diagnostic builds.
- The **security audit package** (`SECURITY_AUDIT_PACKAGE/`) is shipped to third-party auditors with its own `SHA256SUMS.txt` integrity manifest, generated and verified by `npm run audit:checksums` / `npm run audit:checksums:verify`.

## Known Limitations

- wa-sqlite is opt-in migration-only and is **not** the default storage backend.
- Public desktop artifacts must be **signed** before distribution; unsigned artifacts are suitable for internal diagnostics only.
- Linux and macOS runtime smoke is **deferred** (no target hardware); standard local evidence passes, but those artifacts remain internal candidates until real platform smoke is completed.
- iOS / iPadOS readiness is intentionally **blocked on Windows hosts** and requires macOS with full Xcode, iOS Rust targets, CocoaPods, signing/provisioning, and runtime smoke.
- Android biometric wrapping still requires **final manual device review** before production-grade biometric claims.
- Browser Autofill depends on Android/browser provider support and user provider selection.
- Sync/WebDAV is **not** a final public release feature.
- Lost master passwords, lost Account Secret Keys, and lost backup passwords **cannot be recovered** by the app.
- Local malware, OS compromise, rooted devices, memory inspection, keylogging, and privileged screen capture are **outside the app protection boundary**.

## Recovery & Safety Notes

- Aegis Vault 7 cannot recover a lost master password.
- Keep the Emergency Kit and Account Secret Key offline and separate from the device.
- Encrypted `.aegis` backups require the backup password; keep at least one backup off-device.
- Plain JSON backups are unsafe and should only be stored offline in a trusted location.
- Use only trusted, verified builds.

## Documentation Index

- `SECURITY_AUDIT_PACKAGE/` â€” third-party audit package (README, THREAT_MODEL, SECURITY_NOTES, QUALITY_GATES, MASTER_STRING_CLASSIFICATION, SHA256SUMS.txt)
- `docs/RELEASE_PLAN.md`, `docs/ANDROID_READINESS.md`, `docs/ANDROID_MANUAL_SMOKE_CHECKLIST.md`, `docs/DESKTOP_MANUAL_SMOKE_CHECKLIST.md`
- `docs/PUBLIC_RELEASE_BLOCKERS.md` - current final-distribution blockers from the release readiness gate
- `docs/SECURITY_NOTES.md`, `docs/THREAT_MODEL.md`, `docs/QUALITY_GATES.md`, `docs/WA_SQLITE_FINAL_GATE.md`, `docs/MASTER_STRING_CLASSIFICATION.md`
- `CHANGELOG.md`, `README.md`, `LOCAL_RELEASE.md`, `FIREFOX_XPI.md`

## Verification Before Publishing

- Confirm `metadata.json` reports `dirty: false` for public/shareable builds.
- Confirm `SHA256SUMS.txt` matches every published artifact.
- Complete the platform manual smoke checklist; run `desktop:release:evidence:summary -- --final` / `android:release:evidence:summary -- --final` and confirm `PASS`.
- Publish signed artifacts only for public channels.
- For the audit package, run `npm run audit:checksums:verify` and confirm `PASSED` before sending it to the auditor.




