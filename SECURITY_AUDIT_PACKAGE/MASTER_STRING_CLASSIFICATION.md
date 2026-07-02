# Master String Reference Classification

This document classifies all remaining occurrences of plain-text master password string references (`withActiveMasterPassword`, `masterPasswordPlain`, `passwordPlain`, `deriveEncryptionKey`) in the Aegis Vault 7 codebase as of version 7.0.1.0.

---

## 1. Core Session Management

### [vaultSession.ts](file:///C:/Users/hrn21/OneDrive/Desktop/aegisvaultv7/src/lib/vaultSession.ts)
- **Pattern**: `withActiveMasterPassword` definition and export.
- **Classification**: **Required / Unavoidable (Core Enclave Boundary)**.
- **Rationale**: Used to store the master password and backup compatibility credentials as a zeroized `Uint8Array` in temporary memory while the vault is unlocked, allowing Argon2id/KDF derivations at setup and password rotation.

---

## 2. Setup, Rotation, and Migration

### [storage.ts](file:///C:/Users/hrn21/OneDrive/Desktop/aegisvaultv7/src/lib/storage.ts)
- **Pattern**: `withActiveMasterPassword` in `resolveRotatedVaultCredential` and `migrateActiveVaultStorageToWaSqlite`.
- **Classification**: **Required / Unavoidable (Setup/Change/Migration Boundary)**.
- **Rationale**:
  - `resolveRotatedVaultCredential`: Necessary to parse legacy secret key combined credentials during a password rotation. Password change is inherently a credential setup/rotation boundary.
  - `migrateActiveVaultStorageToWaSqlite`: Run once during active storage migration to decrypt old OPFS storage and re-encrypt/write to the new wa-sqlite storage. Allowed under the migration boundary.

---

## 3. Backward Compatibility and Legacy Fallback

### [attachments.ts](file:///C:/Users/hrn21/OneDrive/Desktop/aegisvaultv7/src/lib/attachments.ts)
- **Pattern**: `withActiveMasterPassword` in `getRequiredMasterPassword`.
- **Classification**: **Required / Unavoidable (Legacy Migration Boundary)**.
- **Rationale**: Used solely to decrypt legacy attachment records (which derived keys directly from the master password instead of the vault encryption key) so they can be transparently migrated to the current AES-GCM + `vault-key` format. Once all attachments are migrated, this fallback is never executed.

---

## 4. Settings Panels

### [SettingsPanel.tsx](file:///C:/Users/hrn21/OneDrive/Desktop/aegisvaultv7/src/components/SettingsPanel.tsx)
- **Pattern**: `withActiveMasterPassword` in `handleSyncSave`, `handleSyncNow`, and `handleToggleBiometric`.
- **Classification**:
  - **`handleSyncSave` & `handleSyncNow`**: **Can be migrated to Key-Only**. 
    - *Plan*: The sync configuration password and credentials can be encrypted using a key derived from the active session's vault encryption key instead of the master password.
  - **`handleToggleBiometric`**: **Required / Unavoidable (OS Biometric Wrapper Boundary)**.
    - *Rationale*: Setting up platform biometrics wraps the master credential using a key from the secure OS enclave (Android Keystore/Windows Credential Manager). Passing the credential string to the native registration bridge is unavoidable at setup time.

---

## 5. Persistence Engines

### [sqlite_opfs.ts](file:///C:/Users/hrn21/OneDrive/Desktop/aegisvaultv7/src/lib/sqlite_opfs.ts), [waSqliteVaultStorageRepository.ts](file:///C:/Users/hrn21/OneDrive/Desktop/aegisvaultv7/src/lib/waSqliteVaultStorageRepository.ts), etc.
- **Pattern**: `masterPasswordPlain`, `passwordPlain`, `deriveEncryptionKey`.
- **Classification**: **Required / Unavoidable (Storage Engines)**.
- **Rationale**: Storage adapter classes must implement the `VaultStorageRepository` interface, which defines KDF derivation methods (`deriveEncryptionKey`) and initial setup/verify methods. These methods by definition receive plain credentials from setup/unlock views.
