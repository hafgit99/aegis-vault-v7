/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getNativeVaultStorageScope, type NativeVaultStorageScope } from './desktopStorage';

export type WaSqlitePersistenceKind = 'indexeddb-minimal-vfs' | 'volatile-wasm';

export interface WaSqlitePersistenceProfile {
  databaseName: string;
  storageScope: NativeVaultStorageScope;
  persistenceKind: WaSqlitePersistenceKind;
  vfsName: string | null;
  persistentVfsReady: boolean;
  activeBackendReady: boolean;
  blocker: string;
}

export const WA_SQLITE_ACTIVE_BACKEND_BLOCKER = 'wa-sqlite-active-backend-not-enabled';
export const WA_SQLITE_PERSISTENT_VFS_UNAVAILABLE = 'wa-sqlite-persistent-vfs-unavailable';

const DATABASE_NAMES: Record<NativeVaultStorageScope, string> = {
  'android-app-private': '/aegis-wa-sqlite.android.db',
  'desktop-app-data': '/aegis-wa-sqlite.desktop.db',
  'browser-fallback': '/aegis-wa-sqlite.browser.db',
};

const VFS_NAMES: Record<NativeVaultStorageScope, string> = {
  'android-app-private': 'aegis-wa-sqlite-android-idb',
  'desktop-app-data': 'aegis-wa-sqlite-desktop-idb',
  'browser-fallback': 'aegis-wa-sqlite-browser-idb',
};

export function isIndexedDbPersistenceAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

export function createWaSqlitePersistenceProfile(
  storageScope: NativeVaultStorageScope = getNativeVaultStorageScope(),
  persistentVfsAvailable = isIndexedDbPersistenceAvailable(),
): WaSqlitePersistenceProfile {
  if (!persistentVfsAvailable) {
    return {
      databaseName: DATABASE_NAMES[storageScope],
      storageScope,
      persistenceKind: 'volatile-wasm',
      vfsName: null,
      persistentVfsReady: false,
      activeBackendReady: false,
      blocker: WA_SQLITE_PERSISTENT_VFS_UNAVAILABLE,
    };
  }

  return {
    databaseName: DATABASE_NAMES[storageScope],
    storageScope,
    persistenceKind: 'indexeddb-minimal-vfs',
    vfsName: VFS_NAMES[storageScope],
    persistentVfsReady: true,
    activeBackendReady: false,
    blocker: WA_SQLITE_ACTIVE_BACKEND_BLOCKER,
  };
}

export function assertWaSqlitePersistenceReadyForActiveBackend(
  profile: WaSqlitePersistenceProfile = createWaSqlitePersistenceProfile(),
): void {
  if (!profile.activeBackendReady) {
    throw new Error(profile.blocker);
  }
}

export function assertWaSqlitePersistenceReadyForMigrationTarget(
  profile: WaSqlitePersistenceProfile = createWaSqlitePersistenceProfile(),
): void {
  if (!profile.persistentVfsReady) {
    throw new Error(profile.blocker || WA_SQLITE_PERSISTENT_VFS_UNAVAILABLE);
  }
}

export function markWaSqlitePersistenceReadyForActiveBackend(
  profile: WaSqlitePersistenceProfile = createWaSqlitePersistenceProfile(),
): WaSqlitePersistenceProfile {
  return {
    ...profile,
    activeBackendReady: profile.persistentVfsReady,
    blocker: profile.persistentVfsReady ? '' : profile.blocker,
  };
}
