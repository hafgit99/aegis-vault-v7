/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SettingsEmergencyKitCard } from './SettingsEmergencyKitCard';
import { SettingsAutoLockCard } from './SettingsAutoLockCard';
import { SettingsStorageMigrationCard } from './SettingsStorageMigrationCard';
import { SettingsExtensionTokenCard } from './SettingsExtensionTokenCard';
import { SettingsThemeCard } from './SettingsThemeCard';

const setThemePaletteMock = vi.fn();
const setThemeModeMock = vi.fn();

vi.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({
    themeMode: 'dark',
    themePalette: 'emerald',
    setThemeMode: setThemeModeMock,
    setThemePalette: setThemePaletteMock,
  }),
}));

vi.mock('../../i18n/LanguageContext', () => ({
  useLanguage: () => ({
    t: (k: string) => k,
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Settings Modular Cards', () => {
  const t = (key: string) => key;

  it('renders SettingsEmergencyKitCard and triggers download', () => {
    const onKeyChange = vi.fn();
    const onDownload = vi.fn();

    render(
      <SettingsEmergencyKitCard
        emergencySecretKey="SECRET-KEY-123"
        onEmergencySecretKeyChange={onKeyChange}
        emergencyKitSuccess={null}
        emergencyKitError={null}
        onDownloadEmergencyKit={onDownload}
        t={t}
      />
    );

    expect(screen.getByTestId('settings-emergency-kit-card')).toBeDefined();
    const input = screen.getByTestId('settings-emergency-secret-key-input');
    fireEvent.change(input, { target: { value: 'NEW-KEY' } });
    expect(onKeyChange).toHaveBeenCalledWith('NEW-KEY');

    const btn = screen.getByTestId('settings-emergency-kit-download-button');
    fireEvent.click(btn);
    expect(onDownload).toHaveBeenCalled();
  });

  it('renders SettingsAutoLockCard and triggers change', () => {
    const onChange = vi.fn();
    const lockOptions = [
      { label: 'Immediate', value: 0 },
      { label: '5 Minutes', value: 300 },
    ];

    render(
      <SettingsAutoLockCard
        autoLockDuration={0}
        lockOptions={lockOptions}
        onAutoLockDurationChange={onChange}
        t={t}
      />
    );

    const btn = screen.getByText('5 Minutes');
    fireEvent.click(btn);
    expect(onChange).toHaveBeenCalledWith(300);
  });

  it('renders SettingsStorageMigrationCard and triggers migration', () => {
    const onMigrate = vi.fn();
    render(
      <SettingsStorageMigrationCard
        storageMigrationStatus="idle"
        storageMigrationMessage={null}
        onMigrate={onMigrate}
        t={t}
      />
    );

    const btn = screen.getByTestId('wa-sqlite-migration-button');
    fireEvent.click(btn);
    expect(onMigrate).toHaveBeenCalled();
  });

  it('renders SettingsExtensionTokenCard and triggers rotation', () => {
    const onRotate = vi.fn();
    (window as any).__TAURI_INTERNALS__ = {};

    render(
      <SettingsExtensionTokenCard
        tokenRotateStatus="idle"
        tokenRotateMessage={null}
        onRotateToken={onRotate}
        t={t}
      />
    );

    const btn = screen.getByText('settings.extension.rotateBtn');
    fireEvent.click(btn);
    expect(onRotate).toHaveBeenCalled();
  });

  it('renders SettingsThemeCard and switches color palettes', () => {
    render(<SettingsThemeCard />);

    expect(screen.getByTestId('theme-settings-card')).toBeDefined();
    const bluePaletteBtn = screen.getByTestId('theme-palette-blue');
    fireEvent.click(bluePaletteBtn);
    expect(setThemePaletteMock).toHaveBeenCalledWith('blue');
  });
});
