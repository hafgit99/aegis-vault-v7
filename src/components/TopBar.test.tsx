/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import TopBar from './TopBar';

afterEach(() => {
  cleanup();
});

describe('TopBar', () => {
  it('renders vault search and forwards actions', () => {
    const onSearchChange = vi.fn();
    const onOpenSidebar = vi.fn();
    const onRefresh = vi.fn();
    const onOpenVaultStatus = vi.fn();
    const onOpenProfile = vi.fn();

    render(
      <TopBar
        activeTab="vault"
        searchQuery="mail"
        profileName="Hafız"
        profileAvatar="linear-gradient(135deg, #10b981 0%, #059669 100%)"
        onSearchChange={onSearchChange}
        onOpenSidebar={onOpenSidebar}
        onRefresh={onRefresh}
        onOpenVaultStatus={onOpenVaultStatus}
        onOpenProfile={onOpenProfile}
      />,
    );

    fireEvent.click(screen.getByTitle('Menüyü Aç'));
    fireEvent.change(screen.getByPlaceholderText('Vault içinde ara...'), { target: { value: 'github' } });
    fireEvent.click(screen.getByTitle('Yenile'));
    fireEvent.click(screen.getByTitle('Bildirimler'));
    fireEvent.click(screen.getByTitle('Hafız - Profili Düzenle'));

    expect(onOpenSidebar).toHaveBeenCalledTimes(1);
    expect(onSearchChange).toHaveBeenCalledWith('github');
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onOpenVaultStatus).toHaveBeenCalledTimes(1);
    expect(onOpenProfile).toHaveBeenCalledTimes(1);
  });

  it('hides search outside the vault tab and renders image avatars', () => {
    render(
      <TopBar
        activeTab="settings"
        searchQuery=""
        profileName="Ada"
        profileAvatar="https://example.com/avatar.png"
        onSearchChange={vi.fn()}
        onOpenSidebar={vi.fn()}
        onRefresh={vi.fn()}
        onOpenVaultStatus={vi.fn()}
        onOpenProfile={vi.fn()}
      />,
    );

    expect(screen.queryByPlaceholderText('Vault içinde ara...')).toBeNull();
    expect(screen.getByAltText('AegisUser Profile')).toBeTruthy();
  });
});
