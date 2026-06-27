/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  assertWaSqlitePersistenceReadyForActiveBackend,
  createWaSqlitePersistenceProfile,
  WA_SQLITE_PERSISTENT_VFS_BLOCKER,
} from './waSqlitePersistence';

describe('wa-sqlite persistence profile', () => {
  it('uses separate database names for desktop, Android, and browser scopes', () => {
    expect(createWaSqlitePersistenceProfile('desktop-app-data')).toEqual({
      databaseName: 'aegis-wa-sqlite.desktop.db',
      storageScope: 'desktop-app-data',
      persistenceKind: 'volatile-wasm',
      activeBackendReady: false,
      blocker: WA_SQLITE_PERSISTENT_VFS_BLOCKER,
    });
    expect(createWaSqlitePersistenceProfile('android-app-private')).toMatchObject({
      databaseName: 'aegis-wa-sqlite.android.db',
      storageScope: 'android-app-private',
    });
    expect(createWaSqlitePersistenceProfile('browser-fallback')).toMatchObject({
      databaseName: 'aegis-wa-sqlite.browser.db',
      storageScope: 'browser-fallback',
    });
  });

  it('blocks active backend promotion until a persistent VFS is configured', () => {
    expect(() => assertWaSqlitePersistenceReadyForActiveBackend(
      createWaSqlitePersistenceProfile('desktop-app-data'),
    )).toThrow(WA_SQLITE_PERSISTENT_VFS_BLOCKER);
  });
});
