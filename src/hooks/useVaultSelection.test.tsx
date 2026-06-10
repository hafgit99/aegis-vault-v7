// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VaultItem } from '../types';
import { useVaultSelection } from './useVaultSelection';

const selectedItem: VaultItem = {
  id: '1',
  title: 'GitHub',
  username: 'octo@example.com',
  password: 'secret',
  url: 'github.com',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  category: 'login',
};

describe('useVaultSelection', () => {
  it('selects an item and resets sensitive UI state', () => {
    const setSelectedItem = vi.fn();
    const resetReveals = vi.fn();
    const clearCopiedField = vi.fn();
    const setActiveTab = vi.fn();
    const setMobileActiveView = vi.fn();

    const { result } = renderHook(() =>
      useVaultSelection({
        setSelectedItem,
        resetReveals,
        clearCopiedField,
        setActiveTab,
        setMobileActiveView,
      }),
    );

    act(() => {
      result.current.selectItem(selectedItem);
    });

    expect(setSelectedItem).toHaveBeenCalledWith(selectedItem);
    expect(resetReveals).toHaveBeenCalledOnce();
    expect(clearCopiedField).toHaveBeenCalledOnce();
    expect(setMobileActiveView).toHaveBeenCalledWith('detail');
    expect(setActiveTab).not.toHaveBeenCalled();
  });

  it('selects audit items and returns to the vault tab', () => {
    const setSelectedItem = vi.fn();
    const resetReveals = vi.fn();
    const clearCopiedField = vi.fn();
    const setActiveTab = vi.fn();
    const setMobileActiveView = vi.fn();

    const { result } = renderHook(() =>
      useVaultSelection({
        setSelectedItem,
        resetReveals,
        clearCopiedField,
        setActiveTab,
        setMobileActiveView,
      }),
    );

    act(() => {
      result.current.selectAuditItem(selectedItem);
    });

    expect(setSelectedItem).toHaveBeenCalledWith(selectedItem);
    expect(setMobileActiveView).toHaveBeenCalledWith('detail');
    expect(setActiveTab).toHaveBeenCalledWith('vault');
  });
});
