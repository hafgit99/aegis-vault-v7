/**
 * @vitest-environment jsdom
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsBiometricCard } from './SettingsBiometricCard';

// Mock biometric utility functions
vi.mock('../../lib/biometric', () => ({
  getBiometricType: vi.fn(() => 'platform'),
}));

import { getBiometricType } from '../../lib/biometric';

const t = (key: string) => {
  const translations: Record<string, string> = {
    'settings.biometric.title': 'Biometric Lock',
    'settings.biometric.descriptionPrefix': 'Use',
    'settings.biometric.descriptionSuffix': 'to unlock.',
    'settings.biometric.statusLabel': 'Status',
    'settings.biometric.statusActivePlatform': 'Active (Platform)',
    'settings.biometric.statusActiveFido2': 'Active (FIDO2)',
    'settings.biometric.statusPassive': 'Passive',
    'settings.biometric.activeDescriptionPlatform': 'Active on platform.',
    'settings.biometric.activeDescriptionFido2': 'Active on FIDO2.',
    'settings.biometric.passiveDescription': 'Not active.',
    'settings.biometric.enablePlatform': 'Enable Platform',
    'settings.biometric.enableFido2': 'Enable FIDO2',
    'settings.biometric.disable': 'Disable Biometrics',
    'settings.biometric.loading': 'Loading...',
  };
  return translations[key] || key;
};

describe('SettingsBiometricCard', () => {
  it('renders status and toggle button when disabled', () => {
    const handleToggle = vi.fn();
    render(
      <SettingsBiometricCard
        biometricEnabled={false}
        biometricLoading={false}
        biometricSuccess={null}
        biometricError={null}
        onToggleBiometric={handleToggle}
        t={t}
      />
    );

    expect(screen.getByText('Status: Passive')).toBeTruthy();
    expect(screen.getByText('Not active.')).toBeTruthy();

    const platformBtn = screen.getByText('Enable Platform');
    const fidoBtn = screen.getByText('Enable FIDO2');

    fireEvent.click(platformBtn);
    expect(handleToggle).toHaveBeenCalledWith('platform');

    fireEvent.click(fidoBtn);
    expect(handleToggle).toHaveBeenCalledWith('cross-platform');
  });

  it('renders status and disable button when enabled', () => {
    vi.mocked(getBiometricType).mockReturnValue('platform');
    const handleToggle = vi.fn();
    render(
      <SettingsBiometricCard
        biometricEnabled={true}
        biometricLoading={false}
        biometricSuccess={null}
        biometricError={null}
        onToggleBiometric={handleToggle}
        t={t}
      />
    );

    expect(screen.getByText('Status: Active (Platform)')).toBeTruthy();
    const disableBtn = screen.getByText('Disable Biometrics');
    fireEvent.click(disableBtn);
    expect(handleToggle).toHaveBeenCalledWith('platform');
  });

  it('renders status and disable button when enabled with FIDO2 type', () => {
    vi.mocked(getBiometricType).mockReturnValue('cross-platform');
    render(
      <SettingsBiometricCard
        biometricEnabled={true}
        biometricLoading={false}
        biometricSuccess={null}
        biometricError={null}
        onToggleBiometric={vi.fn()}
        t={t}
      />
    );

    expect(screen.getByText('Status: Active (FIDO2)')).toBeTruthy();
  });

  it('renders success and error banners', () => {
    render(
      <SettingsBiometricCard
        biometricEnabled={false}
        biometricLoading={false}
        biometricSuccess="Successfully enabled!"
        biometricError="Failed to enable."
        onToggleBiometric={vi.fn()}
        t={t}
      />
    );

    expect(screen.getByText('Successfully enabled!')).toBeTruthy();
    expect(screen.getByText('Failed to enable.')).toBeTruthy();
  });
});
