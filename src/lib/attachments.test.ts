/**
 * @vitest-environment jsdom
 */

import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AttachmentError,
  attachmentErrorCodes,
  deleteAttachment,
  decryptAttachmentData,
  encryptAttachmentData,
  getAttachmentBlob,
  migrateLegacyAttachmentsToAesGcm,
  migrateAttachmentRecordToAesGcm,
  reencryptAttachmentsForVaultKeyChange,
  saveAttachment,
  exportAllAttachments,
  importAttachments,
  deleteAttachments,
  auditAttachmentIntegrity,
  purgeOrphanedAttachments,
  type AttachmentRecord,
} from './attachments';
import { closeVaultSession, openVaultSession } from './vaultSession';
import { webCryptoAesGcmEncryptBytes } from './webcrypto';

const DB_NAME = 'aegis_attachments_db';
const STORE_NAME = 'attachments';

const TEST_VAULT_KEY = new Uint8Array(32).fill(7);

function openTestVaultSession(masterPassword = 'master-pass'): void {
  openVaultSession(masterPassword, masterPassword, TEST_VAULT_KEY);
}

function bytes(value: string): ArrayBuffer {
  return new TextEncoder().encode(value).buffer;
}

async function text(buffer: ArrayBuffer): Promise<string> {
  return new TextDecoder().decode(buffer);
}

async function blobText(blob: Blob | undefined): Promise<string> {
  if (!blob) return '';
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error('Blob could not be read as ArrayBuffer.'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
  return text(buffer);
}

function legacyXorEncrypt(buffer: ArrayBuffer): ArrayBuffer {
  const key = new TextEncoder().encode('aegis_secure_file');
  return new Uint8Array(buffer).map((byte, index) => byte ^ key[index % key.length]!).buffer;
}

function deleteAttachmentDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

async function putAttachmentRecord(record: AttachmentRecord): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });

  db.close();
}

async function getStoredAttachmentRecord(id: string): Promise<AttachmentRecord | undefined> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  const record = await new Promise<AttachmentRecord | undefined>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result as AttachmentRecord | undefined);
    request.onerror = () => reject(request.error);
  });

  db.close();
  return record;
}

beforeEach(async () => {
  await deleteAttachmentDatabase();
});

afterEach(async () => {
  closeVaultSession();
  await deleteAttachmentDatabase();
});

describe('attachment encryption', () => {
  it('encrypts attachment bytes with AES-GCM metadata and decrypts them with the active vault session', async () => {
    openTestVaultSession();

    const encrypted = await encryptAttachmentData('attachment-1', bytes('private file'));
    const record: AttachmentRecord = {
      id: 'attachment-1',
      name: 'secret.txt',
      type: 'text/plain',
      size: 12,
      ...encrypted,
    };

    expect(record.algorithm).toBe('AES-256-GCM');
    expect(record.iv).toHaveLength(24);
    expect(record.tag).toHaveLength(32);
    expect(await text(record.data)).not.toBe('private file');
    await expect(decryptAttachmentData(record).then(text)).resolves.toBe('private file');
  });

  it('rejects tampered AES-GCM attachment tags', async () => {
    openTestVaultSession();

    const encrypted = await encryptAttachmentData('attachment-1', bytes('private file'));
    const record: AttachmentRecord = {
      id: 'attachment-1',
      name: 'secret.txt',
      type: 'text/plain',
      size: 12,
      ...encrypted,
      tag: `${encrypted.tag?.startsWith('00') ? 'ff' : '00'}${encrypted.tag?.slice(2)}`,
    };

    await expect(decryptAttachmentData(record)).rejects.toThrow();
  });

  it('rejects AES-GCM attachments when opened with a different vault key', async () => {
    openTestVaultSession();
    const encrypted = await encryptAttachmentData('attachment-1', bytes('private file'));
    closeVaultSession();
    // Re-open with a different vault key — the master password is irrelevant
    // for vault-key records, so a distinct key must block decryption.
    const OTHER_VAULT_KEY = new Uint8Array(32).fill(9);
    openVaultSession('other-master-pass', 'other-master-pass', OTHER_VAULT_KEY);
    const record: AttachmentRecord = {
      id: 'attachment-1',
      name: 'secret.txt',
      type: 'text/plain',
      size: 12,
      ...encrypted,
    };

    await expect(decryptAttachmentData(record)).rejects.toThrow();
  });

  it('rejects AES-GCM attachment records with missing metadata', async () => {
    openTestVaultSession();

    await expect(decryptAttachmentData({
      id: 'broken-attachment',
      name: 'broken.txt',
      type: 'text/plain',
      size: 12,
      data: bytes('encrypted bytes'),
      encrypted: true,
      algorithm: 'AES-256-GCM',
      iv: '000000000000000000000000',
    })).rejects.toMatchObject({
      code: attachmentErrorCodes.missingEncryptionMetadata,
      name: 'AttachmentError',
    });
  });

  it('blocks direct reads of legacy XOR attachment records before migration', async () => {
    await expect(decryptAttachmentData({
      id: 'legacy-attachment',
      name: 'legacy.txt',
      type: 'text/plain',
      size: 12,
      data: legacyXorEncrypt(bytes('private file')),
      encrypted: true,
    })).rejects.toMatchObject({
      code: attachmentErrorCodes.legacyEncryptionBlocked,
      name: 'AttachmentError',
    });
  });

  it('requires an active vault session for new attachment encryption', async () => {
    await expect(encryptAttachmentData('attachment-1', bytes('private file'))).rejects.toMatchObject({
      code: attachmentErrorCodes.missingVaultSession,
      name: 'AttachmentError',
    });
  });

  it('exposes stable error codes for localization boundaries', () => {
    const error = new AttachmentError(attachmentErrorCodes.unreadableFileData);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe(attachmentErrorCodes.unreadableFileData);
    expect(error.code).toBe(attachmentErrorCodes.unreadableFileData);
  });

  it('rejects legacy XOR attachment records during single-record migration', async () => {
    openTestVaultSession();
    const legacyRecord: AttachmentRecord = {
      id: 'legacy-attachment',
      name: 'legacy.txt',
      type: 'text/plain',
      size: 12,
      data: legacyXorEncrypt(bytes('private file')),
      encrypted: true,
      algorithm: 'XOR-LEGACY',
    };

    await expect(migrateAttachmentRecordToAesGcm(legacyRecord)).rejects.toMatchObject({
      code: attachmentErrorCodes.xorLegacyRemoved,
      name: 'AttachmentError',
    });
  });

  it('leaves AES-GCM attachment records unchanged during single-record migration', async () => {
    openTestVaultSession();
    const encrypted = await encryptAttachmentData('attachment-1', bytes('private file'));
    const record: AttachmentRecord = {
      id: 'attachment-1',
      name: 'secret.txt',
      type: 'text/plain',
      size: 12,
      ...encrypted,
    };

    await expect(migrateAttachmentRecordToAesGcm(record)).resolves.toBe(record);
  });

  it('saves, retrieves, and deletes encrypted attachments through IndexedDB', async () => {
    openTestVaultSession();
    const progress: number[] = [];
    const file = new File([bytes('private file')], 'secret.txt', { type: 'text/plain' });

    await saveAttachment('attachment-1', file, (percent) => progress.push(percent));

    expect(progress).toEqual([50, 80, 100]);
    const stored = await getStoredAttachmentRecord('attachment-1');
    expect(stored).toMatchObject({
      id: 'attachment-1',
      name: 'secret.txt',
      type: 'text/plain',
      size: file.size,
      encrypted: true,
      algorithm: 'AES-256-GCM',
    });
    expect(stored?.iv).toHaveLength(24);
    expect(stored?.tag).toHaveLength(32);

    const result = await getAttachmentBlob('attachment-1');
    expect(result?.name).toBe('secret.txt');
    await expect(blobText(result?.blob)).resolves.toBe('private file');

    await deleteAttachment('attachment-1');
    await expect(getAttachmentBlob('attachment-1')).resolves.toBeNull();
  });

  it('uses a binary MIME fallback when saved files omit a type', async () => {
    openTestVaultSession();
    const file = new File([bytes('private file')], 'secret.bin');

    await saveAttachment('attachment-1', file);

    const stored = await getStoredAttachmentRecord('attachment-1');
    expect(stored?.type).toBe('application/octet-stream');
  });

  it('rejects save when FileReader returns unreadable content', async () => {
    openTestVaultSession();
    const originalFileReader = globalThis.FileReader;

    class StringResultFileReader {
      public onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
      public onerror: (() => void) | null = null;
      public error: Error | null = null;

      readAsArrayBuffer() {
        this.onload?.({ target: { result: 'not-an-array-buffer' } } as ProgressEvent<FileReader>);
      }
    }

    vi.stubGlobal('FileReader', StringResultFileReader);

    try {
      await expect(saveAttachment('attachment-1', new File([bytes('private file')], 'secret.txt'))).rejects.toMatchObject({
        code: attachmentErrorCodes.unreadableFileData,
        name: 'AttachmentError',
      });
    } finally {
      vi.stubGlobal('FileReader', originalFileReader);
    }
  });

  it('rejects save when FileReader reports an error', async () => {
    openTestVaultSession();
    const originalFileReader = globalThis.FileReader;
    const readError = new Error('read failed');

    class ErrorFileReader {
      public onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
      public onerror: (() => void) | null = null;
      public error: Error | null = readError;

      readAsArrayBuffer() {
        this.onerror?.();
      }
    }

    vi.stubGlobal('FileReader', ErrorFileReader);

    try {
      await expect(saveAttachment('attachment-1', new File([bytes('private file')], 'secret.txt'))).rejects.toBe(
        readError,
      );
    } finally {
      vi.stubGlobal('FileReader', originalFileReader);
    }
  });

  it('rejects retrieval when stored AES-GCM attachment metadata is incomplete', async () => {
    openTestVaultSession();
    await putAttachmentRecord({
      id: 'broken-attachment',
      name: 'broken.txt',
      type: 'text/plain',
      size: 12,
      data: bytes('encrypted bytes'),
      encrypted: true,
      algorithm: 'AES-256-GCM',
      iv: '000000000000000000000000',
    });

    await expect(getAttachmentBlob('broken-attachment')).rejects.toMatchObject({
      code: attachmentErrorCodes.missingEncryptionMetadata,
      name: 'AttachmentError',
    });
  });

  it('returns null when an attachment id is not found', async () => {
    await expect(getAttachmentBlob('missing')).resolves.toBeNull();
  });

  it('rejects legacy XOR attachment records during bulk migration', async () => {
    openTestVaultSession();
    await putAttachmentRecord({
      id: 'legacy-attachment',
      name: 'legacy.txt',
      type: 'text/plain',
      size: 12,
      data: legacyXorEncrypt(bytes('private file')),
      encrypted: true,
      algorithm: 'XOR-LEGACY',
    });

    await expect(migrateLegacyAttachmentsToAesGcm()).rejects.toMatchObject({
      code: attachmentErrorCodes.xorLegacyRemoved,
      name: 'AttachmentError',
    });
  });

  it('returns zero when bulk migration finds no legacy records', async () => {
    openTestVaultSession();
    const encrypted = await encryptAttachmentData('attachment-1', bytes('private file'));
    await putAttachmentRecord({
      id: 'attachment-1',
      name: 'secret.txt',
      type: 'text/plain',
      size: 12,
      ...encrypted,
    });

    await expect(migrateLegacyAttachmentsToAesGcm()).resolves.toBe(0);
  });

  it('skips bulk legacy migration when IndexedDB is unavailable', async () => {
    const originalIndexedDB = globalThis.indexedDB;

    try {
      Object.defineProperty(globalThis, 'indexedDB', {
        configurable: true,
        value: undefined,
      });

      await expect(migrateLegacyAttachmentsToAesGcm()).resolves.toBe(0);
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', {
        configurable: true,
        value: originalIndexedDB,
      });
    }
  });

  it('blocks old AES-GCM attachments that require legacy SHA-256 master-password derivation', async () => {
    openTestVaultSession();

    // Manually construct an old record with SHA-256 KDF (no kdf property)
    const keyMaterial = new TextEncoder().encode(`aegis-vault-v7:attachment-key:attachment-old:master-pass`);
    const oldKey = new Uint8Array(await crypto.subtle.digest('SHA-256', keyMaterial));
    const encrypted = await webCryptoAesGcmEncryptBytes(bytes('private file'), oldKey, new Uint8Array(12).fill(1));

    const oldRecord: AttachmentRecord = {
      id: 'attachment-old',
      name: 'secret.txt',
      type: 'text/plain',
      size: 12,
      data: encrypted.ciphertext,
      encrypted: true,
      algorithm: 'AES-256-GCM',
      iv: encrypted.iv,
      tag: encrypted.tag,
      // no kdf field, representing old SHA-256 records
    };

    await expect(decryptAttachmentData(oldRecord)).rejects.toMatchObject({
      code: attachmentErrorCodes.legacyEncryptionBlocked,
      name: 'AttachmentError',
    });
  });

  it('blocks bulk migration of old SHA-256 AES-GCM records that require a JS master-password string', async () => {
    openTestVaultSession();

    // Manually construct an old record with SHA-256 KDF and save to IndexedDB
    const keyMaterial = new TextEncoder().encode(`aegis-vault-v7:attachment-key:attachment-old-bulk:master-pass`);
    const oldKey = new Uint8Array(await crypto.subtle.digest('SHA-256', keyMaterial));
    const encrypted = await webCryptoAesGcmEncryptBytes(bytes('bulk migrate file'), oldKey, new Uint8Array(12).fill(2));

    const oldRecord: AttachmentRecord = {
      id: 'attachment-old-bulk',
      name: 'secret-bulk.txt',
      type: 'text/plain',
      size: 17,
      data: encrypted.ciphertext,
      encrypted: true,
      algorithm: 'AES-256-GCM',
      iv: encrypted.iv,
      tag: encrypted.tag,
    };

    await putAttachmentRecord(oldRecord);

    await expect(migrateLegacyAttachmentsToAesGcm()).rejects.toMatchObject({
      code: attachmentErrorCodes.legacyEncryptionBlocked,
      name: 'AttachmentError',
    });

    const stored = await getStoredAttachmentRecord('attachment-old-bulk');
    expect(stored?.kdf).toBeUndefined();
  });

  it('re-encrypts stored attachments when the vault key changes (key-only rotation)', async () => {
    const OLD_VAULT_KEY = new Uint8Array(32).fill(7);
    const NEW_VAULT_KEY = new Uint8Array(32).fill(11);
    openVaultSession('old-master-pass', 'old-master-pass', OLD_VAULT_KEY);
    await saveAttachment('attachment-1', new File([bytes('private file')], 'secret.txt', { type: 'text/plain' }));
    const before = await getStoredAttachmentRecord('attachment-1');

    // Rotate from the old vault key to a new vault key without materializing
    // the master password string inside the re-encryption routine.
    await expect(reencryptAttachmentsForVaultKeyChange(OLD_VAULT_KEY, NEW_VAULT_KEY)).resolves.toBe(1);
    const after = await getStoredAttachmentRecord('attachment-1');

    expect(after?.iv).not.toBe(before?.iv);
    expect(after?.keySource).toBe('vault-key');

    // Old vault key can no longer decrypt the rotated record.
    closeVaultSession();
    openVaultSession('old-master-pass', 'old-master-pass', OLD_VAULT_KEY);
    await expect(getAttachmentBlob('attachment-1')).rejects.toBeTruthy();

    // New vault key decrypts the rotated record successfully.
    closeVaultSession();
    openVaultSession('new-master-pass', 'new-master-pass', NEW_VAULT_KEY);
    const result = await getAttachmentBlob('attachment-1');
    await expect(blobText(result?.blob)).resolves.toBe('private file');
  });

  it('exports all attachments, imports them in bulk, and supports bulk deletion', async () => {
    openTestVaultSession();

    // 1. Save two attachments
    await saveAttachment('attachment-1', new File([bytes('file 1 content')], 'file1.txt', { type: 'text/plain' }));
    await saveAttachment('attachment-2', new File([bytes('file 2 content')], 'file2.txt', { type: 'text/plain' }));

    // 2. Export them
    const exported = await exportAllAttachments();
    expect(exported).toHaveLength(2);
    
    const att1 = exported.find(x => x.id === 'attachment-1');
    const att2 = exported.find(x => x.id === 'attachment-2');
    expect(att1?.name).toBe('file1.txt');
    expect(att2?.name).toBe('file2.txt');
    expect(atob(att1!.dataBase64)).toBe('file 1 content');
    expect(atob(att2!.dataBase64)).toBe('file 2 content');

    // 3. Clear Database
    await deleteAttachment('attachment-1');
    await deleteAttachment('attachment-2');
    await expect(getAttachmentBlob('attachment-1')).resolves.toBeNull();
    await expect(getAttachmentBlob('attachment-2')).resolves.toBeNull();

    // 4. Import them in bulk
    const importedIds = await importAttachments(exported);
    expect(importedIds).toEqual(['attachment-1', 'attachment-2']);

    const blob1 = await getAttachmentBlob('attachment-1');
    await expect(blobText(blob1?.blob)).resolves.toBe('file 1 content');

    const blob2 = await getAttachmentBlob('attachment-2');
    await expect(blobText(blob2?.blob)).resolves.toBe('file 2 content');

    // 5. Bulk deletion
    await deleteAttachments(['attachment-1', 'attachment-2']);
    await expect(getAttachmentBlob('attachment-1')).resolves.toBeNull();
    await expect(getAttachmentBlob('attachment-2')).resolves.toBeNull();
  });

  it('handles undefined indexedDB gracefully in export, import, and delete', async () => {
    const originalIndexedDB = global.indexedDB;
// @ts-expect-error deleting global indexedDB to simulate missing storage
    delete global.indexedDB;

    await expect(exportAllAttachments()).resolves.toEqual([]);
    await expect(importAttachments([{ id: '1', name: '1.txt', type: 'text', size: 10, dataBase64: 'abc' }])).resolves.toEqual([]);
    await expect(deleteAttachments(['1'])).resolves.toBeUndefined();

    // Restore
    global.indexedDB = originalIndexedDB;
  });

  it('skips attachments failing decryption during export', async () => {
    openTestVaultSession();

    // Put a broken record that fails decryption
    const brokenRecord: AttachmentRecord = {
      id: 'attachment-broken',
      name: 'broken.txt',
      type: 'text/plain',
      size: 12,
      data: bytes('unencrypted raw data'),
      encrypted: true,
      algorithm: 'AES-256-GCM',
      iv: 'invalid-iv-not-24-hex',
      tag: 'invalid-tag-not-32-hex',
    };
    await putAttachmentRecord(brokenRecord);

    // Put a working record
    await saveAttachment('attachment-working', new File([bytes('working content')], 'work.txt', { type: 'text/plain' }));

    // Mock console.error to avoid spamming output
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const exported = await exportAllAttachments();
    
    // Broken should be skipped, only working is exported
    expect(exported).toHaveLength(1);
    expect(exported[0]!.id).toBe('attachment-working');
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('audits attachment referential integrity and detects missing records', async () => {
    openTestVaultSession();
    await saveAttachment('att-exist', new File([bytes('test')], 'test.txt', { type: 'text/plain' }));

    const report = await auditAttachmentIntegrity([
      { attachments: [{ id: 'att-exist' }, { id: 'att-missing' }] },
      { attachments: [] },
    ]);

    expect(report.referencedCount).toBe(2);
    expect(report.missingIds).toEqual(['att-missing']);
  });

  it('purges orphaned attachments not present in active vault items', async () => {
    openTestVaultSession();
    await saveAttachment('att-active', new File([bytes('test 1')], 'test1.txt', { type: 'text/plain' }));
    await saveAttachment('att-orphan', new File([bytes('test 2')], 'test2.txt', { type: 'text/plain' }));

    const purgedCount = await purgeOrphanedAttachments(['att-active']);
    expect(purgedCount).toBe(1);

    const remaining = await exportAllAttachments();
    expect(remaining.map((r) => r.id)).toEqual(['att-active']);
  });
});
