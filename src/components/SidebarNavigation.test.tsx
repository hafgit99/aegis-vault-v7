/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { APP_NAME } from '../lib/branding';
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

    expect(screen.getByText(APP_NAME)).toBeTruthy();
    expect(screen.getByTestId('nav-vault-button')).toBeTruthy();
    expect(screen.getByTestId('nav-audit-button')).toBeTruthy();
    expect(screen.getByTestId('nav-generator-button')).toBeTruthy();
    expect(screen.getByTestId('nav-settings-button')).toBeTruthy();
    expect(screen.getByTestId('nav-trash-button')).toBeTruthy();
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

    fireEvent.click(screen.getByTestId('nav-vault-button'));
    fireEvent.click(screen.getByTestId('nav-audit-button'));
    fireEvent.click(screen.getByTestId('nav-generator-button'));
    fireEvent.click(screen.getByTestId('nav-settings-button'));
    fireEvent.click(screen.getByTestId('nav-trash-button'));
    fireEvent.click(screen.getByTestId('lock-vault-button'));

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
