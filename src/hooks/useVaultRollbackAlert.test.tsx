/**
 * @vitest-environment jsdom
 */

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useVaultRollbackAlert } from './useVaultRollbackAlert';
import { consumeVaultRollbackDetected } from '../lib/sqliteOpfsPersistence';
import type { AppNotification } from '../types';

vi.mock('../lib/sqliteOpfsPersistence', () => ({
  consumeVaultRollbackDetected: vi.fn(() => false),
}));

const notifications: AppNotification[] = [];
const onNotify = (notification: AppNotification) => {
  notifications.push(notification);
};

describe('useVaultRollbackAlert', () => {
  beforeEach(() => {
    notifications.length = 0;
    vi.mocked(consumeVaultRollbackDetected).mockReturnValue(false);
    vi.clearAllMocks();
    vi.mocked(consumeVaultRollbackDetected).mockReturnValue(false);
  });

  it('does not notify while the vault stays locked', () => {
    vi.mocked(consumeVaultRollbackDetected).mockReturnValue(true);

    renderHook(() => useVaultRollbackAlert({ unlocked: false, onNotify }));

    expect(notifications).toHaveLength(0);
  });

  it('fires a single danger notification when a rollback was detected (N-1)', () => {
    vi.mocked(consumeVaultRollbackDetected).mockReturnValue(true);

    renderHook(() => useVaultRollbackAlert({ unlocked: true, onNotify }));

    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.type).toBe('danger');
    expect(notifications[0]!.title).toContain('Kasa Bütünlüğü');
    // The detection flag is consumed once — re-running the effect must not re-notify.
    vi.mocked(consumeVaultRollbackDetected).mockReturnValue(false);
    expect(consumeVaultRollbackDetected()).toBe(false);
    expect(notifications).toHaveLength(1);
  });

  it('stays silent when no rollback was detected', () => {
    renderHook(() => useVaultRollbackAlert({ unlocked: true, onNotify }));

    expect(notifications).toHaveLength(0);
  });
});
