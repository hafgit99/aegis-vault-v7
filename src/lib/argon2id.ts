import { invoke } from '@tauri-apps/api/core';
import { logSecurityEvent, securityEventCodes } from './securityEvents';

export interface Argon2idOptions {
  memoryKiB?: number;
  iterations?: number;
  parallelism?: number;
  hashLength?: number;
}

interface Argon2HashResult {
  hash: Uint8Array;
  encoded: string;
}

interface Argon2BrowserModule {
  ArgonType: {
    Argon2id: number;
  };
  hash: (params: {
    pass: string;
    salt: string;
    type: number;
    hashLen: number;
    time: number;
    mem: number;
    parallelism: number;
  }) => Promise<Argon2HashResult>;
  verify: (params: {
    pass: string;
    encoded: string;
    type: number;
  }) => Promise<Argon2HashResult>;
}

interface Argon2BrowserImport {
  default?: Argon2BrowserModule;
}

import { isDesktopRuntime } from './environment';
export { isDesktopRuntime };

// WebView2/WebKit/WebKitGTK can fail Argon2id allocations above ~64 MiB with
// "memory access out of bounds" runtime errors (see docs/SECURITY_NOTES.md and
// the Aegis Vault backup WASM memory hardening). 32 MiB is a conservative,
// widely portable default that still meets the OWASP password storage
// recommendation when paired with 3+ iterations and AES-256-GCM at rest.
export const MIN_ARGON2ID_MEMORY_KIB = 8192; // 8 MiB floor
export const MIN_ARGON2ID_ITERATIONS = 3;
export const MIN_ARGON2ID_PARALLELISM = 1;
export const MIN_ARGON2ID_HASH_LENGTH = 32;

/**
 * O-6: upper bounds on Argon2id cost.
 *
 * These were floors-only, so KDF parameters arriving from an untrusted source —
 * an imported backup, a crafted vault file, a synced envelope — could request an
 * arbitrary memory or iteration count. The WASM path would then attempt the
 * allocation or spin for effectively forever, taking the renderer down with it.
 *
 * The values match the Rust IPC boundary exactly (`credential_handler.rs`), so
 * both ends of the same request agree on what is acceptable. Every profile this
 * application ships is far below the ceilings: 32–64 MiB and 3–4 iterations.
 */
export const MAX_ARGON2ID_MEMORY_KIB = 1024 * 1024; // 1 GiB
export const MAX_ARGON2ID_ITERATIONS = 20;
export const MAX_ARGON2ID_PARALLELISM = 16;
export const MAX_ARGON2ID_HASH_LENGTH = 64;

const ARGON2ID_MEMORY_RANGE: [number, number] = [MIN_ARGON2ID_MEMORY_KIB, MAX_ARGON2ID_MEMORY_KIB];
const ARGON2ID_ITERATION_RANGE: [number, number] = [MIN_ARGON2ID_ITERATIONS, MAX_ARGON2ID_ITERATIONS];
const ARGON2ID_PARALLELISM_RANGE: [number, number] = [MIN_ARGON2ID_PARALLELISM, MAX_ARGON2ID_PARALLELISM];
const ARGON2ID_HASH_LENGTH_RANGE: [number, number] = [MIN_ARGON2ID_HASH_LENGTH, MAX_ARGON2ID_HASH_LENGTH];

/** Thrown when an untrusted KDF parameter falls outside the accepted range. */
export class Argon2idParameterError extends Error {
  readonly parameter: string;
  readonly value: number;

  constructor(parameter: string, value: number, min: number, max: number) {
    super(`argon2id-parameter-out-of-range: ${parameter}=${value} is outside ${min}..=${max}`);
    this.name = 'Argon2idParameterError';
    this.parameter = parameter;
    this.value = value;
  }
}

export function isArgon2idParameterError(err: unknown): err is Argon2idParameterError {
  return err instanceof Argon2idParameterError
    || (err instanceof Error && err.message.startsWith('argon2id-parameter-out-of-range:'));
}

function requireInRange(
  name: string,
  value: number,
  [min, max]: [number, number],
): number {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Argon2idParameterError(name, value, min, max);
  }
  return value;
}

/** High-security profile for desktop native runtime (64 MiB, 4 iter, 2 lanes) */
export const DESKTOP_NATIVE_KDF_PROFILE: Required<Argon2idOptions> = {
  memoryKiB: 64 * 1024,
  iterations: 4,
  parallelism: 2,
  hashLength: 32,
};

/** Portable cross-platform profile for Web/WASM/backups (32 MiB, 3 iter, 1 lane) */
export const CROSS_PLATFORM_KDF_PROFILE: Required<Argon2idOptions> = {
  memoryKiB: 32 * 1024,
  iterations: 3,
  parallelism: 1,
  hashLength: 32,
};

export function getDefaultKdfProfile(): Required<Argon2idOptions> {
  return isDesktopRuntime() ? DESKTOP_NATIVE_KDF_PROFILE : CROSS_PLATFORM_KDF_PROFILE;
}

/**
 * Raises weak parameters to the floor and **rejects** out-of-range ones.
 *
 * Rejecting rather than clamping is deliberate, and matches the Rust IPC
 * boundary: silently reducing a request for four billion iterations to twenty
 * would hand the caller a key derived under parameters it did not ask for while
 * reporting success — a subtler failure than an explicit refusal. The environment
 * degradation in `deriveWasmHash` is a separate, error-driven mechanism and is
 * unaffected.
 */
export function enforceMinimumKdfFloor(options: Argon2idOptions = {}): Required<Argon2idOptions> {
  const defaultProfile = getDefaultKdfProfile();
  const memoryKiB = requireInRange(
    'memoryKiB',
    Math.max(MIN_ARGON2ID_MEMORY_KIB, options.memoryKiB ?? defaultProfile.memoryKiB),
    ARGON2ID_MEMORY_RANGE,
  );
  const iterations = requireInRange(
    'iterations',
    Math.max(MIN_ARGON2ID_ITERATIONS, options.iterations ?? defaultProfile.iterations),
    ARGON2ID_ITERATION_RANGE,
  );
  const parallelism = requireInRange(
    'parallelism',
    Math.max(MIN_ARGON2ID_PARALLELISM, options.parallelism ?? defaultProfile.parallelism),
    ARGON2ID_PARALLELISM_RANGE,
  );
  const hashLength = requireInRange(
    'hashLength',
    // A short output is a weakness to be corrected upward, not an attack, so it
    // keeps the original floor behaviour. Only the ceiling is new here.
    Math.max(MIN_ARGON2ID_HASH_LENGTH, options.hashLength ?? defaultProfile.hashLength),
    ARGON2ID_HASH_LENGTH_RANGE,
  );

  return {
    memoryKiB,
    iterations,
    parallelism,
    hashLength,
  };
}

export interface Argon2DegradationInfo {
  degraded: boolean;
  requestedMemoryKiB: number;
  activeMemoryKiB: number;
  timestamp: number;
  /** P1-6: When true, vault writes should be blocked to prevent persisting weak KDF parameters. */
  writeBlocked: boolean;
}

let latestDegradationInfo: Argon2DegradationInfo | null = null;
const degradationSubscribers = new Set<(info: Argon2DegradationInfo) => void>();

export function getArgon2DegradationInfo(): Argon2DegradationInfo | null {
  return latestDegradationInfo;
}

/**
 * P1-6: Returns true if Argon2id memory degradation was detected and vault writes
 * should be blocked to prevent persisting records with weak KDF parameters.
 */
export function isArgon2WriteBlocked(): boolean {
  return latestDegradationInfo?.writeBlocked === true;
}

export function subscribeArgon2Degradation(cb: (info: Argon2DegradationInfo) => void): () => void {
  degradationSubscribers.add(cb);
  if (latestDegradationInfo) {
    try {
      cb(latestDegradationInfo);
    } catch {}
  }
  return () => {
    degradationSubscribers.delete(cb);
  };
}

let argon2ModulePromise: Promise<Argon2BrowserModule> | null = null;

function resolveOptions(options: Argon2idOptions = {}): Required<Argon2idOptions> {
  return enforceMinimumKdfFloor({
    ...getDefaultKdfProfile(),
    ...options,
  });
}

async function loadArgon2(): Promise<Argon2BrowserModule> {
  argon2ModulePromise ??= import('argon2-browser/dist/argon2-bundled.min.js').then((module: Argon2BrowserImport) => {
    const argon2 = module.default ?? (module as unknown as Argon2BrowserModule);
    if (!argon2?.hash || !argon2?.verify || !argon2.ArgonType?.Argon2id) {
      throw new Error('Argon2 browser module did not expose the expected API.');
    }
    return argon2;
  });

  return argon2ModulePromise;
}

export async function deriveArgon2idKey(
  password: string,
  salt: string,
  options?: Argon2idOptions,
): Promise<Uint8Array> {
  if (isDesktopRuntime()) {
    try {
      const keyBytes = await invoke<number[]>('derive_argon2id_key', {
        password,
        salt,
        options: options ? resolveOptions(options) : null,
      });
      return new Uint8Array(keyBytes);
    } catch (error) {
      console.error('Rust deriveArgon2idKey failed:', error);
    }
  }

  return deriveWasmHash(password, salt, options);
}

async function deriveWasmHash(
  password: string,
  salt: string,
  options?: Argon2idOptions,
): Promise<Uint8Array> {
  const FALLBACK_PROFILES: Required<Argon2idOptions>[] = [
    { memoryKiB: 16 * 1024, iterations: 3, parallelism: 1, hashLength: 32 },
    { memoryKiB: 8 * 1024, iterations: 3, parallelism: 1, hashLength: 32 },
  ];

  const requested = resolveOptions(options);
  const profiles: Required<Argon2idOptions>[] = [requested];
  for (const fallback of FALLBACK_PROFILES) {
    if (fallback.memoryKiB >= requested.memoryKiB) continue;
    profiles.push(fallback);
  }

  let lastError: unknown = null;
  for (const profile of profiles) {
    try {
      const argon2 = await loadArgon2();
      const result = await argon2.hash({
        pass: password,
        salt,
        type: argon2.ArgonType.Argon2id,
        hashLen: profile.hashLength,
        time: profile.iterations,
        mem: profile.memoryKiB,
        parallelism: profile.parallelism,
      });

      if (profile.memoryKiB < requested.memoryKiB) {
        latestDegradationInfo = {
          degraded: true,
          requestedMemoryKiB: requested.memoryKiB,
          activeMemoryKiB: profile.memoryKiB,
          timestamp: Date.now(),
          writeBlocked: true,
        };
        degradationSubscribers.forEach((cb) => {
          try {
            cb(latestDegradationInfo!);
          } catch (err) {
            console.error('Error in argon2 degradation subscriber:', err);
          }
        });
      }

      return result.hash;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error ?? '');
      if (!/memory access out of bounds|out of memory|wasm|RangeError/i.test(message)) {
        throw error;
      }
      console.warn(
        `[AegisSecurity] WASM Argon2id memory limit encountered (${profile.memoryKiB} KiB). Degrading profile parameters from requested ${requested.memoryKiB} KiB.`
      );
      logSecurityEvent(
        securityEventCodes.securityLegacyCryptoWarning,
        `WASM Argon2id memory limit encountered (${profile.memoryKiB} KiB). Degrading profile parameters.`,
        'warning',
        { requestedMemoryKiB: requested.memoryKiB, fallbackMemoryKiB: profile.memoryKiB }
      );
      // try the next (smaller) profile
    }
  }

  throw lastError instanceof Error ? lastError : new Error('argon2-browser-wasm-memory-unsupported');
}

export async function createArgon2idHash(
  password: string,
  salt: string,
  options?: Argon2idOptions,
): Promise<string> {
  if (isDesktopRuntime()) {
    try {
      return await invoke<string>('create_argon2id_hash', {
        password,
        salt,
        options: options ? resolveOptions(options) : null,
      });
    } catch (error) {
      console.error('Rust createArgon2idHash failed:', error);
      throw new Error('native-argon2id-hash-failed');
    }
  }

  const argon2 = await loadArgon2();
  const resolved = resolveOptions(options);
  const result = await argon2.hash({
    pass: password,
    salt,
    type: argon2.ArgonType.Argon2id,
    hashLen: resolved.hashLength,
    time: resolved.iterations,
    mem: resolved.memoryKiB,
    parallelism: resolved.parallelism,
  });

  return result.encoded;
}

export async function verifyArgon2idHash(password: string, encodedHash: string): Promise<boolean> {
  if (isDesktopRuntime()) {
    try {
      return await invoke<boolean>('verify_argon2id_hash', {
        password,
        encodedHash,
      });
    } catch (error) {
      console.error('Rust verifyArgon2idHash failed:', error);
      return false;
    }
  }

  try {
    const argon2 = await loadArgon2();
    await argon2.verify({
      pass: password,
      encoded: encodedHash,
      type: argon2.ArgonType.Argon2id,
    });
    return true;
  } catch {
    return false;
  }
}
