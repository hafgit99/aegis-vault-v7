/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export { SyncError, syncErrorCodes } from './syncTypes';
export type {
  SyncProvider,
  SyncConfig,
  WebDavSyncConfig,
  SyncStatus,
  SyncResult,
  SyncMetadata,
  SyncConflictItem,
  SyncErrorCode,
  SyncProviderType,
} from './syncTypes';

export { WebDavSyncProvider } from './webdavProvider';

export {
  performSync,
  buildSyncEnvelope,
  parseSyncEnvelope,
  resolveLWWConflicts,
} from './syncEngine';

export {
  saveSyncConfig,
  loadSyncConfig,
  clearSyncConfig,
  hasSyncConfig,
  saveLastSyncTime,
  getLastSyncTime,
  validateWebDavConfig,
} from './syncConfigStorage';

/**
 * Factory: creates the appropriate SyncProvider from a SyncConfig.
 * Returns null when config.type is 'disabled'.
 */
export function createSyncProvider(config: import('./syncTypes').SyncConfig): import('./syncTypes').SyncProvider | null {
  if (config.type === 'disabled') return null;

  if (config.type === 'webdav') {
    const { WebDavSyncProvider: Provider } = require('./webdavProvider');
    return new Provider(config.url, config.username, config.password) as import('./syncTypes').SyncProvider;
  }

  return null;
}
