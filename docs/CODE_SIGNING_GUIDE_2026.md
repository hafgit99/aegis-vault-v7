# Aegis Vault 7 — Code Signing & Artifact Signing Guide (2026)

## Overview

This guide documents the procedures for signing desktop (Windows EV Authenticode, macOS Developer ID, Linux GPG) and mobile (Android Keystore, iOS Provisioning Profile) build artifacts for public release.

---

## 1. Windows Code Signing (EV Authenticode)

- **Certificate:** EV Code Signing Hardware Token (YubiKey / HSM) or Azure Key Vault.
- **Tool:** `signtool.exe` or `azure-code-signing-action`.
- **Command:**
  ```powershell
  signtool sign /tr http://timestamp.digicert.com /td sha256 /fd sha256 /sha1 <CERT_THUMBPRINT> "src-tauri/target/release/bundle/nsis/Aegis Vault 7_7.0.1_x64-setup.exe"
  ```

---

## 2. macOS Code Signing & Notarization

- **Certificate:** Developer ID Application.
- **Commands:**
  ```bash
  codesign --deep --force --verify --verbose --sign "Developer ID Application: Aegis (TEAMID)" "src-tauri/target/release/bundle/macos/Aegis Vault 7.app"
  xcrun notarytool submit "src-tauri/target/release/bundle/macos/Aegis Vault 7.dmg" --keychain-profile "AC_NOTARY" --wait
  xcrun stapler staple "src-tauri/target/release/bundle/macos/Aegis Vault 7.dmg"
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
