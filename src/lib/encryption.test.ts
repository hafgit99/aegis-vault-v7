import { describe, expect, it, vi } from 'vitest';
import { decryptDataWithPasswordSecure, encryptDataWithPasswordSecure } from './encryption';

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
});
