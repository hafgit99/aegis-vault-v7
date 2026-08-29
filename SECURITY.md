# Security Policy

Aegis Vault 7 is a local-first, zero-knowledge password manager. Security is the product — if you believe you have found a vulnerability, we want to hear from you.

## Supported Versions

| Version | Supported |
| --- | --- |
| 7.0.x | ✅ |
| < 7.0 | ❌ |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security reports.**

Report vulnerabilities privately to: **admin@aegisvault.xyz**

You will receive:

- an acknowledgement within **48 hours**,
- a triage decision (accepted / rejected / needs more info) within **7 days**,
- status updates at least every 14 days until a fix is released,
- public credit (if desired) in the release notes after the fix ships.

We follow a **90-day coordinated disclosure** timeline: we ask that you keep the finding private until a patched version is released, or up to 90 days — whichever comes first. If a fix cannot be shipped in that window we will agree on a revised date with you.

### What to include

- Affected component: desktop app (Windows / macOS / Linux), browser extension (Chrome / Firefox / Safari), native messaging / IPC bridge, Android app, or sync providers (WebDAV / S3).
- Affected version (and commit hash if known).
- Step-by-step reproduction or a proof of concept.
- Your assessment of impact and severity.
- Whether you want public credit and the name/handle to credit.

### Reports in Turkish or English are both welcome.

## Scope

**In scope:**

- Cryptographic implementation (key derivation, encryption, key storage, sharing).
- The browser extension content script / background worker messaging and autofill gating.
- The native messaging host and the loopback IPC channel (pairing, framing, transport).
- Vault persistence (desktop storage, OPFS, wa-sqlite), backup export/import, and sync providers.
- Android app (KeyStore usage, biometric binding, autofill service, file providers).
- The Tauri IPC surface, capability configuration, and updater.

**Out of scope:**

- Malware or attackers already executing with the user's OS account privileges (the threat model accepts that such processes can read the user's own files, including the IPC pairing token).
- Physical access, hardware attacks, cold-boot/memory scraping, and screen capture by privileged software.
- Attacks requiring a rooted/jailbroken device with the vault unlocked.
- Brute-forcing the Argon2id master credential (offline strength is enforced by design).
- Social engineering of the developer or users.
- Vulnerabilities in third-party dependencies — please report those upstream and notify us so we can update.

## Design Assumptions

The current threat model is documented in [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md). Notable accepted boundaries, so reports can be framed against them:

- The master password and Secret Key (two factors) are required to derive vault keys; losing both means data loss (recovery via the offline Emergency Kit).
- Local malware running as the same OS user is a trust-boundary boundary condition, not an in-scope attacker.
- The browser extension never talks to pages outside isolated message channels; `externally_connectable` is intentionally absent.

## Build Verification

Release artifacts are built through a gated local pipeline (`npm run release:local`): typecheck, Rust tests, `npm audit`, full unit suite, fuzz suite, extension build, Tauri bundle, hardening pass, and SHA-256 checksums. Verify downloads against the published `SHA256SUMS.txt`.

## Credits

Security researchers who responsibly disclose issues are credited in release notes and in the changelog (opt-in).
