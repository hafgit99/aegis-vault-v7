# Security Notes

This project is a password vault, so security claims must stay conservative until the implementation is hardened and tested.

## Current Verified Improvements

- Password generation now uses a centralized secure randomness helper.
- Diceware, biometric challenge generation, import IDs, attachment IDs, and simulated SQLite log IDs now use the same helper.
- Master password verification now uses vetted Argon2id hashes and upgrades legacy simulated hashes after successful unlock.
- Active vault unlock state now uses an in-memory session helper instead of storing the master password in browser `sessionStorage`.
- New attachment writes use WebCrypto AES-GCM with per-attachment keys derived from the active vault session.
- New biometric master-password wrapping uses WebCrypto PBKDF2-SHA256 and AES-GCM.
- New vault item metadata writes use WebCrypto AES-GCM with keys derived through the vetted Argon2id adapter.
- Tauri CSP now adds native defense-in-depth restrictions for frames, objects, forms, workers, media, and outbound connections; runtime air-gap guards also block WebRTC construction.
- Imported WebCrypto AES-GCM key references are cleared automatically when the vault session closes.
- WebCrypto AES-GCM IV generation now uses a fresh 12-byte CSPRNG nonce for every encryption operation instead of process-local counter state.
- Legacy backup encryption writer paths have been removed from the public API.
- Vault database payloads now include a versioned schema envelope with migration tests for legacy unversioned state.
- Desktop vault persistence now mirrors database state through the Tauri app data directory.
- Desktop import/export now uses controlled native Windows file dialogs.
- Clipboard clearing now removes copied secrets after the safety delay when the clipboard remains unchanged.
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

- `src/lib/legacyCrypto.ts` is quarantined as compatibility-only technical debt. It still contains pure-JS SHA-256/HMAC/HKDF/simulated-Argon2id/AES code for legacy migration and must not be used for new encryption; the remaining decrypt fallbacks should be removed or moved to audited native code before a public production release.
- Legacy XOR attachment records are rejected; older secure legacy attachment formats are migration-only and are rewritten to current AES-GCM storage after successful unlock.
- `src/lib/vaultSession.ts` stores active master/backup secrets as zeroized `Uint8Array` process-memory state during an unlocked session. Existing JS storage boundaries can still temporarily materialize immutable JavaScript strings; new sensitive decrypt/KDF work should move toward scoped or native secret handling.
- `src/lib/sqlite_opfs.ts` is a simulated SQLite/OPFS layer backed by versioned serialized JSON state. The naming and implementation should be aligned with the actual persistence strategy.
- `src/lib/otp.ts` supports the common RFC 6238 HMAC-SHA1 path plus SHA-256/SHA-512 algorithm variants and `otpauth://totp` URI parsing for issuer/account imports.
- Product copy should continue to be reviewed before release so public claims stay aligned with the verified implementation.
- Plaintext JSON export is still available for user-controlled migration/recovery, but it is gated by a warning and typed confirmation because the output is intentionally readable.
- Android screenshots, document-picker file flows, Android Keystore-backed secure storage, and native app-private vault persistence are implemented. The remaining Android storage work is release-candidate regression coverage and final production review.
- Android biometric registration can use the Tauri biometric plugin path only when the Android Keystore-backed secure storage bridge is present and exposes the expected API shape. A final manual device review is still needed before marketing it as production-grade biometric protection.
- Android Autofill public claims remain browser-dependent and must be backed by current per-candidate manual evidence even though fill/save flows are implemented.

## Near-Term Security Plan

1. Add repeatable Android regression coverage for secure storage migration, app-private vault persistence, backup/import/download flows, and corrupted payload failures.
2. Decide the final vault session handling and whether native secret handling should move master-secret operations into Rust/mobile platform code.
3. Complete manual Android biometric wrapping release review on target devices.
4. Validate TOTP interoperability against more real-world authenticator exports and service QR payloads.
5. Remove or quarantine remaining legacy custom crypto fallbacks before public release.
6. Continue release-copy review as features move from beta to public release.
