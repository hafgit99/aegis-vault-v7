import { describe, expect, it } from 'vitest';
import { calculatePasswordScore, generatePassword, getStrengthLabel, runVaultAudit } from './security';
import { VaultItem } from '../types';

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
});
