import { describe, it, expect } from 'vitest';
import { createSecureBuffer, isWasmZeroizerAvailable, wasmZeroizeArray } from './wasmZeroizer';

describe('wasmZeroizer (N1 fix & buffer security)', () => {
  it('initializes with WASM zeroizer available', () => {
    expect(isWasmZeroizerAvailable()).toBe(true);
  });

  it('allocates multiple secure buffers without detaching earlier buffers (N1 fix)', () => {
    const buf1 = createSecureBuffer(32);
    buf1.array.set([1, 2, 3, 4, 5]);

    const buf2 = createSecureBuffer(64);
    buf2.array.set([10, 20, 30]);

    // Ensure buf1's underlying buffer is NOT detached and still holds its data
    expect(buf1.array.byteLength).toBe(32);
    expect(buf1.array[0]).toBe(1);
    expect(buf1.array[4]).toBe(5);

    // Zeroize buf1
    buf1.zeroize();
    expect(buf1.array[0]).toBe(0);
    expect(buf1.array[4]).toBe(0);

    // Ensure buf2 is unaffected
    expect(buf2.array.byteLength).toBe(64);
    expect(buf2.array[0]).toBe(10);
    buf2.zeroize();
    expect(buf2.array[0]).toBe(0);
  });

  it('safely falls back to heap buffer when arena capacity is exceeded without corruption', () => {
    // Allocate a very large buffer that exceeds 256 KiB
    const largeBuf = createSecureBuffer(300 * 1024);
    expect(largeBuf.array.byteLength).toBe(300 * 1024);
    largeBuf.array[0] = 0xAA;
    largeBuf.array[1000] = 0xBB;

    largeBuf.zeroize();
    expect(largeBuf.array[0]).toBe(0);
    expect(largeBuf.array[1000]).toBe(0);
  });

  it('wasmZeroizeArray zeroes byte arrays correctly', () => {
    const arr = new Uint8Array([1, 2, 3, 4, 5]);
    wasmZeroizeArray(arr);
    expect(arr.every((b) => b === 0)).toBe(true);
  });

  it('double-zeroize is idempotent for both WASM and heap buffers', () => {
    // WASM buffer double-zeroize
    const wasmBuf = createSecureBuffer(16);
    wasmBuf.array.set([0xff, 0xfe, 0xfd]);
    wasmBuf.zeroize();
    wasmBuf.zeroize(); // second call should be a no-op
    expect(wasmBuf.array[0]).toBe(0);

    // Heap fallback double-zeroize
    const heapBuf = createSecureBuffer(300 * 1024);
    heapBuf.array[0] = 0xaa;
    heapBuf.zeroize();
    heapBuf.zeroize(); // second call should be a no-op
    expect(heapBuf.array[0]).toBe(0);
  });
});
