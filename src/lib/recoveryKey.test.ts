/* @vitest-environment jsdom */
import { describe, expect, it, beforeEach, vi } from 'vitest';

// Mock indexedDbStorage
const store = new Map<string, string>();
vi.mock('./indexedDbStorage', () => ({
  initializeIndexedDbStorage: vi.fn(async () => {}),
  getIndexedDbItemSync: vi.fn((key: string) => store.get(key) ?? null),
  setIndexedDbItemSync: vi.fn((key: string, value: string) => store.set(key, value)),
  removeIndexedDbItemSync: vi.fn((key: string) => store.delete(key)),
  clearAllSetupFlagsSync: vi.fn(() => store.clear()),
}));

// Mock secureStorage (returns null — forces IndexedDB fallback)
vi.mock('./secureStorage', () => ({
  secureStorageKeys: {
    rememberedSecretKey: 'aegis_account_secret_key_remembered',
    biometricInfo: 'aegis_biometric_info',
    recoveryKeyBundle: 'aegis_recovery_key_bundle',
  },
  getSecureStorageItem: vi.fn(() => null),
  setSecureStorageItem: vi.fn(() => false),
  removeSecureStorageItem: vi.fn(() => false),
  isSecureStorageAvailable: vi.fn(() => false),
}));

// Mock argon2id with a deterministic but fast derivation for tests
vi.mock('./argon2id', () => ({
  deriveArgon2idKey: vi.fn(async (password: string, salt: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + salt);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return new Uint8Array(hash);
  }),
  isDesktopRuntime: vi.fn(() => false),
}));

import {
  generateRecoveryWords,
  validateRecoveryWords,
  formatRecoveryWords,
  setupRecoveryKey,
  recoverWithRecoveryKey,
  isRecoveryKeySetup,
  getRecoveryKeyCreatedAt,
  disableRecoveryKey,
} from './recoveryKey';

describe('recoveryKey', () => {
  beforeEach(() => {
    store.clear();
  });

  // ── Word Generation ─────────────────────────────────────────────────

  it('generates exactly 24 words', () => {
    const words = generateRecoveryWords();
    expect(words).toHaveLength(24);
  });

  it('generates words from the BIP-39 wordlist', () => {
    const words = generateRecoveryWords();
    expect(validateRecoveryWords(words)).toBe(true);
  });

  it('generates unique sets on each call', () => {
    const set1 = generateRecoveryWords().join(' ');
    const set2 = generateRecoveryWords().join(' ');
    // Extremely unlikely to collide with 256-bit entropy
    expect(set1).not.toBe(set2);
  });

  // ── Validation ──────────────────────────────────────────────────────

  it('validates a correct 24-word phrase', () => {
    expect(validateRecoveryWords(generateRecoveryWords())).toBe(true);
  });

  it('rejects fewer than 24 words', () => {
    expect(validateRecoveryWords(['abandon', 'ability'])).toBe(false);
  });

  it('rejects words not in the BIP-39 list', () => {
    const words = generateRecoveryWords();
    words[0] = 'xylophone_invalid_word';
    expect(validateRecoveryWords(words)).toBe(false);
  });

  it('accepts words case-insensitively', () => {
    const words = generateRecoveryWords();
    words[0] = words[0].toUpperCase();
    expect(validateRecoveryWords(words)).toBe(true);
  });

  // ── Formatting ──────────────────────────────────────────────────────

  it('formats words into numbered lines of 4', () => {
    const words = generateRecoveryWords();
    const formatted = formatRecoveryWords(words);
    const lines = formatted.split('\n');
    expect(lines).toHaveLength(6); // 24 / 4 = 6 lines
    expect(lines[0]).toContain('1.');
    expect(lines[0]).toContain('4.');
  });

  // ── Encrypt / Decrypt Roundtrip ─────────────────────────────────────

  it('encrypts and recovers the master password', async () => {
    const masterPassword = 'MyStr0ng!P@ssword2026';
    const words = generateRecoveryWords();

    await setupRecoveryKey(masterPassword, words);
    expect(isRecoveryKeySetup()).toBe(true);

    const recovered = await recoverWithRecoveryKey(words);
    expect(recovered).toBe(masterPassword);
  });

  it('returns a non-null creation date after setup', async () => {
    const words = generateRecoveryWords();
    await setupRecoveryKey('TestPass123!@#$', words);
    const createdAt = getRecoveryKeyCreatedAt();
    expect(createdAt).toBeTruthy();
    expect(new Date(createdAt!).getFullYear()).toBeGreaterThanOrEqual(2026);
  });

  it('fails recovery with wrong words', async () => {
    const words = generateRecoveryWords();
    await setupRecoveryKey('CorrectPassword!1', words);

    const wrongWords = generateRecoveryWords();
    await expect(recoverWithRecoveryKey(wrongWords)).rejects.toThrow('Recovery failed');
  });

  it('fails recovery when no bundle exists', async () => {
    const words = generateRecoveryWords();
    await expect(recoverWithRecoveryKey(words)).rejects.toThrow('No recovery key has been set up');
  });

  it('rejects setup with invalid words', async () => {
    const invalidWords = Array(24).fill('invalidword');
    await expect(setupRecoveryKey('pw', invalidWords)).rejects.toThrow('Invalid recovery words');
  });

  // ── Disable ─────────────────────────────────────────────────────────

  it('disables the recovery key', async () => {
    const words = generateRecoveryWords();
    await setupRecoveryKey('TestPassword!23', words);
    expect(isRecoveryKeySetup()).toBe(true);

    disableRecoveryKey();
    expect(isRecoveryKeySetup()).toBe(false);
  });
});
