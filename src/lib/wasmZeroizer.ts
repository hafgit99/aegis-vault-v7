const wasmBytes = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x06, 0x01, 0x60, 0x02, 0x7f, 0x7f, 0x00,
  0x03, 0x02, 0x01, 0x00, 0x05, 0x03, 0x01, 0x00,
  0x01, 0x07, 0x14, 0x02, 0x06, 0x6d, 0x65, 0x6d,
  0x6f, 0x72, 0x79, 0x02, 0x00, 0x07, 0x7a, 0x65,
  0x72, 0x6f, 0x69, 0x7a, 0x65, 0x00, 0x00, 0x0a,
  0x2a, 0x01, 0x28, 0x01, 0x01, 0x7f, 0x41, 0x00,
  0x21, 0x02, 0x02, 0x40, 0x03, 0x40, 0x20, 0x02,
  0x20, 0x01, 0x4f, 0x0d, 0x01, 0x20, 0x00, 0x20,
  0x02, 0x6a, 0x41, 0x00, 0x3a, 0x00, 0x00, 0x20,
  0x02, 0x41, 0x01, 0x6a, 0x21, 0x02, 0x0c, 0x00,
  0x0b, 0x0b, 0x0b
]);

let wasmMemory: WebAssembly.Memory | null = null;
let zeroizeFunc: ((ptr: number, len: number) => void) | null = null;
let nextOffset = 0;

try {
  const module = new WebAssembly.Module(wasmBytes);
  const instance = new WebAssembly.Instance(module, {});
  wasmMemory = instance.exports.memory as WebAssembly.Memory;
  zeroizeFunc = instance.exports.zeroize as (ptr: number, len: number) => void;
} catch (e) {
  console.error("Failed to initialize zeroizer WASM:", e);
}

export function isWasmZeroizerAvailable(): boolean {
  return zeroizeFunc !== null && wasmMemory !== null;
}

export interface SecureBuffer {
  array: Uint8Array;
  offset: number;
  length: number;
  zeroize: () => void;
}

export function createSecureBuffer(size: number): SecureBuffer {
  if (!isWasmZeroizerAvailable()) {
    const array = new Uint8Array(size);
    return {
      array,
      offset: 0,
      length: size,
      zeroize: () => {
        array.fill(0);
      }
    };
  }

  const memoryBuffer = wasmMemory!.buffer;
  if (nextOffset + size > memoryBuffer.byteLength) {
    nextOffset = 0;
  }

  const offset = nextOffset;
  nextOffset += size;

  const array = new Uint8Array(memoryBuffer, offset, size);
  array.fill(0);

  let zeroed = false;

  return {
    array,
    offset,
    length: size,
    zeroize: () => {
      if (zeroed) return;
      zeroizeFunc!(offset, size);
      array.fill(0);
      zeroed = true;
    }
  };
}

export function wasmZeroizeArray(array: Uint8Array): void {
  if (wasmMemory && array.buffer === wasmMemory.buffer) {
    const offset = array.byteOffset;
    const len = array.byteLength;
    zeroizeFunc!(offset, len);
  }
  array.fill(0);
}
