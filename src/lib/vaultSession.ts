let activeCredentialBytes: Uint8Array | null = null;
let activeAccountSecretKeyBytes: Uint8Array | null = null;
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
  activeCredentialBytes = encodeSecret(masterPassword);
  const secretSeparatorIndex = masterPassword.startsWith('aegis-vault-v7:') ? masterPassword.indexOf('\0') : -1;
  activeAccountSecretKeyBytes = secretSeparatorIndex !== -1
    ? encodeSecret(masterPassword.substring(secretSeparatorIndex + 1))
    : null;
  activeBackupPasswordBytes = encodeSecret(backupPassword);
  activeVaultKeyBytes = vaultEncryptionKey ? cloneBytes(vaultEncryptionKey) : null;
}

export function updateActiveVaultEncryptionKey(vaultEncryptionKey: Uint8Array): void {
  if (activeVaultKeyBytes) {
    zeroizeSecret(activeVaultKeyBytes);
  }
  activeVaultKeyBytes = cloneBytes(vaultEncryptionKey);
}

export function closeVaultSession(): void {
  zeroizeSecret(activeCredentialBytes);
  zeroizeSecret(activeBackupPasswordBytes);
  zeroizeSecret(activeAccountSecretKeyBytes);
  zeroizeSecret(activeVaultKeyBytes);
  activeCredentialBytes = null;
  activeBackupPasswordBytes = null;
  activeAccountSecretKeyBytes = null;
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
  return activeCredentialBytes !== null || activeVaultKeyBytes !== null;
}

/**
 * Presence-only probes. These deliberately return a boolean instead of
 * materializing the secret into a JavaScript string. Use these (or the scoped
 * `withActive*` callbacks) when code only needs to know whether a credential is
 * available — never use them to obtain the credential itself.
 */
export function hasActiveMasterPassword(): boolean {
  return activeCredentialBytes !== null;
}

export function hasActiveAccountSecretKey(): boolean {
  return activeAccountSecretKeyBytes !== null;
}

export function hasActiveBackupPassword(): boolean {
  return activeBackupPasswordBytes !== null;
}

export function withActiveVaultEncryptionKey<T>(callback: (vaultEncryptionKey: Uint8Array) => T): T | null {
  if (!activeVaultKeyBytes) return null;
  return callback(cloneBytes(activeVaultKeyBytes));
}

export function withActiveAccountSecretKey<T>(callback: (secretKey: string) => T): T | null {
  const secretKey = decodeSecret(activeAccountSecretKeyBytes);
  if (!secretKey) return null;
  return callback(secretKey);
}

export function withActiveBackupPassword<T>(callback: (backupPassword: string) => T): T | null {
  const backupPassword = decodeSecret(activeBackupPasswordBytes);
  if (!backupPassword) return null;
  return callback(backupPassword);
}

export function withActiveSessionSecrets<T>(
  callback: (masterPassword: string, backupPassword: string) => T,
): T | null {
  const masterPassword = decodeSecret(activeCredentialBytes);
  const backupPassword = decodeSecret(activeBackupPasswordBytes);
  if (!masterPassword || !backupPassword) return null;
  return callback(masterPassword, backupPassword);
}
