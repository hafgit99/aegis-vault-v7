import { describe, expect, it, vi } from 'vitest';
import {
  decryptDataWithPasswordSecure,
  encryptDataWithPasswordSecure,
  SecureBackupError,
  secureBackupErrorCodes,
} from './encryption';

vi.mock('./argon2id', () => ({
  deriveArgon2idKey: vi.fn(async (password: string) => {
    const key = new Uint8Array(32);
    for (let index = 0; index < key.length; index++) {
      key[index] = password.charCodeAt(index % password.length) & 0xff;
    }
    return key;
  }),
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

  it('rejects non-argon2-browser legacy envelopes instead of routing to custom crypto', async () => {
    const legacyEnvelope = JSON.stringify({
      version: '1.0',
      kdf: 'Legacy PBKDF',
      payload: 'legacy-ciphertext',
    });

    await expect(decryptDataWithPasswordSecure(legacyEnvelope, 'legacy-password')).rejects.toMatchObject({
      code: secureBackupErrorCodes.unsupportedLegacyEnvelope,
      name: 'SecureBackupError',
    });
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

  it('rejects secure envelopes with missing or weak KDF parameters', async () => {
    const baseEnvelope = {
      version: '1.2',
      generator: 'Aegis Secure Core',
      kdf: 'Argon2id',
      kdfImplementation: 'argon2-browser',
      cipher: 'WebCrypto AES-256-GCM',
      salt: '00'.repeat(16),
      iv: '11'.repeat(12),
      tag: '22'.repeat(16),
      payload: 'ciphertext',
      checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', // sha256 of 'ciphertext'
    };

    // Missing kdfParams
    await expect(
      decryptDataWithPasswordSecure(JSON.stringify(baseEnvelope), 'password')
    ).rejects.toMatchObject({
      code: secureBackupErrorCodes.weakKdfParams,
      name: 'SecureBackupError',
    });

    // Too low memoryKiB (below the absolute 1 MiB floor for portable WASM).
    const weakMemoryEnvelope = {
      ...baseEnvelope,
      kdfParams: {
        memoryKiB: 512, // 0.5 MiB (too low)
        iterations: 4,
      },
    };
    await expect(
      decryptDataWithPasswordSecure(JSON.stringify(weakMemoryEnvelope), 'password')
    ).rejects.toMatchObject({
      code: secureBackupErrorCodes.weakKdfParams,
      name: 'SecureBackupError',
    });

    // Too low iterations
    const weakIterationsEnvelope = {
      ...baseEnvelope,
      kdfParams: {
        memoryKiB: 32 * 1024,
        iterations: 2, // too low
      },
    };
    await expect(
      decryptDataWithPasswordSecure(JSON.stringify(weakIterationsEnvelope), 'password')
    ).rejects.toMatchObject({
      code: secureBackupErrorCodes.weakKdfParams,
      name: 'SecureBackupError',
    });
  });

  it('guarantees salt uniqueness across multiple encryption operations', async () => {
    const salts = new Set<string>();
    const count = 100;

    for (let i = 0; i < count; i++) {
      const envelope = await encryptDataWithPasswordSecure('test data', 'password');
      const parsed = JSON.parse(envelope);
      salts.add(parsed.salt);
    }

    expect(salts.size).toBe(count);
  });
});
