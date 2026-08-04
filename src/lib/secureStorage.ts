export const secureStorageKeys = {
  rememberedSecretKey: 'aegis_account_secret_key_remembered',
  biometricInfo: 'aegis_biometric_info',
} as const;

interface AndroidSecureStorageBridge {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => boolean;
  removeItem: (key: string) => boolean;
}

declare global {
  interface Window {
    AegisAndroidSecureStorage?: AndroidSecureStorageBridge;
  }
}

export function getAndroidSecureStorageBridge(): AndroidSecureStorageBridge | null {
  if (typeof window === 'undefined') return null;
  const bridge = window.AegisAndroidSecureStorage;
  if (!bridge) return null;

  if (
    typeof bridge.getItem !== 'function' ||
    typeof bridge.setItem !== 'function' ||
    typeof bridge.removeItem !== 'function'
  ) {
    return null;
  }

  return bridge;
}

export function isSecureStorageAvailable(): boolean {
  return getAndroidSecureStorageBridge() !== null;
}

export type SecureStorageResult<T> =
  | { success: true; value: T }
  | { success: false; error: Error };

export function getSecureStorageItem(key: string): string | null {
  const bridge = getAndroidSecureStorageBridge();
  if (!bridge) return null;

  try {
    return bridge.getItem(key);
  } catch {
    return null;
  }
}

export function setSecureStorageItem(key: string, value: string): boolean {
  const bridge = getAndroidSecureStorageBridge();
  if (!bridge) return false;

  try {
    return bridge.setItem(key, value);
  } catch {
    return false;
  }
}

export function setSecureStorageItemResult(key: string, value: string): SecureStorageResult<boolean> {
  const bridge = getAndroidSecureStorageBridge();
  if (!bridge) {
    return { success: false, error: new Error('Secure storage bridge is unavailable on this platform') };
  }

  try {
    const ok = bridge.setItem(key, value);
    if (!ok) {
      return { success: false, error: new Error(`Failed to store secure item for key '${key}'`) };
    }
    return { success: true, value: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

export function removeSecureStorageItem(key: string): boolean {
  const bridge = getAndroidSecureStorageBridge();
  if (!bridge) return false;

  try {
    return bridge.removeItem(key);
  } catch {
    return false;
  }
}
