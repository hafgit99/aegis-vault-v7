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

// M10 Dilim 1: translations resolve through useLanguage() — assertions use
// the real default (tr) locale strings.

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
      />
    );

    expect(screen.getByText('Durum: PASİF 🔴')).toBeTruthy();
    expect(screen.getByText('Kilit açma yardımı kapalı. Sadece ana şifrenizle giriş yapabilirsiniz.')).toBeTruthy();

    const platformBtn = screen.getByText('Cihaz Kilidi Aktifleştir (Touch ID / Face ID / Hello)');
    const fidoBtn = screen.getByText('Güvenlik Anahtarı Aktifleştir (FIDO2 / YubiKey)');

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
      />
    );

    expect(screen.getByText('Durum: AKTİF (Biyometrik / Cihaz Kilidi) 🟢')).toBeTruthy();
    const disableBtn = screen.getByText('Korumayı Devre Dışı Bırak');
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
      />
    );

    expect(screen.getByText('Durum: AKTİF (Güvenlik Anahtarı / FIDO2) 🟢')).toBeTruthy();
  });

  it('renders success and error banners', () => {
    render(
      <SettingsBiometricCard
        biometricEnabled={false}
        biometricLoading={false}
        biometricSuccess="Successfully enabled!"
        biometricError="Failed to enable."
        onToggleBiometric={vi.fn()}
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
      />
    );

    expect(screen.getByText('Güvenlik Seviyesi: Donanıma Bağlı (Yüksek)')).toBeTruthy();
    expect(screen.getByText('🔒 Donanıma Bağlı Koruma: Biyometrik kilit açma anahtarınız, donanım güvenlik modülü (WebAuthn PRF / OS Keystore) tarafından korunmaktadır. Sarma anahtarı yalnızca fiziksel doğrulama ile türetilebilir.')).toBeTruthy();
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
      />
    );

    expect(screen.getByText('Güvenlik Seviyesi: Yazılım Tabanlı Kolaylık (Orta)')).toBeTruthy();
    expect(screen.getByText('⚠️ Kolaylık Modu: Biyometrik kilit açma yalnızca yerel kullanım kolaylığı (UX) sağlar. Sarma anahtarı donanıma bağlı değildir; cihaz depolama alanına erişim sağlayan bir saldırgan şifrelenmiş paketi çıkarabilir. Maksimum güvenlik için donanım PRF desteği olan bir doğrulayıcı (Windows Hello, YubiKey 5+) kullanın.')).toBeTruthy();
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
      />,
    );

    const checkbox = screen.getByRole('checkbox', { name: 'Otomatik Doldurma Öncesi Biyometrik Onay' }) as HTMLInputElement;
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
      />,
    );

    expect(screen.getByText('Eski güvensiz biyometrik kayıt kaldırıldı. Donanım korumalı güvenlik (PRF) için lütfen biyometrik kilidi yeniden etkinleştirin.')).toBeTruthy();
  });

  it('hides the autofill toggle when biometrics are disabled', () => {
    render(
      <SettingsBiometricCard
        biometricEnabled={false}
        biometricLoading={false}
        biometricSuccess={null}
        biometricError={null}
        onToggleBiometric={vi.fn()}
      />,
    );

    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});
