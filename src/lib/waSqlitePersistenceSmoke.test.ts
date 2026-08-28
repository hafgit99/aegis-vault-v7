/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import type { VaultStorageQueryResult } from './vaultStorageRepository';
import { verifyWaSqlitePersistentVfsSmoke } from './waSqlitePersistenceSmoke';
import { createWaSqlitePersistenceProfile, type WaSqlitePersistenceProfile } from './waSqlitePersistence';
import type { WaSqliteEngine } from './waSqliteEngine';

function createProfile(ready = true): WaSqlitePersistenceProfile {
  return createWaSqlitePersistenceProfile('browser-fallback', ready);
}

function createEngineFactory(options: {
  writeError?: string;
  readRows?: unknown[][];
  throwOnInitialize?: boolean;
} = {}): (profile: WaSqlitePersistenceProfile) => WaSqliteEngine {
  const storedRows: unknown[][] = options.readRows ?? [['persisted']];
  return vi.fn(() => ({
    initialize: vi.fn(async () => {
      if (options.throwOnInitialize) {
        throw new Error('initialize failed');
      }
      return {
        initialized: true,
        databaseName: '/smoke.db',
        tableCount: 4,
        persistenceProfile: createProfile(true),
      };
    }),
    execute: vi.fn(async (): Promise<VaultStorageQueryResult> => (
      options.writeError
        ? { columns: [], rows: [], error: options.writeError }
        : { columns: [], rows: [] }
    )),
    executeReadOnly: vi.fn(async (): Promise<VaultStorageQueryResult> => ({
      columns: ['value'],
      rows: storedRows,
    })),
    selectObjects: vi.fn(async () => []),
    close: vi.fn(async () => undefined),
  }));
}

describe('wa-sqlite persistence smoke orchestration', () => {
  it('passes when a value written by one engine is read by a reopened engine', async () => {
    const profile = createProfile(true);
    const createEngine = createEngineFactory({ readRows: [['persisted']] });

    await expect(verifyWaSqlitePersistentVfsSmoke({
      persistenceProfile: profile,
      createEngine,
      smokeValue: 'persisted',
    })).resolves.toEqual({
      status: 'passed',
      databaseName: profile.databaseName,
      vfsName: profile.vfsName,
    });
    expect(createEngine).toHaveBeenCalledTimes(2);
  });

  it('fails closed when the persistence profile has no persistent VFS', async () => {
    const profile = createProfile(false);
    const createEngine = createEngineFactory();

    await expect(verifyWaSqlitePersistentVfsSmoke({
      persistenceProfile: profile,
      createEngine,
    })).resolves.toEqual({
      status: 'failed',
      databaseName: profile.databaseName,
      vfsName: null,
      issue: 'wa-sqlite-persistent-vfs-not-ready',
    });
    expect(createEngine).not.toHaveBeenCalled();
  });

  it('reports write errors before reopening the reader', async () => {
    const profile = createProfile(true);
    const createEngine = createEngineFactory({ writeError: 'disk full' });

    await expect(verifyWaSqlitePersistentVfsSmoke({
      persistenceProfile: profile,
      createEngine,
    })).resolves.toMatchObject({
      status: 'failed',
      issue: 'disk full',
    });
    expect(createEngine).toHaveBeenCalledTimes(1);
  });

  it('reports mismatches when reopened reads do not match the written value', async () => {
    const profile = createProfile(true);
    const createEngine = createEngineFactory({ readRows: [['different']] });

    await expect(verifyWaSqlitePersistentVfsSmoke({
      persistenceProfile: profile,
      createEngine,
      smokeValue: 'persisted',
    })).resolves.toMatchObject({
      status: 'failed',
      issue: 'wa-sqlite-persistence-smoke-mismatch',
    });
    expect(createEngine).toHaveBeenCalledTimes(2);
  });
it('reports write failures thrown by the engine', async () => {
    const profile = createProfile(true);
    const createEngine = vi.fn(() => ({
      initialize: vi.fn(async () => ({ initialized: true, databaseName: '/smoke.db', tableCount: 0, persistenceProfile: profile })),
      execute: vi.fn(async () => {
        throw new Error('write exploded');
      }),
      executeReadOnly: vi.fn(async () => ({ columns: [], rows: [] })),
      selectObjects: vi.fn(async () => []),
      close: vi.fn(async () => undefined),
    }));

    await expect(verifyWaSqlitePersistentVfsSmoke({ persistenceProfile: profile, createEngine })).resolves.toMatchObject({
      status: 'failed',
      issue: 'write exploded',
    });
  });

  it('reports read errors returned by the engine', async () => {
    const profile = createProfile(true);
    const createEngine = vi.fn(() => ({
      initialize: vi.fn(async () => ({ initialized: true, databaseName: '/smoke.db', tableCount: 0, persistenceProfile: profile })),
      execute: vi.fn(async () => ({ columns: [], rows: [] })),
      executeReadOnly: vi.fn(async () => ({ columns: [], rows: [], error: 'read failed' })),
      selectObjects: vi.fn(async () => []),
      close: vi.fn(async () => undefined),
    }));

    await expect(verifyWaSqlitePersistentVfsSmoke({ persistenceProfile: profile, createEngine })).resolves.toMatchObject({
      status: 'failed',
      issue: 'read failed',
    });
  });

  it('reports read failures thrown by the engine', async () => {
    const profile = createProfile(true);
    const createEngine = vi.fn(() => ({
      initialize: vi.fn(async () => ({ initialized: true, databaseName: '/smoke.db', tableCount: 0, persistenceProfile: profile })),
      execute: vi.fn(async () => ({ columns: [], rows: [] })),
      executeReadOnly: vi.fn(async () => {
        throw new Error('read exploded');
      }),
      selectObjects: vi.fn(async () => []),
      close: vi.fn(async () => undefined),
    }));

    await expect(verifyWaSqlitePersistentVfsSmoke({ persistenceProfile: profile, createEngine })).resolves.toMatchObject({
      status: 'failed',
      issue: 'read exploded',
    });
  });

  it('ignores close failures during smoke cleanup', async () => {
    const profile = createProfile(true);
    const createEngine = vi.fn(() => ({
      initialize: vi.fn(async () => ({ initialized: true, databaseName: '/smoke.db', tableCount: 0, persistenceProfile: profile })),
      execute: vi.fn(async () => ({ columns: [], rows: [] })),
      executeReadOnly: vi.fn(async () => ({ columns: ['value'], rows: [['persisted']] })),
      selectObjects: vi.fn(async () => []),
      close: vi.fn(async () => {
        throw new Error('close failed');
      }),
    }));

    await expect(verifyWaSqlitePersistentVfsSmoke({
      persistenceProfile: profile,
      createEngine,
      smokeValue: 'persisted',
    })).resolves.toMatchObject({ status: 'passed' });
  });
});
