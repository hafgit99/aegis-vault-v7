let activeMasterPassword: string | null = null;

export function openVaultSession(masterPassword: string): void {
  activeMasterPassword = masterPassword;
}

export function closeVaultSession(): void {
  activeMasterPassword = null;
}

export function getActiveMasterPassword(): string | null {
  return activeMasterPassword;
}
