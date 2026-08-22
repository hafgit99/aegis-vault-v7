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

import {
  setPasswordHint,
  getPasswordHint,
  clearPasswordHint,
  isHintDangerouslySimilar,
} from './passwordHint';
import { removeIndexedDbItemSync } from './indexedDbStorage';

describe('passwordHint', () => {
  beforeEach(() => {
    clearPasswordHint();
  });

  // ── CRUD ──────────────────────────────────────────────────────────────

  it('stores and retrieves a hint', () => {
    setPasswordHint('My favourite color + year');
    expect(getPasswordHint()).toBe('My favourite color + year');
  });

  it('returns null when no hint is set', () => {
    expect(getPasswordHint()).toBeNull();
  });

  it('clears the hint', () => {
    setPasswordHint('hint text');
    clearPasswordHint();
    expect(getPasswordHint()).toBeNull();
  });

  it('trims whitespace', () => {
    setPasswordHint('  spaced  ');
    expect(getPasswordHint()).toBe('spaced');
  });

  it('clears when saving an empty string', () => {
    setPasswordHint('initial');
    setPasswordHint('   ');
    expect(getPasswordHint()).toBeNull();
    expect(removeIndexedDbItemSync).toHaveBeenCalled();
  });

  // ── Safety Checks ────────────────────────────────────────────────────

  it('warns when hint exactly matches password (case-insensitive)', () => {
    const result = setPasswordHint('MyP@ssword123!', 'myp@ssword123!');
    expect(result.warning).toBe(true);
    expect(result.saved).toBe(true);
  });

  it('warns when hint is a substring of password', () => {
    const result = setPasswordHint('P@ssword', 'MyP@ssword123!');
    expect(result.warning).toBe(true);
  });

  it('warns when password is a substring of hint', () => {
    const result = setPasswordHint('My password is: SecretKey99', 'SecretKey99');
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

  it('does not warn for clearly different hint and password', () => {
    const result = setPasswordHint('My cat name + birthday year', 'Tr0ub4dor&3Horse');
    expect(result.warning).toBe(false);
  });

  it('does not warn when no password is provided', () => {
    const result = setPasswordHint('some hint');
    expect(result.warning).toBe(false);
  });

  it('handles empty inputs gracefully', () => {
    expect(isHintDangerouslySimilar('', '')).toBe(false);
    expect(isHintDangerouslySimilar('hint', '')).toBe(false);
    expect(isHintDangerouslySimilar('', 'password')).toBe(false);
  });
});
