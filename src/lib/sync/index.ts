import { WebDavSyncProvider } from './webdavProvider';
import type { SyncConfig, SyncProvider } from './syncTypes';

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
export function createSyncProvider(config: SyncConfig): SyncProvider | null {
  if (config.type === 'disabled') return null;

  if (config.type === 'webdav') {
    return new WebDavSyncProvider(config.url, config.username, config.password);
  }

  return null;
}

