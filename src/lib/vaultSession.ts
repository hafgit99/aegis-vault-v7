let activeMasterPassword: string | null = null;
let activeBackupPassword: string | null = null;

export function openVaultSession(masterPassword: string, backupPassword = masterPassword): void {
  activeMasterPassword = masterPassword;
  activeBackupPassword = backupPassword;
}

export function closeVaultSession(): void {
  activeMasterPassword = null;
  activeBackupPassword = null;
}

export function getActiveMasterPassword(): string | null {
  return activeMasterPassword;
}

export function getActiveBackupPassword(): string | null {
  return activeBackupPassword;
}
