import { describe, expect, it } from 'vitest';
import { decodeFileBuffer } from './fileDecoder';

describe('file decoder helper', () => {
  it('does not treat partial UTF-8 BOM-like prefixes as a valid BOM', () => {
    const decoded = decodeFileBuffer(new Uint8Array([0xEF, 0xBB, 0x00, 0x41]).buffer);

    expect(decoded).not.toBe('A');
    expect(decoded).toContain('A');
  });

  it('does not treat shifted UTF-8 BOM-like bytes as a valid BOM', () => {
    const decoded = decodeFileBuffer(new Uint8Array([0x00, 0xBB, 0xBF, 0x41]).buffer);

    expect(decoded).not.toBe('A');
    expect(decoded).toContain('A');
  });

  it('requires the exact UTF-16 LE BOM before using the LE decoder shortcut', () => {
    expect(decodeFileBuffer(new Uint8Array([0xFF, 0xFE, 0x41, 0x00]).buffer)).toBe('A');

    const decoded = decodeFileBuffer(new Uint8Array([0xFF, 0x00, 0x41, 0x00]).buffer);
    expect(decoded).not.toBe('A');
  });

  it('requires the exact UTF-16 BE BOM before using the BE decoder shortcut', () => {
    expect(decodeFileBuffer(new Uint8Array([0xFE, 0xFF, 0x00, 0x41]).buffer)).toBe('A');

    const decoded = decodeFileBuffer(new Uint8Array([0xFE, 0x00, 0x00, 0x41]).buffer);
    expect(decoded).not.toBe('A');
  });

  it('uses UTF-16 heuristics for the smallest eligible sample', () => {
    expect(decodeFileBuffer(new Uint8Array([0x41, 0x00, 0x42, 0x00]).buffer)).toBe('AB');
    expect(decodeFileBuffer(new Uint8Array([0x00, 0x41, 0x00, 0x42]).buffer)).toBe('AB');
  });
});
