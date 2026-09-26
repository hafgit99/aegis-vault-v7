/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

import {
  Argon2idParameterError,
  CROSS_PLATFORM_KDF_PROFILE,
  DESKTOP_NATIVE_KDF_PROFILE,
  enforceMinimumKdfFloor,
  isArgon2idParameterError,
  MAX_ARGON2ID_HASH_LENGTH,
  MAX_ARGON2ID_ITERATIONS,
  MAX_ARGON2ID_MEMORY_KIB,
  MAX_ARGON2ID_PARALLELISM,
  MIN_ARGON2ID_ITERATIONS,
  MIN_ARGON2ID_MEMORY_KIB,
} from './argon2id';

describe('O-6 Argon2id cost ceilings', () => {
  it('accepts the profiles the application actually ships', () => {
    for (const profile of [CROSS_PLATFORM_KDF_PROFILE, DESKTOP_NATIVE_KDF_PROFILE]) {
      expect(() => enforceMinimumKdfFloor(profile)).not.toThrow();
      expect(enforceMinimumKdfFloor(profile)).toEqual(profile);
    }
  });

  it('accepts empty options, falling back to the default profile', () => {
    expect(() => enforceMinimumKdfFloor()).not.toThrow();
    expect(() => enforceMinimumKdfFloor({})).not.toThrow();
  });

  it('rejects an absurd memory request', () => {
    // The denial of service: a crafted vault or imported backup asking the WASM
    // path for terabytes, which would take the renderer down.
    expect(() => enforceMinimumKdfFloor({ memoryKiB: 4_000_000_000 })).toThrow(
      Argon2idParameterError,
    );
  });

  it('rejects an absurd iteration request', () => {
    expect(() => enforceMinimumKdfFloor({ iterations: 4_000_000_000 })).toThrow(
      Argon2idParameterError,
    );
  });

  it('rejects an absurd lane count', () => {
    expect(() => enforceMinimumKdfFloor({ parallelism: 4_000_000_000 })).toThrow(
      Argon2idParameterError,
    );
  });

  it('rejects an oversized output length', () => {
    expect(() => enforceMinimumKdfFloor({ hashLength: 1_000_000 })).toThrow(Argon2idParameterError);
  });

  it('rejects non-finite values rather than passing NaN through', () => {
    for (const options of [
      { memoryKiB: Number.NaN },
      { iterations: Number.POSITIVE_INFINITY },
      { parallelism: Number.NaN },
      { hashLength: Number.NaN },
    ]) {
      expect(
        () => enforceMinimumKdfFloor(options),
        `should reject ${JSON.stringify(options)}`,
      ).toThrow(Argon2idParameterError);
    }
  });

  it('keeps raising weak values to the floor instead of rejecting them', () => {
    // A weak parameter is a mistake, not an attack, and silently deriving under
    // stronger parameters than requested is the safe correction. Only dangerous
    // values are refused.
    const raised = enforceMinimumKdfFloor({
      memoryKiB: 1024,
      iterations: 1,
      parallelism: 0,
      hashLength: 16,
    });

    expect(raised.memoryKiB).toBe(MIN_ARGON2ID_MEMORY_KIB);
    expect(raised.iterations).toBe(MIN_ARGON2ID_ITERATIONS);
    expect(raised.parallelism).toBe(1);
    expect(raised.hashLength).toBe(32);
  });

  it('accepts values exactly on the boundaries', () => {
    expect(() => enforceMinimumKdfFloor({
      memoryKiB: MIN_ARGON2ID_MEMORY_KIB,
      iterations: MIN_ARGON2ID_ITERATIONS,
      parallelism: 1,
      hashLength: 32,
    })).not.toThrow();

    expect(() => enforceMinimumKdfFloor({
      memoryKiB: MAX_ARGON2ID_MEMORY_KIB,
      iterations: MAX_ARGON2ID_ITERATIONS,
      parallelism: MAX_ARGON2ID_PARALLELISM,
      hashLength: MAX_ARGON2ID_HASH_LENGTH,
    })).not.toThrow();
  });

  it('rejects values one step past the boundaries', () => {
    expect(() => enforceMinimumKdfFloor({ memoryKiB: MAX_ARGON2ID_MEMORY_KIB + 1 })).toThrow();
    expect(() => enforceMinimumKdfFloor({ iterations: MAX_ARGON2ID_ITERATIONS + 1 })).toThrow();
    expect(() => enforceMinimumKdfFloor({ parallelism: MAX_ARGON2ID_PARALLELISM + 1 })).toThrow();
    expect(() => enforceMinimumKdfFloor({ hashLength: MAX_ARGON2ID_HASH_LENGTH + 1 })).toThrow();
  });

  it('names the offending parameter in the error', () => {
    try {
      enforceMinimumKdfFloor({ iterations: 4_000_000_000 });
      throw new Error('expected a rejection');
    } catch (err) {
      expect(isArgon2idParameterError(err)).toBe(true);
      const typed = err as Argon2idParameterError;
      expect(typed.parameter).toBe('iterations');
      expect(typed.value).toBe(4_000_000_000);
      // Same shape as the Rust boundary's message, for log consistency.
      expect(typed.message).toContain('argon2id-parameter-out-of-range');
    }
  });

  it('is recognisable by message as well as by type', () => {
    // Errors can cross a boundary (a worker, IPC) and lose their prototype.
    expect(isArgon2idParameterError(
      new Error('argon2id-parameter-out-of-range: memoryKiB=1 is outside 8192..=1048576'),
    )).toBe(true);
    expect(isArgon2idParameterError(new Error('some other failure'))).toBe(false);
  });

  it('keeps the ceilings far above every shipped profile', () => {
    // Guards against someone "tightening" a ceiling below a real profile.
    for (const profile of [CROSS_PLATFORM_KDF_PROFILE, DESKTOP_NATIVE_KDF_PROFILE]) {
      expect(profile.memoryKiB).toBeLessThan(MAX_ARGON2ID_MEMORY_KIB);
      expect(profile.iterations).toBeLessThan(MAX_ARGON2ID_ITERATIONS);
      expect(profile.parallelism).toBeLessThan(MAX_ARGON2ID_PARALLELISM);
      expect(profile.hashLength).toBeLessThan(MAX_ARGON2ID_HASH_LENGTH);
    }
  });

  it('bounds the memory ceiling to a value a process could plausibly serve', () => {
    // 1 GiB is already generous for KDF; anything near u32::MAX is not a bound.
    expect(MAX_ARGON2ID_MEMORY_KIB).toBeLessThanOrEqual(1024 * 1024);
  });
});
