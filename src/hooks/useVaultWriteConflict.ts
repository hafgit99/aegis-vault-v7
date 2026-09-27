import { useCallback, useEffect, useRef, useState } from 'react';

import { useLanguage } from '../i18n/LanguageContext';
import { getDurableVaultVersion, subscribeVaultCommits } from '../lib/vaultWriteCoordination';
import type { VaultWriteConflictState } from './useVaultData';
import type { AppNotification } from '../types';

interface UseVaultWriteConflictProps {
  unlocked: boolean;
  onNotify: (notification: AppNotification) => void;
  /** Y-15: a write that `useVaultData` refused because this tab is behind. */
  writeConflict: VaultWriteConflictState | null;
}

/**
 * Y-15: surfaces the two consequences of cross-tab write coordination.
 *
 * 1. **A commit in another tab.** A `BroadcastChannel` message tells this tab
 *    that a newer version exists, so its in-memory list is stale. The honest
 *    response is to refresh, not to keep showing a vault that no longer matches
 *    the one on disk.
 *
 * 2. **A refused write.** `assertFreshWriteBaseline` throws
 *    `VaultWriteConflictError` instead of clobbering the other tab's work. That
 *    error has to reach the user as an explanation; surfacing it as a generic
 *    failure would look like the save simply failed, which is not what happened.
 */
export function useVaultWriteConflict({
  unlocked,
  onNotify,
  writeConflict,
}: UseVaultWriteConflictProps) {
  const { t } = useLanguage();
  const [staleSince, setStaleSince] = useState<number | null>(null);
  const staleSinceRef = useRef<number | null>(null);
  /**
   * The last version this tab was told about, whether or not the banner is
   * currently showing.
   *
   * A version must only ever be raised once. Without this, dismissing the
   * banner would immediately re-raise it, because the triggering
   * `writeConflict` prop is still set — the dismiss button would do nothing.
   */
  const raisedVersionRef = useRef<number | null>(null);

  const markStale = useCallback((versionCounter: number) => {
    if (raisedVersionRef.current === versionCounter) return;
    raisedVersionRef.current = versionCounter;
    staleSinceRef.current = versionCounter;
    setStaleSince(versionCounter);
  }, []);

  const clearStale = useCallback(() => {
    staleSinceRef.current = null;
    setStaleSince(null);
  }, []);

  // 1. Another tab committed: this tab's view is behind.
  useEffect(() => {
    if (!unlocked) return undefined;
    return subscribeVaultCommits((versionCounter) => {
      markStale(versionCounter);
    });
  }, [unlocked, markStale]);

  // 2. A refused write is the strongest possible staleness signal, and the one
  //    the user caused, so it is reported immediately rather than waiting for a
  //    broadcast we may never receive.
  useEffect(() => {
    if (!unlocked || !writeConflict) return;
    markStale(writeConflict.currentVersion);
  }, [unlocked, writeConflict, markStale]);

  // 3. Surface it once per version. A repeating toast per event would be noise,
  //    and the caller may pass a fresh `onNotify` identity on every render, so
  //    the guard cannot rely on the effect only running when the version changes.
  const notifiedVersionRef = useRef<number | null>(null);
  useEffect(() => {
    if (!unlocked || staleSince === null) return;
    if (notifiedVersionRef.current === staleSince) return;
    notifiedVersionRef.current = staleSince;

    onNotify({
      title: t('vault.writeConflict.title'),
      message: t('vault.writeConflict.desc'),
      type: 'warning',
    });
  }, [unlocked, staleSince, onNotify, t]);

  return {
    isVaultStale: staleSince !== null,
    durableVersion: staleSince === null ? null : getDurableVaultVersion(),
    /**
     * Hides the banner. The triggering conflict stays acknowledged, so this
     * does not immediately reappear; only a *newer* version raises it again.
     */
    clearStale,
  };
}
