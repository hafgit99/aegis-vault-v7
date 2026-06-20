import { describe, expect, it, vi } from 'vitest';

import { buildEmergencyKitText, EMERGENCY_KIT_FILENAME, saveEmergencyKit } from './emergencyKit';
import { isNativeFileDialogSupported, saveDesktopExportFile } from './desktopFiles';

vi.mock('./desktopFiles', () => ({
  isNativeFileDialogSupported: vi.fn(() => false),
  saveDesktopExportFile: vi.fn(async () => false),
}));

describe('emergencyKit', () => {
  const secretKey = 'A3-ABCD-EFGH-JKLM-NPQR-STUV-WXYZ-2345-2673';

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
});
