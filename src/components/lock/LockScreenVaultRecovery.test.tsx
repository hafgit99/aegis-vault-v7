/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getVaultSnapshots = vi.hoisted(() => vi.fn(async () => [] as any[]));
const rebuildVaultFromSnapshot = vi.hoisted(() => vi.fn(async () => ({
  restoredItems: 0,
  restoredAttachments: 0,
  skippedSnapshots: 0,
})));
const recordFailedUnlockAttempt = vi.hoisted(() => vi.fn(() => ({ lockedUntil: 0, delayMs: 0 })));
const getUnlockAttemptLockoutDelayMs = vi.hoisted(() => vi.fn(() => 0));

vi.mock('../../lib/snapshots', () => ({ getVaultSnapshots }));
vi.mock('../../lib/storage', () => ({ rebuildVaultFromSnapshot }));
vi.mock('../../lib/vaultSession', () => ({
  recordFailedUnlockAttempt,
  getUnlockAttemptLockoutDelayMs,
}));

import { LockScreenVaultRecovery } from './LockScreenVaultRecovery';

const snapshot = (overrides: Record<string, unknown> = {}) => ({
  id: 'snap-1',
  createdAt: '2026-09-26T10:00:00.000Z',
  trigger: 'auto',
  encryptedPayload: 'payload',
  ...overrides,
});

function renderPanel(props: Partial<React.ComponentProps<typeof LockScreenVaultRecovery>> = {}) {
  const onRestored = vi.fn();
  const onDismiss = vi.fn();
  const onResetVault = vi.fn();
  render(
    <LockScreenVaultRecovery
      masterPassword="correct horse"
      onRestored={onRestored}
      onDismiss={onDismiss}
      onResetVault={onResetVault}
      {...props}
    />,
  );
  return { onRestored, onDismiss, onResetVault };
}

describe('LockScreenVaultRecovery (K-4)', () => {
  beforeEach(() => {
    getVaultSnapshots.mockReset();
    getVaultSnapshots.mockResolvedValue([]);
    rebuildVaultFromSnapshot.mockReset();
    rebuildVaultFromSnapshot.mockResolvedValue({ restoredItems: 3, restoredAttachments: 1, skippedSnapshots: 0 });
    recordFailedUnlockAttempt.mockReset();
    recordFailedUnlockAttempt.mockReturnValue({ lockedUntil: 0, delayMs: 0 });
    getUnlockAttemptLockoutDelayMs.mockReset();
    getUnlockAttemptLockoutDelayMs.mockReturnValue(0);
  });

  afterEach(() => {
    cleanup();
  });

  it('lists available snapshots and preselects the newest', async () => {
    getVaultSnapshots.mockResolvedValue([
      snapshot({ id: 'older', createdAt: '2026-09-25T10:00:00.000Z' }),
      snapshot({ id: 'newer', createdAt: '2026-09-26T10:00:00.000Z' }),
    ]);

    renderPanel();

    await waitFor(() => screen.getByTestId('vault-recovery-list'));
    expect(screen.getByTestId('vault-recovery-option-older')).toBeTruthy();
    expect(screen.getByTestId('vault-recovery-option-newer')).toBeTruthy();
    expect(screen.getByTestId('vault-recovery-option-newer').getAttribute('aria-pressed')).toBe('true');
  });

  it('rebuilds from the selected snapshot and reports success', async () => {
    getVaultSnapshots.mockResolvedValue([snapshot({ id: 'snap-1' })]);

    const { onRestored } = renderPanel();
    await waitFor(() => screen.getByTestId('vault-recovery-restore'));

    fireEvent.click(screen.getByTestId('vault-recovery-restore'));
    fireEvent.click(screen.getByTestId('vault-recovery-confirm'));

    await waitFor(() => expect(onRestored).toHaveBeenCalledTimes(1));
    expect(rebuildVaultFromSnapshot).toHaveBeenCalledWith('snap-1', 'correct horse');
  });

  it('requires an explicit confirmation before destroying the damaged vault', async () => {
    getVaultSnapshots.mockResolvedValue([snapshot()]);

    renderPanel();
    await waitFor(() => screen.getByTestId('vault-recovery-restore'));

    fireEvent.click(screen.getByTestId('vault-recovery-restore'));
    expect(rebuildVaultFromSnapshot).not.toHaveBeenCalled();
    expect(screen.getByTestId('vault-recovery-confirm')).toBeTruthy();

    // Backing out must not touch anything.
    fireEvent.click(screen.getByTestId('vault-recovery-cancel'));
    expect(rebuildVaultFromSnapshot).not.toHaveBeenCalled();
    expect(screen.getByTestId('vault-recovery-restore')).toBeTruthy();
  });

  it('refuses to start without a master password and never calls the rebuild', async () => {
    getVaultSnapshots.mockResolvedValue([snapshot()]);

    renderPanel({ masterPassword: '' });
    await waitFor(() => screen.getByTestId('vault-recovery-restore'));

    fireEvent.click(screen.getByTestId('vault-recovery-restore'));
    fireEvent.click(screen.getByTestId('vault-recovery-confirm'));

    await waitFor(() => expect(screen.getByTestId('vault-recovery-error')).toBeTruthy());
    expect(rebuildVaultFromSnapshot).not.toHaveBeenCalled();
  });

  it('counts a rejected password against the shared lockout', async () => {
    // A wrong password here is still a wrong password; it must not be free to
    // retry, otherwise the snapshot list becomes a password oracle.
    getVaultSnapshots.mockResolvedValue([snapshot()]);
    rebuildVaultFromSnapshot.mockRejectedValue(new Error('snapshot-password-mismatch'));
    getUnlockAttemptLockoutDelayMs.mockReturnValue(60_000);

    const { onDismiss, onRestored } = renderPanel();
    await waitFor(() => screen.getByTestId('vault-recovery-restore'));

    fireEvent.click(screen.getByTestId('vault-recovery-restore'));
    fireEvent.click(screen.getByTestId('vault-recovery-confirm'));

    await waitFor(() => expect(recordFailedUnlockAttempt).toHaveBeenCalledTimes(1));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onRestored).not.toHaveBeenCalled();
  });

  it('keeps the panel open when the failure is not a password problem', async () => {
    getVaultSnapshots.mockResolvedValue([snapshot()]);
    rebuildVaultFromSnapshot.mockRejectedValue(new Error('snapshot-unreadable'));

    const { onDismiss, onRestored } = renderPanel();
    await waitFor(() => screen.getByTestId('vault-recovery-restore'));

    fireEvent.click(screen.getByTestId('vault-recovery-restore'));
    fireEvent.click(screen.getByTestId('vault-recovery-confirm'));

    await waitFor(() => expect(screen.getByTestId('vault-recovery-error')).toBeTruthy());
    expect(recordFailedUnlockAttempt).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
    expect(onRestored).not.toHaveBeenCalled();
  });

  it('offers a reset only when there is genuinely nothing to restore from', async () => {
    getVaultSnapshots.mockResolvedValue([]);

    const { onResetVault } = renderPanel();
    await waitFor(() => screen.getByTestId('vault-recovery-reset'));

    expect(screen.queryByTestId('vault-recovery-restore')).toBeNull();
    fireEvent.click(screen.getByTestId('vault-recovery-reset'));
    expect(onResetVault).toHaveBeenCalledTimes(1);
  });

  it('reports a listing failure instead of pretending there are no snapshots', async () => {
    getVaultSnapshots.mockRejectedValue(new Error('idb unavailable'));

    renderPanel();
    await waitFor(() => expect(screen.getByTestId('vault-recovery-panel')).toBeTruthy());

    // A failed listing must not silently become "no backups exist", which would
    // push the user toward a destructive reset they did not need.
    expect(screen.queryByTestId('vault-recovery-reset')).toBeNull();
    expect(screen.getByTestId('vault-recovery-list-error')).toBeTruthy();
  });

  it('can be dismissed without taking any action', async () => {
    getVaultSnapshots.mockResolvedValue([snapshot()]);

    const { onDismiss } = renderPanel();
    await waitFor(() => screen.getByTestId('vault-recovery-close'));

    fireEvent.click(screen.getByTestId('vault-recovery-close'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(rebuildVaultFromSnapshot).not.toHaveBeenCalled();
  });
});
