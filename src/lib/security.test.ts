import { describe, expect, it, vi } from 'vitest';
import { calculatePasswordScore, generatePassword, getStrengthLabel, runVaultAudit, validateMasterPassword } from './security';
import { VaultItem } from '../types';
import { closeVaultSession } from './vaultSession';
import zxcvbn from 'zxcvbn';

vi.mock('zxcvbn', async (importOriginal) => {
  const actual = await importOriginal<any>();
  const mockFunc = vi.fn((password: string) => {
    const fn = actual.default || actual;
    return fn(password);
  });
  return {
    default: mockFunc,
  };
});

const baseItem = (overrides: Partial<VaultItem>): VaultItem => ({
  id: crypto.randomUUID(),
  title: 'Example',
  username: 'user@example.com',
  password: '',
  url: 'example.com',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  category: 'login',
  ...overrides,
});

describe('security helpers', () => {
  it('scores stronger passwords higher than weak passwords', () => {
    const weakScore = calculatePasswordScore('password');
    const strongScore = calculatePasswordScore('G8x#kL9@pQ2!mZ7');

    expect(strongScore).toBeGreaterThan(weakScore);
    expect(getStrengthLabel('G8x#kL9@pQ2!mZ7').label).toBe('SECURE');
  });

  it('detects weak and reused vault passwords', () => {
    const report = runVaultAudit([
      baseItem({ id: '1', password: 'password' }),
      baseItem({ id: '2', password: 'password' }),
      baseItem({ id: '3', password: 'G8x#kL9@pQ2!mZ7' }),
    ]);

    expect(report.totalCount).toBe(3);
    expect(report.weakCount).toBe(2);
    expect(report.reusedCount).toBe(2);
    expect(report.secureCount).toBe(1);
    expect(report.score).toBeLessThan(100);
  });

  it('generates passwords with the requested length and selected character groups', () => {
    const password = generatePassword({
      length: 24,
      uppercase: true,
      lowercase: true,
      numbers: true,
      symbols: true,
    });

    expect(password).toHaveLength(24);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/[0-9]/);
    expect(password).toMatch(/[^A-Za-z0-9]/);
  });

  it('generates passwords without bias (verifying uniform distribution and shuffle randomness)', () => {
    // Generate 1000 passwords and count frequencies of each character class
    const sampleSize = 1000;
    const charCounts = { upper: 0, lower: 0, digit: 0, symbol: 0 };
    
    for (let i = 0; i < sampleSize; i++) {
      const pw = generatePassword({
        length: 20,
        uppercase: true,
        lowercase: true,
        numbers: true,
        symbols: true,
      });
      for (const char of pw) {
        if (/[A-Z]/.test(char)) charCounts.upper++;
        else if (/[a-z]/.test(char)) charCounts.lower++;
        else if (/[0-9]/.test(char)) charCounts.digit++;
        else charCounts.symbol++;
      }
    }

    const totalChars = sampleSize * 20;
    // Expected distribution proportions:
    // Upper: 26 chars
    // Lower: 26 chars
    // Numbers: 10 chars
    // Symbols: 26 chars
    // Total pool size = 26 + 26 + 10 + 26 = 88 chars.
    // Proportions: Upper, Lower, Symbols are ~29.5% each, Numbers are ~11.4%.
    const expectedProportions = {
      upper: 26 / 88,
      lower: 26 / 88,
      digit: 10 / 88,
      symbol: 26 / 88,
    };

    // Verify actual distribution is within 5% tolerance of the expected proportion
    const tolerance = 0.05;
    Object.keys(charCounts).forEach((key) => {
      const actualProp = charCounts[key as keyof typeof charCounts] / totalChars;
      const expectedProp = expectedProportions[key as keyof typeof expectedProportions];
      expect(Math.abs(actualProp - expectedProp)).toBeLessThan(tolerance);
    });
  });

  it('clears password score cache on close session', () => {
    vi.mocked(zxcvbn).mockClear();

    const pw = 'SomeHighlySpecificPasswordString123!';
    calculatePasswordScore(pw);
    expect(zxcvbn).toHaveBeenCalledTimes(1);

    calculatePasswordScore(pw);
    expect(zxcvbn).toHaveBeenCalledTimes(1);

    closeVaultSession();

    calculatePasswordScore(pw);
    expect(zxcvbn).toHaveBeenCalledTimes(2);
  });
});

describe('validateMasterPassword', () => {
  it('rejects passwords shorter than 12 characters', () => {
    expect(validateMasterPassword('')).toBe(false);
    expect(validateMasterPassword('Short1!')).toBe(false);
    expect(validateMasterPassword('A1b2C3d4E5f')).toBe(false); // 11 characters
  });

  it('rejects passwords of length >= 12 but with less than 3 character classes', () => {
    expect(validateMasterPassword('abcdefghijkl')).toBe(false); // only lowercase
    expect(validateMasterPassword('ABCDEFGHIJKL')).toBe(false); // only uppercase
    expect(validateMasterPassword('123456789012')).toBe(false); // only digits
    expect(validateMasterPassword('!!!!!!!!!!!!')).toBe(false); // only symbols
    expect(validateMasterPassword('abcdeABCDEab')).toBe(false); // lowercase + uppercase (2 classes)
    expect(validateMasterPassword('abcde12345ab')).toBe(false); // lowercase + digits (2 classes)
    expect(validateMasterPassword('abcde!!!!_ab')).toBe(false); // lowercase + symbols (2 classes)
  });

  it('accepts passwords of length >= 12 with 3 or more character classes and zxcvbn score >= 3', () => {
    expect(validateMasterPassword('Xy8#pW2!mQ9a')).toBe(true); // lower, upper, digit, symbol (strong)
    expect(validateMasterPassword('Tr9@kP1!vX4s')).toBe(true); // lower, upper, digit, symbol (strong)
    expect(validateMasterPassword('abcdeABCDE123456')).toBe(true); // >= 16 characters
  });

  it('rejects passwords with score < 3 even if they have 12+ characters and 3 classes', () => {
    expect(validateMasterPassword('abcdefABCDEF12')).toBe(false); // Predictable sequence
    expect(validateMasterPassword('password123!A')).toBe(false); // Common password
  });
});
