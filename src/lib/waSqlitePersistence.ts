/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getNativeVaultStorageScope, type NativeVaultStorageScope } from './desktopStorage';

export type WaSqlitePersistenceKind = 'volatile-wasm';

export interface WaSqlitePersistenceProfile {
  databaseName: string;
  storageScope: NativeVaultStorageScope;
  persistenceKind: WaSqlitePersistenceKind;
  activeBackendReady: boolean;
  blocker: string;
}

export const WA_SQLITE_PERSISTENT_VFS_BLOCKER = 'wa-sqlite-persistent-vfs-not-configured';

const DATABASE_NAMES: Record<NativeVaultStorageScope, string> = {
  'android-app-private': 'aegis-wa-sqlite.android.db',
  'desktop-app-data': 'aegis-wa-sqlite.desktop.db',
  'browser-fallback': 'aegis-wa-sqlite.browser.db',
};

export function createWaSqlitePersistenceProfile(
  storageScope: NativeVaultStorageScope = getNativeVaultStorageScope(),
): WaSqlitePersistenceProfile {
  return {
    databaseName: DATABASE_NAMES[storageScope],
    storageScope,
    persistenceKind: 'volatile-wasm',
    activeBackendReady: false,
    blocker: WA_SQLITE_PERSISTENT_VFS_BLOCKER,
  };
}

export function assertWaSqlitePersistenceReadyForActiveBackend(
  profile: WaSqlitePersistenceProfile = createWaSqlitePersistenceProfile(),
): void {
  if (!profile.activeBackendReady) {
    throw new Error(profile.blocker);
  }
}
