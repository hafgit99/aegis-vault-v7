#KalderaShield — Code Signing & Artifact Signing Guide (2026)

## Overview

This guide documents the procedures for signing desktop (Windows EV Authenticode, macOS Developer ID, Linux GPG) and mobile (Android Keystore, iOS Provisioning Profile) build artifacts for public release.

---

## 1. Windows Code Signing (EV Authenticode)

- **Certificate:** EV Code Signing Hardware Token (YubiKey / HSM) or Azure Key Vault.
- **Tool:** `signtool.exe` or `azure-code-signing-action`.
- **Command:**
  ```powershell
  signtool sign /tr http://timestamp.digicert.com /td sha256 /fd sha256 /sha1 <CERT_THUMBPRINT> "src-tauri/target/release/bundle/nsis/KalderaShield_7.0.1_x64-setup.exe"
  ```

---

## 2. macOS Code Signing & Notarization

- **Certificate:** Developer ID Application.
- **Commands:**
  ```bash
  codesign --deep --force --verify --verbose --sign "Developer ID Application: Aegis (TEAMID)" "src-tauri/target/release/bundle/macos/KalderaShield.app"
  xcrun notarytool submit "src-tauri/target/release/bundle/macos/KalderaShield.dmg" --keychain-profile "AC_NOTARY" --wait
  xcrun stapler staple "src-tauri/target/release/bundle/macos/KalderaShield.dmg"
  ```

---

## 3. Android Release Signing

- **Keystore:** PKCS12 Keystore (`aegis-release-key.jks`) using AES-256 / RSA 4096.
- **Commands:**
  ```bash
  npm run android:release:signing:check
  npm run android:build:apk:aarch64
  ```

---

## 4. Checksums & Integrity Manifest

Before releasing, execute:
```bash
npm run release:checksums
npm run audit:checksums
```
This generates `SHA256SUMS` and `CHECKSUMS.txt` for public verification.

---

## 5. GitHub Actions secrets required for release signing (Y-19)

The signing steps in `.github/workflows/release-desktop.yml` are **secret-driven**.
Each step is skipped when its secret is absent, and the
`desktop:release:signing:report -- --require-signed` gate then fails the job.
That is intentional: without these secrets no public desktop release is
publishable, rather than an unsigned one shipping.

### macOS — Developer ID Application + notarization

| Secret | Purpose |
|---|---|
| `APPLE_SIGNING_CERT_P12` | base64-encoded `.p12` with the Developer ID Application certificate and private key |
| `APPLE_SIGNING_CERT_PASSWORD` | password for that `.p12` |
| `APPLE_KEYCHAIN_PASSWORD` | password for the temporary signing keychain created on the runner |
| `APPLE_ID` | Apple ID used by `notarytool` |
| `APPLE_TEAM_ID` | Apple Developer team ID |
| `APPLE_APP_SPECIFIC_PASSWORD` | app-specific password for `notarytool` |

### Windows — Authenticode

| Secret | Purpose |
|---|---|
| `WINDOWS_SIGNING_CERT_BASE64` | base64-encoded `.pfx` with the code-signing certificate and private key |
| `WINDOWS_SIGNING_CERT_PASSWORD` | password for that `.pfx` |
| `WINDOWS_SIGNING_TIMESTAMP_URL` | RFC 3161 timestamp server; defaults to `http://timestamp.digicert.com` |

### Android — already wired, unchanged

| Secret | Purpose |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | base64-encoded release keystore |
| `KALDERASHIELD_ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `KALDERASHIELD_ANDROID_KEY_ALIAS` | key alias |
| `KALDERASHIELD_ANDROID_KEY_PASSWORD` | key password |

### Tauri updater bundles

| Secret | Purpose |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | minisign key for the automatic updater bundles |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | passphrase for that key |

The updater signature is separate from platform code signing: it is what the
built-in updater verifies, whereas Authenticode/Developer ID are what the
operating system verifies. Both are required for a public desktop release.
