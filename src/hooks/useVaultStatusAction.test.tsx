/**
 * @vitest-environment jsdom
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useVaultStatusAction } from './useVaultStatusAction';

afterEach(() => {
  cleanup();
});

describe('useVaultStatusAction', () => {
  it('opens a success alert for the current vault status', () => {
    const openConfirm = vi.fn();
    const { result } = renderHook(() => useVaultStatusAction({ openConfirm }));

    act(() => result.current.openVaultStatus());

    expect(openConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Kasa Durumu',
        type: 'success',
        isAlert: true,
      }),
    );
  });
});
