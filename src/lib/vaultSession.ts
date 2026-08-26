import { invoke } from '@tauri-apps/api/core';
import { isDesktopRuntime } from './argon2id';
import { createSecureBuffer, wasmZeroizeArray } from './wasmZeroizer';

let fallbackCredentialBytes: Uint8Array | null = null;
let fallbackAccountSecretKeyBytes: Uint8Array | null = null;
let fallbackBackupPasswordBytes: Uint8Array | null = null;
let activeVaultKeyBytes: Uint8Array | null = null;

let hasActiveMasterPass = false;
let hasActiveBackupPass = false;
let hasActiveSecretKey = false;

function encodeSecret(value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value);
  const secureBuf = createSecureBuffer(bytes.length);
  secureBuf.array.set(bytes);
  bytes.fill(0);
  return secureBuf.array;
}

function decodeSecret(value: Uint8Array | null): string | null {
  if (!value) return null;
  return new TextDecoder().decode(value);
}

function cloneBytes(value: Uint8Array): Uint8Array {
  const secureBuf = createSecureBuffer(value.length);
  secureBuf.array.set(value);
  return secureBuf.array;
}

function zeroizeSecret(value: Uint8Array | null): void {
  if (value) {
    wasmZeroizeArray(value);
  }
}

const onCloseCallbacks: (() => void)[] = [];
const subscribers = new Set<() => void>();

function notifySubscribers(): void {
  subscribers.forEach(cb => cb());
}

export function subscribeToVaultSession(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

export function getVaultSessionSnapshot(): boolean {
  return hasActiveVaultSession();
}

export function registerOnCloseSession(cb: () => void): void {
  onCloseCallbacks.push(cb);
}

import {
  getIndexedDbItemSync,
  setIndexedDbItemSync,
  removeIndexedDbItemSync,
} from './indexedDbStorage';

export const LOCKOUT_STORAGE_KEY = 'aegis_lockout_state';
export const MAX_LOCKOUT_MS = 5 * 60 * 1000;

/**
 * Client-side unlock lockout state.
 *
 * NOTE (P1-9 / L-2): This client-side lockout is a UX rate-limiting convenience
 * for interactive UI sessions. It is NOT an offline security boundary against an
 * attacker with physical or root access to the database file.
 * The primary, mathematically enforced brute-force resistance of Aegis Vault is
 * provided by Argon2id's memory-hard KDF parameters (32-64 MiB, 3-4 iterations).
 */
export interface LockoutState {
  failedAttempts: number;
  lockedUntil: number;
}

export function readLockoutState(): LockoutState {
  try {
    const raw = getIndexedDbItemSync(LOCKOUT_STORAGE_KEY) || (typeof localStorage !== 'undefined' ? localStorage.getItem(LOCKOUT_STORAGE_KEY) : null);
    if (!raw) return { failedAttempts: 0, lockedUntil: 0 };
    const parsed = JSON.parse(raw) as LockoutState;
    if (typeof parsed.failedAttempts === 'number' && typeof parsed.lockedUntil === 'number') {
      return parsed;
    }
  } catch {
    // Fall back to clean state on parse error
  }
  return { failedAttempts: 0, lockedUntil: 0 };
}

export function writeLockoutState(state: LockoutState): void {
  const serialized = JSON.stringify(state);
  try {
    setIndexedDbItemSync(LOCKOUT_STORAGE_KEY, serialized);
  } catch {
    // Fall back or ignore
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCKOUT_STORAGE_KEY, serialized);
    }
  } catch {
    // Fail open if storage is unavailable
  }
}

export function recordFailedUnlockAttempt(now = Date.now()): LockoutState {
  const current = readLockoutState();
  const failedAttempts = current.failedAttempts + 1;
  const delayMs = Math.min(MAX_LOCKOUT_MS, 1000 * 2 ** Math.min(failedAttempts - 1, 8));

  const state: LockoutState = {
    failedAttempts,
    lockedUntil: now + delayMs,
  };
  writeLockoutState(state);
  return state;
}

export function getUnlockAttemptLockoutDelayMs(now = Date.now()): number {
  return Math.max(0, readLockoutState().lockedUntil - now);
}

export function resetFailedUnlockAttempts(): void {
  try {
    removeIndexedDbItemSync(LOCKOUT_STORAGE_KEY);
  } catch {
    // Silently ignore
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LOCKOUT_STORAGE_KEY);
    }
  } catch {
    // Silently ignore
  }
}

export function openVaultSession(
  masterPasswordOrKey: string | Uint8Array,
  backupPassword?: string | { hasBackup?: boolean; hasSecret?: boolean },
  vaultEncryptionKey?: Uint8Array,
): void {
  closeVaultSession(true);
  resetFailedUnlockAttempts();

  if (masterPasswordOrKey instanceof Uint8Array) {
    // Desktop runtime / key-only path
    activeVaultKeyBytes = cloneBytes(masterPasswordOrKey);
    const flags = backupPassword as { hasBackup?: boolean; hasSecret?: boolean } | undefined;
    hasActiveMasterPass = true;
    hasActiveBackupPass = flags?.hasBackup ?? true;
    hasActiveSecretKey = flags?.hasSecret ?? false;
    notifySubscribers();
    return;
  }

  // Fallback path
  const masterPassword = masterPasswordOrKey;
  fallbackCredentialBytes = encodeSecret(masterPassword);
  const secretSeparatorIndex = masterPassword.startsWith('aegis-vault-v7:') ? masterPassword.indexOf('\0') : -1;
  fallbackAccountSecretKeyBytes = secretSeparatorIndex !== -1
    ? encodeSecret(masterPassword.substring(secretSeparatorIndex + 1))
    : null;
  fallbackBackupPasswordBytes = encodeSecret((backupPassword as string | undefined) || masterPassword);
  activeVaultKeyBytes = vaultEncryptionKey ? cloneBytes(vaultEncryptionKey) : null;

  hasActiveMasterPass = fallbackCredentialBytes !== null;
  hasActiveBackupPass = fallbackBackupPasswordBytes !== null;
  hasActiveSecretKey = fallbackAccountSecretKeyBytes !== null;

  notifySubscribers();
}

export function updateActiveVaultEncryptionKey(vaultEncryptionKey: Uint8Array): void {
  if (activeVaultKeyBytes) {
    zeroizeSecret(activeVaultKeyBytes);
  }
  activeVaultKeyBytes = cloneBytes(vaultEncryptionKey);
  if (isDesktopRuntime()) {
    invoke('update_rust_active_vault_key', { newVaultKey: Array.from(vaultEncryptionKey) })
      .catch(e => {
        console.error('Failed to update vault key in Rust, closing session for security:', e);
        closeVaultSession();
      });
  }
  notifySubscribers();
}

export function closeVaultSession(skipNativeClose: boolean = false): void {
  zeroizeSecret(fallbackCredentialBytes);
  zeroizeSecret(fallbackBackupPasswordBytes);
  zeroizeSecret(fallbackAccountSecretKeyBytes);
  zeroizeSecret(activeVaultKeyBytes);
  fallbackCredentialBytes = null;
  fallbackBackupPasswordBytes = null;
  fallbackAccountSecretKeyBytes = null;
  activeVaultKeyBytes = null;
  hasActiveMasterPass = false;
  hasActiveBackupPass = false;
  hasActiveSecretKey = false;

  if (isDesktopRuntime() && !skipNativeClose) {
    invoke('close_rust_session').catch(e => console.error('Failed to close rust session:', e));
  }

  onCloseCallbacks.forEach(cb => {
    try {
      cb();
    } catch (e) {
      console.error('Error during close session callback:', e);
    }
  });
  notifySubscribers();
}

export function hasActiveVaultSession(): boolean {
  return activeVaultKeyBytes !== null || hasActiveMasterPass;
}

/**
 * Presence-only probes. These deliberately return a boolean instead of
 * materializing the secret into a JavaScript string. Use these (or the scoped
 * `withActive*` callbacks) when code only needs to know whether a credential is
 * available — never use them to obtain the credential itself.
 */
export function hasActiveMasterPassword(): boolean {
  return hasActiveMasterPass;
}

export function hasActiveAccountSecretKey(): boolean {
  return hasActiveSecretKey;
}

export function hasActiveBackupPassword(): boolean {
  return hasActiveBackupPass;
}

export function withActiveVaultEncryptionKey<T>(callback: (vaultEncryptionKey: Uint8Array) => T): T | null {
  if (!activeVaultKeyBytes) return null;
  const cloned = cloneBytes(activeVaultKeyBytes);
  try {
    const result = callback(cloned);
    if (result instanceof Promise) {
      return (result as Promise<unknown>).finally(() => {
        wasmZeroizeArray(cloned);
      }) as unknown as T;
    }
    wasmZeroizeArray(cloned);
    return result;
  } catch (err) {
    wasmZeroizeArray(cloned);
    throw err;
  }
}

export function withActiveCredentialBytes<T>(callback: (credentialBytes: Uint8Array) => T): T | null {
  if (!fallbackCredentialBytes) return null;
  const cloned = cloneBytes(fallbackCredentialBytes);
  try {
    const result = callback(cloned);
    if (result instanceof Promise) {
      return (result as Promise<unknown>).finally(() => {
        wasmZeroizeArray(cloned);
      }) as unknown as T;
    }
    wasmZeroizeArray(cloned);
    return result;
  } catch (err) {
    wasmZeroizeArray(cloned);
    throw err;
  }
}

export function withActiveBackupPasswordBytes<T>(callback: (backupPasswordBytes: Uint8Array) => T): T | null {
  if (!fallbackBackupPasswordBytes) return null;
  const cloned = cloneBytes(fallbackBackupPasswordBytes);
  try {
    const result = callback(cloned);
    if (result instanceof Promise) {
      return (result as Promise<unknown>).finally(() => {
        wasmZeroizeArray(cloned);
      }) as unknown as T;
    }
    wasmZeroizeArray(cloned);
    return result;
  } catch (err) {
    wasmZeroizeArray(cloned);
    throw err;
  }
}

export function withActiveAccountSecretKeyBytes<T>(callback: (secretKeyBytes: Uint8Array) => T): T | null {
  if (!fallbackAccountSecretKeyBytes) return null;
  const cloned = cloneBytes(fallbackAccountSecretKeyBytes);
  try {
    const result = callback(cloned);
    if (result instanceof Promise) {
      return (result as Promise<unknown>).finally(() => {
        wasmZeroizeArray(cloned);
      }) as unknown as T;
    }
    wasmZeroizeArray(cloned);
    return result;
  } catch (err) {
    wasmZeroizeArray(cloned);
    throw err;
  }
}

export async function withActiveAccountSecretKey<T>(callback: (secretKey: string) => Promise<T> | T): Promise<T | null> {
  const secretKey = decodeSecret(fallbackAccountSecretKeyBytes);
  if (!secretKey) return null;
  return await callback(secretKey);
}

export async function withActiveBackupPassword<T>(callback: (backupPassword: string) => Promise<T> | T): Promise<T | null> {
  const backupPassword = decodeSecret(fallbackBackupPasswordBytes);
  if (!backupPassword) return null;
  return await callback(backupPassword);
}

export async function withActiveSessionSecrets<T>(
  callback: (masterPassword: string, backupPassword: string) => Promise<T> | T,
): Promise<T | null> {
  const masterPassword = decodeSecret(fallbackCredentialBytes);
  const backupPassword = decodeSecret(fallbackBackupPasswordBytes);
  if (!masterPassword || !backupPassword) return null;
  return await callback(masterPassword, backupPassword);
}

