# Aegis Vault 7 Desktop Threat Model

This document defines the current desktop security model for Aegis Vault 7. It is intentionally conservative: product copy and release claims must not promise more than this model supports.

## Scope

This model covers the desktop application running as a local-first vault on a user's own device.

In scope:

- Master password setup, unlock, lock, and reset behavior.
- Vault item persistence through the wa-sqlite active backend, plus legacy OPFS/JSON vaults awaiting guarded migration.
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
- Vault item secrets: passwords, card details, secure key/API secret records, platform WebAuthn passkey records, identities, notes, TOTP seeds, and metadata that reveals account ownership. Browser credential-provider/proxy and Android Credential Provider passkey filling remain outside the current release boundary.
- Attachment contents.
- Encrypted backup files.
- Biometric-wrapped master password bundle.
- Database persistence payload and schema metadata.

## Trust Boundaries

- The app UI is trusted only while loaded from the packaged desktop application.
- Browser-like storage APIs are treated as local persistence, not secure secret storage.
- `src/lib/vaultSession.ts` is zeroized `Uint8Array` process-memory session state. It is safer than browser `sessionStorage`, but it is not an OS secret enclave; user-entered setup/unlock credentials still cross the JavaScript UI boundary before key material is scoped into the active session.
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
- Someone with access to legacy data written before current hardening. Legacy custom-crypto backup/database fallbacks are now rejected; older secure attachment migration remains limited to current authenticated formats.
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
- The master password is no longer stored in `sessionStorage`; routine vault item reads/writes use a scoped session vault encryption key after unlock instead of passing the master password string through repository calls. Attachment key derivation and master-password rotation also use the session vault key (HKDF-SHA-256) rather than the master password string; the deprecated string-returning session getters were removed.
- Manual lock and auto-lock close the in-memory vault session and zeroize the stored byte buffers.
- Reset clears the active session and persisted vault setup state.

Screen capture:

- Windows desktop builds request `WDA_EXCLUDEFROMCAPTURE` on app windows.
- Android builds set `FLAG_SECURE` on the main activity.
- These controls reduce ordinary screenshots, screen recording, and task-switcher preview exposure on supported OS surfaces, but do not defend against privileged capture software or compromised devices.

Vault database:

- Database persistence payloads use a versioned schema envelope.
- Legacy unversioned database payloads are normalized to the current schema.
- Vault rows store sensitive item data inside encrypted metadata (`enc_metadata`).
- **Metadata vs Ciphertext Boundary:** All sensitive item fields (passwords, usernames, titles, notes, URLs, TOTP secrets, card data, and passkeys) are strictly encrypted inside the AES-256-GCM authenticated ciphertext envelope with per-item derived HKDF keys. Row-level columns (`category`, `favorite`, `deleted`, `deleted_at`, timestamps) are maintained in plain columns solely for local SQL indexing and sync tombstone resolution. These columns never contain credential data or secret strings.
- New vault item metadata writes use Argon2id-derived keys and WebCrypto AES-GCM.
- Fresh vaults use the real wa-sqlite backend with persistent VFS support when available. Existing OPFS/JSON vaults stay on the legacy encrypted store until the guarded migration proves persistence, item parity, and restore safety.

Backups:

- Secure `.aegis` exports use vetted Argon2id key derivation and WebCrypto AES-GCM.
- AES-GCM tags protect encrypted backup payload integrity.
- Wrong-password and tampered-tag regression tests cover the secure backup envelope.
- Plaintext JSON exports require an explicit warning and typed `EXPORT` confirmation because the resulting file is readable by design.

Attachments:

- New attachment writes use WebCrypto AES-GCM.
- Attachment keys are derived from the active vault session and attachment id.
- AES-GCM tag verification rejects tampered attachment records.
- Legacy XOR attachment records are rejected. Older secure attachment records that still match supported authenticated formats are rewritten to AES-GCM after successful unlock.

Biometric unlock:

- Biometric unlock is a convenience wrapper around the master password.
- The biometric bundle remains local.
- Biometric support must be presented as local user-presence convenience, not as a separate recovery mechanism.

Import:

- Universal imports normalize supported CSV/JSON formats before saving.
- Encrypted Aegis imports require the correct decrypt password.
- Android import/export/download flows use the system document picker bridge so the user explicitly chooses save and open locations.

Extension bridge IPC channel:

- **Loopback Transport & Port Binding:** The native messaging bridge connects the browser extension host process (`aegis-host`) to the running Aegis desktop instance over local loopback TCP (`127.0.0.1:49155..49165`). Network interfaces beyond loopback are never bound.
- **Authentication & Pairing Token:** Authentication uses a 256-bit CSPRNG pairing token stored in an OS-protected file with strict permissions (fail-closed Windows `icacls` grant-only ACLs, and Unix `0o600` mode). Token validation uses constant-time comparison (`subtle::ConstantTimeEq`).
- **Session Key Derivation & Confidentiality + Authentication (AEAD, RUST-Y1):** After successful handshake, both endpoints derive a 32-byte AEAD session data key from the pairing token using HKDF-SHA256 (`derive_session_data_key`, info `aegis-ipc-session-data-key-v2`). Every request and response frame is encrypted and authenticated with XChaCha20-Poly1305 using a fresh 24-byte CSPRNG nonce per frame (`[4-byte len][version][24-byte nonce][ciphertext||16-byte tag]`, protocol version `0x02`). AEAD provides confidentiality, integrity and authentication in a single layer, so an unprivileged process on loopback can no longer read frame contents. Any structurally invalid, version-mismatched or unauthenticated frame causes immediate fail-closed connection termination.
- **Session Revocation (RUST-Y1):** A `revoke` action wipes the in-memory credential lease, rotates the pairing token (persisted to the OS-protected token file) and terminates that connection. All previously issued session keys are invalidated, so the browser bridge can be force-locked remotely.
- **Credential Lease & Memory Zeroization:** Credentials in the IPC cache are bound to a strict 5-minute lease TTL (`EXTENSION_CREDENTIAL_LEASE_MS`), zeroized upon expiry via `Zeroize` and `ZeroizeOnDrop`, and connections are rate-limited to 5 per second.
- **Metadata Protection:** Unauthenticated or broad credential queries (`list_credentials` without active URL) return sanitized metadata with empty password strings to prevent single-message bulk credential exfiltration.
- **Legacy Database Envelope Integrity Window (N-2):** Databases created prior to versioned HMAC integrity framing are admitted on first unlock and immediately authenticated with `computeStateIntegrityHmac` on the subsequent save cycle.
- **Threat Boundary & Residual Risk:** Malware executing with the same OS user privileges has file access to the pairing token by definition. The IPC layer protects against non-privilege network tampering, unauthorized local loopback processes without file access, and payload corruption.

Network:

- Production builds install an air-gap policy around browser network primitives.
- App-local/Tauri IPC URLs and exact five-character HIBP SHA-1 range checks are allowed.
- Unexpected outbound `fetch`, XHR, WebSocket, `sendBeacon`, EventSource, and WebRTC destinations are blocked and logged as security events.
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
| Legacy custom cryptographic primitives in `legacyCrypto.ts` | Mitigated | Removed from production decrypt paths; keep fail-closed tests in place |
| Simulated SQLite/OPFS persistence naming overstates implementation | Mitigated | Fresh vaults default to wa-sqlite; OPFS/JSON is retained only as a legacy migration source with guarded promotion |
| Legacy XOR attachment fallback | Mitigated | Rejected instead of decrypted |
| Active-session master credential callback materializes JS strings | Mitigated (zero-allowlist gate) | `withActiveMasterPassword` and string-returning active master getters are removed from production source. The final gate allows zero occurrences of that pattern; remaining credential exposure is limited to explicit setup/unlock/export/migration boundaries. |
| Clipboard can keep copied secrets after OS history/cloud capture or user clipboard changes | Partially mitigated | Safe clearing now uses overwrite-then-clear for unchanged secrets and Windows native writes request history/cloud exclusion where supported; OS clipboard history managers, Universal Clipboard, DLP agents, and hostile local capture remain out of scope |
| TOTP follows RFC 6238 for HMAC-SHA1/SHA-256/SHA-512, accepts `otpauth://totp` imports, and rejects unsupported digit/period parameters with explicit validation errors, but broad provider QR compatibility still needs manual verification | Mitigated with residual compatibility risk | Add fixture coverage from more authenticator exports before broad public release |
| Plaintext export option can create unsafe files | Partially mitigated | Warning and typed confirmation are required; decide whether to remove it from final release builds |
| Android remembered Secret Key and biometric wrapping use the Keystore-backed secure-storage bridge, but production biometric claims require explicit OEM/version matrix evidence | Partially mitigated | Complete Pixel, Samsung, Xiaomi, and Android 12/13/14/15 biometric matrix before using production biometric wording |
| Background-to-content `fill_inputs` messages are not replay-protected (no per-message nonce or tab-ID binding) — M7 | Accepted (defense-in-depth gap, not an attack path) | `chrome.runtime.onMessage` in a content script only receives messages from the same extension (`externally_connectable` is intentionally absent, so pages cannot reach this channel), and fills are already gated by tab-URL validation and the phishing-alert latch. A forged `fill_inputs` would require prior control of the extension's own background worker, at which point message hardening would not stop the attacker. Revisit only if an external audit requests it; adding nonce state to the autofill path risks regressions in the most critical user flow. |

## Release Claim Rules

Allowed current claims:

- "Local-first desktop vault."
- "Fresh vaults use wa-sqlite storage when persistent VFS support is available."
- "Existing OPFS/JSON vaults migrate through a guarded parity-checked flow."
- "Secure backups use Argon2id and WebCrypto AES-GCM."
- "New attachments are protected with WebCrypto AES-GCM."
- "New vault item metadata is protected with WebCrypto AES-GCM."
- "The master password is not stored in browser sessionStorage."
- "Windows and Android builds request platform screen-capture protection on supported OS surfaces."

Claims to avoid until fixed:

- "Military-grade security."
- "Zero-knowledge recovery."
- "Biometric security replaces the master password."
- "All data is protected against malware or device compromise."

## Next Decisions

1. Align the simulated SQLite naming with the finalized Tauri app data persistence strategy.
2. Complete the Android biometric production matrix on Pixel, Samsung, Xiaomi, and Android 12/13/14/15 devices before public biometric claims.
3. Move the remaining unlock/credential boundary and feature edges into native/key-only adapters, then remove deprecated JS master-password getters.
4. Decide whether plaintext JSON export remains available in release builds.
5. Review public release branding and installer identity before publishing signed artifacts.
