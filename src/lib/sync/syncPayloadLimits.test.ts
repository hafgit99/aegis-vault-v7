/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

import {
  MAX_SYNC_PAYLOAD_BYTES,
  readResponseTextBounded,
  syncErrorCodes,
  SyncError,
  validateRemoteSyncMetadata,
} from './syncTypes';

const VALID_CHECKSUM = 'a'.repeat(64);

function validMetadata(overrides: Record<string, unknown> = {}) {
  return {
    updatedAt: '2026-06-01T12:00:00.000Z',
    deviceId: 'device-1',
    vaultVersion: '7.0',
    checksum: VALID_CHECKSUM,
    itemCount: 3,
    ...overrides,
  };
}

/** Builds a Response whose body streams `size` bytes without allocating them all. */
function streamingResponse(size: number, declaredLength?: number): Response {
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= size) {
        controller.close();
        return;
      }
      // 64 KiB chunks so a large size does not itself exhaust the test.
      const chunk = new Uint8Array(Math.min(65536, size - sent));
      chunk.fill(0x61);
      sent += chunk.byteLength;
      controller.enqueue(chunk);
    },
  });

  const headers = new Headers();
  if (declaredLength !== undefined) headers.set('content-length', String(declaredLength));

  return new Response(stream, { status: 200, headers });
}

describe('O-20 bounded remote payload reads', () => {
  it('reads a body within the limit', async () => {
    const response = streamingResponse(1024, 1024);

    const text = await readResponseTextBounded(response, 4096, 'Remote vault snapshot');

    expect(text.length).toBe(1024);
  });

  it('rejects a body that declares an oversized length before reading it', async () => {
    const response = streamingResponse(10, 10_000_000);

    const error = await readResponseTextBounded(response, 4096, 'Remote vault snapshot')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SyncError);
    expect((error as SyncError).code).toBe(syncErrorCodes.remoteTooLarge);
  });

  it('rejects an oversized stream even when the declared length lies', async () => {
    // The header is attacker-controlled, so the length check alone is a TOCTOU
    // hole: a server can declare 10 bytes and stream gigabytes.
    const response = streamingResponse(200_000, 10);

    const error = await readResponseTextBounded(response, 4096, 'Remote vault snapshot')
      .catch((e: unknown) => e);

    expect((error as SyncError).code).toBe(syncErrorCodes.remoteTooLarge);
  });

  it('rejects an oversized stream that declares no length at all', async () => {
    const response = streamingResponse(200_000);

    const error = await readResponseTextBounded(response, 4096, 'Remote vault snapshot')
      .catch((e: unknown) => e);

    expect((error as SyncError).code).toBe(syncErrorCodes.remoteTooLarge);
  });

  it('accepts a body exactly at the limit', async () => {
    const response = streamingResponse(4096, 4096);

    const text = await readResponseTextBounded(response, 4096, 'Remote vault snapshot');

    expect(text.length).toBe(4096);
  });

  it('decodes multi-byte characters that straddle a chunk boundary', async () => {
    // A naive per-chunk decode would corrupt this; the helper must merge the
    // chunks before decoding.
    const payload = 'ü'.repeat(5000);
    const bytes = new TextEncoder().encode(payload);
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes.slice(0, 65536));
          controller.enqueue(bytes.slice(65536));
          controller.close();
        },
      }),
      { status: 200 },
    );

    const text = await readResponseTextBounded(response, 1024 * 1024, 'Remote vault snapshot');

    expect(text).toBe(payload);
  });

  it('the shipped limit is large enough for real vaults but still bounded', () => {
    expect(MAX_SYNC_PAYLOAD_BYTES).toBeGreaterThan(1024 * 1024);
    expect(MAX_SYNC_PAYLOAD_BYTES).toBeLessThanOrEqual(64 * 1024 * 1024);
  });
});

describe('O-21 remote metadata validation', () => {
  it('accepts well-formed metadata', () => {
    const result = validateRemoteSyncMetadata(validMetadata());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.metadata.itemCount).toBe(3);
      expect(result.metadata.deviceId).toBe('device-1');
    }
  });

  it('normalises the checksum to lowercase', () => {
    const result = validateRemoteSyncMetadata(validMetadata({ checksum: 'A'.repeat(64) }));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.metadata.checksum).toBe('a'.repeat(64));
  });

  it('rejects an unparsable updatedAt', () => {
    // The decisive case: `NaN > x` is false, so an unparsable timestamp made
    // performSync conclude the remote was not newer, skip the download, and
    // upload over it. A ~60-byte metadata file was enough.
    const result = validateRemoteSyncMetadata(validMetadata({ updatedAt: 'not-a-date' }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('not a valid timestamp');
  });

  it('rejects every shape that would produce NaN in a timestamp comparison', () => {
    for (const updatedAt of ['', '   ', 'null', 'undefined', 'NaN', '2026-13-45T99:99:99Z', 12345, null, {}]) {
      const result = validateRemoteSyncMetadata(validMetadata({ updatedAt }));
      expect(result.ok, `should reject updatedAt=${JSON.stringify(updatedAt)}`).toBe(false);
    }
  });

  it('rejects a missing or empty deviceId', () => {
    expect(validateRemoteSyncMetadata(validMetadata({ deviceId: '' })).ok).toBe(false);
    expect(validateRemoteSyncMetadata(validMetadata({ deviceId: undefined })).ok).toBe(false);
  });

  it('rejects a missing or empty vaultVersion', () => {
    expect(validateRemoteSyncMetadata(validMetadata({ vaultVersion: '' })).ok).toBe(false);
    expect(validateRemoteSyncMetadata(validMetadata({ vaultVersion: 7 })).ok).toBe(false);
  });

  it('rejects a malformed checksum', () => {
    for (const checksum of ['', 'abc', 'z'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), 123]) {
      expect(
        validateRemoteSyncMetadata(validMetadata({ checksum })).ok,
        `should reject checksum=${JSON.stringify(checksum)}`,
      ).toBe(false);
    }
  });

  it('rejects a non-integer or negative itemCount', () => {
    for (const itemCount of [-1, 1.5, '3', null, undefined, NaN]) {
      expect(
        validateRemoteSyncMetadata(validMetadata({ itemCount })).ok,
        `should reject itemCount=${JSON.stringify(itemCount)}`,
      ).toBe(false);
    }
  });

  it('rejects non-objects', () => {
    for (const value of [null, undefined, 42, 'metadata', true, []]) {
      expect(validateRemoteSyncMetadata(value).ok, `should reject ${JSON.stringify(value)}`).toBe(false);
    }
  });

  it('rejects an entirely empty object', () => {
    const result = validateRemoteSyncMetadata({});

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('updatedAt');
  });
});
