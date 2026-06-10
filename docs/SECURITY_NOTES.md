# Security Notes

This project is a password vault, so security claims must stay conservative until the implementation is hardened and tested.

## Current Verified Improvements

- Password generation now uses a centralized secure randomness helper.
- Diceware, biometric challenge generation, import IDs, attachment IDs, and simulated SQLite log IDs now use the same helper.
- Unit tests cover random helper boundaries and password audit behavior.
- Desktop build is available through Tauri.

## Known Security Debt

- `src/lib/encryption.ts` contains custom cryptographic primitives. These should be replaced with vetted primitives before production use.
- `src/lib/attachments.ts` uses XOR-style encryption for attachments. This must be replaced with authenticated encryption.
- `src/lib/storage.ts` stores the master password in `sessionStorage` as base64 during an unlocked session. This is not acceptable for the final desktop threat model.
- `src/lib/sqlite_opfs.ts` is a simulated SQLite/OPFS layer backed by serialized JSON state. The naming and implementation should be aligned with the actual persistence strategy.
- `src/lib/otp.ts` is a deterministic demo OTP generator, not an RFC 6238-compatible TOTP implementation.
- Some UI labels currently overstate security guarantees. Product copy should match the real implementation.

## Near-Term Security Plan

1. Add regression tests around encryption/decryption roundtrips and corrupted payload failures.
2. Replace attachment encryption with AES-GCM using a key derived from the active vault key.
3. Introduce a vault session abstraction so the UI does not read the master password directly from browser storage.
4. Decide whether desktop storage uses Tauri filesystem APIs, SQLite, Stronghold, or a hybrid.
5. Replace the demo OTP generator with standards-compatible HOTP/TOTP.
6. Update UI copy after the implementation matches the claim.
