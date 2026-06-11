/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { APP_PROFILE_ALT } from '../lib/branding';
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
        profileName="Hafiz"
        profileAvatar="linear-gradient(135deg, #10b981 0%, #059669 100%)"
        onSearchChange={onSearchChange}
        onOpenSidebar={onOpenSidebar}
        onRefresh={onRefresh}
        onOpenVaultStatus={onOpenVaultStatus}
        onOpenProfile={onOpenProfile}
      />,
    );

    fireEvent.click(screen.getByTestId('topbar-menu-button'));
    fireEvent.change(screen.getByTestId('vault-search-input'), { target: { value: 'github' } });
    fireEvent.click(screen.getByTestId('topbar-refresh-button'));
    fireEvent.click(screen.getByTestId('topbar-status-button'));
    fireEvent.click(screen.getByTestId('topbar-profile-button'));

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

    expect(screen.queryByTestId('vault-search-input')).toBeNull();
    expect(screen.getByAltText(APP_PROFILE_ALT)).toBeTruthy();
  });
});
