let activeMasterPasswordBytes: Uint8Array | null = null;
let activeBackupPasswordBytes: Uint8Array | null = null;
let activeVaultKeyBytes: Uint8Array | null = null;

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

export function registerOnCloseSession(cb: () => void): void {
  onCloseCallbacks.push(cb);
}

export function openVaultSession(
  masterPassword: string,
  backupPassword = masterPassword,
  vaultEncryptionKey?: Uint8Array,
): void {
  closeVaultSession();
  activeMasterPasswordBytes = encodeSecret(masterPassword);
  activeBackupPasswordBytes = encodeSecret(backupPassword);
  activeVaultKeyBytes = vaultEncryptionKey ? cloneBytes(vaultEncryptionKey) : null;
}

export function closeVaultSession(): void {
  zeroizeSecret(activeMasterPasswordBytes);
  zeroizeSecret(activeBackupPasswordBytes);
  zeroizeSecret(activeVaultKeyBytes);
  activeMasterPasswordBytes = null;
  activeBackupPasswordBytes = null;
  activeVaultKeyBytes = null;
  onCloseCallbacks.forEach(cb => {
    try {
      cb();
    } catch (e) {
      console.error('Error during close session callback:', e);
    }
  });
}

export function hasActiveVaultSession(): boolean {
  return activeMasterPasswordBytes !== null || activeVaultKeyBytes !== null;
}

export function withActiveVaultEncryptionKey<T>(callback: (vaultEncryptionKey: Uint8Array) => T): T | null {
  if (!activeVaultKeyBytes) return null;
  return callback(cloneBytes(activeVaultKeyBytes));
}

export function withActiveMasterPassword<T>(callback: (masterPassword: string) => T): T | null {
  const masterPassword = decodeSecret(activeMasterPasswordBytes);
  if (!masterPassword) return null;
  return callback(masterPassword);
}

export function withActiveBackupPassword<T>(callback: (backupPassword: string) => T): T | null {
  const backupPassword = decodeSecret(activeBackupPasswordBytes);
  if (!backupPassword) return null;
  return callback(backupPassword);
}

export function withActiveSessionSecrets<T>(
  callback: (masterPassword: string, backupPassword: string) => T,
): T | null {
  const masterPassword = decodeSecret(activeMasterPasswordBytes);
  const backupPassword = decodeSecret(activeBackupPasswordBytes);
  if (!masterPassword || !backupPassword) return null;
  return callback(masterPassword, backupPassword);
}

/**
 * @deprecated Prefer scoped/native secret operations. This getter must only be
 * used by tests or compatibility boundaries while the final lock-screen native
 * credential adapter is being introduced.
 */
export function getActiveMasterPassword(): string | null {
  return decodeSecret(activeMasterPasswordBytes);
}

/**
 * @deprecated Prefer scoped/native secret operations. This getter materializes
 * a temporary JavaScript string and should not be used by new storage paths.
 */
export function getActiveBackupPassword(): string | null {
  return decodeSecret(activeBackupPasswordBytes);
}
