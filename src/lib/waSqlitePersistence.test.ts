/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  assertWaSqlitePersistenceReadyForActiveBackend,
  assertWaSqlitePersistenceReadyForMigrationTarget,
  createWaSqlitePersistenceProfile,
  WA_SQLITE_ACTIVE_BACKEND_BLOCKER,
  WA_SQLITE_PERSISTENT_VFS_UNAVAILABLE,
} from './waSqlitePersistence';

describe('wa-sqlite persistence profile', () => {
  it('uses separate persistent IndexedDB VFS database names for desktop, Android, and browser scopes', () => {
    expect(createWaSqlitePersistenceProfile('desktop-app-data', true)).toEqual({
      databaseName: '/aegis-wa-sqlite.desktop.db',
      storageScope: 'desktop-app-data',
      persistenceKind: 'indexeddb-minimal-vfs',
      vfsName: 'aegis-wa-sqlite-desktop-idb',
      persistentVfsReady: true,
      activeBackendReady: false,
      blocker: WA_SQLITE_ACTIVE_BACKEND_BLOCKER,
    });
    expect(createWaSqlitePersistenceProfile('android-app-private', true)).toMatchObject({
      databaseName: '/aegis-wa-sqlite.android.db',
      storageScope: 'android-app-private',
      vfsName: 'aegis-wa-sqlite-android-idb',
      persistentVfsReady: true,
    });
    expect(createWaSqlitePersistenceProfile('browser-fallback', true)).toMatchObject({
      databaseName: '/aegis-wa-sqlite.browser.db',
      storageScope: 'browser-fallback',
      vfsName: 'aegis-wa-sqlite-browser-idb',
      persistentVfsReady: true,
    });
  });

  it('falls back to volatile wasm storage when IndexedDB persistence is unavailable', () => {
    expect(createWaSqlitePersistenceProfile('desktop-app-data', false)).toEqual({
      databaseName: '/aegis-wa-sqlite.desktop.db',
      storageScope: 'desktop-app-data',
      persistenceKind: 'volatile-wasm',
      vfsName: null,
      persistentVfsReady: false,
      activeBackendReady: false,
      blocker: WA_SQLITE_PERSISTENT_VFS_UNAVAILABLE,
    });
  });

  it('blocks active backend promotion until the migration switch is enabled', () => {
    expect(() => assertWaSqlitePersistenceReadyForActiveBackend(
      createWaSqlitePersistenceProfile('desktop-app-data', true),
    )).toThrow(WA_SQLITE_ACTIVE_BACKEND_BLOCKER);
  });

  it('allows migration write targets only when the persistent VFS is available', () => {
    expect(() => assertWaSqlitePersistenceReadyForMigrationTarget(
      createWaSqlitePersistenceProfile('desktop-app-data', true),
    )).not.toThrow();
    expect(() => assertWaSqlitePersistenceReadyForMigrationTarget(
      createWaSqlitePersistenceProfile('desktop-app-data', false),
    )).toThrow(WA_SQLITE_PERSISTENT_VFS_UNAVAILABLE);
  });
});
