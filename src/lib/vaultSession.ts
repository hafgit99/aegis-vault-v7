import { invoke } from '@tauri-apps/api/core';
import { isDesktopRuntime } from './argon2id';

let fallbackCredentialBytes: Uint8Array | null = null;
let fallbackAccountSecretKeyBytes: Uint8Array | null = null;
let fallbackBackupPasswordBytes: Uint8Array | null = null;
let activeVaultKeyBytes: Uint8Array | null = null;

let hasActiveMasterPass = false;
let hasActiveBackupPass = false;
let hasActiveSecretKey = false;

function encodeSecret(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function decodeSecret(value: Uint8Array | null): string | null {
  if (!value) return null;
  return new TextDecoder().decode(value);
}

function cloneBytes(value: Uint8Array): Uint8Array {
  return new Uint8Array(value);
}

function zeroizeSecret(value: Uint8Array | null): void {
  value?.fill(0);
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

export function openVaultSession(
  masterPasswordOrKey: string | Uint8Array,
  backupPassword?: string | { hasBackup?: boolean; hasSecret?: boolean },
  vaultEncryptionKey?: Uint8Array,
): void {
  closeVaultSession();

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
      .catch(e => console.error('Failed to update vault key in Rust:', e));
  }
  notifySubscribers();
}

export function closeVaultSession(): void {
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

  if (isDesktopRuntime()) {
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
  return callback(cloneBytes(activeVaultKeyBytes));
}

export async function withActiveAccountSecretKey<T>(callback: (secretKey: string) => Promise<T> | T): Promise<T | null> {
  if (isDesktopRuntime()) {
    const secretKey = await invoke<string | null>('get_rust_active_account_secret_key');
    if (!secretKey) return null;
    return await callback(secretKey);
  } else {
    const secretKey = decodeSecret(fallbackAccountSecretKeyBytes);
    if (!secretKey) return null;
    return await callback(secretKey);
  }
}

export async function withActiveBackupPassword<T>(callback: (backupPassword: string) => Promise<T> | T): Promise<T | null> {
  if (isDesktopRuntime()) {
    const backupPassword = await invoke<string | null>('get_rust_active_backup_password');
    if (!backupPassword) return null;
    return await callback(backupPassword);
  } else {
    const backupPassword = decodeSecret(fallbackBackupPasswordBytes);
    if (!backupPassword) return null;
    return await callback(backupPassword);
  }
}

export async function withActiveSessionSecrets<T>(
  callback: (masterPassword: string, backupPassword: string) => Promise<T> | T,
): Promise<T | null> {
  if (isDesktopRuntime()) {
    const masterPassword = await invoke<string | null>('get_rust_active_credential');
    const backupPassword = await invoke<string | null>('get_rust_active_backup_password');
    if (!masterPassword || !backupPassword) return null;
    return await callback(masterPassword, backupPassword);
  } else {
    const masterPassword = decodeSecret(fallbackCredentialBytes);
    const backupPassword = decodeSecret(fallbackBackupPasswordBytes);
    if (!masterPassword || !backupPassword) return null;
    return await callback(masterPassword, backupPassword);
  }
}
