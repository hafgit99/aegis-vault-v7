/* @vitest-environment jsdom */
import { describe, expect, it, beforeEach, vi } from 'vitest';

vi.mock('./indexedDbStorage', () => {
  const store = new Map<string, string>();
  return {
    initializeIndexedDbStorage: vi.fn(async () => {}),
    getIndexedDbItemSync: vi.fn((key: string) => store.get(key) ?? null),
    setIndexedDbItemSync: vi.fn((key: string, value: string) => store.set(key, value)),
    removeIndexedDbItemSync: vi.fn((key: string) => store.delete(key)),
    clearAllSetupFlagsSync: vi.fn(() => store.clear()),
  };
});

vi.mock('./secureStorage', async () => {
  const actual = await vi.importActual<typeof import('./secureStorage')>('./secureStorage');
  // No Android secure-storage bridge in tests → the module falls back to the
  // separate IndexedDB record for the wrapping key (desktop/browser path).
  return {
    ...actual,
    getSecureStorageItem: vi.fn(() => null),
    setSecureStorageItem: vi.fn(() => false),
    removeSecureStorageItem: vi.fn(),
  };
});

import {
  setPasswordHint,
  getPasswordHint,
  clearPasswordHint,
  isHintDangerouslySimilar,
} from './passwordHint';
import {
  removeIndexedDbItemSync,
  getIndexedDbItemSync,
  setIndexedDbItemSync,
} from './indexedDbStorage';

const HINT_STORAGE_KEY = 'aegis_password_hint';

describe('passwordHint', () => {
  beforeEach(() => {
    clearPasswordHint();
  });

  // ── CRUD ──────────────────────────────────────────────────────────────

  it('stores and retrieves a hint', async () => {
    await setPasswordHint('My favourite color + year');
    await expect(getPasswordHint()).resolves.toBe('My favourite colour + year'.replace('colour', 'color'));
  });

  it('stores the hint as an encrypted envelope, not plaintext', async () => {
    const hint = 'SecretHintPhrase-2026';
    await setPasswordHint(hint);

    const raw = getIndexedDbItemSync(HINT_STORAGE_KEY);
    expect(raw).toBeTruthy();
    // The stored record must NOT contain the plaintext hint.
    expect(raw).not.toContain(hint);
    const envelope = JSON.parse(raw!);
    expect(envelope).toMatchObject({ version: 2, cipher: 'AES-256-GCM' });
    expect(typeof envelope.payload?.ciphertext).toBe('string');
  });

  it('migrates a legacy plaintext hint to the encrypted envelope on read', async () => {
    // Simulate a pre-M1 v1 plaintext record.
    const legacy = 'Legacy plaintext hint';
    setIndexedDbItemSync(HINT_STORAGE_KEY, legacy);

    await expect(getPasswordHint()).resolves.toBe(legacy);
    const raw = getIndexedDbItemSync(HINT_STORAGE_KEY);
    expect(raw).not.toBe(legacy);
    expect(JSON.parse(raw!).version).toBe(2);
  });

  it('returns null when no hint is set', async () => {
    await expect(getPasswordHint()).resolves.toBeNull();
  });

  it('clears the hint', async () => {
    await setPasswordHint('hint text');
    clearPasswordHint();
    await expect(getPasswordHint()).resolves.toBeNull();
  });

  it('trims whitespace', async () => {
    await setPasswordHint('  spaced  ');
    await expect(getPasswordHint()).resolves.toBe('spaced');
  });

  it('clears when saving an empty string', async () => {
    await setPasswordHint('initial');
    await setPasswordHint('   ');
    await expect(getPasswordHint()).resolves.toBeNull();
    expect(removeIndexedDbItemSync).toHaveBeenCalled();
  });

  // ── Safety Checks ────────────────────────────────────────────────────

  it('warns when hint exactly matches password (case-insensitive)', async () => {
    const result = await setPasswordHint('MyP@ssword123!', 'myp@ssword123!');
    expect(result.warning).toBe(true);
    expect(result.saved).toBe(true);
  });

  it('warns when hint is a substring of password', async () => {
    const result = await setPasswordHint('P@ssword', 'MyP@ssword123!');
    expect(result.warning).toBe(true);
  });

  it('warns when password is a substring of hint', async () => {
    const result = await setPasswordHint('My password is: SecretKey99', 'SecretKey99');
    expect(result.warning).toBe(true);
  });

  it('warns when hint is very similar to password (Levenshtein)', () => {
    expect(isHintDangerouslySimilar('MyPassword123', 'MyPassword124')).toBe(true);
  });

  it('warns when hint contains key password tokens or words', () => {
    expect(isHintDangerouslySimilar('The word is SecretKey and something else', 'SecretKey99!')).toBe(true);
    expect(isHintDangerouslySimilar('My Istanbul trip', 'Istanbul2026!')).toBe(true);
    expect(isHintDangerouslySimilar('Secret', 'My-Secret-Password-2026')).toBe(true);
    expect(isHintDangerouslySimilar('abcdefghijk', '123-defgh-456')).toBe(true);
  });

  it('warns when hint is reversed password or contains reversed password', () => {
    expect(isHintDangerouslySimilar('drowssap', 'password')).toBe(true);
    expect(isHintDangerouslySimilar('pass-drowssap-word', 'password')).toBe(true);
  });

  it('does not warn for clearly different hint and password', async () => {
    const result = await setPasswordHint('My cat name + birthday year', 'Tr0ub4dor&3Horse');
    expect(result.warning).toBe(false);
  });

  it('does not warn when no password is provided', async () => {
    const result = await setPasswordHint('some hint');
    expect(result.warning).toBe(false);
  });

  it('handles empty inputs gracefully', () => {
    expect(isHintDangerouslySimilar('', '')).toBe(false);
    expect(isHintDangerouslySimilar('hint', '')).toBe(false);
    expect(isHintDangerouslySimilar('', 'password')).toBe(false);
  });
});
