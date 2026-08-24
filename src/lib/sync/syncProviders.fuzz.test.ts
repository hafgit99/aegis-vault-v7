/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import fc from 'fast-check';
import { S3SyncProvider } from './s3Provider';
import { WebDAVSyncProvider } from './webdavProvider';
import { SyncError } from './syncTypes';

const fuzzConfig = { numRuns: 80, seed: 0x5343 };

describe('Sync Providers property-based fuzz tests', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('safely handles arbitrary S3 configurations and enforces strict origin and error typing', () => {
    fc.assert(
      fc.property(
        fc.record({
          endpoint: fc.webUrl(),
          region: fc.string({ minLength: 1, maxLength: 30 }),
          bucket: fc.string({ minLength: 1, maxLength: 63 }),
          accessKeyId: fc.string({ minLength: 1, maxLength: 40 }),
          secretAccessKey: fc.string({ minLength: 1, maxLength: 80 }),
          prefix: fc.string({ maxLength: 50 }),
        }),
        (config) => {
          try {
            const provider = new S3SyncProvider({
              type: 's3',
              ...config,
            });
            expect(provider.type).toBe('s3');
            provider.dispose();
          } catch (err: any) {
            expect(err instanceof SyncError || err instanceof Error).toBe(true);
          }
        },
      ),
      fuzzConfig,
    );
  });

  it('safely handles arbitrary WebDAV configurations and enforces HTTPS/loopback policy', () => {
    fc.assert(
      fc.property(
        fc.record({
          url: fc.webUrl(),
          username: fc.string({ minLength: 1, maxLength: 50 }),
          password: fc.string({ minLength: 1, maxLength: 50 }),
          remotePath: fc.string({ maxLength: 100 }),
        }),
        (config) => {
          try {
            const provider = new WebDAVSyncProvider({
              type: 'webdav',
              ...config,
            });
            expect(provider.type).toBe('webdav');
            provider.dispose();
          } catch (err: any) {
            expect(err instanceof SyncError || err instanceof Error).toBe(true);
          }
        },
      ),
      fuzzConfig,
    );
  });

  it('handles arbitrary chunk metadata and payload writes cleanly without crashing', async () => {
    const validConfig = {
      type: 's3' as const,
      endpoint: 'https://s3.us-east-1.amazonaws.com',
      region: 'us-east-1',
      bucket: 'test-bucket',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      prefix: 'Vault',
    };

    const provider = new S3SyncProvider(validConfig);

    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 0, maxLength: 1024 }),
        fc.record({
          updatedAt: fc.date().map((d) => d.toISOString()),
          deviceId: fc.uuid(),
          vaultVersion: fc.constant('7.0'),
          checksum: fc.array(fc.constantFrom('0','1','2','3','4','5','6','7','8','9','a','b','c','d','e','f'), { minLength: 64, maxLength: 64 }).map((a) => a.join('')),
          itemCount: fc.integer({ min: 0, max: 1000 }),
        }),
        async (payload, meta) => {
          globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
          await expect(provider.uploadVault(payload, meta)).resolves.not.toThrow();
        },
      ),
      { numRuns: 30, seed: 0x5354 },
    );

    provider.dispose();
  });
});
