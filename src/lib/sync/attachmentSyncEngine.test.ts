/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { performAttachmentSync, uploadAttachmentsToSync } from './attachmentSyncEngine';
import { SyncProvider } from './syncTypes';
import { VaultItem } from '../../types';

vi.mock('../attachments', () => ({
  exportAllAttachments: vi.fn(async () => [
    {
      id: 'att-1',
      name: 'file.pdf',
      type: 'application/pdf',
      size: 100,
      data: 'base64data',
    },
  ]),
  importAttachments: vi.fn(async () => ['att-1']),
  purgeOrphanedAttachments: vi.fn(async () => 0),
}));

describe('attachmentSyncEngine', () => {
  const makeProvider = (): SyncProvider => ({
    uploadVault: vi.fn().mockResolvedValue(undefined),
    downloadVault: vi.fn().mockResolvedValue(null),
    getRemoteMetadata: vi.fn().mockResolvedValue(null),
    testConnection: vi.fn().mockResolvedValue(undefined),
  });

  it('uploadAttachmentsToSync exports and uploads attachment records', async () => {
    const provider = makeProvider();
    const count = await uploadAttachmentsToSync(provider, []);
    expect(count).toBe(1);
    expect(provider.uploadVault).toHaveBeenCalledOnce();
  });

  it('performAttachmentSync uploads local attachments and purges orphans', async () => {
    const provider = makeProvider();
    const items: VaultItem[] = [
      {
        id: 'item-1',
        title: 'Doc',
        username: '',
        url: '',
        category: 'login',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        attachmentId: 'att-1',
      },
    ];

    const res = await performAttachmentSync(provider, items);
    expect(res.uploaded).toBe(1);
    expect(res.purged).toBe(0);
  });
});
