/**
 * @vitest-environment jsdom
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useConfirmModal } from './useConfirmModal';

afterEach(() => {
  cleanup();
});

describe('useConfirmModal', () => {
  it('starts closed with an inert info config', () => {
    const { result } = renderHook(() => useConfirmModal());

    expect(result.current.confirmConfig.isOpen).toBe(false);
    expect(result.current.confirmConfig.type).toBe('info');
  });

  it('opens confirm dialogs with the provided action', () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useConfirmModal());

    act(() =>
      result.current.openConfirm({
        title: 'Delete item',
        message: 'Are you sure?',
        type: 'danger',
        confirmText: 'Delete',
        cancelText: 'Cancel',
        onConfirm,
      }),
    );

    expect(result.current.confirmConfig).toMatchObject({
      isOpen: true,
      title: 'Delete item',
      message: 'Are you sure?',
      type: 'danger',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });

    act(() => result.current.confirmConfig.onConfirm());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('opens alert-style notifications', () => {
    const { result } = renderHook(() => useConfirmModal());

    act(() =>
      result.current.showNotification({
        title: 'Saved',
        message: 'Done',
        type: 'success',
      }),
    );

    expect(result.current.confirmConfig).toMatchObject({
      isOpen: true,
      title: 'Saved',
      message: 'Done',
      type: 'success',
      isAlert: true,
    });
  });

  it('closes the active confirm config', () => {
    const { result } = renderHook(() => useConfirmModal());

    act(() =>
      result.current.showNotification({
        title: 'Heads up',
        message: 'Check this',
      }),
    );
    act(() => result.current.closeConfirm());

    expect(result.current.confirmConfig.isOpen).toBe(false);
    expect(result.current.confirmConfig.title).toBe('Heads up');
  });
});
