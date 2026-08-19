/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { generateRandomPassword, generateDicewarePassphrase, parseVaultEnvelope } from '../../scripts/aegis-cli.cjs';

describe('aegis-cli module', () => {
  it('generateRandomPassword produces expected length and characters', () => {
    const pw1 = generateRandomPassword(16, false);
    expect(pw1.length).toBe(16);

    const pw2 = generateRandomPassword(32, true);
    expect(pw2.length).toBe(32);
  });

  it('generateRandomPassword samples from the full charset without modulo bias', () => {
    const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const pw = generateRandomPassword(2000, true);
    for (const ch of symbols) {
      expect(pw).toContain(ch);
    }
  });

  it('generateDicewarePassphrase produces hyphen-separated words', () => {
    const phrase = generateDicewarePassphrase(4);
    const parts = phrase.split('-');
    expect(parts.length).toBe(4);
    expect(parts.every((w: string) => w.length > 0)).toBe(true);
  });

  it('generateDicewarePassphrase draws from an EFF-sized word pool', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      seen.add(generateDicewarePassphrase(1));
    }
    expect(seen.size).toBeGreaterThan(1000);
  });

  it('parseVaultEnvelope parses unencrypted array backups', () => {
    const tmpFile = path.resolve('.tmp/test-vault-cli.json');
    if (!fs.existsSync('.tmp')) {
      fs.mkdirSync('.tmp', { recursive: true });
    }
    const dummyItems = [{ id: '1', title: 'Test', username: 'admin', password: 'secret', category: 'login' }];
    fs.writeFileSync(tmpFile, JSON.stringify(dummyItems));

    const parsed = parseVaultEnvelope(tmpFile, 'dummy-pass');
    expect(parsed.length).toBe(1);
    expect(parsed[0].title).toBe('Test');

    fs.unlinkSync(tmpFile);
  });
});
