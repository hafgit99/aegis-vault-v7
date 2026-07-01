# Aegis Vault 7 Release Checklist and Signed Build Plan

This document defines the minimum release gate for Windows desktop builds. It is intentionally conservative because Aegis Vault 7 handles local secrets.

## Release Scope

Initial release target:

- Windows desktop installer from Tauri.
- NSIS setup executable.
- MSI installer.
- Portable release executable for internal smoke testing.

Not in initial release scope:

- Android builds.
- Auto-update distribution.
- Cloud sync.
- Production security claims beyond the current threat model.

## Required Release Gates

Every release candidate must pass:

- `npm ci`
- `npm run desktop:release:gate` on the matching host OS, or `npm run desktop:release:gate -- --skip-desktop-build` when collecting trusted externally built artifacts.
- GitHub Actions `Windows Desktop CI` when available.

The desktop release gate runs:

- `npm run lint`
- `npm run desktop:release:version:check`
- `npm run test:unit`
- `npm run build`
- `npm run build:extension`
- `npx tauri build`
- `node scripts/collect-release-artifacts.cjs --platform <platform>`
- `node scripts/desktop-signing-report.cjs --platform <platform>`
- `node scripts/desktop-release-notes.cjs --platform <platform>`
- `node scripts/desktop-release-evidence.cjs --platform <platform>`

The release owner must also verify:

- The app can create a new vault.
- The app can unlock an existing vault after restart.
- A `.aegis` encrypted export can be created through the native save dialog.
- The `.aegis` export can be imported through the native open dialog.
- Wrong backup password is rejected.
- Manual lock clears the active session and sensitive reveal state.
- Auto-lock clears the active session after the configured timeout.
- Copied secrets are cleared from the clipboard when unchanged.
- Reset clears vault state and requires a fresh setup.

When Linux or macOS artifacts are produced by the manual GitHub workflow and downloaded locally, extract the artifact zip and run `npm run desktop:release:import -- --platform <linux|macos> --source <extracted-artifact-dir>` before `npm run desktop:release:evidence:summary -- --platform <linux|macos> --final`.

If Linux or macOS target hardware is not available, mark the runtime smoke checklist items as deferred instead of silently passing them. Standard artifact evidence may still be archived, but those Linux/macOS builds remain internal candidates only. Public Linux/macOS distribution requires platform runtime smoke, completed manual checklist evidence, and macOS signing/notarization where applicable.

The same checks are mirrored in `docs/DESKTOP_MANUAL_SMOKE_CHECKLIST.md`; `npm run desktop:release:gate` runs the automated gate and copies a prefilled checklist into `release-local/<platform>/`. Use `npm run desktop:release:gate:dry` to review the exact command sequence without building, and `npm run desktop:release:evidence` to re-check an existing `release-local/<platform>/` folder before publishing. After the copied checklist is completed, run `npm run desktop:release:evidence -- --require-completed-checklist` so final evidence cannot pass with unchecked release items or missing candidate fields. Use `npm run desktop:release:evidence:summary -- --platform <windows|linux|macos> --final` to print the final PASS/BLOCKED artifact, checklist, and signing summary before publishing.

## Artifact Checklist

For each release, collect:

- `src-tauri/target/release/bundle/nsis/Aegis Vault 7_<version>_x64-setup.exe`
- `src-tauri/target/release/bundle/msi/Aegis Vault 7_<version>_x64_en-US.msi`
- `src-tauri/target/release/aegis-vault-v7.exe`
- SHA-256 checksums for each artifact.
- `release-local/<platform>/metadata.json` with version, commit, dirty status, artifact sizes, and hashes.
- `release-local/<platform>/README.md` as the human-readable release evidence summary.
- `release-local/<platform>/DESKTOP_MANUAL_SMOKE_CHECKLIST.md` completed for the candidate platform.
- `release-local/<platform>/DESKTOP_SIGNATURES.md` generated from platform signing checks.
- `release-local/<platform>/RELEASE_NOTES.md` generated from metadata and checksums.
- Git commit SHA used for the build.
- Git tag used for the release.
- CI run URL for the passing build.

## Versioning Steps

Before building a release:

1. Update `package.json` version.
2. Update `src-tauri/tauri.conf.json` version.
3. Confirm `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock` versions match with `npm run desktop:release:version:check`.
4. Commit the version update.
5. Create an annotated tag such as `v0.1.0`.
6. Build only from the tagged commit.

## Code Signing Plan

Unsigned installers are acceptable only for internal testing builds. Public release builds must be signed.

Windows signing requirements:

- Use an organization or individual code signing certificate from a trusted certificate authority.
- Store certificate material outside the repository.
- Use GitHub Actions secrets for signing credentials when CI signing is enabled.
- Never commit `.pfx`, private keys, passwords, timestamp credentials, or signing scripts with embedded secrets.
- Timestamp signatures so the signature remains valid after certificate expiry.

Recommended signing variables:

- `WINDOWS_SIGNING_CERT_BASE64`
- `WINDOWS_SIGNING_CERT_PASSWORD`
- `WINDOWS_SIGNING_TIMESTAMP_URL`

Recommended timestamp URL:

- `http://timestamp.digicert.com`

Manual signing fallback:

1. Download CI-produced unsigned artifacts.
2. Verify SHA-256 checksums against CI artifacts.
3. Sign `.exe` and `.msi` files with `signtool`.
4. Verify signatures with `signtool verify /pa` or `npm run desktop:release:signing:report -- --require-signed`.
5. Generate new checksums for signed artifacts.
6. Refresh `release-local/<platform>/metadata.json` and `README.md` after replacing unsigned artifacts with signed ones.
7. Upload only signed artifacts to the public GitHub release.

## Release Notes Checklist

`npm run desktop:release:notes` generates `release-local/<platform>/RELEASE_NOTES.md` from `metadata.json`. Release notes must include:

- Version number.
- Supported platform.
- Installers included.
- Security-relevant changes.
- Known limitations from `docs/THREAT_MODEL.md`.
- Backup and recovery reminder.
- Whether artifacts are signed or unsigned.
- Checksums for all published artifacts.
- Whether the release evidence `metadata.json` reports a clean working tree.

Required user-facing warnings:

- Aegis Vault 7 cannot recover a lost master password.
- Encrypted backup files require the backup password.
- Plaintext JSON backups are unsafe and should be stored only in a secure offline location.
- Local malware or OS compromise is outside the app's protection boundary.

## Rollback Plan

If a release is found to be broken:

1. Mark the GitHub release as pre-release or withdraw public links.
2. Open a release-blocker issue with exact reproduction steps.
3. Keep the tag for audit history unless it contains sensitive data.
4. Publish a fixed patch release from a new tag.
5. Document affected versions in the release notes.

## Pre-Release Decision Log

Before the first public release, decide:

- Whether plaintext JSON export remains enabled.
- Whether the branded icon source still matches the current release branding.
- Whether remaining legacy crypto compatibility paths are acceptable for beta only.
- Whether unsigned builds are internal-only.
- Whether the app should display a stronger backup/recovery warning during setup.

## Android Internal Build Boundary

Android builds are still treated as internal release candidates until the readiness checklist in `docs/ANDROID_READINESS.md` is complete. The latest signed physical-device fresh-install gate passed and should now be followed by completed final evidence review plus desktop release parity checks. A public Android release additionally needs:

- APK/AAB signing procedure with `AEGIS_ANDROID_KEYSTORE_PATH`, `AEGIS_ANDROID_KEY_ALIAS`, `AEGIS_ANDROID_KEYSTORE_PASSWORD`, and `AEGIS_ANDROID_KEY_PASSWORD`.
- Android storage and backup UX decision.
- Android biometric decision.
- Real-device smoke test evidence.
