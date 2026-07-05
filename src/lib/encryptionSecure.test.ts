import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deriveArgon2idKey } from './argon2id';
import {
  BACKUP_KDF_PROFILE,
  decryptDataWithPasswordSecure,
  encryptDataWithPasswordSecure,
  secureBackupErrorCodes,
} from './encryption';
import { generateSafeIv, webCryptoAesGcmEncrypt } from './webcrypto';

const testKey = new Uint8Array(32).fill(7);

vi.mock('./argon2id', () => ({
  deriveArgon2idKey: vi.fn(async () => testKey),
}));

describe('secure encrypted backup envelope', () => {
  beforeEach(() => {
    vi.mocked(deriveArgon2idKey).mockClear();
    vi.mocked(deriveArgon2idKey).mockImplementation(async () => testKey);
  });

  it('uses the cross-platform Argon2id backup profile for new exports', async () => {
    const envelope = await encryptDataWithPasswordSecure('secret export', 'backup-password');
    const parsed = JSON.parse(envelope);

    expect(parsed).toMatchObject({
      version: '1.2',
      kdf: 'Argon2id',
      kdfImplementation: 'argon2-browser',
      kdfProfile: 'aegis-backup-cross-platform-v2',
      cipher: 'WebCrypto AES-256-GCM',
      kdfParams: BACKUP_KDF_PROFILE,
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

  it('maps Android/WebView Argon2 WASM memory failures to a stable import error', async () => {
    const envelope = await encryptDataWithPasswordSecure('secret export', 'backup-password');
    vi.mocked(deriveArgon2idKey).mockRejectedValueOnce(new Error('memory access out of bounds'));

    await expect(decryptDataWithPasswordSecure(envelope, 'backup-password')).rejects.toMatchObject({
      code: secureBackupErrorCodes.kdfRuntimeFailure,
      name: 'SecureBackupError',
    });
  });
});

