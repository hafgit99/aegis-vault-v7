# Aegis Vault 7 Desktop Threat Model

This document defines the current desktop security model for Aegis Vault 7. It is intentionally conservative: product copy and release claims must not promise more than this model supports.

## Scope

This model covers the desktop application running as a local-first vault on a user's own device.

In scope:

- Master password setup, unlock, lock, and reset behavior.
- Vault item persistence through the current simulated SQLite/OPFS layer.
- Encrypted backup export and import.
- Attachment encryption and retrieval.
- Biometric unlock as a local convenience feature.
- Clipboard and revealed-field behavior while the app is unlocked.

Out of scope for the current phase:

- Cloud synchronization.
- Multi-device conflict resolution.
- Remote account recovery.
- Enterprise policy enforcement.
- Malware already running with the user's OS account privileges.
- Kernel compromise, hardware attacks, memory scraping, or screen capture by privileged software.
- Platform-specific mobile storage and biometric implementation details beyond the current Android debug build.

## Protected Assets

- Master password.
- Vault item secrets: passwords, card details, passkeys, identities, notes, TOTP seeds, and metadata that reveals account ownership.
- Attachment contents.
- Encrypted backup files.
- Biometric-wrapped master password bundle.
- Database persistence payload and schema metadata.

## Trust Boundaries

- The app UI is trusted only while loaded from the packaged desktop application.
- Browser-like storage APIs are treated as local persistence, not secure secret storage.
- `src/lib/vaultSession.ts` is zeroized `Uint8Array` process-memory session state. It is safer than browser `sessionStorage`, but it is not an OS secret enclave and some operations still temporarily decode it into JavaScript strings.
- OPFS/localStorage fallback persistence is treated as attacker-readable at rest unless encrypted by the app.
- User-selected backup files may be attacker-controlled input.
- Imported JSON/CSV data is untrusted until parsed and normalized.
- Biometric authentication proves local user presence for convenience. It does not replace the master password as the root secret.

## Attacker Model

Defended against:

- Someone who obtains a copied encrypted `.aegis` backup file but does not know the backup password.
- Someone who reads the persisted vault database payload while the app is locked.
- Someone who tampers with AES-GCM encrypted backup or attachment payloads.
- Someone who imports malformed backup or CSV/JSON files.
- Someone with brief physical access after the app has locked.

Partially defended against:

- Someone with local user-account access to application storage. Vault item payloads and new attachments are encrypted, but profile settings, UI preferences, and some metadata may remain readable.
- Someone with access to legacy data written before current hardening. Legacy XOR attachment records are readable through a compatibility fallback until the AES-GCM migration is run and fallback support is removed.
- Someone with a valid unlocked desktop session. Auto-lock and reveal reset reduce exposure, but unlocked state is still trusted state.

Not defended against:

- Malware running as the same OS user while the vault is unlocked.
- A compromised operating system, browser engine, WebView, or Tauri runtime.
- Memory inspection while the app is unlocked.
- Keylogging, privileged screen capture, clipboard capture, or accessibility API abuse by hostile local software.
- Loss of the master password without a valid encrypted backup and backup password.

## Current Controls

Master password and session:

- Successful setup and unlock open an in-memory vault session.
- The master password is no longer stored in `sessionStorage`.
- Manual lock and auto-lock close the in-memory vault session and zeroize the stored byte buffers.
- Reset clears the active session and persisted vault setup state.

Screen capture:

- Windows desktop builds request `WDA_EXCLUDEFROMCAPTURE` on app windows.
- Android builds set `FLAG_SECURE` on the main activity.
- These controls reduce ordinary screenshots, screen recording, and task-switcher preview exposure on supported OS surfaces, but do not defend against privileged capture software or compromised devices.

Vault database:

- Database persistence payloads use a versioned schema envelope.
- Legacy unversioned database payloads are normalized to the current schema.
- Vault rows store sensitive item data inside encrypted metadata.
- New vault item metadata writes use Argon2id-derived keys and WebCrypto AES-GCM.
- The current SQLite/OPFS layer is still a simulated persistence layer and must be replaced or finalized before production claims.

Backups:

- Secure `.aegis` exports use vetted Argon2id key derivation and WebCrypto AES-GCM.
- AES-GCM tags protect encrypted backup payload integrity.
- Wrong-password and tampered-tag regression tests cover the secure backup envelope.
- Plaintext JSON exports require an explicit warning and typed `EXPORT` confirmation because the resulting file is readable by design.

Attachments:

- New attachment writes use WebCrypto AES-GCM.
- Attachment keys are derived from the active vault session and attachment id.
- AES-GCM tag verification rejects tampered attachment records.
- Legacy XOR attachment records remain readable for migration compatibility and are rewritten to AES-GCM after successful unlock.

Biometric unlock:

- Biometric unlock is a convenience wrapper around the master password.
- The biometric bundle remains local.
- Biometric support must be presented as local user-presence convenience, not as a separate recovery mechanism.

Import:

- Universal imports normalize supported CSV/JSON formats before saving.
- Encrypted Aegis imports require the correct decrypt password.
- Android import/export/download flows use the system document picker bridge so the user explicitly chooses save and open locations.

Network:

- Production builds install an air-gap policy around browser network primitives.
- App-local/Tauri IPC URLs and HIBP range checks are allowed.
- Unexpected outbound `fetch`, XHR, WebSocket, `sendBeacon`, and EventSource destinations are blocked and logged as security events.
- HIBP password checks use the range API: the app computes SHA-1 locally and sends only the first five hash characters. Full password hashes and plaintext passwords are not sent.

## Recovery Model

Supported recovery paths:

- Unlock with the master password.
- Restore from a valid encrypted `.aegis` backup when the user knows its backup password.
- Restore from a plaintext JSON backup if the user intentionally created one.
- Reset the vault and start over.

Unsupported recovery paths:

- Recovering a lost master password from the app.
- Recovering a lost encrypted backup password.
- Server-side account recovery.
- Recovering deleted data after reset without a backup.

Required user-facing recovery rules:

- The user must store the master password outside the vault.
- The user should keep at least one encrypted `.aegis` backup outside the device.
- The backup password should not be stored only inside Aegis Vault 7.
- Plaintext JSON backups are high risk and should be discouraged or gated before release.

## Residual Risk Register

| Risk | Current status | Planned mitigation |
| --- | --- | --- |
| Custom cryptographic primitives are isolated in read-only legacy backup and compatibility paths | Open | Replace or remove remaining custom AES/GCM simulation fallbacks |
| Simulated SQLite/OPFS persistence naming overstates implementation | Open | Decide final desktop storage adapter and align naming |
| Legacy XOR attachment fallback remains readable | Partially mitigated | Remove fallback after migrated installs have aged out |
| Active master password lives in process memory while unlocked | Partially mitigated | Byte buffers are zeroized on lock; move secret operations into native adapters where practical |
| Clipboard can keep copied secrets after OS capture or user clipboard changes | Partially mitigated | Safe clearing removes unchanged copied secrets; hostile OS clipboard capture remains out of scope |
| TOTP follows RFC 6238 for HMAC-SHA1/SHA-256/SHA-512 and accepts `otpauth://totp` imports, but broad provider QR compatibility still needs manual verification | Mitigated with residual validation risk | Add fixture coverage from more authenticator exports before broad public release |
| Plaintext export option can create unsafe files | Partially mitigated | Warning and typed confirmation are required; decide whether to remove it from final release builds |
| Android remembered Secret Key and biometric wrapping use the Keystore-backed secure-storage bridge, but final biometric device review is still required | Partially mitigated | Complete manual Android biometric wrapping review on target devices before public release |

## Release Claim Rules

Allowed current claims:

- "Local-first desktop vault."
- "Secure backups use Argon2id and WebCrypto AES-GCM."
- "New attachments are protected with WebCrypto AES-GCM."
- "New vault item metadata is protected with WebCrypto AES-GCM."
- "The master password is not stored in browser sessionStorage."
- "Windows and Android builds request platform screen-capture protection on supported OS surfaces."

Claims to avoid until fixed:

- "Military-grade security."
- "Zero-knowledge recovery."
- "SQLite database" unless the persistence layer is finalized as real SQLite.
- "Biometric security replaces the master password."
- "All data is protected against malware or device compromise."

## Next Decisions

1. Align the simulated SQLite naming with the finalized Tauri app data persistence strategy.
2. Complete final Android biometric wrapping review on target devices.
3. Replace remaining legacy custom AES/GCM simulation fallbacks.
4. Decide whether plaintext JSON export remains available in release builds.
5. Review public release branding and installer identity before publishing signed artifacts.
