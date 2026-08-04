import { WebDavSyncProvider } from './webdavProvider';
import { S3SyncProvider } from './s3Provider';
import type { SyncConfig, SyncProvider } from './syncTypes';

export { SyncError, syncErrorCodes } from './syncTypes';
export type {
  SyncProvider,
  SyncConfig,
  WebDavSyncConfig,
  S3SyncConfig,
  SyncStatus,
  SyncResult,
  SyncMetadata,
  SyncConflictItem,
  SyncErrorCode,
  SyncProviderType,
} from './syncTypes';

export { WebDavSyncProvider } from './webdavProvider';
export { S3SyncProvider } from './s3Provider';

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
  validateS3Config,
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

  if (config.type === 's3') {
    return new S3SyncProvider(config);
  }

  return null;
}

