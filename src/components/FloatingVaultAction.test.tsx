/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import FloatingVaultAction from './FloatingVaultAction';

afterEach(() => {
  cleanup();
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

    fireEvent.click(screen.getByTitle('Yeni Şifre Ekle'));

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

    expect(screen.queryByTitle('Yeni Şifre Ekle')).toBeNull();
  });

  it('hides when the mobile detail view is open', () => {
    render(
      <FloatingVaultAction
        activeTab="vault"
        isDetailOpenOnMobile={true}
        onNewItem={vi.fn()}
      />,
    );

    expect(screen.queryByTitle('Yeni Şifre Ekle')).toBeNull();
  });
});
