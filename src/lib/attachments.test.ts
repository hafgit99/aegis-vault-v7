/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  decryptAttachmentData,
  encryptAttachmentData,
  migrateAttachmentRecordToAesGcm,
  type AttachmentRecord,
} from './attachments';
import { closeVaultSession, openVaultSession } from './vaultSession';

function bytes(value: string): ArrayBuffer {
  return new TextEncoder().encode(value).buffer;
}

async function text(buffer: ArrayBuffer): Promise<string> {
  return new TextDecoder().decode(buffer);
}

function legacyXorEncrypt(buffer: ArrayBuffer): ArrayBuffer {
  const key = new TextEncoder().encode('aegis_secure_file');
  return new Uint8Array(buffer).map((byte, index) => byte ^ key[index % key.length]).buffer;
}

afterEach(() => {
  closeVaultSession();
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

  it('requires an active vault session for new attachment encryption', async () => {
    await expect(encryptAttachmentData('attachment-1', bytes('private file'))).rejects.toThrow(
      'Aktif kasa oturumu bulunamadı.',
    );
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
});
