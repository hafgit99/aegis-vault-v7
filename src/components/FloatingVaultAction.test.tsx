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
  it('renders and forwards new item action', () => {
    const onNewItem = vi.fn();

    render(<FloatingVaultAction onNewItem={onNewItem} />);

    fireEvent.click(screen.getByTestId('floating-new-vault-item-button'));

    expect(onNewItem).toHaveBeenCalledTimes(1);
  });

  it('keeps the action available without navigation context', () => {
    render(<FloatingVaultAction onNewItem={vi.fn()} />);

    expect(screen.getByTestId('floating-new-vault-item-button')).toBeTruthy();
  });

  it('uses the selected language for the accessible title', () => {
    window.localStorage.setItem(languageStorageKey, 'en');

    render(
      <LanguageProvider>
        <FloatingVaultAction onNewItem={vi.fn()} />
      </LanguageProvider>,
    );

    expect(screen.getByTitle('Add New Password')).toBeTruthy();
  });
});
