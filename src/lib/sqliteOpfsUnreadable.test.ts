/**
 * @vitest-environment jsdom
 */

/**
 * K-4: a vault file that EXISTS but cannot be decoded must be reported as
 * `unreadable`, never collapsed into `unavailable`.
 *
 * The distinction is the whole fix. `unavailable` means "this storage path does
 * not exist here", where falling back to the IndexedDB mirror is safe.
 * `unreadable` means "the authoritative vault is present and damaged", where
 * falling back hands the user stale data that then overwrites the real vault on
 * their next save.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  decodePersistedVaultPayload,
  DB_FILENAME,
  loadPersistedVaultDatabase,
  MAX_VAULT_PAYLOAD_BYTES,
} from './sqliteOpfsPersistence';
import { createEmptyVaultDatabaseState } from './vaultDatabaseFormat';

const readDesktopVaultDatabase = vi.hoisted(() => vi.fn(async (): Promise<string | null> => null));

vi.mock('./desktopStorage', () => ({
  getNativeVaultStorageScope: () => 'app',
  readDesktopVaultDatabase,
  writeDesktopVaultDatabase: vi.fn(async () => true),
  resetDesktopVaultDatabase: vi.fn(async () => undefined),
}));

vi.mock('./indexedDbStorage', () => ({
  setIndexedDbItemSync: vi.fn(),
  getIndexedDbItemSync: vi.fn(() => null),
  removeIndexedDbItemSync: vi.fn(),
  initializeIndexedDbStorage: vi.fn(async () => undefined),
}));

vi.mock('./securityEvents', () => ({
  logSecurityEvent: vi.fn(),
  securityEventCodes: new Proxy({}, { get: (_t, prop) => String(prop) }),
}));

function stubOpfs(file: { text: () => Promise<string>; size?: number } | null) {
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: {
      getDirectory: async () => ({
        getFileHandle: async () => {
          if (file === null) throw new DOMException('NotFoundError');
          return { getFile: async () => file };
        },
      }),
    },
  });
}

function clearOpfs() {
  Object.defineProperty(navigator, 'storage', { configurable: true, value: undefined });
}

describe('K-4: decodePersistedVaultPayload', () => {
  it('classifies invalid JSON instead of throwing a bare SyntaxError', () => {
    const result = decodePersistedVaultPayload('{ not json', 10);
    expect(result.kind).toBe('unreadable');
    if (result.kind === 'unreadable') expect(result.reason).toBe('invalid-json');
  });

  it('rejects a payload over the size limit', () => {
    const result = decodePersistedVaultPayload('{}', MAX_VAULT_PAYLOAD_BYTES + 1);
    expect(result.kind).toBe('unreadable');
    if (result.kind === 'unreadable') expect(result.reason).toBe('too-large');
  });

  it('rejects a whitespace-only payload', () => {
    const result = decodePersistedVaultPayload('   \n\t ', 6);
    expect(result.kind).toBe('unreadable');
    if (result.kind === 'unreadable') expect(result.reason).toBe('empty');
  });

  it('rejects valid JSON that is not an object', () => {
    for (const payload of ['[]', '"a string"', '42', 'null']) {
      const result = decodePersistedVaultPayload(payload, payload.length);
      expect(result.kind).toBe('unreadable');
      if (result.kind === 'unreadable') expect(result.reason).toBe('invalid-shape');
    }
  });

  it('accepts a well-formed vault state', () => {
    const result = decodePersistedVaultPayload(JSON.stringify(createEmptyVaultDatabaseState()), 128);
    expect(result.kind).toBe('state');
  });
});

describe('K-4: loadPersistedVaultDatabase', () => {
  beforeEach(() => {
    readDesktopVaultDatabase.mockReset();
    readDesktopVaultDatabase.mockResolvedValue(null);
    clearOpfs();
  });

  afterEach(() => {
    clearOpfs();
  });

  it('reports a truncated / corrupt OPFS vault file as unreadable, NOT unavailable', async () => {
    stubOpfs({ text: async () => '{"schemaVersion":3,"user_sec', size: 30 });

    const result = await loadPersistedVaultDatabase();

    // The critical assertion: this must NOT be `unavailable`, which is the
    // value that used to trigger the stale-mirror fallback and the overwrite.
    expect(result.kind).toBe('unreadable');
  });

  it('reports a file whose bytes are not valid UTF-8-decodable JSON as unreadable', async () => {
    stubOpfs({ text: async () => '\u0000\u0001\u0002binary-garbage', size: 21 });

    expect((await loadPersistedVaultDatabase()).kind).toBe('unreadable');
  });

  it('reports a read failure on an existing file as unreadable, not unavailable', async () => {
    stubOpfs({
      text: async () => {
        throw new Error('The requested file could not be read');
      },
      size: 100,
    });

    const result = await loadPersistedVaultDatabase();
    expect(result.kind).toBe('unreadable');
    if (result.kind === 'unreadable') expect(result.reason).toBe('read-failed');
  });

  it('reports a non-empty file with no decodable content as unreadable', async () => {
    stubOpfs({ text: async () => '', size: 4096 });

    const result = await loadPersistedVaultDatabase();
    expect(result.kind).toBe('unreadable');
    if (result.kind === 'unreadable') expect(result.reason).toBe('empty');
  });

  it('still treats a genuinely empty (0 byte) file as a fresh install', async () => {
    // createWritable truncates before the first payload lands, so an
    // interrupted very first write can legitimately leave 0 bytes. Escalating
    // that to corruption would block a brand-new vault.
    stubOpfs({ text: async () => '', size: 0 });

    expect((await loadPersistedVaultDatabase()).kind).toBe('empty');
  });

  it('keeps `unavailable` for a storage path that genuinely does not exist', async () => {
    stubOpfs(null);
    expect((await loadPersistedVaultDatabase()).kind).toBe('missing');
  });

  it('reports a corrupt DESKTOP payload as unreadable too', async () => {
    readDesktopVaultDatabase.mockResolvedValue('{ broken');
    expect((await loadPersistedVaultDatabase()).kind).toBe('unreadable');
  });

  it('reports an oversized DESKTOP payload as unreadable', async () => {
    readDesktopVaultDatabase.mockResolvedValue(JSON.stringify({ pad: 'x'.repeat(MAX_VAULT_PAYLOAD_BYTES) }));
    const result = await loadPersistedVaultDatabase();
    expect(result.kind).toBe('unreadable');
    if (result.kind === 'unreadable') expect(result.reason).toBe('too-large');
  });

  it('surfaces the DB_FILENAME so the error names the file the user must not delete', () => {
    expect(DB_FILENAME).toBe('kalderashield.db');
  });
});
