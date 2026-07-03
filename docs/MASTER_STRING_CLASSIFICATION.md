# Master String Reference Classification

This document records the current Aegis Vault 7 no-JS-master-string boundary.

## Current Gate Result

- `withActiveMasterPassword`: **0 allowed occurrences** in production source.
- `getActiveMasterPassword`: **0 allowed occurrences** in production source.
- The automated gate `npm run security:no-js-master-string` fails if either API reappears.

## Session Boundary

`src/lib/vaultSession.ts` no longer exports a scoped callback that materializes the active master credential as a JavaScript string. The unlocked session keeps zeroizable byte state for compatibility boundaries, exposes boolean presence probes, exposes the active vault encryption key as a cloned `Uint8Array`, and stores only the active account Secret Key separately for password rotation.

## Rotation and Migration

Master password rotation no longer parses the active combined credential through `withActiveMasterPassword`. Secret-Key based accounts derive the rotated credential from the active Secret Key boundary.

The wa-sqlite active migration remains a setup/migration boundary because storage repositories still verify and migrate credential-derived data. It no longer depends on the removed `withActiveMasterPassword` API.

## Attachments

Current attachment encryption/decryption uses vault-key-derived HKDF-SHA-256 keys. Legacy master-password-derived attachment fallback is fail-closed under the no-JS-master-string gate; those records must be migrated before enabling this boundary or restored from a current vault-key backup.

## Remaining Credential Terms

Some storage repository interfaces still use parameter names such as `masterPasswordPlain`, `passwordPlain`, and `deriveEncryptionKey` because setup, unlock, import, and migration APIs necessarily receive user credentials at explicit credential-entry boundaries. These are tracked separately from the removed active-session getter/callback pattern.
