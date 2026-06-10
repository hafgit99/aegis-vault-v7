/**
 * @vitest-environment jsdom
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useAppNavigation } from './useAppNavigation';

afterEach(() => {
  cleanup();
});

describe('useAppNavigation', () => {
  it('starts on the vault tab with the sidebar closed', () => {
    const { result } = renderHook(() => useAppNavigation());

    expect(result.current.activeTab).toBe('vault');
    expect(result.current.isSidebarOpen).toBe(false);
  });

  it('opens and closes the sidebar', () => {
    const { result } = renderHook(() => useAppNavigation());

    act(() => result.current.openSidebar());
    expect(result.current.isSidebarOpen).toBe(true);

    act(() => result.current.closeSidebar());
    expect(result.current.isSidebarOpen).toBe(false);
  });

  it('changes tabs and closes the sidebar', () => {
    const { result } = renderHook(() => useAppNavigation());

    act(() => result.current.openSidebar());
    act(() => result.current.changeTab('settings'));

    expect(result.current.activeTab).toBe('settings');
    expect(result.current.isSidebarOpen).toBe(false);
  });

  it('opens shortcut tabs', () => {
    const { result } = renderHook(() => useAppNavigation());

    act(() => result.current.openAuditTab());
    expect(result.current.activeTab).toBe('audit');

    act(() => result.current.openGeneratorTab());
    expect(result.current.activeTab).toBe('generator');
  });

  it('keeps direct tab setter available for selection flows', () => {
    const { result } = renderHook(() => useAppNavigation());

    act(() => result.current.setActiveTab('trash'));

    expect(result.current.activeTab).toBe('trash');
  });
});
