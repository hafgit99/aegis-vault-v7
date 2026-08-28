import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, beforeEach } from 'vitest';
import {
  openVaultSession,
  closeVaultSession,
  updateActiveVaultEncryptionKey,
  withActiveVaultEncryptionKey,
  withActiveCredentialBytes,
  withActiveBackupPasswordBytes,
  withActiveAccountSecretKeyBytes,
  withActiveAccountSecretKey,
  withActiveBackupPassword,
  withActiveSessionSecrets,
  hasActiveVaultSession,
  hasActiveMasterPassword,
  hasActiveAccountSecretKey,
  hasActiveBackupPassword,
  subscribeToVaultSession,
  registerOnCloseSession,
  getVaultSessionSnapshot,
  recordFailedUnlockAttempt,
  getUnlockAttemptLockoutDelayMs,
  resetFailedUnlockAttempts,
} from './vaultSession';

const forbiddenSessionGetterPattern = /getActive(?:Master|Backup)Password/;

function collectProductionFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectProductionFiles(fullPath));
      continue;
    }

    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry.name)) continue;
    if (fullPath.endsWith(path.join('src', 'lib', 'vaultSession.ts'))) continue;
    files.push(fullPath);
  }

  return files;
}

describe('vault session secret access policy', () => {
  it('keeps production code on scoped session-secret callbacks', () => {
    const srcRoot = path.resolve(process.cwd(), 'src');
    const offenders = collectProductionFiles(srcRoot).filter((filePath) => {
      const contents = fs.readFileSync(filePath, 'utf8');
      return forbiddenSessionGetterPattern.test(contents);
    });

    expect(offenders.map((filePath) => path.relative(process.cwd(), filePath))).toEqual([]);
  });
});

describe('vaultSession comprehensive lifecycle and byte callbacks', () => {
  beforeEach(() => {
    closeVaultSession(true);
    resetFailedUnlockAttempts();
  });

  it('handles lockout counter tracking and delay computation', () => {
    expect(getUnlockAttemptLockoutDelayMs()).toBe(0);
    recordFailedUnlockAttempt();
    recordFailedUnlockAttempt();
    recordFailedUnlockAttempt();
    expect(getUnlockAttemptLockoutDelayMs()).toBeGreaterThan(0);
    resetFailedUnlockAttempts();
    expect(getUnlockAttemptLockoutDelayMs()).toBe(0);
  });

  it('manages desktop key-only session lifecycle and subscriptions', () => {
    const key = new Uint8Array(32).fill(42);
    let notified = 0;
    const unsub = subscribeToVaultSession(() => {
      notified += 1;
    });

    openVaultSession(key, { hasBackup: true, hasSecret: true });
    expect(hasActiveVaultSession()).toBe(true);
    expect(getVaultSessionSnapshot()).toBe(true);
    expect(hasActiveMasterPassword()).toBe(true);
    expect(hasActiveBackupPassword()).toBe(true);
    expect(hasActiveAccountSecretKey()).toBe(true);

    const syncVal = withActiveVaultEncryptionKey((k) => k[0]);
    expect(syncVal).toBe(42);

    const updateKey = new Uint8Array(32).fill(99);
    updateActiveVaultEncryptionKey(updateKey);
    expect(withActiveVaultEncryptionKey((k) => k[0])).toBe(99);

    let closed = false;
    registerOnCloseSession(() => {
      closed = true;
    });

    closeVaultSession(true);
    expect(hasActiveVaultSession()).toBe(false);
    expect(closed).toBe(true);
    expect(notified).toBeGreaterThan(0);
    unsub();
  });

  it('handles fallback credential session and withActive* byte callbacks', async () => {
    const key = new Uint8Array(32).fill(11);
    openVaultSession('aegis-vault-v7:master\0secret123', 'backupPass456', key);

    expect(hasActiveVaultSession()).toBe(true);
    expect(hasActiveMasterPassword()).toBe(true);
    expect(hasActiveBackupPassword()).toBe(true);
    expect(hasActiveAccountSecretKey()).toBe(true);

    // Sync callbacks
    expect(withActiveVaultEncryptionKey((k) => k[0])).toBe(11);
    expect(withActiveCredentialBytes((b) => b.length)).toBeGreaterThan(0);
    expect(withActiveBackupPasswordBytes((b) => b.length)).toBeGreaterThan(0);
    expect(withActiveAccountSecretKeyBytes((b) => b.length)).toBeGreaterThan(0);

    // Async callbacks
    const asyncVal = await withActiveVaultEncryptionKey(async (k) => {
      await new Promise((r) => setTimeout(r, 5));
      return (k[0] ?? 0) * 2;
    });
    expect(asyncVal).toBe(22);

    const asyncCred = await withActiveCredentialBytes(async (b) => {
      await new Promise((r) => setTimeout(r, 5));
      return b.length;
    });
    expect(asyncCred).toBeGreaterThan(0);

    const asyncBackup = await withActiveBackupPasswordBytes(async (b) => {
      await new Promise((r) => setTimeout(r, 5));
      return b.length;
    });
    expect(asyncBackup).toBeGreaterThan(0);

    const asyncSecret = await withActiveAccountSecretKeyBytes(async (b) => {
      await new Promise((r) => setTimeout(r, 5));
      return b.length;
    });
    expect(asyncSecret).toBeGreaterThan(0);

    // String callbacks
    await withActiveAccountSecretKey((s) => {
      expect(s).toBe('secret123');
    });
    await withActiveBackupPassword((p) => {
      expect(p).toBe('backupPass456');
    });
    // SEC-B3: withActiveSessionSecrets is now bytes-only — no string decoding
    // happens inside the session callback boundary itself.
    await withActiveSessionSecrets((m, b) => {
      expect(new TextDecoder().decode(m)).toBe('aegis-vault-v7:master\0secret123');
      expect(new TextDecoder().decode(b)).toBe('backupPass456');
    });
  });

  it('zeroizes withActiveSessionSecrets byte clones on callback exit (SEC-B3)', async () => {
    openVaultSession('aegis-vault-v7:master\0secret123', 'backupPass456', new Uint8Array(32).fill(5));
    let capturedMaster: Uint8Array | null = null;
    let capturedBackup: Uint8Array | null = null;
    await withActiveSessionSecrets((m, b) => {
      capturedMaster = m;
      capturedBackup = b;
      return true;
    });
    expect(capturedMaster!.length).toBeGreaterThan(0);
    expect(capturedMaster!.every((byte) => byte === 0)).toBe(true);
    expect(capturedBackup!.every((byte) => byte === 0)).toBe(true);
  });

  it('returns null for withActive* callbacks when session is locked', async () => {
    closeVaultSession(true);
    expect(withActiveVaultEncryptionKey((k) => k)).toBeNull();
    expect(withActiveCredentialBytes((b) => b)).toBeNull();
    expect(withActiveBackupPasswordBytes((b) => b)).toBeNull();
    expect(withActiveAccountSecretKeyBytes((b) => b)).toBeNull();
    expect(await withActiveAccountSecretKey((s) => s)).toBeNull();
    expect(await withActiveBackupPassword((p) => p)).toBeNull();
    expect(await withActiveSessionSecrets((m, b) => m.length + b.length)).toBeNull();
  });

  it('handles error throwing inside withActive* callbacks safely', async () => {
    const key = new Uint8Array(32).fill(7);
    openVaultSession('aegis-vault-v7:master\0secret', 'backup', key);

    expect(() => {
      withActiveVaultEncryptionKey(() => {
        throw new Error('sync fail');
      });
    }).toThrow('sync fail');

    expect(() => {
      withActiveCredentialBytes(() => {
        throw new Error('cred fail');
      });
    }).toThrow('cred fail');

    expect(() => {
      withActiveBackupPasswordBytes(() => {
        throw new Error('backup fail');
      });
    }).toThrow('backup fail');

    expect(() => {
      withActiveAccountSecretKeyBytes(() => {
        throw new Error('secret fail');
      });
    }).toThrow('secret fail');
  });
});
