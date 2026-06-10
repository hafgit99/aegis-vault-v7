declare module 'argon2-browser' {
  interface Argon2HashParams {
    pass: string;
    salt?: string;
    encoded?: string;
    type?: number;
    hashLen?: number;
    time?: number;
    mem?: number;
    parallelism?: number;
  }

  interface Argon2HashResult {
    hash: Uint8Array;
    hashHex: string;
    encoded: string;
  }

  const argon2: {
    ArgonType: {
      Argon2d: number;
      Argon2i: number;
      Argon2id: number;
    };
    hash(params: Argon2HashParams): Promise<Argon2HashResult>;
    verify(params: Argon2HashParams): Promise<Argon2HashResult>;
  };

  export default argon2;
}

declare module 'argon2-browser/dist/argon2-bundled.min.js' {
  import argon2 from 'argon2-browser';

  export default argon2;
}
