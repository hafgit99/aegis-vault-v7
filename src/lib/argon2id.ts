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

const DEFAULT_OPTIONS: Required<Argon2idOptions> = {
  memoryKiB: 64 * 1024,
  iterations: 3,
  parallelism: 1,
  hashLength: 32,
};

let argon2ModulePromise: Promise<Argon2BrowserModule> | null = null;

function resolveOptions(options: Argon2idOptions = {}): Required<Argon2idOptions> {
  return {
    ...DEFAULT_OPTIONS,
    ...options,
  };
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

  return result.hash;
}

export async function createArgon2idHash(
  password: string,
  salt: string,
  options?: Argon2idOptions,
): Promise<string> {
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
