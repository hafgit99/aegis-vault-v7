/**
 * @vitest-environment jsdom
 */

import { cleanup, renderHook, waitFor, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { decryptShareUrl } from '../lib/share';
import { LanguageProvider } from '../i18n/LanguageContext';
import { useShareReceive } from './useShareReceive';
import type { ReactNode } from 'react';
import type { VaultItem } from '../types';

const receivedPayload = {
  title: 'Shared Login',
  username: 'shared@example.com',
  password: 'shared-secret',
  url: 'https://shared.example.com',
  category: 'login' as const,
  expiresAt: 9999999999999,
};

vi.mock('../lib/share', () => ({
  decryptShareUrl: vi.fn(),
}));

function wrapper({ children }: { children: ReactNode }) {
  return <LanguageProvider>{children}</LanguageProvider>;
}

beforeEach(() => {
  vi.mocked(decryptShareUrl).mockResolvedValue(receivedPayload);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useShareReceive', () => {
  it('opens the share modal for an item', () => {
    const item = { id: 'a' } as VaultItem;
    const { result } = renderHook(() => useShareReceive({ onSaveItem: vi.fn() }), { wrapper });

    act(() => {
      result.current.openShare(item);
    });

    expect(result.current.isShareOpen).toBe(true);
    expect(result.current.sharingItem).toBe(item);
  });

  it('closes the share modal and clears the shared item', () => {
    const { result } = renderHook(() => useShareReceive({ onSaveItem: vi.fn() }), { wrapper });

    act(() => {
      result.current.openShare({ id: 'a' } as VaultItem);
    });
    act(() => {
      result.current.closeShare();
    });

    expect(result.current.isShareOpen).toBe(false);
    expect(result.current.sharingItem).toBeNull();
  });

  it('opens the receive password prompt when a #share= hash is present and decrypts on password submit', async () => {
    window.location.hash = '#share=valid-token&s=salt';
    const { result } = renderHook(() => useShareReceive({ onSaveItem: vi.fn() }), { wrapper });

    await waitFor(() => {
      expect(result.current.isSharePasswordPromptOpen).toBe(true);
    });

    await act(async () => {
      await result.current.submitSharePassword('correct-password');
    });

    expect(decryptShareUrl).toHaveBeenCalledWith('#share=valid-token&s=salt', 'correct-password');
    expect(result.current.isReceiveOpen).toBe(true);
  });

  it('imports a received payload as a new vault item', async () => {
    const onSaveItem = vi.fn();
    const onNotify = vi.fn();
    const { result } = renderHook(
      () => useShareReceive({ onSaveItem, onNotify }),
      { wrapper },
    );

    await act(async () => {
      await result.current.importShare(receivedPayload);
    });

    expect(onSaveItem).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Shared Login',
        username: 'shared@example.com',
        category: 'login',
      }),
    );
    expect(onNotify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' }),
    );
  });

  it('notifies failure when saving a shared item throws', async () => {
    const onSaveItem = vi.fn().mockRejectedValueOnce(new Error('save failed'));
    const onNotify = vi.fn();
    const { result } = renderHook(
      () => useShareReceive({ onSaveItem, onNotify }),
      { wrapper },
    );

    await act(async () => {
      await result.current.importShare(receivedPayload);
    });

    expect(onNotify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'danger' }),
    );
  });
});
