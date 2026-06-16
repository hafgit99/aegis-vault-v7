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
5. SHA-256 checksum generation
6. Artifact collection into `release-local/<platform>/`

## Platform Commands

Windows:

```bash
npm run release:windows
```

Linux:

```bash
npm run release:linux
```

macOS current architecture:

```bash
npm run release:macos
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

The script also includes browser extension builds:

```text
release-local/<platform>/browser-extension/chromium/
release-local/<platform>/browser-extension/firefox/
```

Checksums are generated at:

```text
src-tauri/target/SHA256SUMS.txt
```

and copied into the local release folder.

## Before Publishing

Confirm these files exist for the platform you built:

- Windows: `.exe` installer and/or `.msi`
- Linux: `.deb` and/or `.AppImage`
- macOS: `.dmg` and `.app`
- `SHA256SUMS.txt`
- Browser extension folders for Chromium and Firefox
