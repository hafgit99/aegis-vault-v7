/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import SidebarNavigation from './SidebarNavigation';

afterEach(() => {
  cleanup();
});

describe('SidebarNavigation', () => {
  it('renders navigation items and trash count', () => {
    render(
      <SidebarNavigation
        activeTab="vault"
        isOpen={true}
        trashCount={3}
        onTabChange={vi.fn()}
        onLock={vi.fn()}
      />,
    );

    expect(screen.getByText('AegisVault')).toBeTruthy();
    expect(screen.getByText('Kasa (Vault)')).toBeTruthy();
    expect(screen.getByText('Güvenlik Analizi')).toBeTruthy();
    expect(screen.getByText('Şifre Üretici')).toBeTruthy();
    expect(screen.getByText('Ayarlar')).toBeTruthy();
    expect(screen.getByText('Çöp Kutusu')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('forwards tab changes and lock action', () => {
    const onTabChange = vi.fn();
    const onLock = vi.fn();

    render(
      <SidebarNavigation
        activeTab="settings"
        isOpen={false}
        trashCount={0}
        onTabChange={onTabChange}
        onLock={onLock}
      />,
    );

    fireEvent.click(screen.getByText('Kasa (Vault)'));
    fireEvent.click(screen.getByText('Güvenlik Analizi'));
    fireEvent.click(screen.getByText('Şifre Üretici'));
    fireEvent.click(screen.getByText('Ayarlar'));
    fireEvent.click(screen.getByText('Çöp Kutusu'));
    fireEvent.click(screen.getByText('Kilitli (Lock Vault)'));

    expect(onTabChange).toHaveBeenCalledWith('vault');
    expect(onTabChange).toHaveBeenCalledWith('audit');
    expect(onTabChange).toHaveBeenCalledWith('generator');
    expect(onTabChange).toHaveBeenCalledWith('settings');
    expect(onTabChange).toHaveBeenCalledWith('trash');
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it('hides the trash count when empty', () => {
    render(
      <SidebarNavigation
        activeTab="trash"
        isOpen={false}
        trashCount={0}
        onTabChange={vi.fn()}
        onLock={vi.fn()}
      />,
    );

    expect(screen.queryByText('0')).toBeNull();
  });
});
