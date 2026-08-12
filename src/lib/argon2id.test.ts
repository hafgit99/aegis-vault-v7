// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createArgon2idHash, deriveArgon2idKey, verifyArgon2idHash } from './argon2id';

const hash = vi.fn(async ({ pass, salt, hashLen, time, mem, parallelism }) => ({
  hash: new Uint8Array(Array.from({ length: hashLen }, (_, index) => (pass.length + salt.length + index) % 256)),
  encoded: `$argon2id$v=19$m=${mem},t=${time},p=${parallelism}$${salt}$mocked`,
}));

const verify = vi.fn(async ({ pass }) => {
  if (pass !== 'correct-password') {
    throw new Error('verification failed');
  }
  return { hash: new Uint8Array([1]), encoded: 'verified' };
});

const invoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

vi.mock('argon2-browser/dist/argon2-bundled.min.js', () => ({
  default: {
    ArgonType: {
      Argon2id: 2,
    },
    hash,
    verify,
  },
}));

beforeEach(() => {
  hash.mockClear();
  verify.mockClear();
  invoke.mockClear();
  delete (window as any).__TAURI_INTERNALS__;
});

describe('argon2id adapter', () => {
  it('derives a key with Argon2id parameters', async () => {
    const key = await deriveArgon2idKey('password', 'salt', {
      memoryKiB: 1024,
      iterations: 2,
      parallelism: 1,
      hashLength: 16,
    });

    expect(key).toHaveLength(16);
    expect(hash).toHaveBeenCalledWith(
      expect.objectContaining({
        pass: 'password',
        salt: 'salt',
        type: 2,
        hashLen: 16,
        time: 3,
        mem: 8192,
        parallelism: 1,
      }),
    );
  });

  it('creates an encoded Argon2id hash', async () => {
    const encoded = await createArgon2idHash('password', 'salt', {
      memoryKiB: 2048,
      iterations: 3,
    });

    expect(encoded).toBe('$argon2id$v=19$m=8192,t=3,p=1$salt$mocked');
  });

  it('verifies encoded hashes with failure isolation', async () => {
    await expect(verifyArgon2idHash('correct-password', '$argon2id$hash')).resolves.toBe(true);
    await expect(verifyArgon2idHash('wrong-password', '$argon2id$hash')).resolves.toBe(false);
  });

  it('gracefully degrades to smaller Argon2id profiles on WASM "memory access out of bounds" errors', async () => {
    const memoryError = new Error('memory access out of bounds');
    let callCount = 0;
    hash.mockImplementation(async ({ mem }) => {
      callCount += 1;
      if (mem >= 16 * 1024) {
        throw memoryError;
      }
      return {
        hash: new Uint8Array(32).fill(3),
        encoded: '$argon2id$degraded',
      };
    });

    const key = await deriveArgon2idKey('password', 'salt', {
      memoryKiB: 32 * 1024,
      iterations: 3,
      parallelism: 1,
      hashLength: 32,
    });

    expect(key).toHaveLength(32);
    expect(callCount).toBeGreaterThanOrEqual(2);
    expect(hash.mock.calls.some(([args]) => (args as any).mem <= 8 * 1024)).toBe(true);
  });

  it('surfaces the underlying WASM error when even the smallest fallback profile fails', async () => {
    const fatalError = new Error('memory access out of bounds');
    hash.mockRejectedValue(fatalError);

    await expect(deriveArgon2idKey('password', 'salt', {
      memoryKiB: 32 * 1024,
      iterations: 3,
      parallelism: 1,
      hashLength: 32,
    })).rejects.toBe(fatalError);
  });

  describe('Tauri desktop runtime', () => {
    beforeEach(() => {
      (window as any).__TAURI_INTERNALS__ = {};
    });

    it('delegates deriveArgon2idKey to Tauri invoke', async () => {
      invoke.mockResolvedValueOnce([1, 2, 3]);
      const key = await deriveArgon2idKey('pass', 'salt');
      expect(invoke).toHaveBeenCalledWith('derive_argon2id_key', {
        password: 'pass',
        salt: 'salt',
        options: null,
      });
      expect(key).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('delegates createArgon2idHash to Tauri invoke', async () => {
      invoke.mockResolvedValueOnce('$argon2id$mocked');
      const hashVal = await createArgon2idHash('pass', 'salt');
      expect(invoke).toHaveBeenCalledWith('create_argon2id_hash', {
        password: 'pass',
        salt: 'salt',
        options: null,
      });
      expect(hashVal).toBe('$argon2id$mocked');
    });

    it('delegates verifyArgon2idHash to Tauri invoke', async () => {
      invoke.mockResolvedValueOnce(true);
      const isVerified = await verifyArgon2idHash('pass', '$argon2id$mocked');
      expect(invoke).toHaveBeenCalledWith('verify_argon2id_hash', {
        password: 'pass',
        encodedHash: '$argon2id$mocked',
      });
      expect(isVerified).toBe(true);
    });

    it('falls back to the WASM graceful-degradation path when Tauri derive invoke throws an error', async () => {
      invoke.mockRejectedValue(new Error('Tauri error'));
      // Reset the hash mock so the previous test's "memory access out of
      // bounds" mock implementation does not leak into this one.
      hash.mockReset();
      hash.mockResolvedValue({ hash: new Uint8Array(16), encoded: 'mock-encoded' });

      // On Android the native Rust argon2 crate can fail to allocate a
      // 32 MiB profile, and in some Tauri Android builds the KDF invoke
      // channel is not wired at all. The adapter now transparently falls
      // through to the WASM path so the user can still import their
      // backup instead of being blocked by a hard
      // 'native-argon2id-derive-failed' error.
      const key = await deriveArgon2idKey('password', 'salt', {
        memoryKiB: 1024,
        iterations: 2,
        parallelism: 1,
        hashLength: 16,
      });

      expect(key).toBeInstanceOf(Uint8Array);
      expect(invoke).toHaveBeenCalled();
    });

    it('does not fall back to WASM when Tauri hash invoke throws an error', async () => {
      invoke.mockRejectedValue(new Error('Tauri error'));

      await expect(createArgon2idHash('password', 'salt')).rejects.toThrow('native-argon2id-hash-failed');

      expect(invoke).toHaveBeenCalled();
      expect(hash).not.toHaveBeenCalled();
    });
  });
});
