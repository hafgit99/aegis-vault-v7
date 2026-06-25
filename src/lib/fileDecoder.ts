/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Decodes a binary ArrayBuffer into a string, auto-detecting UTF-8, UTF-16,
 * and falling back to Turkish Windows-1254 if the text is invalid UTF-8.
 */
export function decodeFileBuffer(buffer: ArrayBuffer): string {
  const arr = new Uint8Array(buffer);
  if (arr.length === 0) return '';

  // 1. Check for BOM (Byte Order Mark)
  // UTF-8 BOM: EF BB BF
  if (arr.length >= 3 && arr[0] === 0xEF && arr[1] === 0xBB && arr[2] === 0xBF) {
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(arr.subarray(3));
  }

  // UTF-16 LE BOM: FF FE
  if (arr.length >= 2 && arr[0] === 0xFF && arr[1] === 0xFE) {
    const decoder = new TextDecoder('utf-16le');
    return decoder.decode(arr.subarray(2));
  }

  // UTF-16 BE BOM: FE FF
  if (arr.length >= 2 && arr[0] === 0xFE && arr[1] === 0xFF) {
    const decoder = new TextDecoder('utf-16be');
    return decoder.decode(arr.subarray(2));
  }

  // 2. Heuristics for UTF-16 without BOM (e.g. sample null bytes)
  let nullEven = 0;
  let nullOdd = 0;
  const sampleSize = Math.min(arr.length, 200);
  for (let i = 0; i < sampleSize; i++) {
    if (arr[i] === 0) {
      if (i % 2 === 0) nullEven++;
      else nullOdd++;
    }
  }

  const threshold = Math.floor(sampleSize / 4);
  if (sampleSize >= 4 && (nullEven > threshold || nullOdd > threshold)) {
    const encoding = nullOdd > nullEven ? 'utf-16le' : 'utf-16be';
    const decoder = new TextDecoder(encoding);
    return decoder.decode(arr);
  }

  // 3. Fallback logic: UTF-8 vs Turkish Windows-1254 (ISO-8859-9)
  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    return utf8Decoder.decode(arr);
  } catch (err) {
    // If UTF-8 decoding throws a fatal error, fall back to Turkish Windows-1254
    const trDecoder = new TextDecoder('windows-1254');
    return trDecoder.decode(arr);
  }
}
