import { APP_NAME } from './branding';
import { isNativeFileDialogSupported, saveDesktopExportFile, saveDesktopBinaryFile } from './desktopFiles';
import { isAccountSecretKeyFormatValid, normalizeAccountSecretKey } from './secretKey';

export const EMERGENCY_KIT_FILENAME = 'aegis-vault-emergency-kit.txt';
export const EMERGENCY_KIT_PDF_FILENAME = 'aegis-vault-emergency-kit.pdf';

interface EmergencyKitOptions {
  generatedAt?: Date;
  recoveryWords?: string[];
}

export function buildEmergencyKitText(secretKey: string, options: EmergencyKitOptions = {}): string {
  const normalizedSecretKey = normalizeAccountSecretKey(secretKey);
  if (!isAccountSecretKeyFormatValid(normalizedSecretKey)) {
    throw new Error('Invalid account secret key format.');
  }

  const generatedAt = (options.generatedAt ?? new Date()).toISOString();

  const lines = [
    `${APP_NAME} Emergency Kit`,
    '',
    `Generated: ${generatedAt}`,
    `Account Secret Key: ${normalizedSecretKey}`,
  ];

  if (options.recoveryWords && options.recoveryWords.length === 24) {
    lines.push('');
    lines.push('Recovery Key Words (24-word BIP-39 phrase):');
    for (let i = 0; i < options.recoveryWords.length; i += 4) {
      lines.push(options.recoveryWords.slice(i, i + 4).map((w, j) => `${i + j + 1}. ${w}`).join('  '));
    }
  }

  lines.push('');
  lines.push('Keep this file offline and outside the vault.');
  lines.push('You need this secret key together with your master password to unlock this vault on a new device.');
  if (options.recoveryWords && options.recoveryWords.length === 24) {
    lines.push('If you forget your master password, use the 24 recovery words to unlock and reset your password.');
  }
  lines.push(`${APP_NAME} cannot recover the secret key or master password for you.`);

  return lines.join('\n');
}

export function buildEmergencyKitPdfBytes(secretKey: string, options: EmergencyKitOptions = {}): Uint8Array {
  const normalizedSecretKey = normalizeAccountSecretKey(secretKey);
  if (!isAccountSecretKeyFormatValid(normalizedSecretKey)) {
    throw new Error('Invalid account secret key format.');
  }

  const generatedAt = (options.generatedAt ?? new Date()).toISOString();

  const lines = [
    `${APP_NAME} Emergency Kit`,
    '',
    `Generated: ${generatedAt}`,
    `Account Secret Key: ${normalizedSecretKey}`,
  ];

  if (options.recoveryWords && options.recoveryWords.length === 24) {
    lines.push('');
    lines.push('Recovery Key Words (24-word phrase):');
    for (let i = 0; i < options.recoveryWords.length; i += 4) {
      lines.push(options.recoveryWords.slice(i, i + 4).map((w, j) => `${i + j + 1}.${w}`).join(' '));
    }
  }

  lines.push('');
  lines.push('Keep this file offline and outside the vault.');
  lines.push('You need this secret key together with your master password to unlock this vault on a new device.');
  lines.push(`${APP_NAME} cannot recover the secret key or master password for you.`);

  const objects: string[] = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj');
  objects.push('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.3 841.9] /Contents 4 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>\nendobj');

  let streamText = 'BT\n/F1 18 Tf\n50 780 Td\n';
  for (const line of lines) {
    if (line === '') {
      streamText += '0 -20 Td\n';
    } else {
      const escaped = line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
      streamText += `(${escaped}) Tj\n0 -20 Td\n`;
    }
  }
  streamText += 'ET';

  const streamBytes = new TextEncoder().encode(streamText);
  objects.push(`4 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n${streamText}\nendstream\nendobj`);

  const header = '%PDF-1.4\n';
  const offsets: number[] = [];
  let currentOffset = header.length;

  const assembledObjects: string[] = [];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(currentOffset);
    const objStr = objects[i] + '\n';
    assembledObjects.push(objStr);
    currentOffset += objStr.length;
  }

  const xrefOffset = currentOffset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 0; i < objects.length; i++) {
    xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }

  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  const finalPdfText = header + assembledObjects.join('') + xref + trailer;
  return new TextEncoder().encode(finalPdfText);
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

function browserDownloadPdfFile(filename: string, bytes: Uint8Array): void {
  const blob = new Blob([bytes], { type: 'application/pdf' });
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

export async function saveEmergencyKitPdf(secretKey: string): Promise<boolean> {
  const bytes = buildEmergencyKitPdfBytes(secretKey);
  const savedWithNativeDialog = await saveDesktopBinaryFile(EMERGENCY_KIT_PDF_FILENAME, bytes);

  if (savedWithNativeDialog) return true;
  if (isNativeFileDialogSupported()) return false;

  browserDownloadPdfFile(EMERGENCY_KIT_PDF_FILENAME, bytes);
  return true;
}
