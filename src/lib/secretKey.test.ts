import { afterEach, describe, expect, it, vi } from 'vitest';

const secureRandomBytes = vi.fn();

vi.mock('./random', () => ({
  secureRandomBytes,
}));

describe('account secret key helpers', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('generates a grouped A3 secret key from 20 random bytes', async () => {
    secureRandomBytes.mockReturnValue(new Uint8Array(20));
    const { generateAccountSecretKey } = await import('./secretKey');

    expect(generateAccountSecretKey()).toBe('A3-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA');
    expect(secureRandomBytes).toHaveBeenCalledWith(20);
  });

  it('normalizes user-entered secret keys without preserving unsafe characters', async () => {
    const { normalizeAccountSecretKey } = await import('./secretKey');

    expect(normalizeAccountSecretKey('  a3-abcd efgh-!@#2345  ')).toBe('A3-ABCDEFGH-2345');
  });

  it('validates the supported A3 secret key format', async () => {
    const { isAccountSecretKeyFormatValid } = await import('./secretKey');
    const valid = 'A3-ABCD-EFGH-JKLM-NPQR-STUV-WXYZ-2345-2673';

    expect(isAccountSecretKeyFormatValid(valid)).toBe(true);
    expect(isAccountSecretKeyFormatValid(valid.toLowerCase())).toBe(true);
    expect(isAccountSecretKeyFormatValid(valid.replace('A3', 'A2'))).toBe(false);
    expect(isAccountSecretKeyFormatValid('A3-ABCD-EFGH-JKLM-NPQR-STUV-WXYZ-2345')).toBe(false);
    expect(isAccountSecretKeyFormatValid('A3-ABCD-EFGH-JKLM-NPQR-STUV-WXYZ-2345-0189')).toBe(false);
  });

  it('combines the master password with a normalized account secret key', async () => {
    const { combineMasterPasswordAndSecretKey } = await import('./secretKey');

    expect(combineMasterPasswordAndSecretKey('master pass', ' a3-abcd-efgh ')).toBe(
      'aegis-vault-v7:master pass\nA3-ABCD-EFGH',
    );
  });

  it('creates a display-safe fingerprint from the last eight normalized key characters', async () => {
    const { getSecretKeyFingerprint } = await import('./secretKey');

    expect(getSecretKeyFingerprint('A3-ABCD-EFGH-JKLM-NPQR-STUV-WXYZ-2345-2673')).toBe('2345-2673');
    expect(getSecretKeyFingerprint('')).toBe('UNKNOWN');
  });
});
