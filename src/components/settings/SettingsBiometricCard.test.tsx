/**
 * @vitest-environment jsdom
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsBiometricCard } from './SettingsBiometricCard';

afterEach(cleanup);

// Mock biometric utility functions
vi.mock('../../lib/biometric', () => ({
  getBiometricType: vi.fn(() => 'platform'),
  isBiometricAutofillRequireEnabled: vi.fn(() => false),
  setBiometricAutofillRequireEnabled: vi.fn(),
  isBiometricV2UpgradeRequired: vi.fn(() => false),
  isBiometricHardwareBound: vi.fn(() => false),
}));

import { getBiometricType, isBiometricHardwareBound, isBiometricV2UpgradeRequired, setBiometricAutofillRequireEnabled } from '../../lib/biometric';

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
    'settings.biometric.securityLevelLabel': 'Security Level',
    'settings.biometric.securityLevelHardware': 'Hardware-Bound (High)',
    'settings.biometric.securityLevelSoftware': 'Software-Based Convenience (Medium)',
    'settings.biometric.securityNoticeHardwareBound': 'Hardware-bound protection notice.',
    'settings.biometric.securityNoticeConvenience': 'Convenience mode notice.',
    'settings.biometric.autofillConfirmTitle': 'Autofill Confirmation',
    'settings.biometric.autofillConfirmDesc': 'Require confirmation before autofill.',
    'settings.biometric.v2UpgradeNotice': 'Upgrade required',
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

  it('shows the hardware-bound security level when the binding is hardware-bound (RUST-O6)', () => {
    vi.mocked(isBiometricHardwareBound).mockReturnValue(true);
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

    expect(screen.getByText('Security Level: Hardware-Bound (High)')).toBeTruthy();
    expect(screen.getByText('Hardware-bound protection notice.')).toBeTruthy();
  });

  it('shows the software convenience security level when the binding is not hardware-bound (RUST-O6)', () => {
    vi.mocked(isBiometricHardwareBound).mockReturnValue(false);
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

    expect(screen.getByText('Security Level: Software-Based Convenience (Medium)')).toBeTruthy();
    expect(screen.getByText('Convenience mode notice.')).toBeTruthy();
  });

  it('hides the security level block when biometric unlock is disabled (RUST-O6)', () => {
    vi.mocked(isBiometricHardwareBound).mockReturnValue(true);
    render(
      <SettingsBiometricCard
        biometricEnabled={false}
        biometricLoading={false}
        biometricSuccess={null}
        biometricError={null}
        onToggleBiometric={vi.fn()}
        t={t}
      />
    );

    expect(screen.queryByText(/Security Level:/)).toBeNull();
  });
it('toggles the autofill-confirmation requirement checkbox', () => {
    vi.mocked(isBiometricHardwareBound).mockReturnValue(false);
    render(
      <SettingsBiometricCard
        biometricEnabled={true}
        biometricLoading={false}
        biometricSuccess={null}
        biometricError={null}
        onToggleBiometric={vi.fn()}
        t={t}
      />,
    );

    const checkbox = screen.getByRole('checkbox', { name: 'Autofill Confirmation' }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    fireEvent.click(checkbox);

    expect(setBiometricAutofillRequireEnabled).toHaveBeenCalledWith(true);
    expect(checkbox.checked).toBe(true);
  });

  it('shows the V2 upgrade notice when an upgrade is required and biometrics are off', () => {
    vi.mocked(isBiometricV2UpgradeRequired).mockReturnValue(true);

    render(
      <SettingsBiometricCard
        biometricEnabled={false}
        biometricLoading={false}
        biometricSuccess={null}
        biometricError={null}
        onToggleBiometric={vi.fn()}
        t={t}
      />,
    );

    expect(screen.getByText('Upgrade required')).toBeTruthy();
  });

  it('hides the autofill toggle when biometrics are disabled', () => {
    render(
      <SettingsBiometricCard
        biometricEnabled={false}
        biometricLoading={false}
        biometricSuccess={null}
        biometricError={null}
        onToggleBiometric={vi.fn()}
        t={t}
      />,
    );

    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});
