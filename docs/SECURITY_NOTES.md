# Security Notes

This project is a password vault, so security claims must stay conservative until the implementation is hardened and tested.

## Current Verified Improvements

- Password generation now uses a centralized secure randomness helper; the browser extension generator also uses rejection-sampled CSPRNG indexes and CSPRNG Fisher-Yates shuffling instead of `Math.random`.
- Diceware, biometric challenge generation, import IDs, attachment IDs, and simulated SQLite log IDs now use the same helper.
- Master password verification now uses vetted Argon2id hashes; legacy simulated hash verification has been removed from the active unlock path.
- Active vault unlock state now uses an in-memory session helper instead of storing the master password in browser `sessionStorage`; normal vault item reads, writes, trash operations, and demo reseeds now use a scoped session vault encryption key instead of re-materializing the master password string. Attachment encryption/decryption and master-password rotation also run through the vault encryption key (HKDF-SHA-256) so the master password string no longer materializes inside attachment key derivation or rotation; deprecated string-returning session getters were removed in favor of boolean presence probes and scoped callbacks.
- New attachment writes use WebCrypto AES-GCM with per-attachment keys derived from the active vault session.
- New biometric master-password wrapping uses WebCrypto PBKDF2-SHA256 at 600,000 iterations and AES-GCM.
- New vault item metadata writes use WebCrypto AES-GCM with keys derived through the vetted Argon2id adapter.
- Tauri CSP now adds native defense-in-depth restrictions for frames, objects, forms, workers, media, and outbound connections; runtime air-gap guards also block WebRTC construction.
- Tauri CSP now removes `style-src 'unsafe-inline'`; production React/HTML sources avoid inline style attributes and the release gates enforce this with `npm run security:csp`.
- Imported WebCrypto AES-GCM key references are cleared automatically when the vault session closes.
- WebCrypto AES-GCM IV generation now uses a fresh 12-byte CSPRNG nonce for every encryption operation instead of process-local counter state.
- Legacy backup encryption writer and decrypt fallback paths have been removed from the public API.
- Vault database payloads now include a versioned schema envelope with migration tests for legacy unversioned state.
- Desktop vault persistence now mirrors database state through the Tauri app data directory, and native database writes use a temp-file + atomic replace flow to reduce crash/power-loss corruption risk.
- Desktop import/export now uses controlled native Windows file dialogs.
- Clipboard clearing now removes copied secrets after the safety delay when the clipboard remains unchanged.
- Browser extension IPC pairing token checks use constant-time comparison, and Unix/macOS token files are written with owner-only permissions.
- WebDAV Basic Auth encoding avoids deprecated `unescape`, and sync local-network exceptions are limited to loopback plus RFC 1918 private address ranges.
- Production builds install an air-gap network policy that blocks unexpected outbound `fetch`, XHR, WebSocket, `sendBeacon`, EventSource, and WebRTC connections while allowing app-local/Tauri IPC URLs and exact five-character HIBP SHA-1 range checks.
- Security Audit can check passwords against Have I Been Pwned using the k-anonymity range API: only the first five SHA-1 hash characters are sent, full hashes and plaintext passwords stay local.
- TOTP generation now follows the RFC 6238 flow for Base32 secrets, HMAC-SHA1/SHA-256/SHA-512, 8-byte counters, dynamic truncation, and `otpauth://totp` URI parsing.
- Desktop Windows builds enable native screen capture protection through `SetWindowDisplayAffinity`.
- Android builds set `FLAG_SECURE` on the main activity to block screenshots and task-switcher previews for supported system surfaces.
- Android Emergency Kit, import, export, backup, and attachment download flows now use the Android document picker bridge instead of invisible browser downloads.
- Android document picker calls now include a safety timeout and regression coverage for native errors, user cancellation, and no-callback failures.
- Android remembered Secret Key state and biometric metadata now prefer a JavaScript bridge backed by Android Keystore AES-GCM encrypted SharedPreferences, with browser storage retained only as a fallback or legacy migration source.
- Android native biometric registration now requires the Android Keystore-backed secure storage bridge and refuses to store native wrapping metadata in IndexedDB fallback storage.
- Android vault database persistence uses the Tauri native app-data command path, which maps to app-private storage on Android. The localStorage mirror is reduced to a setup marker when native persistence succeeds.
- Android Autofill is registered as a native service and settings entry. Fill and save flows require vault unlock, package/domain review, explicit user approval, stale-request checks, and browser-specific manual release validation.
- Android device smoke testing now verifies process startup with retries and confirms the debug package uses an app-private `/data/user/0/...` data directory.
- Plaintext JSON export now requires an explicit risk warning and typed `EXPORT` confirmation before a readable backup can be created.
- User-facing security copy no longer uses broad "military-grade" claims and now describes concrete local encryption controls more conservatively.
- The top-level Android debug APK and device smoke flow are documented and have been validated on a physical `arm64-v8a` device.
- Desktop threat and recovery boundaries are documented in `docs/THREAT_MODEL.md`.
- Release gates and the signed Windows build plan are documented in `docs/RELEASE_PLAN.md`.
- Unit coverage gates and current baseline are documented in `docs/QUALITY_GATES.md`.
- Security regression tests now cover active-session export, encrypted import, attachment authentication, and lock session clearing.
- Unit tests cover random helper boundaries and password audit behavior.
- Desktop build is available through Tauri.
- Android preparation has started with a dedicated readiness checklist in `docs/ANDROID_READINESS.md`.

## Known Security Debt

- `src/lib/legacyCrypto.ts` no longer ships custom SHA/HMAC/HKDF/simulated-Argon2id/AES decrypt primitives. It remains only as a fail-closed error-code boundary for old UI mappings.
- Legacy XOR attachment records are rejected; legacy master-password-derived AES-GCM attachment fallback is also fail-closed under the no-JS-master-string boundary. Current attachment records use vault-key-derived AES-GCM/HKDF-SHA-256.
- `withActiveMasterPassword` and string-returning active master getters are removed from production source. The automated "No-JS-Master-String final gate" now allows zero occurrences of that active-session callback pattern. `src/lib/vaultSession.ts` still keeps zeroizable byte state for explicit setup/unlock/export compatibility boundaries, while routine vault item and attachment operations use the active vault encryption key.
- wa-sqlite is the default active storage backend for fresh vaults when persistent VFS support is available. `src/lib/sqlite_opfs.ts` remains as the encrypted legacy OPFS/JSON migration source for existing vaults until the guarded parity-checked migration succeeds.
- `src/lib/otp.ts` supports the common RFC 6238 HMAC-SHA1 path plus SHA-256/SHA-512 algorithm variants and `otpauth://totp` URI parsing for issuer/account imports.
- Product copy should continue to be reviewed before release so public claims stay aligned with the verified implementation.
- Plaintext JSON export is still available for user-controlled migration/recovery, but it is gated by a warning and typed confirmation because the output is intentionally readable.
- Android screenshots, document-picker file flows, Android Keystore-backed secure storage, and native app-private vault persistence are implemented. The remaining Android storage work is release-candidate regression coverage and final production review.
- Android biometric registration can use the Tauri biometric plugin path only when the Android Keystore-backed secure storage bridge is present and exposes the expected API shape. A final manual device review is still needed before marketing it as production-grade biometric protection.
- Android Autofill public claims remain browser-dependent and must be backed by current per-candidate manual evidence even though fill/save flows are implemented.

## Near-Term Security Plan

1. Add repeatable Android regression coverage for secure storage migration, app-private vault persistence, backup/import/download flows, and corrupted payload failures.
2. Continue shrinking explicit setup/unlock/export credential boundaries toward native adapters; active-session master getter callbacks are already removed.
3. Complete manual Android biometric wrapping release review on target devices.
4. Validate TOTP interoperability against more real-world authenticator exports and service QR payloads.
5. Design the native credential/unlock adapter for a strict no-JS-master-string security boundary.
6. Continue release-copy review as features move from beta to public release.
