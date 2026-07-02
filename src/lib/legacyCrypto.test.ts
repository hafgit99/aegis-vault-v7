import { describe, expect, it } from 'vitest';

import {
  LegacyCryptoError,
  legacyCryptoErrorCodes,
  rejectRemovedLegacyCrypto,
} from './legacyCrypto';

describe('removed legacy crypto boundary', () => {
  it('ships no custom legacy crypto primitives and fails closed', () => {
    expect(() => rejectRemovedLegacyCrypto()).toThrow(LegacyCryptoError);
    expect(() => rejectRemovedLegacyCrypto()).toThrow(legacyCryptoErrorCodes.removed);
  });

  it('keeps stable legacy error codes for UI mappings without decrypt helpers', async () => {
    const module = await import('./legacyCrypto');

    expect(module.legacyCryptoErrorCodes.unsupportedEnvelope).toBe('legacyCrypto.unsupportedEnvelope');
    expect('decryptLegacyAes256Gcm' in module).toBe(false);
    expect('decryptLegacyDataWithPassword' in module).toBe(false);
    expect('generateLegacyArgon2idKey' in module).toBe(false);
    expect('hmacSha256' in module).toBe(false);
  });
});
