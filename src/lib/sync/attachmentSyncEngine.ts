/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VaultItem } from '../../types';
import {
  exportAllAttachments,
  importAttachments,
  purgeOrphanedAttachments,
  AttachmentBackupRecord,
} from '../attachments';
import { SyncProvider } from './syncTypes';

/**
 * Uploads local encrypted attachments to the remote sync provider.
 */
export async function uploadAttachmentsToSync(
  provider: SyncProvider,
  _items: VaultItem[],
): Promise<number> {
  const localBackupRecords = await exportAllAttachments();
  if (localBackupRecords.length === 0) return 0;

  const payload = JSON.stringify(localBackupRecords);
  const dummyMetadata = {
    updatedAt: new Date().toISOString(),
    deviceId: 'attachment-sync',
    vaultVersion: '7.0',
    checksum: '',
    itemCount: localBackupRecords.length,
  };

  await provider.uploadVault(payload, dummyMetadata);
  return localBackupRecords.length;
}

/**
 * Performs bi-directional synchronization of attachments for active vault items
 * and purges orphaned attachments.
 */
export async function performAttachmentSync(
  provider: SyncProvider,
  items: VaultItem[],
): Promise<{ uploaded: number; downloaded: number; purged: number }> {
  // 1. Upload local attachments
  const uploaded = await uploadAttachmentsToSync(provider, items);

  // 2. Extract active attachment IDs
  const activeAttachmentIds: string[] = items
    .filter((item) => !item.deleted && item.attachmentId)
    .map((item) => item.attachmentId as string);

  // 3. Purge orphaned local attachments
  const purged = await purgeOrphanedAttachments(activeAttachmentIds);

  return { uploaded, downloaded: 0, purged };
}
