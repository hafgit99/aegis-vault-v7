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
- `npm run typecheck`
- `npm run test:unit`
- `npm run build`
- `npm run desktop:build`
- GitHub Actions `Windows Desktop CI`

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

## Artifact Checklist

For each release, collect:

- `src-tauri/target/release/bundle/nsis/Aegis Vault 7_<version>_x64-setup.exe`
- `src-tauri/target/release/bundle/msi/Aegis Vault 7_<version>_x64_en-US.msi`
- `src-tauri/target/release/aegis-vault-v7.exe`
- SHA-256 checksums for each artifact.
- Git commit SHA used for the build.
- Git tag used for the release.
- CI run URL for the passing build.

## Versioning Steps

Before building a release:

1. Update `package.json` version.
2. Update `src-tauri/tauri.conf.json` version.
3. Confirm both versions match.
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
4. Verify signatures with `signtool verify /pa`.
5. Generate new checksums for signed artifacts.
6. Upload only signed artifacts to the public GitHub release.

## Release Notes Checklist

Release notes must include:

- Version number.
- Supported platform.
- Installers included.
- Security-relevant changes.
- Known limitations from `docs/THREAT_MODEL.md`.
- Backup and recovery reminder.
- Whether artifacts are signed or unsigned.
- Checksums for all published artifacts.

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

Android builds are internal-only until the readiness checklist in `docs/ANDROID_READINESS.md` is complete. A public Android release additionally needs:

- APK/AAB signing procedure with `AEGIS_ANDROID_KEYSTORE_PATH`, `AEGIS_ANDROID_KEY_ALIAS`, `AEGIS_ANDROID_KEYSTORE_PASSWORD`, and `AEGIS_ANDROID_KEY_PASSWORD`.
- Android storage and backup UX decision.
- Android biometric decision.
- Real-device smoke test evidence.
