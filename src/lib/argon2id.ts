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

export function enforceMinimumKdfFloor(options: Argon2idOptions = {}): Required<Argon2idOptions> {
  const defaultProfile = getDefaultKdfProfile();
  const memoryKiB = Math.max(MIN_ARGON2ID_MEMORY_KIB, options.memoryKiB ?? defaultProfile.memoryKiB);
  const iterations = Math.max(MIN_ARGON2ID_ITERATIONS, options.iterations ?? defaultProfile.iterations);
  const parallelism = Math.max(1, options.parallelism ?? defaultProfile.parallelism);
  const hashLength = options.hashLength ?? defaultProfile.hashLength;

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
}

let latestDegradationInfo: Argon2DegradationInfo | null = null;
const degradationSubscribers = new Set<(info: Argon2DegradationInfo) => void>();

export function getArgon2DegradationInfo(): Argon2DegradationInfo | null {
  return latestDegradationInfo;
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
