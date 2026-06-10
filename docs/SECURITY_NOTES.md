# Security Notes

This project is a password vault, so security claims must stay conservative until the implementation is hardened and tested.

## Current Verified Improvements

- Password generation now uses a centralized secure randomness helper.
- Diceware, biometric challenge generation, import IDs, attachment IDs, and simulated SQLite log IDs now use the same helper.
- Active vault unlock state now uses an in-memory session helper instead of storing the master password in browser `sessionStorage`.
- New attachment writes use WebCrypto AES-GCM with per-attachment keys derived from the active vault session.
- Unit tests cover random helper boundaries and password audit behavior.
- Desktop build is available through Tauri.

## Known Security Debt

- `src/lib/encryption.ts` contains custom cryptographic primitives. These should be replaced with vetted primitives before production use.
- Legacy XOR attachment records are still readable as migration fallback and need a dedicated migration plan.
- `src/lib/vaultSession.ts` keeps the active master password in process memory during an unlocked session. This is safer than browser storage, but native desktop secret handling still needs a final threat-model decision.
- `src/lib/sqlite_opfs.ts` is a simulated SQLite/OPFS layer backed by serialized JSON state. The naming and implementation should be aligned with the actual persistence strategy.
- `src/lib/otp.ts` is a deterministic demo OTP generator, not an RFC 6238-compatible TOTP implementation.
- Some UI labels currently overstate security guarantees. Product copy should match the real implementation.

## Near-Term Security Plan

1. Add regression tests around remaining encryption/decryption roundtrips and corrupted payload failures.
2. Define a migration plan for legacy XOR attachment records.
3. Define the final desktop vault session and recovery model.
4. Decide whether desktop storage uses Tauri filesystem APIs, SQLite, Stronghold, or a hybrid.
5. Replace the demo OTP generator with standards-compatible HOTP/TOTP.
6. Update UI copy after the implementation matches the claim.
