/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { secureRandomBytes } from './random';
import { withActiveVaultEncryptionKey, withActiveSessionSecrets } from './vaultSession';
import { webCryptoAesGcmDecryptBytes, webCryptoAesGcmEncryptBytes, generateSafeIv } from './webcrypto';
import { logSecurityEvent } from './securityEvents';

const DB_NAME = 'aegis_attachments_db';
const STORE_NAME = 'attachments';
const DB_VERSION = 1;
const ATTACHMENT_KEY_CONTEXT = 'aegis-vault-v7:attachment-key';

export const attachmentErrorCodes = {
  missingVaultSession: 'attachment.missingVaultSession',
  missingEncryptionMetadata: 'attachment.missingEncryptionMetadata',
  unreadableFileData: 'attachment.unreadableFileData',
  legacyEncryptionBlocked: 'attachment.legacyEncryptionBlocked',
  xorLegacyRemoved: 'attachment.xorLegacyRemoved',
} as const;

export type AttachmentErrorCode = (typeof attachmentErrorCodes)[keyof typeof attachmentErrorCodes];

export class AttachmentError extends Error {
  constructor(public readonly code: AttachmentErrorCode) {
    super(code);
    this.name = 'AttachmentError';
  }
}

/**
 * Initializes IndexedDB for attachments.
 */
function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

export interface AttachmentRecord {
  id: string;
  name: string;
  type: string;
  size: number;
  data: ArrayBuffer; // Encrypted ArrayBuffer
  encrypted: boolean;
  algorithm?: 'AES-256-GCM' | 'XOR-LEGACY';
  iv?: string;
  tag?: string;
  kdf?: 'SHA-256' | 'HKDF-SHA-256';
  /**
   * Identifies which root secret was used to derive the per-attachment key.
   * - `'vault-key'` (new): the key is derived from the session vault encryption
   *   key via HKDF. The master password string never materializes for this path.
   * - `'master-password'` (legacy): the key is derived from the master password
   *   string. New writes never use this source; it is preserved only so existing
   *   records can be read and transparently migrated to `'vault-key'`.
   * Omitted on the oldest records, which are treated as `'master-password'`.
   */
  keySource?: 'vault-key' | 'master-password';
}

/**
 * Legacy XOR attachment fallback has been permanently removed (security hardening).
 * XOR with a hardcoded key is obfuscation, not encryption. Records must be migrated
 * from a previous Aegis Vault version before upgrading.
 */
function rejectLegacyXorRecord(): never {
  logSecurityEvent(
    'attachment.legacyMigration.failed' as any,
    'Rejected legacy XOR-obfuscated attachment. This format is no longer supported. Migrate from a previous Aegis Vault version first.',
    'critical',
  );
  throw new AttachmentError(attachmentErrorCodes.xorLegacyRemoved);
}

async function deriveAttachmentKey(masterPassword: string, attachmentId: string): Promise<Uint8Array> {
  const keyMaterial = new TextEncoder().encode(`${ATTACHMENT_KEY_CONTEXT}:${attachmentId}:${masterPassword}`);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', keyMaterial));
}

async function deriveAttachmentKeyHkdf(masterPassword: string, attachmentId: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(masterPassword),
    { name: 'HKDF' },
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode(ATTACHMENT_KEY_CONTEXT),
      info: encoder.encode(attachmentId),
    },
    baseKey,
    256
  );
  return new Uint8Array(derivedBits);
}

/**
 * Derives a per-attachment AES-256 key from the session vault encryption key
 * via HKDF-SHA-256. This is the key-only path: the master password string
 * never materializes for new attachment writes/reads. The vault key is the
 * 32-byte Argon2id-derived encryption key held (zeroized on lock) in the
 * active vault session.
 */
async function deriveAttachmentKeyFromVaultKey(vaultKey: Uint8Array, attachmentId: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    vaultKey,
    { name: 'HKDF' },
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode(ATTACHMENT_KEY_CONTEXT),
      info: encoder.encode(attachmentId),
    },
    baseKey,
    256
  );
  // Zeroize the imported view of the vault key copy we received.
  vaultKey.fill(0);
  return new Uint8Array(derivedBits);
}

function getRequiredVaultKey(): Uint8Array {
  const key = withActiveVaultEncryptionKey((value) => value);
  if (!key) {
    throw new AttachmentError(attachmentErrorCodes.missingVaultSession);
  }
  return key;
}

async function encryptAttachmentDataWithVaultKey(
  vaultKey: Uint8Array,
  attachmentId: string,
  rawBuffer: ArrayBuffer,
): Promise<Pick<AttachmentRecord, 'algorithm' | 'data' | 'encrypted' | 'iv' | 'tag' | 'kdf' | 'keySource'>> {
  const key = await deriveAttachmentKeyFromVaultKey(vaultKey, attachmentId);
  const encrypted = await webCryptoAesGcmEncryptBytes(rawBuffer, key, generateSafeIv());

  return {
    algorithm: 'AES-256-GCM',
    kdf: 'HKDF-SHA-256',
    keySource: 'vault-key',
    data: encrypted.ciphertext,
    encrypted: true,
    iv: encrypted.iv,
    tag: encrypted.tag,
  };
}

async function decryptAttachmentDataWithVaultKey(
  record: AttachmentRecord,
  vaultKey: Uint8Array,
): Promise<ArrayBuffer> {
  if (record.algorithm !== 'AES-256-GCM') {
    throw new AttachmentError(attachmentErrorCodes.legacyEncryptionBlocked);
  }
  if (!record.iv || !record.tag) {
    throw new AttachmentError(attachmentErrorCodes.missingEncryptionMetadata);
  }
  const key = await deriveAttachmentKeyFromVaultKey(vaultKey, record.id);
  return webCryptoAesGcmDecryptBytes(
    {
      iv: record.iv,
      tag: record.tag,
      ciphertext: record.data,
    },
    key,
  );
}

async function encryptAttachmentDataWithMasterPassword(
  masterPassword: string,
  attachmentId: string,
  rawBuffer: ArrayBuffer,
): Promise<Pick<AttachmentRecord, 'algorithm' | 'data' | 'encrypted' | 'iv' | 'tag' | 'kdf'>> {
  const key = await deriveAttachmentKeyHkdf(masterPassword, attachmentId);
  const encrypted = await webCryptoAesGcmEncryptBytes(rawBuffer, key, generateSafeIv());

  return {
    algorithm: 'AES-256-GCM',
    kdf: 'HKDF-SHA-256',
    data: encrypted.ciphertext,
    encrypted: true,
    iv: encrypted.iv,
    tag: encrypted.tag,
  };
}

async function decryptAttachmentDataWithMasterPassword(
  record: AttachmentRecord,
  masterPassword: string,
): Promise<ArrayBuffer> {
  if (record.algorithm === 'AES-256-GCM') {
    if (!record.iv || !record.tag) {
      throw new AttachmentError(attachmentErrorCodes.missingEncryptionMetadata);
    }

    const key = await (record.kdf === 'HKDF-SHA-256'
      ? deriveAttachmentKeyHkdf(masterPassword, record.id)
      : deriveAttachmentKey(masterPassword, record.id));
    return webCryptoAesGcmDecryptBytes(
      {
        iv: record.iv,
        tag: record.tag,
        ciphertext: record.data,
      },
      key,
    );
  }

  throw new AttachmentError(attachmentErrorCodes.legacyEncryptionBlocked);
}

/**
 * New attachment writes always prefer the vault-key path: the master password
 * string is never materialized for encryption. A vault session with an
 * encryption key is required.
 */
export async function encryptAttachmentData(
  attachmentId: string,
  rawBuffer: ArrayBuffer,
): Promise<Pick<AttachmentRecord, 'algorithm' | 'data' | 'encrypted' | 'iv' | 'tag' | 'kdf' | 'keySource'>> {
  const vaultKey = getRequiredVaultKey();
  try {
    return await encryptAttachmentDataWithVaultKey(vaultKey, attachmentId, rawBuffer);
  } finally {
    vaultKey.fill(0);
  }
}

/**
 * Decrypts an attachment. The key source is selected automatically:
 * - Records written with `keySource: 'vault-key'` use the session vault key.
 * - Legacy records (no `keySource`, or `keySource: 'master-password'`) fall
 *   back to the master-password-derived key. This keeps existing attachments
 *   readable until they are transparently migrated to the vault-key format.
 */
export async function decryptAttachmentData(record: AttachmentRecord): Promise<ArrayBuffer> {
  if (record.algorithm !== 'AES-256-GCM') {
    throw new AttachmentError(attachmentErrorCodes.legacyEncryptionBlocked);
  }

  if (!record.iv || !record.tag) {
    throw new AttachmentError(attachmentErrorCodes.missingEncryptionMetadata);
  }

  if (record.keySource === 'vault-key') {
    const vaultKey = getRequiredVaultKey();
    try {
      return await decryptAttachmentDataWithVaultKey(record, vaultKey);
    } finally {
      vaultKey.fill(0);
    }
  }

  // Legacy master-password-derived attachment records are intentionally blocked
  // in the no-JS-master-string architecture. They must be migrated before this
  // gate is enabled, or restored from a current vault-key backup.
  throw new AttachmentError(attachmentErrorCodes.legacyEncryptionBlocked);
}

export async function migrateAttachmentRecordToAesGcm(record: AttachmentRecord): Promise<AttachmentRecord> {
  // Already on the current vault-key + HKDF-SHA-256 format — nothing to do.
  if (record.algorithm === 'AES-256-GCM' && record.kdf === 'HKDF-SHA-256' && record.keySource === 'vault-key') {
    return record;
  }

  // Already on HKDF-SHA-256 but still master-password-keyed — re-key to vault-key.
  if (record.algorithm === 'AES-256-GCM' && record.kdf === 'HKDF-SHA-256' && record.keySource === 'master-password') {
    const rawBuffer = await decryptAttachmentData(record);
    const encryptedAttachment = await encryptAttachmentData(record.id, rawBuffer);
    return { ...record, ...encryptedAttachment };
  }

  if (record.algorithm !== 'AES-256-GCM') {
    rejectLegacyXorRecord();
  }

  // Oldest records (no kdf / SHA-256) — decrypt with legacy path, re-encrypt vault-key.
  const rawBuffer = await decryptAttachmentData(record);
  const encryptedAttachment = await encryptAttachmentData(record.id, rawBuffer);

  return {
    ...record,
    ...encryptedAttachment,
  };
}

export async function migrateLegacyAttachmentsToAesGcm(): Promise<number> {
  if (typeof indexedDB === 'undefined') {
    return 0;
  }

  const db = await initDB();
  try {
    const legacyRecords = await new Promise<AttachmentRecord[]>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve((request.result as AttachmentRecord[]).filter((record) => 
          record.algorithm !== 'AES-256-GCM' || record.kdf !== 'HKDF-SHA-256' || record.keySource !== 'vault-key'
        ));
      };

      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
    });

    if (legacyRecords.length === 0) {
      return 0;
    }

    logSecurityEvent(
      'security.legacyCryptoWarning' as any,
      `Legacy XOR-LEGACY or old SHA-256 KDF encrypted attachments detected. Forcing migration to secure AES-256-GCM HKDF-SHA-256.`,
      'warning'
    );

    const migratedRecords = await Promise.all(legacyRecords.map((record) => migrateAttachmentRecordToAesGcm(record)));

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      migratedRecords.forEach((record) => {
        store.put(record);
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });

    return migratedRecords.length;
  } finally {
    db.close();
  }
}


/**
 * Key-only re-encryption for a master password rotation. The active session
 * must already hold the *old* vault key; the caller supplies the *new* vault
 * key derived from the rotated master password. Records are decrypted with the
 * old vault key (or the legacy master-password path for old records) and
 * re-encrypted onto the new vault key. The master password string never
 * materializes inside this routine for vault-key records; the optional
 * `legacyMasterPassword` is only consulted for pre-vault-key records.
 *
 * Returns the number of re-encrypted records.
 */
export async function reencryptAttachmentsForVaultKeyChange(
  oldVaultKey: Uint8Array,
  newVaultKey: Uint8Array,
  legacyMasterPassword?: string,
): Promise<number> {
  if (typeof indexedDB === 'undefined') {
    oldVaultKey.fill(0);
    newVaultKey.fill(0);
    return 0;
  }

  const db = await initDB();
  try {
    const records = await new Promise<AttachmentRecord[]>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result as AttachmentRecord[]);
      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
    });

    if (records.length === 0) {
      return 0;
    }

    const migratedRecords = await Promise.all(records.map(async (record) => {
      if (record.algorithm !== 'AES-256-GCM') {
        rejectLegacyXorRecord();
      }

      // Decrypt with old vault key (vault-key records) or legacy master path.
      let rawBuffer: ArrayBuffer;
      if (record.keySource === 'vault-key') {
        const oldKeyCopy = new Uint8Array(oldVaultKey);
        try {
          rawBuffer = await decryptAttachmentDataWithVaultKey(record, oldKeyCopy);
        } finally {
          oldKeyCopy.fill(0);
        }
      } else if (legacyMasterPassword) {
        rawBuffer = await decryptAttachmentDataWithMasterPassword(record, legacyMasterPassword);
      } else {
        throw new AttachmentError(attachmentErrorCodes.missingVaultSession);
      }

      const newKeyCopy = new Uint8Array(newVaultKey);
      try {
        const encryptedAttachment = await encryptAttachmentDataWithVaultKey(newKeyCopy, record.id, rawBuffer);
        return { ...record, ...encryptedAttachment };
      } finally {
        newKeyCopy.fill(0);
      }
    }));

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      migratedRecords.forEach((record) => {
        store.put(record);
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });

    return migratedRecords.length;
  } finally {
    db.close();
  }
}

/**
 * Saves a file to IndexedDB with local byte-level encryption.
 */
export async function saveAttachment(
  id: string,
  file: File,
  progressCallback?: (percent: number) => void
): Promise<void> {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        if (!e.target?.result || typeof e.target.result === 'string') {
          throw new AttachmentError(attachmentErrorCodes.unreadableFileData);
        }

        progressCallback?.(50);
        
        const rawBuffer = e.target.result as ArrayBuffer;
        const encryptedAttachment = await encryptAttachmentData(id, rawBuffer);
        
        progressCallback?.(80);

        const record: AttachmentRecord = {
          id,
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          ...encryptedAttachment,
        };

        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(record);

        transaction.oncomplete = () => {
          db.close();
          progressCallback?.(100);
          resolve();
        };
        transaction.onerror = () => {
          db.close();
          reject(transaction.error);
        };
      } catch (err) {
        db.close();
        reject(err);
      }
    };

    reader.onerror = () => {
      db.close();
      reject(reader.error);
    };
    
    // Read files as ArrayBuffer (highly optimal for raw binary data and large chunks)
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Retrieves a decrypted file from IndexedDB as a Blob.
 */
export async function getAttachmentBlob(id: string): Promise<{ blob: Blob, name: string } | null> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = async () => {
      const record = request.result as AttachmentRecord | undefined;
      if (!record) {
        db.close();
        resolve(null);
        return;
      }

      try {
        const decryptedBuffer = await decryptAttachmentData(record);
        const blob = new Blob([decryptedBuffer], { type: record.type });
        db.close();
        resolve({ blob, name: record.name });
      } catch (err) {
        db.close();
        reject(err);
      }
    };

    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

/**
 * Removes an attachment from IndexedDB.
 */
export async function deleteAttachment(id: string): Promise<void> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

export interface AttachmentBackupRecord {
  id: string;
  name: string;
  type: string;
  size: number;
  dataBase64: string;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK_SIZE = 0x8000; // 32 KiB chunks to avoid call stack limits and excessive string concatenation
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    chunks.push(String.fromCharCode.apply(null, Array.from(chunk)));
  }
  return btoa(chunks.join(''));
}

export function base64ToArrayBuffer(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Retrieves all attachments from IndexedDB, decrypts them, and converts to Base64 format for backups.
 */
export async function exportAllAttachments(): Promise<AttachmentBackupRecord[]> {
  if (typeof indexedDB === 'undefined') {
    return [];
  }
  const db = await initDB();
  try {
    const records = await new Promise<AttachmentRecord[]>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result as AttachmentRecord[]);
      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
    });

    const backupRecords: AttachmentBackupRecord[] = [];
    for (const record of records) {
      try {
        const decrypted = await decryptAttachmentData(record);
        backupRecords.push({
          id: record.id,
          name: record.name,
          type: record.type,
          size: record.size,
          dataBase64: arrayBufferToBase64(decrypted),
        });
      } catch (err) {
        console.error(`Failed to decrypt attachment ${record.id} for export:`, err);
        logSecurityEvent(
          'security.attachmentExportFailed' as any,
          `Failed to decrypt attachment ${record.id} for export.`,
          'warning',
          { attachmentId: record.id, error: err instanceof Error ? err.message : String(err) }
        );
      }
    }
    return backupRecords;
  } finally {
    db.close();
  }
}

/**
 * Takes decrypted attachments from backup, encrypts them, and writes to IndexedDB in a single transaction.
 */
export async function importAttachments(attachments: AttachmentBackupRecord[]): Promise<string[]> {
  if (typeof indexedDB === 'undefined' || attachments.length === 0) {
    return [];
  }
  const db = await initDB();
  try {
    const importedIds: string[] = [];
    const encryptedRecords: AttachmentRecord[] = [];

    for (const att of attachments) {
      const rawBuffer = base64ToArrayBuffer(att.dataBase64);
      const encryptedAttachment = await encryptAttachmentData(att.id, rawBuffer);
      encryptedRecords.push({
        id: att.id,
        name: att.name,
        type: att.type,
        size: att.size,
        ...encryptedAttachment,
      });
    }

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      encryptedRecords.forEach((record) => {
        store.put(record);
        importedIds.push(record.id);
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });

    return importedIds;
  } finally {
    db.close();
  }
}

/**
 * Deletes multiple attachments from IndexedDB in a single transaction.
 */
export async function deleteAttachments(ids: string[]): Promise<void> {
  if (typeof indexedDB === 'undefined' || ids.length === 0) {
    return;
  }
  const db = await initDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      ids.forEach((id) => {
        store.delete(id);
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export interface AttachmentIntegrityReport {
  referencedCount: number;
  availableCount: number;
  missingIds: string[];
}

/**
 * Performs a referential integrity audit comparing wa-sqlite vault item attachment IDs
 * against IndexedDB attachment records.
 */
export async function auditAttachmentIntegrity(items: Array<{ attachments?: Array<{ id: string }> }>): Promise<AttachmentIntegrityReport> {
  if (typeof indexedDB === 'undefined') {
    return { referencedCount: 0, availableCount: 0, missingIds: [] };
  }

  const referencedIds = new Set<string>();
  items.forEach((item) => {
    if (item.attachments && Array.isArray(item.attachments)) {
      item.attachments.forEach((att) => {
        if (att.id) referencedIds.add(att.id);
      });
    }
  });

  const db = await initDB();
  try {
    const availableIds = await new Promise<Set<string>>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAllKeys();

      request.onsuccess = () => resolve(new Set(request.result as string[]));
      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
    });

    const missingIds: string[] = [];
    referencedIds.forEach((id) => {
      if (!availableIds.has(id)) {
        missingIds.push(id);
      }
    });

    return {
      referencedCount: referencedIds.size,
      availableCount: availableIds.size,
      missingIds,
    };
  } finally {
    db.close();
  }
}

/**
 * Scans IndexedDB and deletes attachment records whose IDs are no longer
 * referenced by any active vault item in wa-sqlite (referential integrity enforcement).
 * Returns the count of purged orphaned attachments.
 */
export async function purgeOrphanedAttachments(activeAttachmentIds: string[]): Promise<number> {
  if (typeof indexedDB === 'undefined') {
    return 0;
  }

  const activeSet = new Set(activeAttachmentIds);
  const db = await initDB();
  try {
    const allRecords = await new Promise<AttachmentRecord[]>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result as AttachmentRecord[]);
      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
    });

    const orphanedIds = allRecords
      .map((r) => r.id)
      .filter((id) => !activeSet.has(id));

    if (orphanedIds.length === 0) {
      return 0;
    }

    await deleteAttachments(orphanedIds);
    return orphanedIds.length;
  } finally {
    db.close();
  }
}

