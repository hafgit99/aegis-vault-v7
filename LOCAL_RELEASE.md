# Local Desktop Release Guide

GitHub Actions is currently disabled to protect the Actions quota. Use this guide to build desktop installers locally.

## What Can Be Built Locally

Tauri desktop bundles are platform-native:

- Windows installers must be built on Windows.
- Linux packages must be built on Linux.
- macOS `.dmg` / `.app` bundles must be built on macOS.

Windows cannot produce signed macOS bundles directly, and macOS bundles should not be produced from Linux/Windows CI substitutes.

## Standard Release Command

Run this on the target operating system:

```bash
npm run release:local
```

The command performs:

1. TypeScript typecheck
2. Unit tests
3. Browser extension build
4. Tauri desktop build
5. Release artifact renaming
6. SHA-256 checksum generation for final release filenames
7. Artifact collection into `release-local/<platform>/`

## Platform Commands

The release script detects the host platform automatically, so a single command works on Windows, Linux, and macOS:

```bash
npm run release:local
```

macOS universal Apple/Intel build:

```bash
npm run release:macos:universal
```

## Faster Local Rebuild

Use this only after tests already passed in the same code state:

```bash
npm run release:local:skip-tests
```

## Output

Release files are copied to:

```text
release-local/windows/
release-local/linux/
release-local/macos/
```

Final desktop artifacts use this naming convention:

```text
AegisVault7-<version>-windows-x64-portable.exe
AegisVault7-<version>-windows-x64.msi
AegisVault7-<version>-windows-x64-setup.exe
AegisVault7-<version>-linux-amd64.deb
AegisVault7-<version>-linux-x64.AppImage
AegisVault7-<version>-macos-universal.dmg
AegisVault7-<version>-macos-universal.app
SHA256SUMS.txt
```

The script also includes browser extension builds:

```text
release-local/<platform>/browser-extension/chromium/
release-local/<platform>/browser-extension/firefox/
```

Checksums are generated for the final renamed desktop artifacts at:

```text
release-local/<platform>/SHA256SUMS.txt
```

The legacy checksum script is still available as `npm run release:checksums` for direct inspection of Tauri target outputs.

## Before Publishing

Confirm these files exist for the platform you built:

- Windows: `.exe` installer and/or `.msi`
- Linux: `.deb` and/or `.AppImage`
- macOS: `.dmg` and `.app`
- `SHA256SUMS.txt`
- Browser extension folders for Chromium and Firefox
