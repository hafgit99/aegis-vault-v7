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
const MAX_WASM_PAGES = 4; // 256 KiB maximum arena

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

const WASM_PAGE_SIZE = 65536;

/**
 * Hardened zeroize helper that prevents JavaScript JIT dead-store elimination
 * by performing a volatile read pass after zeroing.
 */
function secureZeroizeBytes(arr: Uint8Array): void {
  arr.fill(0);
  // Force a side-effect accumulator to prevent JIT optimizer from dropping .fill(0)
  let acc = 0;
  for (let i = 0; i < arr.length; i++) {
    acc |= arr[i];
  }
  if (acc !== 0) {
    arr.fill(0);
  }
}

export function createSecureBuffer(size: number): SecureBuffer {
  if (isWasmZeroizerAvailable() && wasmMemory && zeroizeFunc) {
    // If current capacity is exceeded, attempt to grow WASM memory up to MAX_WASM_PAGES
    const currentBytes = wasmMemory.buffer.byteLength;
    if (nextOffset + size > currentBytes) {
      const currentPages = currentBytes / WASM_PAGE_SIZE;
      const pagesNeeded = Math.ceil((nextOffset + size - currentBytes) / WASM_PAGE_SIZE);
      if (currentPages + pagesNeeded <= MAX_WASM_PAGES) {
        try {
          wasmMemory.grow(pagesNeeded);
        } catch {
          // If grow fails, reset offset if previous buffers were freed
        }
      } else {
        // Reset offset to start of arena if wrapped
        nextOffset = 0;
      }
    }

    if (nextOffset + size <= wasmMemory.buffer.byteLength) {
      const offset = nextOffset;
      nextOffset += size;
      const array = new Uint8Array(wasmMemory.buffer, offset, size);
      let zeroed = false;

      return {
        array,
        offset,
        length: size,
        zeroize: () => {
          if (zeroed) return;
          try {
            zeroizeFunc!(offset, size);
          } catch {}
          secureZeroizeBytes(array);
          zeroed = true;
        },
      };
    }
  }

  // Heap fallback with hardened zeroization
  const array = new Uint8Array(size);
  let zeroed = false;

  return {
    array,
    offset: 0,
    length: size,
    zeroize: () => {
      if (zeroed) return;
      secureZeroizeBytes(array);
      zeroed = true;
    },
  };
}

export function wasmZeroizeArray(array: Uint8Array): void {
  secureZeroizeBytes(array);
}

