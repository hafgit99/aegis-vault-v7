# Changelog

All notable Aegis Vault 7 changes are tracked here. The project follows a security-first release style: release notes summarize user-facing changes, while this changelog also records release-gate and validation work.

## 7.0.1.0 - Release Candidate Hardening

### Added

- Automated "No-JS-Master-String final gate" script to scan source code for forbidden master-password plain string patterns, enforcing a strict count-based allowlist across authorized files.
- Android evidence-boundary documentation that separates automated release-gate proof from manual device-only claims for Autofill, biometric, document picker, FLAG_SECURE, and mobile UI behavior.
- Android Autofill save-candidate handling so Android can offer to save newly registered credentials and Aegis opens a prefilled new-login form after user approval.
- Desktop release gate with lint, version consistency checks, unit tests, web build, extension build, Tauri build, artifact collection, signing report generation, release notes generation, and evidence verification.
- Desktop release evidence files: `metadata.json`, `SHA256SUMS.txt`, `DESKTOP_MANUAL_SMOKE_CHECKLIST.md`, `DESKTOP_SIGNATURES.md`, `RELEASE_NOTES.md`, and release evidence `README.md`.
- Desktop signing report support for Windows Authenticode, macOS codesign/spctl checks, and Linux artifact signing policy notes.
- Desktop version consistency gate across `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock`.
- wa-sqlite migration UI smoke coverage and active-backend migration safety gates.
- wa-sqlite restored-backend restart routing coverage so unlock, backup reads, and import writes prove they use the promoted repository after app initialization.
- Android release gate evidence for signed APK candidates, fresh install checks, artifact metadata, SHA-256 hashes, ABI checks, signing checks, and device smoke reports.
- Android Autofill provider flow with diagnostics, domain/package validation, stale-request protection, and browser compatibility notes.
- Android document picker flows for encrypted backup export, plain JSON export, encrypted import, attachment download, and Emergency Kit saving.
- Emergency Kit generation during first-run setup and from Settings after unlock.
- Crypto donation page with wallet addresses, QR codes, copy actions, and Turkish/English/Chinese UI support.
- Playwright smoke coverage for setup, unlock, create item, lock/unlock, Settings import/export, wa-sqlite migration UI, Emergency Kit download, donation page visibility, and TR/EN/ZH language switching.

### Changed

- Refined Android background behavior so normal idle auto-lock pauses while the app is hidden, leaving background locking to the runtime security delay instead of immediately requiring master password re-entry.
- Strengthened desktop release documentation with local build, evidence, signing, and release notes procedures.
- Expanded Android readiness documentation for signed APKs, physical-device smoke testing, safe-area behavior, backup/import flows, Autofill validation, and biometric release checks.
- Improved Android UI safe-area handling across lock screen, dashboard, navigation, Settings, item detail, and modal surfaces.
- Refined dashboard, item detail, Security Analysis, Password Manager, Donation, Trash, and Settings layouts for mobile usability.
- Reworked backup/export/import flows to prefer explicit native save/open paths on desktop and Android.
- Updated release candidate process so generated artifacts are not considered publishable unless evidence metadata, checksums, signing report, manual checklist, and release notes are coherent.

### Security

- Enforced no-JS-master-string memory safety bounds using an automated final gate, eliminating unused helpers like `withSessionMasterPassword` and legacy attachment rotation code, and gating all remaining occurrences under strict baseline counts.
- Hardened browser extension password generation by removing `Math.random`, replacing modulo selection with rejection-sampled CSPRNG indexes, and using CSPRNG Fisher-Yates shuffling.
- Raised biometric PBKDF2-SHA256 wrapping cost for new WebAuthn and Android native biometric bundles to 600,000 iterations.
- Hardened extension IPC pairing token validation with constant-time comparison and Unix/macOS `0600` token-file writes.
- Replaced deprecated WebDAV Basic Auth `unescape` encoding and aligned HTTP local-network exceptions with RFC 1918 loopback/private-host checks.
- Bounded the imported WebCrypto AES-GCM key cache at twenty entries.
- Replaced production master/backup session getter usage with scoped session-secret callbacks across storage, attachments, Settings, biometric setup, encrypted export, and sync flows.
- Removed legacy custom crypto decrypt/KDF fallback primitives from production paths; old backup/database compatibility now fails closed instead of using pure-JS SHA/HMAC/HKDF/simulated-Argon2id/AES helpers.
- Switched WebCrypto AES-GCM IV generation to fresh 12-byte CSPRNG nonces for every encryption operation.
- Clear imported WebCrypto AES-GCM key references on vault session close.
- Hardened air-gap defense with stricter Tauri CSP directives and runtime WebRTC blocking.
- Removed insecure random fallback behavior; cryptographic randomness requires WebCrypto CSPRNG.
- Replaced non-standard TOTP generation with RFC 6238-compatible behavior.
- Reworked master session handling away from plaintext string persistence: routine vault item reads, writes, trash operations, and demo reseeds now use a scoped session vault encryption key, while remaining master-secret edges stay documented for the native adapter phase.
- Added brute-force protection, stronger password minimums, and safer master password rotation messaging.
- Replaced static vault item KDF salt behavior with per-vault salt handling.
- Rejected legacy XOR attachment records and migrated secure legacy attachment formats through authenticated encryption paths.
- Added air-gap style network policy enforcement around allowed HIBP range checks.
- Added structured security error taxonomy and security event logging patterns.
- Added Android FLAG_SECURE protection for sensitive screens.
- Added HIBP k-anonymity checks for breach-risk signals where enabled.

### Fixed

- Fixed Android Autofill return/save flows that could leave the app on a black privacy-shield screen after switching back from the browser.
- Fixed broken top-right refresh behavior after unlock.
- Made the large add-item action consistently visible.
- Removed personal email example text from the new password item form.
- Fixed attachment download/save behavior while preserving delete behavior.
- Fixed Android backup export/import file picker flows and clarified user-selected destinations.
- Fixed dashboard control panel navigation behavior.
- Fixed Android Autofill flow so selected credentials return to the target app and fill supported browser fields.
- Fixed mobile lock button visibility in the dashboard header.
- Fixed Settings master password change warning so users understand re-encryption impact before proceeding.
- Fixed browser-fallback OPFS persistence so a fast reload after saving a vault item cannot restore stale pre-save data.

### Validation

- No-JS-Master-String final gate scan and unit test suite successfully verified; integrated as a blocking step in the unit test lifecycle.
- Signed Android release gate passed with device, fresh-install, and evidence on commit `1df341ec15938da9dad2a8304181dc902013b242`; evidence folder: `release-local/android/2026-07-01T12-41-48-852Z`.
- Linux and macOS desktop artifact evidence passed standard local verification on commit `30740c2c468aeb56640764fd4d19e05cf4866ef0`; runtime smoke is deferred because no target Linux/macOS devices are available in this workspace, so those artifacts remain internal candidates until platform testing is completed.
- Unit suite baseline: 108 test files and 841 tests passed in the latest recorded full unit run during release-gate work.
- E2E smoke suite includes 24 passing Chromium smoke scenarios, including setup/unlock, item lifecycle, reload persistence, mobile viewport smoke, wa-sqlite migration UI, Emergency Kit, donation, language switching, encrypted import/export, and confirmed plain JSON export coverage.
- Coverage and mutation thresholds are documented in `docs/QUALITY_GATES.md`.
- wa-sqlite final gate unit run passed: 9 focused files and 128 tests.
- Android release and desktop release evidence workflows are documented in `docs/ANDROID_READINESS.md` and `docs/RELEASE_PLAN.md`.

### Known Limitations

- wa-sqlite is still behind explicit migration/promotion gates; making it the default backend remains a separate release decision.
- Public desktop release artifacts should be signed before distribution. Unsigned artifacts are suitable only for internal diagnostics.
- Android biometric behavior still requires final validation on supported physical devices before public release claims.
- Browser Autofill behavior depends on Android/browser provider support and user Autofill provider selection; Chrome may require disabling Google Password Manager Autofill or selecting Aegis as the active provider.
- Sync/WebDAV is not yet treated as a final public release feature.
- Lost master passwords, lost Account Secret Keys, and lost backup passwords cannot be recovered by the app.
