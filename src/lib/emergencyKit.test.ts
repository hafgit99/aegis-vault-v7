/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildEmergencyKitText, EMERGENCY_KIT_FILENAME, saveEmergencyKit, buildEmergencyKitPdfBytes, saveEmergencyKitPdf, EMERGENCY_KIT_PDF_FILENAME } from './emergencyKit';
import { isNativeFileDialogSupported, saveDesktopExportFile, saveDesktopBinaryFile } from './desktopFiles';

vi.mock('./desktopFiles', () => ({
  isNativeFileDialogSupported: vi.fn(() => false),
  saveDesktopExportFile: vi.fn(async () => false),
  saveDesktopBinaryFile: vi.fn(async () => false),
}));

describe('emergencyKit', () => {
  const secretKey = 'A3-ABCD-EFGH-JKLM-NPQR-STUV-WXYZ-2345-2673';

  beforeEach(() => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn() });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(isNativeFileDialogSupported).mockReset();
    vi.mocked(saveDesktopExportFile).mockReset();
    vi.mocked(saveDesktopBinaryFile).mockReset();
    vi.mocked(isNativeFileDialogSupported).mockReturnValue(false);
    vi.mocked(saveDesktopExportFile).mockResolvedValue(false);
    vi.mocked(saveDesktopBinaryFile).mockResolvedValue(false);
  });

  it('builds an offline recovery kit without including a master password', () => {
    const kit = buildEmergencyKitText(secretKey, { generatedAt: new Date('2026-06-20T12:00:00.000Z') });

    expect(kit.split('\n')).toEqual([
      'Aegis Vault 7 Emergency Kit',
      '',
      'Generated: 2026-06-20T12:00:00.000Z',
      `Account Secret Key: ${secretKey}`,
      '',
      'Keep this file offline and outside the vault.',
      'You need this secret key together with your master password to unlock this vault on a new device.',
      'Aegis Vault 7 cannot recover the secret key or master password for you.',
    ]);
    expect(kit).not.toContain('Master Password:');
  });

  it('rejects malformed secret keys before writing a kit', async () => {
    await expect(saveEmergencyKit('not-valid')).rejects.toThrow('Invalid account secret key format.');
    expect(saveDesktopExportFile).not.toHaveBeenCalled();
  });

  it('uses the native save dialog when available', async () => {
    vi.mocked(saveDesktopExportFile).mockResolvedValueOnce(true);

    await expect(saveEmergencyKit(secretKey)).resolves.toBe(true);

    expect(saveDesktopExportFile).toHaveBeenCalledWith(EMERGENCY_KIT_FILENAME, expect.stringContaining(secretKey));
  });

  it('does not fall back to hidden browser downloads after native cancellation', async () => {
    vi.mocked(isNativeFileDialogSupported).mockReturnValueOnce(true);
    vi.mocked(saveDesktopExportFile).mockResolvedValueOnce(false);

    await expect(saveEmergencyKit(secretKey)).resolves.toBe(false);
  });

  it('falls back to a browser download when no native file dialog is available', async () => {
    const createdUrl = 'blob:aegis-emergency-kit';
    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const removeSpy = vi.spyOn(HTMLAnchorElement.prototype, 'remove').mockImplementation(() => undefined);
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue(createdUrl);
    const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    vi.mocked(isNativeFileDialogSupported).mockReturnValueOnce(false);
    vi.mocked(saveDesktopExportFile).mockResolvedValueOnce(false);

    await expect(saveEmergencyKit(secretKey)).resolves.toBe(true);

    expect(createObjectUrlSpy).toHaveBeenCalledWith(expect.any(Blob));
    const blob = createObjectUrlSpy.mock.calls[0][0] as Blob;
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe('text/plain;charset=utf-8');
    expect(appendSpy).toHaveBeenCalledWith(expect.any(HTMLAnchorElement));
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith(createdUrl);

    const anchor = appendSpy.mock.calls.at(-1)?.[0] as HTMLAnchorElement;
    expect(anchor.download).toBe(EMERGENCY_KIT_FILENAME);
    expect(anchor.href).toBe(createdUrl);
  });

  it('surfaces native save errors instead of starting an unsafe fallback', async () => {
    const saveError = new Error('disk is read-only');
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL');

    vi.mocked(isNativeFileDialogSupported).mockReturnValueOnce(true);
    vi.mocked(saveDesktopExportFile).mockRejectedValueOnce(saveError);

    await expect(saveEmergencyKit(secretKey)).rejects.toThrow('disk is read-only');
    expect(createObjectUrlSpy).not.toHaveBeenCalled();
  });

  it('builds an offline recovery kit in PDF format as bytes', () => {
    const bytes = buildEmergencyKitPdfBytes(secretKey, { generatedAt: new Date('2026-06-20T12:00:00.000Z') });
    const text = new TextDecoder().decode(bytes);

    expect(text).toContain('%PDF-1.4');
    expect(text).toContain('Aegis Vault 7 Emergency Kit');
    expect(text).toContain(`Account Secret Key: ${secretKey}`);
    expect(text).toContain('%%EOF');
  });

  it('saves PDF kit using native dialog when supported', async () => {
    vi.mocked(saveDesktopBinaryFile).mockResolvedValueOnce(true);

    await expect(saveEmergencyKitPdf(secretKey)).resolves.toBe(true);

    expect(saveDesktopBinaryFile).toHaveBeenCalledTimes(1);
    const [calledFilename, calledBytes] = vi.mocked(saveDesktopBinaryFile).mock.calls[0];
    expect(calledFilename).toBe(EMERGENCY_KIT_PDF_FILENAME);
    const byteArr = calledBytes instanceof Uint8Array ? calledBytes : new Uint8Array(Object.values(calledBytes as any));
    const pdfHeader = new TextDecoder().decode(byteArr.slice(0, 8));
    expect(pdfHeader).toContain('%PDF-1.4');
  });

  it('falls back to browser download for PDF saving when native dialog is not supported', async () => {
    const createdUrl = 'blob:aegis-emergency-kit-pdf';
    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const removeSpy = vi.spyOn(HTMLAnchorElement.prototype, 'remove').mockImplementation(() => undefined);
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue(createdUrl);
    const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    vi.mocked(isNativeFileDialogSupported).mockReturnValueOnce(false);
    vi.mocked(saveDesktopBinaryFile).mockResolvedValueOnce(false);

    await expect(saveEmergencyKitPdf(secretKey)).resolves.toBe(true);

    expect(createObjectUrlSpy).toHaveBeenCalledWith(expect.any(Blob));
    const blob = createObjectUrlSpy.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('application/pdf');
    expect(appendSpy).toHaveBeenCalledWith(expect.any(HTMLAnchorElement));
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith(createdUrl);
  });
});
