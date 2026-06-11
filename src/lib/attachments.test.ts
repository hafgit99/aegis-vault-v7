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
  saveAttachment,
  type AttachmentRecord,
} from './attachments';
import { closeVaultSession, openVaultSession } from './vaultSession';

const DB_NAME = 'aegis_attachments_db';
const STORE_NAME = 'attachments';

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
  return new Uint8Array(buffer).map((byte, index) => byte ^ key[index % key.length]).buffer;
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
    openVaultSession('master-pass');

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
    openVaultSession('master-pass');

    const encrypted = await encryptAttachmentData('attachment-1', bytes('private file'));
    const record: AttachmentRecord = {
      id: 'attachment-1',
      name: 'secret.txt',
      type: 'text/plain',
      size: 12,
      ...encrypted,
      tag: `00${encrypted.tag?.slice(2)}`,
    };

    await expect(decryptAttachmentData(record)).rejects.toThrow();
  });

  it('rejects AES-GCM attachments when opened with a different vault session', async () => {
    openVaultSession('master-pass');
    const encrypted = await encryptAttachmentData('attachment-1', bytes('private file'));
    closeVaultSession();
    openVaultSession('other-master-pass');
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
    openVaultSession('master-pass');

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

  it('decrypts legacy attachment records without an explicit algorithm', async () => {
    await expect(decryptAttachmentData({
      id: 'legacy-attachment',
      name: 'legacy.txt',
      type: 'text/plain',
      size: 12,
      data: legacyXorEncrypt(bytes('private file')),
      encrypted: true,
    }).then(text)).resolves.toBe('private file');
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

  it('migrates legacy XOR attachment records to AES-GCM', async () => {
    openVaultSession('master-pass');
    const legacyRecord: AttachmentRecord = {
      id: 'legacy-attachment',
      name: 'legacy.txt',
      type: 'text/plain',
      size: 12,
      data: legacyXorEncrypt(bytes('private file')),
      encrypted: true,
      algorithm: 'XOR-LEGACY',
    };

    const migrated = await migrateAttachmentRecordToAesGcm(legacyRecord);

    expect(migrated.algorithm).toBe('AES-256-GCM');
    expect(migrated.iv).toHaveLength(24);
    expect(migrated.tag).toHaveLength(32);
    await expect(decryptAttachmentData(migrated).then(text)).resolves.toBe('private file');
  });

  it('leaves AES-GCM attachment records unchanged during single-record migration', async () => {
    openVaultSession('master-pass');
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
    openVaultSession('master-pass');
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
    openVaultSession('master-pass');
    const file = new File([bytes('private file')], 'secret.bin');

    await saveAttachment('attachment-1', file);

    const stored = await getStoredAttachmentRecord('attachment-1');
    expect(stored?.type).toBe('application/octet-stream');
  });

  it('rejects save when FileReader returns unreadable content', async () => {
    openVaultSession('master-pass');
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
    openVaultSession('master-pass');
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
    openVaultSession('master-pass');
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

  it('migrates legacy IndexedDB attachment records in bulk', async () => {
    openVaultSession('master-pass');
    await putAttachmentRecord({
      id: 'legacy-attachment',
      name: 'legacy.txt',
      type: 'text/plain',
      size: 12,
      data: legacyXorEncrypt(bytes('private file')),
      encrypted: true,
      algorithm: 'XOR-LEGACY',
    });

    await expect(migrateLegacyAttachmentsToAesGcm()).resolves.toBe(1);

    const migrated = await getStoredAttachmentRecord('legacy-attachment');
    expect(migrated?.algorithm).toBe('AES-256-GCM');
    expect(migrated?.iv).toHaveLength(24);
    expect(migrated?.tag).toHaveLength(32);
    const result = await getAttachmentBlob('legacy-attachment');
    await expect(blobText(result?.blob)).resolves.toBe('private file');
  });

  it('returns zero when bulk migration finds no legacy records', async () => {
    openVaultSession('master-pass');
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
});
