// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { dispatchFocusSearchShortcut, useKeyboardShortcuts } from './useKeyboardShortcuts';

function pressKey(key: string, modifier: 'ctrl' | 'meta' | null) {
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: modifier === 'ctrl',
    metaKey: modifier === 'meta',
    cancelable: true,
  });
  window.dispatchEvent(event);
  return event;
}

describe('useKeyboardShortcuts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dispatches focus-search, new-item and lock shortcuts with Ctrl', () => {
    const focusSearch = vi.fn();
    const newItem = vi.fn();
    const onLock = vi.fn();

    renderHook(() =>
      useKeyboardShortcuts({ enabled: true, onFocusSearch: focusSearch, onNewItem: newItem, onLock }),
    );

    const searchEvent = pressKey('k', 'ctrl');
    expect(searchEvent.defaultPrevented).toBe(true);
    expect(focusSearch).toHaveBeenCalledTimes(1);

    expect(pressKey('n', 'ctrl').defaultPrevented).toBe(true);
    expect(newItem).toHaveBeenCalledTimes(1);

    expect(pressKey('l', 'ctrl').defaultPrevented).toBe(true);
    expect(onLock).toHaveBeenCalledTimes(1);

    // Non-shortcut keys are ignored.
    expect(pressKey('x', 'ctrl').defaultPrevented).toBe(false);
    // Without modifier nothing fires.
    expect(pressKey('k', null).defaultPrevented).toBe(false);
    expect(focusSearch).toHaveBeenCalledTimes(1);
  });

  it('does not bind listeners while disabled', () => {
    const onLock = vi.fn();
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() =>
      useKeyboardShortcuts({ enabled: false, onFocusSearch: vi.fn(), onNewItem: vi.fn(), onLock }),
    );

    pressKey('l', 'ctrl');
    expect(onLock).not.toHaveBeenCalled();
    unmount();
    expect(removeSpy).not.toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('unsubscribes on unmount while enabled', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts({ enabled: true, onFocusSearch: vi.fn(), onNewItem: vi.fn(), onLock: vi.fn() }),
    );
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('dispatchFocusSearchShortcut emits the DOM event consumed by the search input', () => {
    const listener = vi.fn();
    window.addEventListener('aegis-focus-search', listener);
    try {
      dispatchFocusSearchShortcut();
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('aegis-focus-search', listener);
    }
  });
});
