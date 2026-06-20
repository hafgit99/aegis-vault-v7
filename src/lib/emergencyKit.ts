import { APP_NAME } from './branding';
import { isNativeFileDialogSupported, saveDesktopExportFile } from './desktopFiles';
import { isAccountSecretKeyFormatValid, normalizeAccountSecretKey } from './secretKey';

export const EMERGENCY_KIT_FILENAME = 'aegis-vault-emergency-kit.txt';

interface EmergencyKitOptions {
  generatedAt?: Date;
}

export function buildEmergencyKitText(secretKey: string, options: EmergencyKitOptions = {}): string {
  const normalizedSecretKey = normalizeAccountSecretKey(secretKey);
  if (!isAccountSecretKeyFormatValid(normalizedSecretKey)) {
    throw new Error('Invalid account secret key format.');
  }

  const generatedAt = (options.generatedAt ?? new Date()).toISOString();

  return [
    `${APP_NAME} Emergency Kit`,
    '',
    `Generated: ${generatedAt}`,
    `Account Secret Key: ${normalizedSecretKey}`,
    '',
    'Keep this file offline and outside the vault.',
    'You need this secret key together with your master password to unlock this vault on a new device.',
    `${APP_NAME} cannot recover the secret key or master password for you.`,
  ].join('\n');
}

function browserDownloadTextFile(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function saveEmergencyKit(secretKey: string): Promise<boolean> {
  const contents = buildEmergencyKitText(secretKey);
  const savedWithNativeDialog = await saveDesktopExportFile(EMERGENCY_KIT_FILENAME, contents);

  if (savedWithNativeDialog) return true;
  if (isNativeFileDialogSupported()) return false;

  browserDownloadTextFile(EMERGENCY_KIT_FILENAME, contents);
  return true;
}
