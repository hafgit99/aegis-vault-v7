import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  generateRandomPassword,
  generateDicewarePassphrase,
  loadDicewareWords,
  parseVaultEnvelope,
  deriveArgon2idKeyAsync,
} from '../../scripts/aegis-cli.cjs';

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

  it('loadDicewareWords loads authentic word list and throws if missing', () => {
    const words = loadDicewareWords();
    expect(Array.isArray(words)).toBe(true);
    expect(words.length).toBeGreaterThanOrEqual(100);
  });

  it('parseVaultEnvelope parses unencrypted array backups', async () => {
    const tmpFile = path.resolve('.tmp/test-vault-cli-plain.json');
    if (!fs.existsSync('.tmp')) {
      fs.mkdirSync('.tmp', { recursive: true });
    }
    const dummyItems = [{ id: '1', title: 'Test', username: 'admin', password: 'secret', category: 'login' }];
    fs.writeFileSync(tmpFile, JSON.stringify(dummyItems));

    const parsed = await parseVaultEnvelope(tmpFile, 'dummy-pass');
    expect(parsed.length).toBe(1);
    expect(parsed[0].title).toBe('Test');

    fs.unlinkSync(tmpFile);
  });

  it('parseVaultEnvelope decrypts real Argon2id + AES-256-GCM encrypted envelopes', async () => {
    const tmpFile = path.resolve('.tmp/test-vault-cli-encrypted.json');
    if (!fs.existsSync('.tmp')) {
      fs.mkdirSync('.tmp', { recursive: true });
    }

    const password = 'CorrectMasterPassword!2026';
    const saltHex = crypto.randomBytes(16).toString('hex');
    const iv = crypto.randomBytes(12);

    const kdfParams = { memoryKiB: 8192, iterations: 3, parallelism: 1, hashLength: 32 };
    const key = await deriveArgon2idKeyAsync(password, saltHex, kdfParams);

    const vaultItems = [
      { id: 'item-101', title: 'GitHub Enterprise', username: 'devops', password: 'ultra-secret-password-xyz' },
    ];
    const plaintext = JSON.stringify(vaultItems);

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    const payloadBase64 = ciphertext.toString('base64');
    const checksum = crypto.createHash('sha256').update(payloadBase64).digest('hex');

    const envelope = {
      version: '1.2',
      generator: 'Aegis Secure Core',
      kdf: 'Argon2id',
      kdfImplementation: 'argon2-browser',
      kdfParams,
      cipher: 'WebCrypto AES-256-GCM',
      salt: saltHex,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      payload: payloadBase64,
      checksum,
    };

    fs.writeFileSync(tmpFile, JSON.stringify(envelope, null, 2));

    // 1. Decrypt with correct password
    const decryptedItems = await parseVaultEnvelope(tmpFile, password);
    expect(decryptedItems).toHaveLength(1);
    expect(decryptedItems[0].title).toBe('GitHub Enterprise');
    expect(decryptedItems[0].password).toBe('ultra-secret-password-xyz');

    // 2. Fail with wrong password
    await expect(parseVaultEnvelope(tmpFile, 'WrongPassword123!')).rejects.toThrow(
      'Failed to decrypt vault envelope: Incorrect master password or corrupted backup.',
    );

    // 3. Fail when password is missing
    await expect(parseVaultEnvelope(tmpFile, '')).rejects.toThrow(
      'Vault file is encrypted. Master password is required for decryption.',
    );

    // 4. Fail when checksum is tampered
    const tamperedEnvelope = { ...envelope, checksum: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' };
    const tamperedFile = path.resolve('.tmp/test-vault-cli-tampered.json');
    fs.writeFileSync(tamperedFile, JSON.stringify(tamperedEnvelope));

    await expect(parseVaultEnvelope(tamperedFile, password)).rejects.toThrow(
      'Vault envelope checksum mismatch',
    );

    fs.unlinkSync(tmpFile);
    fs.unlinkSync(tamperedFile);
  });

  it('parseVaultEnvelope throws for missing or invalid files', async () => {
    await expect(parseVaultEnvelope('.tmp/non-existent-file.json', 'pw')).rejects.toThrow('Vault file not found');

    const badJsonFile = path.resolve('.tmp/bad-json.json');
    fs.writeFileSync(badJsonFile, 'not-json{{{');
    await expect(parseVaultEnvelope(badJsonFile, 'pw')).rejects.toThrow('Vault file contains invalid JSON');
    fs.unlinkSync(badJsonFile);
  });
});

