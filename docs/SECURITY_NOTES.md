# Security Notes

This project is a password vault, so security claims must stay conservative until the implementation is hardened and tested.

## Current Verified Improvements

- Password generation now uses a centralized secure randomness helper.
- Diceware, biometric challenge generation, import IDs, attachment IDs, and simulated SQLite log IDs now use the same helper.
- Master password verification now uses vetted Argon2id hashes and upgrades legacy simulated hashes after successful unlock.
- Active vault unlock state now uses an in-memory session helper instead of storing the master password in browser `sessionStorage`.
- New attachment writes use WebCrypto AES-GCM with per-attachment keys derived from the active vault session.
- New biometric master-password wrapping uses WebCrypto PBKDF2-SHA256 and AES-GCM.
- Vault database payloads now include a versioned schema envelope with migration tests for legacy unversioned state.
- Desktop vault persistence now mirrors database state through the Tauri app data directory.
- Desktop import/export now uses controlled native Windows file dialogs.
- Clipboard clearing now removes copied secrets after the safety delay when the clipboard remains unchanged.
- Desktop threat and recovery boundaries are documented in `docs/THREAT_MODEL.md`.
- Release gates and the signed Windows build plan are documented in `docs/RELEASE_PLAN.md`.
- Security regression tests now cover active-session export, encrypted import, attachment authentication, and lock session clearing.
- Unit tests cover random helper boundaries and password audit behavior.
- Desktop build is available through Tauri.

## Known Security Debt

- `src/lib/encryption.ts` contains custom cryptographic primitives used by remaining legacy storage and compatibility paths. These should be replaced with vetted primitives before production use.
- Legacy XOR attachment records are still readable as migration fallback and can now be rewritten to AES-GCM by the migration helper.
- `src/lib/vaultSession.ts` keeps the active master password in process memory during an unlocked session. This is safer than browser storage, but native desktop secret handling still needs a final threat-model decision.
- `src/lib/sqlite_opfs.ts` is a simulated SQLite/OPFS layer backed by versioned serialized JSON state. The naming and implementation should be aligned with the actual persistence strategy.
- `src/lib/otp.ts` is a deterministic demo OTP generator, not an RFC 6238-compatible TOTP implementation.
- Some UI labels currently overstate security guarantees. Product copy should match the real implementation.

## Near-Term Security Plan

1. Add regression tests around remaining encryption/decryption roundtrips and corrupted payload failures.
2. Wire the legacy XOR attachment migration into a startup or settings maintenance flow.
3. Decide the final vault session handling and whether native secret handling is needed.
4. Replace the demo OTP generator with standards-compatible HOTP/TOTP.
5. Update UI copy after the implementation matches the claim.
