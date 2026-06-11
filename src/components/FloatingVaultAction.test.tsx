/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';
import FloatingVaultAction from './FloatingVaultAction';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('FloatingVaultAction', () => {
  it('renders and forwards new item action in the vault tab', () => {
    const onNewItem = vi.fn();

    render(
      <FloatingVaultAction
        activeTab="vault"
        isDetailOpenOnMobile={false}
        onNewItem={onNewItem}
      />,
    );

    fireEvent.click(screen.getByTestId('floating-new-vault-item-button'));

    expect(onNewItem).toHaveBeenCalledTimes(1);
  });

  it('hides outside the vault tab', () => {
    render(
      <FloatingVaultAction
        activeTab="settings"
        isDetailOpenOnMobile={false}
        onNewItem={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('floating-new-vault-item-button')).toBeNull();
  });

  it('hides when the mobile detail view is open', () => {
    render(
      <FloatingVaultAction
        activeTab="vault"
        isDetailOpenOnMobile={true}
        onNewItem={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('floating-new-vault-item-button')).toBeNull();
  });

  it('uses the selected language for the accessible title', () => {
    window.localStorage.setItem(languageStorageKey, 'en');

    render(
      <LanguageProvider>
        <FloatingVaultAction
          activeTab="vault"
          isDetailOpenOnMobile={false}
          onNewItem={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(screen.getByTitle('Add New Password')).toBeTruthy();
  });
});
