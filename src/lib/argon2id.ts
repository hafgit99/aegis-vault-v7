import { invoke } from '@tauri-apps/api/core';
import { logSecurityEvent } from './securityEvents';

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

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export function isDesktopRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);
}

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

const DEFAULT_OPTIONS: Required<Argon2idOptions> = CROSS_PLATFORM_KDF_PROFILE;

export function enforceMinimumKdfFloor(options: Argon2idOptions = {}): Required<Argon2idOptions> {
  const memoryKiB = Math.max(MIN_ARGON2ID_MEMORY_KIB, options.memoryKiB ?? DEFAULT_OPTIONS.memoryKiB);
  const iterations = Math.max(MIN_ARGON2ID_ITERATIONS, options.iterations ?? DEFAULT_OPTIONS.iterations);
  const parallelism = Math.max(1, options.parallelism ?? DEFAULT_OPTIONS.parallelism);
  const hashLength = options.hashLength ?? DEFAULT_OPTIONS.hashLength;

  return {
    memoryKiB,
    iterations,
    parallelism,
    hashLength,
  };
}

let argon2ModulePromise: Promise<Argon2BrowserModule> | null = null;

function resolveOptions(options: Argon2idOptions = {}): Required<Argon2idOptions> {
  return enforceMinimumKdfFloor({
    ...DEFAULT_OPTIONS,
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
      // On Android, the native Rust `argon2` crate can fail to allocate
      // large Argon2id profiles (or, in some Android Tauri builds, the
      // Tauri invoke channel itself is not yet wired for KDF commands).
      // We cannot tell the two apart from the JS side, so fall through
      // to the WASM fallback path instead of throwing a hard
      // 'native-argon2id-derive-failed' that the caller would translate
      // into the "KDF runtime failure" toast.
    }
  }

  // WebView2 / WebKit / WebKitGTK / Android WebView can fail Argon2id
  // allocations with "memory access out of bounds" runtime errors when
  // requested memory exceeds what the host's WASM linear memory can address
  // (the bundled argon2.wasm uses a 32-bit address space). Try the requested
  // parameters first, then gracefully drop to a known-safe profile before
  // surfacing a stable error to the caller. The fallback ladder is
  // deliberately aggressive (down to 2 MiB) so that an Android device
  // with a constrained WASM heap (e.g. a 32 MiB 32-bit address-space
  // boundary on certain WebView versions) can still decrypt a 32 MiB
  // backup by accepting the user's request to retry from a fresh
  // browser tab, while encrypted backups created with the 8/16/32 MiB
  // profile all succeed on the first try.
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
      return result.hash;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error ?? '');
      if (!/memory access out of bounds|out of memory|wasm|RangeError/i.test(message)) {
        throw error;
      }
      logSecurityEvent(
        'security.legacyCryptoWarning' as any,
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
