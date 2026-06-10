import { describe, expect, it } from 'vitest';

import {
  generateLegacyArgon2idHash,
  verifyLegacyArgon2idHash,
} from './legacyCrypto';

describe('legacy crypto compatibility helpers', () => {
  it('verifies legacy simulated Argon2id hashes after module isolation', () => {
    const hash = generateLegacyArgon2idHash('correct-password', 'fixed-legacy-salt');

    expect(verifyLegacyArgon2idHash('correct-password', hash)).toBe(true);
    expect(verifyLegacyArgon2idHash('wrong-password', hash)).toBe(false);
  });
});
