/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildEmergencyKitText, EMERGENCY_KIT_FILENAME, saveEmergencyKit } from './emergencyKit';
import { isNativeFileDialogSupported, saveDesktopExportFile } from './desktopFiles';

vi.mock('./desktopFiles', () => ({
  isNativeFileDialogSupported: vi.fn(() => false),
  saveDesktopExportFile: vi.fn(async () => false),
}));

describe('emergencyKit', () => {
  const secretKey = 'A3-ABCD-EFGH-JKLM-NPQR-STUV-WXYZ-2345-2673';

  beforeEach(() => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn() });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(isNativeFileDialogSupported).mockReturnValue(false);
    vi.mocked(saveDesktopExportFile).mockResolvedValue(false);
  });

  it('builds an offline recovery kit without including a master password', () => {
    const kit = buildEmergencyKitText(secretKey, { generatedAt: new Date('2026-06-20T12:00:00.000Z') });

    expect(kit).toContain('Aegis Vault 7 Emergency Kit');
    expect(kit).toContain('Generated: 2026-06-20T12:00:00.000Z');
    expect(kit).toContain(`Account Secret Key: ${secretKey}`);
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
});
