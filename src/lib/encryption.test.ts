import { describe, expect, it } from 'vitest';
import { decryptDataWithPassword, encryptDataWithPassword } from './encryption';

describe('encrypted backup envelope', () => {
  it('roundtrips encrypted backup data with the correct password', () => {
    const rawData = JSON.stringify([
      {
        title: 'GitHub',
        username: 'octo@example.com',
        password: 'G8x#kL9@pQ2!mZ7',
      },
    ]);

    const envelope = encryptDataWithPassword(rawData, 'correct horse battery staple');
    const decrypted = decryptDataWithPassword(envelope, 'correct horse battery staple');

    expect(JSON.parse(envelope)).toMatchObject({
      version: '1.1',
      kdf: 'Argon2id',
      cipher: 'AES-256-GCM',
    });
    expect(decrypted).toBe(rawData);
  });

  it('rejects encrypted backup data with the wrong password', () => {
    const envelope = encryptDataWithPassword('sensitive vault export', 'right-password');

    expect(() => decryptDataWithPassword(envelope, 'wrong-password')).toThrow();
  });
});
