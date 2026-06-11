import { describe, expect, it, vi } from 'vitest';
import {
  decryptDataWithPasswordSecure,
  encryptDataWithPasswordSecure,
  SecureBackupError,
  secureBackupErrorCodes,
} from './encryption';
import { decryptLegacyDataWithPassword } from './legacyCrypto';

vi.mock('./argon2id', () => ({
  deriveArgon2idKey: vi.fn(async (password: string) => {
    const key = new Uint8Array(32);
    for (let index = 0; index < key.length; index++) {
      key[index] = password.charCodeAt(index % password.length) & 0xff;
    }
    return key;
  }),
}));

vi.mock('./legacyCrypto', () => ({
  decryptLegacyDataWithPassword: vi.fn(async () => 'legacy decrypted export'),
}));

describe('encrypted backup envelope', () => {
  it('roundtrips encrypted backup data with the correct password', async () => {
    const rawData = JSON.stringify([
      {
        title: 'GitHub',
        username: 'octo@example.com',
        password: 'G8x#kL9@pQ2!mZ7',
      },
    ]);

    const envelope = await encryptDataWithPasswordSecure(rawData, 'correct horse battery staple');
    const decrypted = await decryptDataWithPasswordSecure(envelope, 'correct horse battery staple');

    expect(JSON.parse(envelope)).toMatchObject({
      version: '1.2',
      kdf: 'Argon2id',
      kdfImplementation: 'argon2-browser',
      cipher: 'WebCrypto AES-256-GCM',
    });
    expect(decrypted).toBe(rawData);
  });

  it('rejects encrypted backup data with the wrong password', async () => {
    const envelope = await encryptDataWithPasswordSecure('sensitive vault export', 'right-password');

    await expect(decryptDataWithPasswordSecure(envelope, 'wrong-password')).rejects.toThrow();
  });

  it('rejects malformed JSON backup envelopes before decryption', async () => {
    await expect(decryptDataWithPasswordSecure('{not-json', 'backup-password')).rejects.toMatchObject({
      code: secureBackupErrorCodes.invalidJson,
      name: 'SecureBackupError',
    });
  });

  it('routes non-argon2-browser envelopes through the legacy decryptor', async () => {
    const legacyEnvelope = JSON.stringify({
      version: '1.0',
      kdf: 'Legacy PBKDF',
      payload: 'legacy-ciphertext',
    });

    await expect(decryptDataWithPasswordSecure(legacyEnvelope, 'legacy-password')).resolves.toBe(
      'legacy decrypted export',
    );
    expect(decryptLegacyDataWithPassword).toHaveBeenCalledWith(legacyEnvelope, 'legacy-password');
  });

  it('rejects secure envelopes that are missing required security fields', async () => {
    const incompleteEnvelope = JSON.stringify({
      kdfImplementation: 'argon2-browser',
      salt: '00',
      iv: '11',
      tag: '22',
      payload: 'ciphertext',
    });

    await expect(decryptDataWithPasswordSecure(incompleteEnvelope, 'backup-password')).rejects.toMatchObject({
      code: secureBackupErrorCodes.missingFields,
      name: 'SecureBackupError',
    });
  });

  it('rejects secure envelopes when the payload checksum has been tampered', async () => {
    const envelope = await encryptDataWithPasswordSecure('sensitive vault export', 'backup-password');
    const parsed = JSON.parse(envelope);
    parsed.payload = `${parsed.payload}tampered`;

    await expect(decryptDataWithPasswordSecure(JSON.stringify(parsed), 'backup-password')).rejects.toMatchObject({
      code: secureBackupErrorCodes.checksumMismatch,
      name: 'SecureBackupError',
    });
  });

  it('exposes stable secure backup error codes for localization boundaries', () => {
    const error = new SecureBackupError(secureBackupErrorCodes.missingFields);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe(secureBackupErrorCodes.missingFields);
    expect(error.code).toBe(secureBackupErrorCodes.missingFields);
  });
});
