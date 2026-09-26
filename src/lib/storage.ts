/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VaultItem } from '../types';
import { getDefaultKdfProfile } from './argon2id';
import { migrateLegacyAttachmentsToAesGcm, reencryptAttachmentsForVaultKeyChange } from './attachments';
import {
  combineMasterPasswordAndSecretKey,
  normalizeAccountSecretKey,
} from './secretKey';
import { clearPersistedActiveVaultStorageBackend, getVaultStorageRepository, restoreOrActivateDefaultVaultStorageBackend } from './vaultStorageProvider';
import {
  runWaSqliteActiveBackendMigration,
  type WaSqliteActiveBackendMigrationResult,
} from './vaultStorageActiveMigration';
import { logSecurityEvent, securityEventCodes } from './securityEvents';
import {
  closeVaultSession,
  openVaultSession,
  updateActiveVaultEncryptionKey,
  withActiveAccountSecretKey,
  withActiveSessionSecrets,
  withActiveVaultEncryptionKey,
} from './vaultSession';
import { clearVaultIntegrityLedger } from './vaultIntegrityLedger';
import { getVaultSnapshots } from './snapshots';
import { decryptDataWithPasswordSecure } from './encryption';
import { validateBackupPayload } from './backupValidation';
import { importAttachments, type AttachmentBackupRecord } from './attachments';
import { disableBiometric, hydrateBiometric } from './biometric';
import { disableRecoveryKey } from './recoveryKey';
import { createDemoItems } from './storageDemoItems';
import {
  getSecureStorageItem,
  isSecureStorageAvailable,
  removeSecureStorageItem,
  secureStorageKeys,
  setSecureStorageItem,
} from './secureStorage';
import {
  initializeIndexedDbStorage,
  getIndexedDbItemSync,
  setIndexedDbItemSync,
  removeIndexedDbItemSync,
  clearAllSetupFlagsSync,
} from './indexedDbStorage';
import { isAndroidRuntime, isDesktopRuntime } from './desktopStorage';
import { sqliteOPFSInstance } from './sqlite_opfs';
import { invoke } from '@tauri-apps/api/core';

const STORAGE_KEYS = {
  IS_SET_UP: 'aegis_is_setup',
  SECRET_PROFILE: 'aegis_account_secret_profile',
  REMEMBERED_SECRET_KEY: 'aegis_account_secret_key_remembered',
};

interface AccountSecretProfile {
  enabled: true;
}

/**
 * K-4: raised when the authoritative vault file exists but cannot be decoded.
 *
 * This is deliberately a distinct type rather than a generic `Error`:
 *  - the UI must not shake or count it as a wrong password;
 *  - the correct user action is "restore from a snapshot", not "try again";
 *  - the failure must NOT be swallowed into an empty vault, because that is the
 *    data-loss path this whole change exists to close.
 */
export class VaultStorageUnreadableError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`vault-database-unreadable:${reason}`);
    this.name = 'VaultStorageUnreadableError';
    this.reason = reason;
  }
}

export function isVaultStorageUnreadableError(err: unknown): err is VaultStorageUnreadableError {
  return err instanceof VaultStorageUnreadableError
    || (err instanceof Error && err.message.startsWith('vault-database-unreadable:'));
}

/**
 * Y-13: a wa-sqlite promotion marker exists but its database could not be opened
 * on this attempt (transient IndexedDB/WASM failure, origin quota exhausted,
 * tab-restore race).
 *
 * This is a distinct type because the semantics are the opposite of
 * `VaultStorageUnreadableError`:
 *  - the vault is NOT corrupt — the database is intact and still referenced by
 *    the promotion marker, which is deliberately preserved;
 *  - the correct user action is "retry", not "restore from a snapshot";
 *  - it must NOT be swallowed, because the alternative is a new empty database
 *    being created and presented as the user's vault.
 */
export class VaultStorageUnavailableError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`vault-storage-unavailable:${reason}`);
    this.name = 'VaultStorageUnavailableError';
    this.reason = reason;
  }
}

export function isVaultStorageUnavailableError(err: unknown): err is VaultStorageUnavailableError {
  return err instanceof VaultStorageUnavailableError
    || (err instanceof Error && err.message.startsWith('vault-storage-unavailable:'));
}

export async function initializeStorage(): Promise<void> {
  // Phase 1: IndexedDB cache must be ready before anything reads setup flags,
  // but biometric hydrate is completely independent — run them together.
  const biometricPromise = hydrateBiometric();
  await initializeIndexedDbStorage();

  // Phase 2: OPFS pre-hydrate (desktop only) and backend restore run concurrently.
  const opfsPromise = isDesktopRuntime()
    ? sqliteOPFSInstance.hydrate().catch((e: unknown) => {
        console.error('Failed to pre-hydrate sqliteOPFSInstance:', e);
      })
    : Promise.resolve();

  const [startupBackendStatus] = await Promise.all([
    restoreOrActivateDefaultVaultStorageBackend({
      hasLegacyOpfsVaultData: isMasterPasswordSet,
    }),
    opfsPromise,
  ]);

  // Y-13: a promotion marker exists but the wa-sqlite database would not open.
  // Surface it instead of continuing: the next phase would otherwise operate on
  // whatever repository happens to be active, and the user would be shown an
  // empty vault with no explanation.
  if (startupBackendStatus === 'wa-sqlite-unavailable') {
    throw new VaultStorageUnavailableError('persisted-wa-sqlite-backend-unavailable');
  }

  // Phase 3: Vault repo hydrate + wait for biometric (should already be done).
  // K-4: a hydrate() rejection here means the vault file is present but
  // damaged. It must propagate as a typed, non-fatal-but-blocking error so the
  // lock screen can offer snapshot restore — NOT be caught and turned into an
  // empty vault.
  const repo = getVaultStorageRepository();
  const repoHydrate = repo.hydrate().catch((e: unknown) => {
    if (isVaultStorageUnreadableError(e)) throw e;
    console.error('Failed to hydrate vault storage repository:', e);
  });
  await Promise.all([repoHydrate, biometricPromise]);

  // K-4: reuses the same repository handle rather than re-resolving it.
  if (repo.isVaultFileUnreadable?.()) {
    const failure = repo.getStartupFailure?.();
    const reason = failure?.message.split(':').slice(1).join(':') || 'unknown';
    throw new VaultStorageUnreadableError(reason);
  }

  migrateRememberedSecretKeyToSecureStorage();
}


/**
 * Checks if a master password has already been set up in SQLite database.
 */
export function isMasterPasswordSet(): boolean {
  const fallback = getIndexedDbItemSync('aegis_sqlite_fallback');
  if (fallback) {
    try {
      const parsed = JSON.parse(fallback);
      if (parsed.user_secrets && parsed.user_secrets.length > 0) {
        return true;
      }
    } catch {
      // fall through to the legacy IS_SET_UP check
    }
  }
  return getIndexedDbItemSync(STORAGE_KEYS.IS_SET_UP) === 'true';
}

function readSecretProfile(): AccountSecretProfile | null {
  const raw = getIndexedDbItemSync(STORAGE_KEYS.SECRET_PROFILE);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as AccountSecretProfile;
    return parsed.enabled ? parsed : null;
  } catch {
    return null;
  }
}

export function isAccountSecretKeyRequired(): boolean {
  return readSecretProfile() !== null;
}

export function isRememberSecretKeySupported(): boolean {
  return isSecureStorageAvailable();
}

export function getRememberedAccountSecretKey(): string | null {
  const secureValue = getSecureStorageItem(secureStorageKeys.rememberedSecretKey);
  if (secureValue) return secureValue;

  const deviceValue = getIndexedDbItemSync(STORAGE_KEYS.REMEMBERED_SECRET_KEY);
  if (deviceValue) {
    if (setSecureStorageItem(secureStorageKeys.rememberedSecretKey, deviceValue)) {
      removeIndexedDbItemSync(STORAGE_KEYS.REMEMBERED_SECRET_KEY);
      return deviceValue;
    }
  }

  return null;
}

export function rememberAccountSecretKey(secretKey: string): boolean {
  const normalizedSecretKey = normalizeAccountSecretKey(secretKey);
  if (setSecureStorageItem(secureStorageKeys.rememberedSecretKey, normalizedSecretKey)) {
    removeIndexedDbItemSync(STORAGE_KEYS.REMEMBERED_SECRET_KEY);
    return true;
  }

  // R-5: If hardware/OS secure storage is unavailable, fail closed without writing plaintext secret keys to IndexedDB
  return false;
}

export function forgetRememberedAccountSecretKey(): void {
  removeSecureStorageItem(secureStorageKeys.rememberedSecretKey);
  removeIndexedDbItemSync(STORAGE_KEYS.REMEMBERED_SECRET_KEY);
}

function migrateRememberedSecretKeyToSecureStorage(): void {
  const legacySecretKey = getIndexedDbItemSync(STORAGE_KEYS.REMEMBERED_SECRET_KEY);
  if (!legacySecretKey) return;

  if (setSecureStorageItem(secureStorageKeys.rememberedSecretKey, legacySecretKey)) {
    removeIndexedDbItemSync(STORAGE_KEYS.REMEMBERED_SECRET_KEY);
  }
}

function resolveVaultCredential(password: string, secretKey?: string | null): string {
  if (password.startsWith('aegis-vault-v7:')) {
    return password;
  }
  const profile = readSecretProfile();
  if (!profile) return password;

  const usableSecretKey = secretKey || getRememberedAccountSecretKey();
  if (!usableSecretKey) return password;

  return combineMasterPasswordAndSecretKey(password, usableSecretKey);
}

async function resolveRotatedVaultCredential(newPassword: string): Promise<string> {
  const rotatedWithActiveSecret = await withActiveAccountSecretKey((secretKey) => (
    combineMasterPasswordAndSecretKey(newPassword, secretKey)
  ));

  return rotatedWithActiveSecret ?? resolveVaultCredential(newPassword);
}

async function resolveCurrentVaultCredential(password: string): Promise<string> {
  // SEC-B3: session secrets arrive as zeroizable byte clones. The backup
  // password is verified byte-wise first, and the credential string is decoded
  // only after that verification passes — scoped to this return value alone.
  const resolved = withActiveSessionSecrets((masterCredBytes, backupCredBytes) => {
    const passwordBytes = new TextEncoder().encode(password);
    try {
      const backupMatches = backupCredBytes.length === passwordBytes.length
        && passwordBytes.every((byte, index) => backupCredBytes[index] === byte);
      if (!backupMatches) return null;

      const credentialPrefix = new TextEncoder().encode('aegis-vault-v7:');
      const hasCredentialPrefix = masterCredBytes.length >= credentialPrefix.length
        && credentialPrefix.every((byte, index) => masterCredBytes[index] === byte);
      if (!hasCredentialPrefix) return null;

      return new TextDecoder().decode(masterCredBytes);
    } finally {
      passwordBytes.fill(0);
    }
  });
  return resolved ?? resolveVaultCredential(password);
}

/**
 * Validates the master password against the SQLite Argon2id signature.
 */
async function openDerivedVaultSession(credential: string, backupPassword: string): Promise<void> {
  const vaultEncryptionKey = await getVaultStorageRepository().deriveEncryptionKey(credential);
  const sessionVaultEncryptionKey = new Uint8Array(vaultEncryptionKey);
  try {
    openVaultSession(credential, backupPassword, sessionVaultEncryptionKey);
  } finally {
    vaultEncryptionKey.fill(0);
    sessionVaultEncryptionKey.fill(0);
  }
}

export async function verifyMasterPassword(password: string, secretKey?: string | null): Promise<boolean> {
  await initializeStorage();
  
  const usableSecretKey = secretKey || getRememberedAccountSecretKey();
  const credential = resolveVaultCredential(password, usableSecretKey);

  if (isDesktopRuntime()) {
    const repo = getVaultStorageRepository();
    const salt = repo.getCurrentVaultEncryptionSalt ? await repo.getCurrentVaultEncryptionSalt() : null;
    if (!salt) {
      throw new Error('Vault encryption salt is missing or uninitialized in repository.');
    }
    const kdfParams = repo.getKdfParams ? await repo.getKdfParams() : { memoryKiB: 32 * 1024, iterations: 3, parallelism: 1, hashLength: 32 };
    const argonHash = repo.getArgonHash ? await repo.getArgonHash() : '';

    try {
      const vaultKeyBytes = await invoke<number[]>('open_rust_session', {
        password: credential,
        backupPassword: password,
        argonHash,
        salt,
        kdfParams,
        secretKey: usableSecretKey || null,
      });

      const sessionVaultEncryptionKey = new Uint8Array(vaultKeyBytes);
      openVaultSession(credential, password, sessionVaultEncryptionKey);
      
      try {
        await migrateLegacyAttachmentsToAesGcm();
      } catch (err) {
        logSecurityEvent(
          securityEventCodes.attachmentLegacyMigrationFailed,
          'Legacy attachment migration failed after unlock.',
          'warning',
          { error: err instanceof Error ? err.message : String(err) },
        );
      }
      return true;
    } catch (err) {
      console.error('Rust unlock failed:', err);
      return false;
    }
  } else {
    const isCorrect = await getVaultStorageRepository().verifyPassword(credential);
    if (isCorrect) {
      let rawMasterPassword = password;
      if (password.startsWith('aegis-vault-v7:')) {
        const separatorIndex = password.indexOf('\0');
        if (separatorIndex !== -1) {
          rawMasterPassword = password.substring('aegis-vault-v7:'.length, separatorIndex);
        }
      }
      await openDerivedVaultSession(credential, rawMasterPassword);
      try {
        await migrateLegacyAttachmentsToAesGcm();
      } catch (err) {
        logSecurityEvent(
          securityEventCodes.attachmentLegacyMigrationFailed,
          'Legacy attachment migration failed after unlock.',
          'warning',
          { error: err instanceof Error ? err.message : String(err) },
        );
      }
    }
    return isCorrect;
  }
}

/**
 * Safe utility to store the master password with Argon2id signature.
 */
export async function setupMasterPassword(password: string): Promise<void> {
  await initializeStorage();
  
  if (isDesktopRuntime()) {
    const credential = resolveVaultCredential(password);
    const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const kdfParams = getDefaultKdfProfile();
    
    const result = await invoke<{
      vaultEncryptionKey: number[];
      argonHash: string;
      salt: string;
    }>('setup_rust_session', {
      password: credential,
      backupPassword: password,
      secretKey: null,
      salt,
      kdfParams,
    });

    const vaultKeyBytes = new Uint8Array(result.vaultEncryptionKey);
    const repo = getVaultStorageRepository();
    if (repo.setupMasterWithHash) {
      // K-3: pass the derived key so the first persisted state is signed.
      await repo.setupMasterWithHash(result.argonHash, result.salt, kdfParams, vaultKeyBytes);
    } else {
      const credential = resolveVaultCredential(password);
      await repo.setupMaster(credential, vaultKeyBytes);
    }
    
    openVaultSession(credential, password, vaultKeyBytes);
  } else {
    const credential = resolveVaultCredential(password);
    // K-3: `setupMaster` derives the key itself (it already holds the
    // credential) so the first persisted state is signed. Keeping the
    // derivation inside the repository avoids widening the JS-side master
    // password surface in this file.
    await getVaultStorageRepository().setupMaster(credential);
    await openDerivedVaultSession(credential, password);
  }

  try {
    await migrateLegacyAttachmentsToAesGcm();
  } catch (err) {
    logSecurityEvent(
      securityEventCodes.attachmentLegacyMigrationFailed,
      'Legacy attachment migration failed after setup.',
      'warning',
      { error: err instanceof Error ? err.message : String(err) },
    );
  }
  setIndexedDbItemSync(STORAGE_KEYS.IS_SET_UP, 'true');
}

export async function setupMasterPasswordWithSecretKey(
  password: string,
  secretKey: string,
  rememberSecretKeyOnThisDevice: boolean,
): Promise<void> {
  const normalizedSecretKey = normalizeAccountSecretKey(secretKey);
  const credential = combineMasterPasswordAndSecretKey(password, normalizedSecretKey);

  await initializeStorage();

  if (isDesktopRuntime()) {
    const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const kdfParams = getDefaultKdfProfile();
    
    const result = await invoke<{
      vaultEncryptionKey: number[];
      argonHash: string;
      salt: string;
    }>('setup_rust_session', {
      password: credential,
      backupPassword: password,
      secretKey: normalizedSecretKey,
      salt,
      kdfParams,
    });

    const vaultKeyBytes = new Uint8Array(result.vaultEncryptionKey);
    const repo = getVaultStorageRepository();
    if (repo.setupMasterWithHash) {
      await repo.setupMasterWithHash(result.argonHash, result.salt, kdfParams);
    } else {
      await repo.setupMaster(credential);
    }
    
    openVaultSession(credential, password, vaultKeyBytes);
  } else {
    await getVaultStorageRepository().setupMaster(credential);
    await openDerivedVaultSession(credential, password);
  }

  try {
    await migrateLegacyAttachmentsToAesGcm();
  } catch (err) {
    logSecurityEvent(
      securityEventCodes.attachmentLegacyMigrationFailed,
      'Legacy attachment migration failed after setup.',
      'warning',
      { error: err instanceof Error ? err.message : String(err) },
    );
  }
  setIndexedDbItemSync(STORAGE_KEYS.IS_SET_UP, 'true');
  setIndexedDbItemSync(STORAGE_KEYS.SECRET_PROFILE, JSON.stringify({
    enabled: true,
  }));

  if (rememberSecretKeyOnThisDevice) {
    rememberAccountSecretKey(normalizedSecretKey);
  } else {
    forgetRememberedAccountSecretKey();
  }
}

export async function changeMasterPassword(oldPassword: string, newPassword: string): Promise<void> {
  await initializeStorage();
  
  if (isDesktopRuntime()) {
    const repo = getVaultStorageRepository();
    const newSalt = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const kdfParams = getDefaultKdfProfile();

    const oldCredential = await resolveCurrentVaultCredential(oldPassword);
    const newCredential = await resolveRotatedVaultCredential(newPassword);

    const result = await invoke<{
      newVaultKey: number[];
      newArgonHash: string;
    }>('rotate_rust_session', {
      oldPassword: oldCredential,
      newPassword: newCredential,
      backupPassword: newPassword,
      newSalt,
      kdfParams,
    });

    const newVaultKey = new Uint8Array(result.newVaultKey);
    const oldVaultKey = await withActiveVaultEncryptionKey(async (key) => new Uint8Array(key));
    if (!oldVaultKey) {
      throw new Error('vault-storage-active-migration-session-required');
    }

    let rotatedAttachmentCount = 0;
    try {
      // SEC-B3: decode the credential bytes inside the narrowest scope needed
      // by the legacy attachment path; byte clones are zeroized by the session
      // callback on exit.
      const oldCredential = withActiveSessionSecrets((credentialBytes) => new TextDecoder().decode(credentialBytes)) ?? '';
      rotatedAttachmentCount = await reencryptAttachmentsForVaultKeyChange(
        oldVaultKey,
        newVaultKey,
        oldCredential,
      );
    } catch (err) {
      oldVaultKey.fill(0);
      newVaultKey.fill(0);
      throw err;
    }

    try {
      if (repo.changeMasterPasswordWithHash) {
        await repo.changeMasterPasswordWithHash(result.newArgonHash, newSalt, kdfParams, oldVaultKey, newVaultKey);
      } else {
        const oldCredential = withActiveSessionSecrets((credentialBytes) => new TextDecoder().decode(credentialBytes)) ?? '';
        const newCredential = await resolveRotatedVaultCredential(newPassword);
        await repo.changeMasterPassword(oldCredential, newCredential);
      }
    } catch (err) {
      if (rotatedAttachmentCount > 0) {
        const oldCredential = withActiveSessionSecrets((credentialBytes) => new TextDecoder().decode(credentialBytes)) ?? '';
        await reencryptAttachmentsForVaultKeyChange(newVaultKey, oldVaultKey, oldCredential).catch(() => {});
      }
      oldVaultKey.fill(0);
      newVaultKey.fill(0);
      throw err;
    }

    openVaultSession(newCredential, newPassword, newVaultKey);

    oldVaultKey.fill(0);
    newVaultKey.fill(0);

    disableBiometric();
    // Y-3: the old recovery bundle is sealed under the previous master
    // password — after a rotation it must be invalidated, otherwise a
    // compromised 24-word phrase still unlocks the vault while the UI
    // claims recovery is active.
    disableRecoveryKey();
    setIndexedDbItemSync(STORAGE_KEYS.IS_SET_UP, 'true');
  } else {
    const oldCredential = await resolveCurrentVaultCredential(oldPassword);
    const isCorrectOld = await getVaultStorageRepository().verifyPassword(oldCredential);
    if (!isCorrectOld) {
      throw new Error('current-master-password-invalid');
    }

    const newCredential = await resolveRotatedVaultCredential(newPassword);

    const oldVaultKey = await withActiveVaultEncryptionKey(async (key) => new Uint8Array(key));
    if (!oldVaultKey) {
      throw new Error('vault-storage-active-migration-session-required');
    }

    let newVaultKey: Uint8Array;
    try {
      newVaultKey = await getVaultStorageRepository().deriveEncryptionKey(newCredential);
    } catch (err) {
      oldVaultKey.fill(0);
      throw err;
    }

    let rotatedAttachmentCount = 0;
    try {
      rotatedAttachmentCount = await reencryptAttachmentsForVaultKeyChange(
        oldVaultKey,
        newVaultKey,
        oldCredential,
      );
    } catch (err) {
      oldVaultKey.fill(0);
      newVaultKey.fill(0);
      throw err;
    }

    try {
      await getVaultStorageRepository().changeMasterPassword(oldCredential, newCredential);
    } catch (err) {
      if (rotatedAttachmentCount > 0) {
        await reencryptAttachmentsForVaultKeyChange(newVaultKey, oldVaultKey, newCredential).catch(() => {});
      }
      oldVaultKey.fill(0);
      newVaultKey.fill(0);
      throw err;
    }

    oldVaultKey.fill(0);
    newVaultKey.fill(0);

    await openDerivedVaultSession(newCredential, newPassword);
    disableBiometric();
    // Y-3: see desktop branch — rotate-out stale recovery bundles.
    disableRecoveryKey();
    setIndexedDbItemSync(STORAGE_KEYS.IS_SET_UP, 'true');
  }
}

/**
 * Resets the master password and wipes all database contents.
 */
export async function resetSystem(): Promise<void> {
  await getVaultStorageRepository().resetAll();
  closeVaultSession();
  clearAllSetupFlagsSync();
  clearPersistedActiveVaultStorageBackend();
}

export interface VaultRebuildFromSnapshotResult {
  restoredItems: number;
  restoredAttachments: number;
  /** Snapshots that failed the master-password check, oldest first. */
  skippedSnapshots: number;
}

/**
 * K-4: rebuilds an unreadable vault from an encrypted snapshot, in place, while
 * the vault is still locked.
 *
 * ## Why this cannot go through the normal restore path
 *
 * `restoreVaultSnapshot` reads the CURRENT vault (`getVaultItems`) to reconcile
 * against, and needs an open session. Neither is available here: the file that
 * holds the vault is the thing that is broken, which is precisely why the
 * lock screen cannot offer the ordinary "restore" affordance.
 *
 * ## What this does instead
 *
 * The snapshot is encrypted with the master password, and the master password is
 * something the user still knows. So recovery is a REBUILD rather than a
 * rollback:
 *
 *   1. decrypt the chosen snapshot with the supplied password — this both proves
 *      the password is right and yields the plaintext items;
 *   2. wipe the unreadable vault and re-create it with the SAME password (new
 *      salt, new argon2id hash, so the user's password keeps working);
 *   3. write the snapshot's items and attachments into the fresh vault.
 *
 * The password itself is never changed, so afterwards the user unlocks with
 * exactly what they used before.
 *
 * ## Destructive by design
 *
 * The unreadable file is unrecoverable, and a rebuild cannot merge with it. The
 * caller is expected to have shown the user what is about to be replaced. The
 * integrty ledger is cleared with the vault, otherwise the new vault's counter
 * would sit below the old mark and every write would be refused.
 */
export async function rebuildVaultFromSnapshot(
  snapshotId: string,
  masterPassword: string,
): Promise<VaultRebuildFromSnapshotResult> {
  const snapshots = await getVaultSnapshots();
  const target = snapshots.find((snapshot) => snapshot.id === snapshotId);
  if (!target) {
    throw new Error('snapshot-not-found');
  }

  // Proves the password before anything destructive happens.
  let rawJson: string;
  try {
    rawJson = await decryptDataWithPasswordSecure(target.encryptedPayload, masterPassword);
  } catch {
    throw new Error('snapshot-password-mismatch');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('snapshot-unreadable');
  }

  const validated = validateBackupPayload(parsed);
  const items = validated.items as unknown as VaultItem[];
  const attachments = (validated.attachments || []) as unknown as AttachmentBackupRecord[];

  // 1. Replace the unreadable vault with an empty one under the same password.
  await getVaultStorageRepository().resetAll();
  clearVaultIntegrityLedger();
  clearAllSetupFlagsSync();
  clearPersistedActiveVaultStorageBackend();
  closeVaultSession();

  // 2. Re-create the vault so the user's existing password works again.
  await setupMasterPassword(masterPassword);

  // 3. Repopulate from the snapshot. From here on the normal, session-backed
  //    save path is usable, so no bespoke write path is needed.
  const sessionCredential = resolveVaultCredential(masterPassword);
  await openDerivedVaultSession(sessionCredential, masterPassword);

  let restoredAttachments = 0;
  try {
    await saveVaultItems(items);
    if (attachments.length > 0) {
      await importAttachments(attachments);
      restoredAttachments = attachments.length;
    }
  } finally {
    closeVaultSession();
  }

  // Older snapshots may be encrypted under a previous password; counting them
  // keeps the summary honest rather than silently restoring a partial vault.
  const skippedSnapshots = snapshots.filter(
    (snapshot) => snapshot.id !== snapshotId && snapshot.encryptedPayload !== target.encryptedPayload,
  ).length;

  logSecurityEvent(
    securityEventCodes.storageLegacyMigrationFailed,
    `Rebuilt an unreadable vault from snapshot ${snapshotId} (${items.length} items, ${restoredAttachments} attachments).`,
    'warning',
    { snapshotId, restoredItems: items.length, restoredAttachments },
  );

  return { restoredItems: items.length, restoredAttachments, skippedSnapshots };
}

export async function migrateActiveVaultStorageToWaSqlite(): Promise<WaSqliteActiveBackendMigrationResult> {
  if (isAndroidRuntime()) {
    throw new Error('wa-sqlite-android-webview-wasm-memory-unsupported');
  }

  const result = await withActiveSessionSecrets(async (credentialBytes) => {
    const credential = new TextDecoder().decode(credentialBytes);
    let migrationResult: WaSqliteActiveBackendMigrationResult;
    try {
      migrationResult = await runWaSqliteActiveBackendMigration(credential);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? '');
      if (/memory access out of bounds|out of memory|wasm/i.test(message)) {
        throw new Error('wa-sqlite-webview-wasm-memory-unsupported');
      }
      throw error;
    }
    if (migrationResult.status === 'promoted') {
      setIndexedDbItemSync(STORAGE_KEYS.IS_SET_UP, 'true');
      // Y-12: always re-derive from the newly promoted repository.
      //
      // `runVaultStorageMigration` calls `targetRepository.setupMaster(...)`,
      // which mints a BRAND NEW random salt and then writes every migrated row
      // under `Argon2id(credential, newSalt)`. The key already sitting in the
      // session is `Argon2id(credential, oldOpfsSalt)` — a different key.
      //
      // The old `if (existingKey)` shortcut pushed that stale key straight into
      // the session. The first `changeMasterPassword` after promotion then
      // handed it to `changeMasterPasswordWithHash(..., oldVaultKey, ...)`, and
      // every wa-sqlite row failed to decrypt: `WA_SQLITE_ROW_DECRYPT_ERROR` on
      // the very first row. The user could not change their master password at
      // all, and storage.ts:466-474 then tried an extra rotation with the
      // mismatched pair, making it worse.
      //
      // The SEC-B3 justification on the shortcut was never real: the credential
      // is already decoded in this scope by `withActiveSessionSecrets`, and the
      // `else` branch performed exactly this derivation. The shortcut bought no
      // security and produced a wrong key.
      const promotedKey = await getVaultStorageRepository().deriveEncryptionKey(credential);
      updateActiveVaultEncryptionKey(promotedKey);
      promotedKey.fill(0);
    }
    return migrationResult;
  });

  if (!result) {
    throw new Error('vault-storage-active-migration-session-required');
  }
  return result;
}

async function withSessionVaultKey<T>(fallback: T, action: (vaultEncryptionKey: Uint8Array) => Promise<T>): Promise<T> {
  let keyCopy: Uint8Array | null = null;
  const result = withActiveVaultEncryptionKey((vaultEncryptionKey) => {
    keyCopy = vaultEncryptionKey;
    return action(vaultEncryptionKey);
  });
  if (!result) return fallback;
  try {
    return await result;
  } finally {
    (keyCopy as Uint8Array | null)?.fill(0);
  }
}


/** Trash items are permanently deleted this many days after deletion. */
export const TRASH_RETENTION_DAYS = 15;

const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/**
 * Retrieves vault items from the database.
 *
 * Y-14: this used to be a **read that destroyed data**. Every call permanently
 * deleted every trashed item older than 15 days, and returned the result of
 * that delete. It had 11 call sites, including the worst possible ones:
 *
 *   - `createVaultSnapshot`  — taking a backup purged the trash
 *   - `restoreVaultSnapshot` — restoring a backup purged the trash
 *   - `useSettingsSync`      — syncing to WebDAV/S3 purged the trash
 *   - `useSettingsPasskey`   — a passkey operation purged the trash
 *   - `useSettingsBackupImport` — importing a backup purged the trash
 *
 * So merely opening the vault, taking a snapshot, or pushing it to remote
 * storage silently and irreversibly destroyed user data — with no
 * confirmation, no snapshot, and no log entry.
 *
 * Reading is now a pure read. Retention is enforced by
 * `purgeExpiredTrashItems()`, which is explicit and logs a
 * `storage.trashRetention.purged` event.
 */
export async function getVaultItems(): Promise<VaultItem[]> {
  return withSessionVaultKey([], (vaultKey) =>
    getVaultStorageRepository().getVaultItemsWithKey!(vaultKey),
  );
}

/**
 * Y-14: explicitly delete trash items past the 15-day retention window.
 *
 * Separate from `getVaultItems` so that irreversible multi-row deletion only
 * happens where it was asked for, and always leaves an audit record.
 *
 * @returns the remaining items, and how many were purged.
 */
export async function purgeExpiredTrashItems(): Promise<{ items: VaultItem[]; purgedCount: number }> {
  return withSessionVaultKey({ items: [], purgedCount: 0 }, async (vaultKey) => {
    const items = await getVaultStorageRepository().getVaultItemsWithKey!(vaultKey);
    const now = Date.now();
    const expiredIds = items
      .filter((item) => {
        if (!item.deleted || !item.deletedAt) return false;
        const deletedTime = new Date(item.deletedAt).getTime();
        return Number.isFinite(deletedTime) && now - deletedTime >= TRASH_RETENTION_MS;
      })
      .map((item) => item.id);

    if (expiredIds.length === 0) {
      return { items, purgedCount: 0 };
    }

    const remaining = await getVaultStorageRepository().deletePermanentlyBatchWithKey!(expiredIds, vaultKey);

    // An irreversible delete must never be silent.
    logSecurityEvent(
      securityEventCodes.storageTrashRetentionPurged,
      `Permanently deleted ${expiredIds.length} trashed item(s) past the ${TRASH_RETENTION_DAYS}-day retention window.`,
      'warning',
      { purgedCount: expiredIds.length, retentionDays: TRASH_RETENTION_DAYS },
    );

    return { items: remaining, purgedCount: expiredIds.length };
  });
}

/**
 * Saves or updates a vault item inside SQLite row.
 */
export async function saveVaultItem(item: VaultItem): Promise<VaultItem[]> {
  return withSessionVaultKey([], (vaultKey) => getVaultStorageRepository().saveVaultItemWithKey!(item, vaultKey));
}

export async function saveVaultItems(items: VaultItem[], onProgress?: (count: number) => void): Promise<VaultItem[]> {
  return withSessionVaultKey([], (vaultKey) => {
    if (onProgress) {
      return getVaultStorageRepository().saveVaultItemsWithKey!(items, vaultKey, onProgress);
    }
    return getVaultStorageRepository().saveVaultItemsWithKey!(items, vaultKey);
  });
}

/**
 * Deletes a vault item directly.
 */
export async function deleteVaultItem(id: string): Promise<VaultItem[]> {
  return withSessionVaultKey([], (vaultKey) => getVaultStorageRepository().deletePermanentlyWithKey!(id, vaultKey));
}

/**
 * Moves a vault item to trash.
 *
 * Y-15: uses the repository's targeted flag update when available. The previous
 * implementation read the whole vault, mutated one item in the resulting array
 * and wrote it back — so a one-field change decrypted everything, and any field
 * that changed between the read and the write was silently reverted.
 */
export async function moveToTrash(id: string): Promise<VaultItem[]> {
  return withSessionVaultKey([], async (vaultKey) => {
    const repository = getVaultStorageRepository();
    if (repository.setItemTrashedWithKey) {
      return repository.setItemTrashedWithKey(id, true, vaultKey);
    }

    const items = await repository.getVaultItemsWithKey!(vaultKey);
    const found = items.find(x => x.id === id);
    if (found) {
      found.deleted = true;
      found.deletedAt = new Date().toISOString();
      await repository.saveVaultItemWithKey!(found, vaultKey);
    }
    return repository.getVaultItemsWithKey!(vaultKey);
  });
}

/**
 * Restores a vault item from trash. See `moveToTrash` for why the targeted
 * update is preferred.
 */
export async function restoreFromTrash(id: string): Promise<VaultItem[]> {
  return withSessionVaultKey([], async (vaultKey) => {
    const repository = getVaultStorageRepository();
    if (repository.setItemTrashedWithKey) {
      return repository.setItemTrashedWithKey(id, false, vaultKey);
    }

    const items = await repository.getVaultItemsWithKey!(vaultKey);
    const found = items.find(x => x.id === id);
    if (found) {
      found.deleted = false;
      delete found.deletedAt;
      await repository.saveVaultItemWithKey!(found, vaultKey);
    }
    return repository.getVaultItemsWithKey!(vaultKey);
  });
}

/**
 * Permanently deletes a vault item from the database.
 */
export async function deletePermanently(id: string): Promise<VaultItem[]> {
  return withSessionVaultKey([], (vaultKey) => getVaultStorageRepository().deletePermanentlyWithKey!(id, vaultKey));
}

/**
 * Empties the trash completely in SQLite.
 */
export async function emptyTrashComplete(): Promise<VaultItem[]> {
  return withSessionVaultKey([], async (vaultKey) => {
    const items = await getVaultStorageRepository().getVaultItemsWithKey!(vaultKey);
    const deletedIds = items.filter(item => item.deleted).map(item => item.id);

    if (deletedIds.length > 0) {
      return getVaultStorageRepository().deletePermanentlyBatchWithKey!(deletedIds, vaultKey);
    }
    return items;
  });
}

/**
 * Re-seeds the system with default demo items inside SQLite.
 */
export async function reseedDemoData(): Promise<VaultItem[]> {
  return withSessionVaultKey([], (vaultKey) => getVaultStorageRepository().reseedDemoWithKey!(vaultKey, createDemoItems()));
}
