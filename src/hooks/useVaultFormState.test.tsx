/**
 * @vitest-environment jsdom
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { VaultItem } from '../types';
import { useVaultFormState } from './useVaultFormState';

const item = (id: string): VaultItem => ({
  id,
  title: id,
  username: `${id}@example.com`,
  password: `${id}-secret`,
  url: `https://${id}.example.com`,
  createdAt: '2026-06-10T12:00:00.000Z',
  updatedAt: '2026-06-10T12:00:00.000Z',
  category: 'login',
});

afterEach(() => {
  cleanup();
});

describe('useVaultFormState', () => {
  it('starts closed with no editing item', () => {
    const { result } = renderHook(() => useVaultFormState());

    expect(result.current.isVaultFormOpen).toBe(false);
    expect(result.current.editingItem).toBeNull();
  });

  it('opens a blank form for new items', () => {
    const { result } = renderHook(() => useVaultFormState());

    act(() => result.current.openEditItemForm(item('mail')));
    act(() => result.current.openNewItemForm());

    expect(result.current.isVaultFormOpen).toBe(true);
    expect(result.current.editingItem).toBeNull();
  });

  it('opens an edit form when an item is selected', () => {
    const selected = item('github');
    const { result } = renderHook(() => useVaultFormState());

    act(() => result.current.openEditItemForm(selected));

    expect(result.current.isVaultFormOpen).toBe(true);
    expect(result.current.editingItem).toEqual(selected);
  });

  it('ignores edit requests without a selected item', () => {
    const { result } = renderHook(() => useVaultFormState());

    act(() => result.current.openEditItemForm(null));

    expect(result.current.isVaultFormOpen).toBe(false);
    expect(result.current.editingItem).toBeNull();
  });

  it('closes the form without clearing the edit context', () => {
    const selected = item('github');
    const { result } = renderHook(() => useVaultFormState());

    act(() => result.current.openEditItemForm(selected));
    act(() => result.current.closeVaultForm());

    expect(result.current.isVaultFormOpen).toBe(false);
    expect(result.current.editingItem).toEqual(selected);
  });

  it('handles prefill with explicit values and fallbacks', () => {
    const { result } = renderHook(() => useVaultFormState());

    // Explicit values
    act(() => result.current.openNewItemForm({
      title: 'Prefill Title',
      username: 'prefill_user',
      password: 'prefill_pass',
      url: 'https://example.com',
      category: 'card',
    }));

    expect(result.current.isVaultFormOpen).toBe(true);
    expect(result.current.editingItem).toMatchObject({
      title: 'Prefill Title',
      username: 'prefill_user',
      password: 'prefill_pass',
      url: 'https://example.com',
      category: 'card',
    });

    // Empty prefill object
    act(() => result.current.openNewItemForm({}));
    expect(result.current.editingItem).toMatchObject({
      title: '',
      username: '',
      password: '',
      url: '',
      category: 'login',
    });
  });
});
