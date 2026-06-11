let activeMasterPasswordBytes: Uint8Array | null = null;
let activeBackupPasswordBytes: Uint8Array | null = null;

function encodeSecret(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function decodeSecret(value: Uint8Array | null): string | null {
  if (!value) return null;
  return new TextDecoder().decode(value);
}

function zeroizeSecret(value: Uint8Array | null): void {
  value?.fill(0);
}

export function openVaultSession(masterPassword: string, backupPassword = masterPassword): void {
  closeVaultSession();
  activeMasterPasswordBytes = encodeSecret(masterPassword);
  activeBackupPasswordBytes = encodeSecret(backupPassword);
}

export function closeVaultSession(): void {
  zeroizeSecret(activeMasterPasswordBytes);
  zeroizeSecret(activeBackupPasswordBytes);
  activeMasterPasswordBytes = null;
  activeBackupPasswordBytes = null;
}

export function getActiveMasterPassword(): string | null {
  return decodeSecret(activeMasterPasswordBytes);
}

export function getActiveBackupPassword(): string | null {
  return decodeSecret(activeBackupPasswordBytes);
}
