# Firefox XPI Packaging and Signing

Aegis Vault's Firefox extension is built from `src-extension/` into `dist-extension-firefox/`, then packaged or signed from a clean staging folder.

## Unsigned Local XPI

Use this for local developer testing:

```bash
npm run package:firefox:xpi
```

Output:

```text
release-local/firefox/aegis-vault-7-firefox-v<version>.xpi
```

Firefox Release and Beta require Mozilla signing for persistent installation. Unsigned XPI files are mainly for Developer Edition, Nightly, ESR with signature checks disabled, or temporary debugging.

## Signed XPI With AMO API

Create AMO API credentials in the Mozilla Add-ons Developer Hub, then set them only in your local terminal session.

PowerShell:

```powershell
$env:WEB_EXT_API_KEY="your-jwt-issuer"
$env:WEB_EXT_API_SECRET="your-jwt-secret"
npm run sign:firefox:xpi
```

Alternative variable names are also supported:

```powershell
$env:AMO_API_KEY="your-jwt-issuer"
$env:AMO_API_SECRET="your-jwt-secret"
npm run sign:firefox:xpi
```

The default signing channel is `unlisted`, which is best for distributing an installable XPI yourself.

If the command stays at `Waiting for approval...`, AMO accepted the upload and is waiting for automated or manual approval. You can either wait, or submit without waiting for approval:

```powershell
$env:AMO_APPROVAL_TIMEOUT="0"
npm run sign:firefox:xpi
```

To wait for a fixed time, provide milliseconds. This example waits up to 30 minutes:

```powershell
$env:AMO_APPROVAL_TIMEOUT="1800000"
npm run sign:firefox:xpi
```

To use the listed AMO channel:

```powershell
$env:AMO_CHANNEL="listed"
npm run sign:firefox:xpi
```

## Security Rules

- Never commit AMO API keys.
- Never paste AMO API keys into issue comments, docs, or chat.
- Use environment variables or a local secret manager.
- The XPI package excludes native messaging host registration files such as `aegis-host.bat` and `com.hafgit99.aegisvault7.json`; those belong to the desktop installer/registration flow, not inside the browser extension package.

## Native Host Requirement

The signed XPI only installs the browser extension. The desktop app must still register the native messaging host:

```bash

npm run register:extension
```

On Windows, this writes the Firefox native messaging manifest to both registry and the Mozilla NativeMessagingHosts directory.

Host manifests are generated at registration time (never committed or shipped in build outputs). They live in the gitignored `native-host-local/` directory: `chromium/com.hafgit99.aegisvault7.json` for Chrome/Edge and `firefox/com.hafgit99.aegisvault7.json` for Firefox. Additional Chromium extension IDs can be added with `npm run register:extension <extension-id>`; entries are validated and migrated from previously generated manifests automatically.
