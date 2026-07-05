/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

import { createSyncProvider, WebDavSyncProvider } from './index';
import type { SyncConfig } from './syncTypes';

describe('sync index factory', () => {
  it('does not create a provider for disabled sync', () => {
    expect(createSyncProvider({ type: 'disabled' })).toBeNull();
  });

  it('creates a WebDAV provider for WebDAV sync config', () => {
    const provider = createSyncProvider({
      type: 'webdav',
      url: 'https://cloud.example.com/dav',
      username: 'alice',
      password: 'token',
    });

    expect(provider).toBeInstanceOf(WebDavSyncProvider);
  });

  it('returns null for unknown future provider configs', () => {
    const config = { type: 'future-provider' } as unknown as SyncConfig;
    expect(createSyncProvider(config)).toBeNull();
  });
});
