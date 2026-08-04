/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { VaultItem } from '../types';
import {
  createSyncProvider,
  getLastSyncTime,
  hasSyncConfig,
  loadSyncConfig,
  performSync,
  saveLastSyncTime,
  SyncConflictItem,
  SyncError,
  SyncStatus,
} from '../lib/sync';
import { performAttachmentSync } from '../lib/sync/attachmentSyncEngine';

export interface UseSyncCoordinatorOptions {
  items: VaultItem[];
  masterPassword: string | null;
  onVaultMerged?: (mergedItems: VaultItem[]) => void;
  autoSyncIntervalMs?: number; // Default 5 minutes (300,000 ms)
  debounceDelayMs?: number; // Default 3 seconds (3,000 ms)
}

export interface UseSyncCoordinatorResult {
  syncStatus: SyncStatus;
  lastSyncAt: string | null;
  syncError: SyncError | null;
  conflicts: SyncConflictItem[];
  triggerSync: () => Promise<void>;
  clearSyncError: () => void;
  isConfigured: boolean;
}

export function useSyncCoordinator({
  items,
  masterPassword,
  onVaultMerged,
  autoSyncIntervalMs = 300_000,
  debounceDelayMs = 3_000,
}: UseSyncCoordinatorOptions): UseSyncCoordinatorResult {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(() => getLastSyncTime());
  const [syncError, setSyncError] = useState<SyncError | null>(null);
  const [conflicts, setConflicts] = useState<SyncConflictItem[]>([]);
  const [isConfigured, setIsConfigured] = useState<boolean>(() => hasSyncConfig());

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const isSyncingRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const executeSync = useCallback(async () => {
    if (!masterPassword || isSyncingRef.current || !hasSyncConfig()) {
      return;
    }

    isSyncingRef.current = true;
    setSyncStatus('syncing');
    setSyncError(null);

    try {
      const config = await loadSyncConfig(masterPassword);
      if (config.type === 'disabled') {
        setIsConfigured(false);
        setSyncStatus('idle');
        isSyncingRef.current = false;
        return;
      }

      setIsConfigured(true);
      const provider = createSyncProvider(config);
      if (!provider) {
        setSyncStatus('idle');
        isSyncingRef.current = false;
        return;
      }

      const result = await performSync(provider, itemsRef.current, masterPassword);

      if (result.status === 'error') {
        setSyncStatus('error');
        setSyncError(result.error ?? null);
      } else {
        const nowIso = result.syncedAt ?? new Date().toISOString();
        saveLastSyncTime(nowIso);
        setLastSyncAt(nowIso);

        if (result.status === 'conflict' && result.conflicts) {
          setSyncStatus('conflict');
          setConflicts(result.conflicts);
        } else {
          setSyncStatus('success');
          setConflicts([]);
        }

        if (result.mergedItems && onVaultMerged) {
          onVaultMerged(result.mergedItems);
        }

        // Run attachment sync in background after main vault sync
        try {
          await performAttachmentSync(provider, result.mergedItems);
        } catch (attErr) {
          console.warn('[SyncCoordinator] Attachment sync background warning:', attErr);
        }
      }

      provider.dispose?.();
    } catch (err) {
      setSyncStatus('error');
      setSyncError(err instanceof SyncError ? err : new SyncError('sync.uploadFailed' as any, String(err)));
    } finally {
      isSyncingRef.current = false;
    }
  }, [masterPassword, onVaultMerged]);

  const triggerSync = useCallback(async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    await executeSync();
  }, [executeSync]);

  const clearSyncError = useCallback(() => {
    setSyncError(null);
    setSyncStatus('idle');
  }, []);

  // Sync on mount / unlock if configured
  useEffect(() => {
    if (masterPassword && hasSyncConfig()) {
      executeSync();
    }
  }, [masterPassword, executeSync]);

  // Debounced auto-sync when items mutate
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (!masterPassword || !hasSyncConfig()) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      executeSync();
    }, debounceDelayMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [items, masterPassword, debounceDelayMs, executeSync]);

  // Periodic background sync interval
  useEffect(() => {
    if (!masterPassword || !hasSyncConfig() || autoSyncIntervalMs <= 0) return;

    const intervalId = setInterval(() => {
      executeSync();
    }, autoSyncIntervalMs);

    return () => clearInterval(intervalId);
  }, [masterPassword, autoSyncIntervalMs, executeSync]);

  return {
    syncStatus,
    lastSyncAt,
    syncError,
    conflicts,
    triggerSync,
    clearSyncError,
    isConfigured,
  };
}
