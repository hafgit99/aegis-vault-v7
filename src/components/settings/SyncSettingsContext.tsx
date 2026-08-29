/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createContext, useContext, type ReactNode } from 'react';

import { useSettingsSync } from '../../hooks/useSettingsSync';

export type SyncSettings = ReturnType<typeof useSettingsSync>;

const SyncSettingsContext = createContext<SyncSettings | null>(null);

interface SyncSettingsProviderProps {
  onDatabaseChanged: () => void | Promise<void>;
  children: ReactNode;
}

/**
 * M10 Dilim 2: owns the cloud-sync settings state above SettingsPanel so that
 * unrelated settings-panel state changes (password fields, backup flows, ...)
 * no longer re-render the sync section. The provider value is memoized
 * inside useSettingsSync; consumers re-render only on sync state changes.
 */
export function SyncSettingsProvider({ onDatabaseChanged, children }: SyncSettingsProviderProps) {
  const sync = useSettingsSync({ onDatabaseChanged });
  return <SyncSettingsContext.Provider value={sync}>{children}</SyncSettingsContext.Provider>;
}

export function useSyncSettings(): SyncSettings {
  const ctx = useContext(SyncSettingsContext);
  if (!ctx) {
    throw new Error('useSyncSettings must be used within a SyncSettingsProvider');
  }
  return ctx;
}
