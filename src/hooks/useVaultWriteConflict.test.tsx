/**
 * @vitest-environment jsdom
 */

import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VaultItem } from '../types';
import { getVaultItems, purgeExpiredTrashItems, saveVaultItem, saveVaultItems } from '../lib/storage';
import { VaultWriteConflictError } from '../lib/vaultWriteCoordination';
import { VaultStaleBanner } from '../components/VaultStaleBanner';
import { useVaultWriteConflict } from './useVaultWriteConflict';
import { useVaultData } from './useVaultData';

vi.mock('../lib/storage', () => ({
  getVaultItems: vi.fn(),
  purgeExpiredTrashItems: vi.fn(),
  saveVaultItem: vi.fn(),
  saveVaultItems: vi.fn(),
}));

const hasActiveMasterPassword = vi.hoisted(() => vi.fn(() => true));

vi.mock('../lib/vaultSession', () => ({
  hasActiveMasterPassword,
}));

/**
 * Stands in for `BroadcastChannel`, which jsdom does not implement.
 *
 * The real `subscribeVaultCommits` is used unmodified — this only provides the
 * transport, so the test exercises the actual wiring rather than a mock of it.
 */
class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  private listeners = new Set<(event: MessageEvent) => void>();

  constructor(public readonly name: string) {
    FakeBroadcastChannel.instances.push(this);
  }

  addEventListener(_type: 'message', listener: (event: MessageEvent) => void) {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'message', listener: (event: MessageEvent) => void) {
    this.listeners.delete(listener);
  }

  postMessage(data: unknown) {
    for (const peer of FakeBroadcastChannel.instances) {
      if (peer === this || peer.name !== this.name) continue;
      for (const listener of peer.listeners) {
        listener({ data } as MessageEvent);
      }
    }
  }

  close() {
    this.listeners.clear();
    FakeBroadcastChannel.instances = FakeBroadcastChannel.instances.filter((c) => c !== this);
  }
}

/** Emits a commit as if another tab had saved. */
function emitCommitFromAnotherTab(versionCounter: number) {
  new FakeBroadcastChannel('KalderaShield-vault').postMessage({ type: 'commit', versionCounter });
}

const translations: Record<string, string> = {
  'vault.writeConflict.title': 'Vault updated in another tab',
  'vault.writeConflict.desc': 'Your change was not saved.',
  'vault.writeConflict.banner': 'This tab is showing an outdated vault.',
  'vault.writeConflict.refreshNow': 'Reload now',
  'common.close': 'Close',
};

vi.mock('../i18n/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => translations[key] ?? key }),
}));

const item = (id: string, overrides: Partial<VaultItem> = {}): VaultItem => ({
  id,
  title: id,
  username: `${id}@example.com`,
  password: `${id}-secret`,
  url: `https://${id}.example.com`,
  createdAt: '2026-06-10T12:00:00.000Z',
  updatedAt: '2026-06-10T12:00:00.000Z',
  category: 'login',
  ...overrides,
});

function conflictError() {
  return new VaultWriteConflictError('vault-write-stale-baseline', 10, 12);
}

beforeEach(() => {
  hasActiveMasterPassword.mockReturnValue(true);
  FakeBroadcastChannel.instances = [];
  (globalThis as unknown as { BroadcastChannel: unknown }).BroadcastChannel = FakeBroadcastChannel;
  vi.mocked(purgeExpiredTrashItems).mockImplementation(
    async () => ({ items: await vi.mocked(getVaultItems)(), purgedCount: 0 }),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useVaultData write conflicts (Y-15)', () => {
  it('records a refused write instead of throwing it at the caller', async () => {
    vi.mocked(getVaultItems).mockResolvedValue([item('mail')]);
    vi.mocked(saveVaultItem).mockRejectedValue(conflictError());
    const { result } = renderHook(() => useVaultData());

    await act(async () => {
      await result.current.refreshDatabase();
    });

    await act(async () => {
      await result.current.saveItem(item('mail'));
    });

    // The user must be able to distinguish "refused because another tab is
    // ahead" from "the save failed".
    expect(result.current.writeConflict).toEqual({ baselineVersion: 10, currentVersion: 12 });
  });

  it('keeps the stale list on screen when a write is refused', async () => {
    vi.mocked(getVaultItems).mockResolvedValue([item('mail'), item('other')]);
    vi.mocked(saveVaultItem).mockRejectedValue(conflictError());
    const { result } = renderHook(() => useVaultData());

    await act(async () => {
      await result.current.refreshDatabase();
    });

    await act(async () => {
      await result.current.saveItem(item('mail'));
    });

    // Replacing the list with the storage layer's failure fallback would show an
    // empty vault and look like data loss.
    expect(result.current.items).toHaveLength(2);
  });

  it('does not report a conflict for an ordinary failure', async () => {
    vi.mocked(getVaultItems).mockResolvedValue([item('mail')]);
    vi.mocked(saveVaultItem).mockRejectedValue(new Error('disk full'));
    const { result } = renderHook(() => useVaultData());

    await act(async () => {
      await result.current.refreshDatabase();
    });

    await act(async () => {
      await result.current.saveItem(item('mail')).catch(() => undefined);
    });

    expect(result.current.writeConflict).toBeNull();
  });

  it('clears the conflict once the caller has handled it', async () => {
    vi.mocked(getVaultItems).mockResolvedValue([item('mail')]);
    vi.mocked(saveVaultItem).mockRejectedValue(conflictError());
    const { result } = renderHook(() => useVaultData());

    await act(async () => {
      await result.current.refreshDatabase();
    });
    await act(async () => {
      await result.current.saveItem(item('mail'));
    });

    expect(result.current.writeConflict).not.toBeNull();

    act(() => {
      result.current.clearWriteConflict();
    });

    expect(result.current.writeConflict).toBeNull();
  });

  it('records conflicts from bulk saves and favourite toggles too', async () => {
    vi.mocked(getVaultItems).mockResolvedValue([item('mail')]);
    const { result } = renderHook(() => useVaultData());

    await act(async () => {
      await result.current.refreshDatabase();
    });

    vi.mocked(saveVaultItems).mockRejectedValue(conflictError());
    await act(async () => {
      await result.current.saveItems([item('mail')]);
    });
    expect(result.current.writeConflict?.currentVersion).toBe(12);

    act(() => {
      result.current.clearWriteConflict();
    });

    vi.mocked(saveVaultItem).mockRejectedValue(conflictError());
    await act(async () => {
      await result.current.toggleFavorite(item('mail'));
    });
    expect(result.current.writeConflict?.currentVersion).toBe(12);
  });
});

describe('useVaultWriteConflict (Y-15)', () => {
  it('flags the vault as stale when another tab commits', () => {
    const { result } = renderHook(() => useVaultWriteConflict({
      unlocked: true,
      onNotify: vi.fn(),
      writeConflict: null,
    }));

    expect(result.current.isVaultStale).toBe(false);

    act(() => {
      emitCommitFromAnotherTab(14);
    });

    expect(result.current.isVaultStale).toBe(true);
  });

  it('flags the vault as stale when a write was refused', () => {
    const { result } = renderHook(() => useVaultWriteConflict({
      unlocked: true,
      onNotify: vi.fn(),
      writeConflict: { baselineVersion: 10, currentVersion: 12 },
    }));

    expect(result.current.isVaultStale).toBe(true);
  });

  it('notifies the user exactly once per stale version', () => {
    const onNotify = vi.fn();
    const { rerender } = renderHook(
      ({ conflict }) => useVaultWriteConflict({
        unlocked: true,
        onNotify,
        writeConflict: conflict,
      }),
      { initialProps: { conflict: { baselineVersion: 10, currentVersion: 12 } as { baselineVersion: number; currentVersion: number } | null } },
    );

    expect(onNotify).toHaveBeenCalledTimes(1);
    expect(onNotify).toHaveBeenCalledWith(expect.objectContaining({ type: 'warning' }));

    // A re-render with the same conflict must not produce a second toast.
    rerender({ conflict: { baselineVersion: 10, currentVersion: 12 } });
    expect(onNotify).toHaveBeenCalledTimes(1);
  });

  it('raises the banner again only for a newer version', () => {
    const { result, rerender } = renderHook(
      ({ conflict }) => useVaultWriteConflict({
        unlocked: true,
        onNotify: vi.fn(),
        writeConflict: conflict,
      }),
      { initialProps: { conflict: { baselineVersion: 10, currentVersion: 12 } as { baselineVersion: number; currentVersion: number } | null } },
    );

    expect(result.current.isVaultStale).toBe(true);

    act(() => {
      result.current.clearStale();
    });
    expect(result.current.isVaultStale).toBe(false);

    // The same conflict, still set in the parent, must not bring it back.
    rerender({ conflict: { baselineVersion: 10, currentVersion: 12 } });
    expect(result.current.isVaultStale).toBe(false);

    // A genuinely newer version is a new event and does raise it.
    rerender({ conflict: { baselineVersion: 12, currentVersion: 15 } });
    expect(result.current.isVaultStale).toBe(true);
  });

  it('stays visible until explicitly cleared, not on the conflict flag', () => {
    // Regression guard: clearing the banner as soon as the conflict flag is set
    // would hide it the instant it appeared — exactly what the user must read.
    const { result } = renderHook(() => useVaultWriteConflict({
      unlocked: true,
      onNotify: vi.fn(),
      writeConflict: { baselineVersion: 10, currentVersion: 12 },
    }));

    expect(result.current.isVaultStale).toBe(true);

    act(() => {
      result.current.clearStale();
    });

    expect(result.current.isVaultStale).toBe(false);
  });

  it('stays quiet while the vault is locked', () => {
    const onNotify = vi.fn();

    renderHook(() => useVaultWriteConflict({
      unlocked: false,
      onNotify,
      writeConflict: { baselineVersion: 10, currentVersion: 12 },
    }));

    expect(onNotify).not.toHaveBeenCalled();
    act(() => {
      emitCommitFromAnotherTab(20);
    });
    expect(onNotify).not.toHaveBeenCalled();
  });
});

describe('VaultStaleBanner (Y-15)', () => {
  it('renders nothing while the vault is current', () => {
    const { container } = render(
      <VaultStaleBanner isVisible={false} onRefresh={vi.fn()} onDismiss={vi.fn()} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('explains the situation and offers a reload', () => {
    const onRefresh = vi.fn();
    render(<VaultStaleBanner isVisible onRefresh={onRefresh} onDismiss={vi.fn()} />);

    expect(screen.getByText('This tab is showing an outdated vault.')).toBeTruthy();

    act(() => {
      screen.getByText('Reload now').click();
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('can be dismissed', () => {
    const onDismiss = vi.fn();
    render(<VaultStaleBanner isVisible onRefresh={vi.fn()} onDismiss={onDismiss} />);

    act(() => {
      screen.getByLabelText('Close').click();
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
