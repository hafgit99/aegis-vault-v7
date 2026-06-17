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
- Legacy backup encryption writer paths have been removed from the public API.
- Vault database payloads now include a versioned schema envelope with migration tests for legacy unversioned state.
- Desktop vault persistence now mirrors database state through the Tauri app data directory.
- Desktop import/export now uses controlled native Windows file dialogs.
- Clipboard clearing now removes copied secrets after the safety delay when the clipboard remains unchanged.
- TOTP generation now follows the RFC 6238 flow for Base32 secrets, HMAC-SHA1, 8-byte counters, and dynamic truncation.
- Desktop Windows builds enable native screen capture protection through `SetWindowDisplayAffinity`.
- Android builds set `FLAG_SECURE` on the main activity to block screenshots and task-switcher previews for supported system surfaces.
- Android import, export, backup, and attachment download flows now use the Android document picker bridge instead of invisible browser downloads.
- Android remembered Secret Key state and biometric metadata now prefer a JavaScript bridge backed by Android Keystore AES-GCM encrypted SharedPreferences, with browser storage retained only as a fallback or legacy migration source.
- Android vault database persistence uses the Tauri native app-data command path, which maps to app-private storage on Android. The localStorage mirror is reduced to a setup marker when native persistence succeeds.
- The top-level Android debug APK and device smoke flow are documented and have been validated on a physical `arm64-v8a` device.
- Desktop threat and recovery boundaries are documented in `docs/THREAT_MODEL.md`.
- Release gates and the signed Windows build plan are documented in `docs/RELEASE_PLAN.md`.
- Unit coverage gates and current baseline are documented in `docs/QUALITY_GATES.md`.
- Security regression tests now cover active-session export, encrypted import, attachment authentication, and lock session clearing.
- Unit tests cover random helper boundaries and password audit behavior.
- Desktop build is available through Tauri.
- Android preparation has started with a dedicated readiness checklist in `docs/ANDROID_READINESS.md`.

## Known Security Debt

- `src/lib/legacyCrypto.ts` contains custom cryptographic primitives used only by remaining read-only legacy backup and compatibility fallbacks. These should be replaced or removed before production use.
- Legacy XOR attachment records are still readable as migration fallback and are rewritten to AES-GCM automatically after a successful unlock.
- `src/lib/vaultSession.ts` stores the active master password as zeroized `Uint8Array` process-memory state during an unlocked session. This is safer than browser storage, but callers that need the value still temporarily materialize JavaScript strings.
- `src/lib/sqlite_opfs.ts` is a simulated SQLite/OPFS layer backed by versioned serialized JSON state. The naming and implementation should be aligned with the actual persistence strategy.
- `src/lib/otp.ts` currently supports the common RFC 6238 HMAC-SHA1 path. SHA-256/SHA-512 and configurable issuer/account URI parsing are not implemented yet.
- Some UI labels currently overstate security guarantees. Product copy should match the real implementation.
- Android screenshots, document-picker file flows, Android Keystore-backed secure storage, and native app-private vault persistence are implemented. The remaining Android storage work is release-candidate regression coverage and final production review.
- Android biometric registration can use the Tauri biometric plugin path, and its metadata now prefers the Android Keystore bridge. A final review is still needed before marketing it as production-grade biometric protection.

## Near-Term Security Plan

1. Add repeatable Android regression coverage for secure storage migration, app-private vault persistence, backup/import/download flows, and corrupted payload failures.
2. Decide the final vault session handling and whether native secret handling should move master-secret operations into Rust/mobile platform code.
3. Complete Android biometric wrapping release review.
4. Extend TOTP support beyond the common HMAC-SHA1 path where needed: SHA-256/SHA-512, otpauth URI parsing, and stricter validation.
5. Remove or quarantine remaining legacy custom crypto fallbacks before public release.
6. Update UI copy after the implementation matches each security claim.
