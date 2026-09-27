/**
 * @vitest-environment jsdom
 */

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useVaultFallbackMirrorStaleAlert } from './useVaultFallbackMirrorStaleAlert';
import { consumeVaultFallbackMirrorStale } from '../lib/sqliteOpfsPersistence';
import type { AppNotification } from '../types';

vi.mock('../lib/sqliteOpfsPersistence', () => ({
  consumeVaultFallbackMirrorStale: vi.fn(() => false),
}));

const notifications: AppNotification[] = [];
const onNotify = (notification: AppNotification) => {
  notifications.push(notification);
};

describe('useVaultFallbackMirrorStaleAlert', () => {
  beforeEach(() => {
    notifications.length = 0;
    vi.clearAllMocks();
    vi.mocked(consumeVaultFallbackMirrorStale).mockReturnValue(false);
  });

  it('does not notify while the vault stays locked', () => {
    // A stale mirror is only worth interrupting for once the user is in. Not
    // consuming the flag here is deliberate: it must still be there on unlock.
    vi.mocked(consumeVaultFallbackMirrorStale).mockReturnValue(true);

    renderHook(() => useVaultFallbackMirrorStaleAlert({ unlocked: false, onNotify }));

    expect(notifications).toHaveLength(0);
    expect(consumeVaultFallbackMirrorStale).not.toHaveBeenCalled();
  });

  it('does not notify when the mirror is current', () => {
    vi.mocked(consumeVaultFallbackMirrorStale).mockReturnValue(false);

    renderHook(() => useVaultFallbackMirrorStaleAlert({ unlocked: true, onNotify }));

    expect(notifications).toHaveLength(0);
  });

  it('warns as a danger notification when the mirror is behind', () => {
    vi.mocked(consumeVaultFallbackMirrorStale).mockReturnValue(true);

    renderHook(() => useVaultFallbackMirrorStaleAlert({ unlocked: true, onNotify }));

    expect(notifications).toHaveLength(1);
    const notification = notifications[0]!;
    expect(notification.type).toBe('danger');
    // The message has to say what the user can do about it, or the warning is
    // just anxiety.
    expect(notification.message.length).toBeGreaterThan(0);
  });
});
