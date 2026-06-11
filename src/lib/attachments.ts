/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { secureRandomBytes } from './random';
import { getActiveMasterPassword } from './vaultSession';
import { webCryptoAesGcmDecryptBytes, webCryptoAesGcmEncryptBytes } from './webcrypto';

const DB_NAME = 'aegis_attachments_db';
const STORE_NAME = 'attachments';
const DB_VERSION = 1;
const ATTACHMENT_KEY_CONTEXT = 'aegis-vault-v7:attachment-key';

export const attachmentErrorCodes = {
  missingVaultSession: 'attachment.missingVaultSession',
  missingEncryptionMetadata: 'attachment.missingEncryptionMetadata',
  unreadableFileData: 'attachment.unreadableFileData',
  legacyEncryptionBlocked: 'attachment.legacyEncryptionBlocked',
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
}

/**
 * Legacy attachment fallback for records written before the AES-GCM attachment format.
 */
function decryptLegacyXorBufferForMigration(buffer: ArrayBuffer, keyStr: string = 'aegis_secure_file'): ArrayBuffer {
  const view = new Uint8Array(buffer);
  const keyBytes = new TextEncoder().encode(keyStr);
  const result = new Uint8Array(view.length);
  
  for (let i = 0; i < view.length; i++) {
    result[i] = view[i] ^ keyBytes[i % keyBytes.length];
  }
  return result.buffer;
}

async function deriveAttachmentKey(masterPassword: string, attachmentId: string): Promise<Uint8Array> {
  const keyMaterial = new TextEncoder().encode(`${ATTACHMENT_KEY_CONTEXT}:${attachmentId}:${masterPassword}`);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', keyMaterial));
}

function getRequiredMasterPassword(): string {
  const masterPassword = getActiveMasterPassword();
  if (!masterPassword) {
    throw new AttachmentError(attachmentErrorCodes.missingVaultSession);
  }
  return masterPassword;
}

export async function encryptAttachmentData(
  attachmentId: string,
  rawBuffer: ArrayBuffer,
): Promise<Pick<AttachmentRecord, 'algorithm' | 'data' | 'encrypted' | 'iv' | 'tag'>> {
  const masterPassword = getRequiredMasterPassword();
  const key = await deriveAttachmentKey(masterPassword, attachmentId);
  const encrypted = await webCryptoAesGcmEncryptBytes(rawBuffer, key, secureRandomBytes(12));

  return {
    algorithm: 'AES-256-GCM',
    data: encrypted.ciphertext,
    encrypted: true,
    iv: encrypted.iv,
    tag: encrypted.tag,
  };
}

export async function decryptAttachmentData(record: AttachmentRecord): Promise<ArrayBuffer> {
  if (record.algorithm === 'AES-256-GCM') {
    if (!record.iv || !record.tag) {
      throw new AttachmentError(attachmentErrorCodes.missingEncryptionMetadata);
    }

    const masterPassword = getRequiredMasterPassword();
    const key = await deriveAttachmentKey(masterPassword, record.id);
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

export async function migrateAttachmentRecordToAesGcm(record: AttachmentRecord): Promise<AttachmentRecord> {
  if (record.algorithm === 'AES-256-GCM') {
    return record;
  }

  const rawBuffer = decryptLegacyXorBufferForMigration(record.data);
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
        resolve((request.result as AttachmentRecord[]).filter((record) => record.algorithm !== 'AES-256-GCM'));
      };

      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
    });

    if (legacyRecords.length === 0) {
      return 0;
    }

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
