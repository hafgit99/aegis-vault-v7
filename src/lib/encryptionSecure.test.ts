import { describe, expect, it, vi } from 'vitest';

import { deriveArgon2idKey } from './argon2id';
import { decryptDataWithPasswordSecure, encryptDataWithPasswordSecure } from './encryption';

const testKey = new Uint8Array(32).fill(7);

vi.mock('./argon2id', () => ({
  deriveArgon2idKey: vi.fn(async () => testKey),
}));

describe('secure encrypted backup envelope', () => {
  it('uses the vetted Argon2id adapter metadata for new exports', async () => {
    const envelope = await encryptDataWithPasswordSecure('secret export', 'backup-password');
    const parsed = JSON.parse(envelope);

    expect(parsed).toMatchObject({
      version: '1.2',
      kdf: 'Argon2id',
      kdfImplementation: 'argon2-browser',
      cipher: 'WebCrypto AES-256-GCM',
      kdfParams: {
        memoryKiB: 131072,
        iterations: 4,
        parallelism: 1,
        hashLength: 32,
      },
    });
    expect(deriveArgon2idKey).toHaveBeenCalledWith(
      'backup-password',
      parsed.salt,
      parsed.kdfParams,
    );
  });

  it('roundtrips secure exports through the vetted Argon2id adapter', async () => {
    const envelope = await encryptDataWithPasswordSecure('secret export', 'backup-password');

    await expect(decryptDataWithPasswordSecure(envelope, 'backup-password')).resolves.toBe('secret export');
  });

  it('rejects tampered secure exports through WebCrypto authentication', async () => {
    const envelope = await encryptDataWithPasswordSecure('secret export', 'backup-password');
    const parsed = JSON.parse(envelope);
    const tamperedTagPrefix = parsed.tag.startsWith('00') ? 'ff' : '00';
    parsed.tag = `${tamperedTagPrefix}${parsed.tag.slice(2)}`;

    await expect(decryptDataWithPasswordSecure(JSON.stringify(parsed), 'backup-password')).rejects.toThrow();
  });
});
