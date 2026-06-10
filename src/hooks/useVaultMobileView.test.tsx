/**
 * @vitest-environment jsdom
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useVaultMobileView } from './useVaultMobileView';

afterEach(() => {
  cleanup();
});

describe('useVaultMobileView', () => {
  it('starts on the list view', () => {
    const { result } = renderHook(() => useVaultMobileView({ setSelectedItem: vi.fn() }));

    expect(result.current.mobileActiveView).toBe('list');
  });

  it('selects the dashboard by clearing item selection and opening detail view', () => {
    const setSelectedItem = vi.fn();
    const { result } = renderHook(() => useVaultMobileView({ setSelectedItem }));

    act(() => result.current.selectDashboard());

    expect(setSelectedItem).toHaveBeenCalledWith(null);
    expect(result.current.mobileActiveView).toBe('detail');
  });

  it('returns to the list view', () => {
    const { result } = renderHook(() => useVaultMobileView({ setSelectedItem: vi.fn() }));

    act(() => result.current.setMobileActiveView('detail'));
    act(() => result.current.backToList());

    expect(result.current.mobileActiveView).toBe('list');
  });

  it('keeps the direct setter available for item selection flows', () => {
    const { result } = renderHook(() => useVaultMobileView({ setSelectedItem: vi.fn() }));

    act(() => result.current.setMobileActiveView('detail'));

    expect(result.current.mobileActiveView).toBe('detail');
  });
});
