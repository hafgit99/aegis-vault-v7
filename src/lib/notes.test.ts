import { describe, expect, it } from 'vitest';
import { MAX_NOTE_LENGTH, sanitizeNoteText, validateNoteSecurity } from './notes';

describe('notes security and sanitization', () => {
  it('handles non-string inputs safely', () => {
    expect(sanitizeNoteText(null)).toBe('');
    expect(sanitizeNoteText(undefined)).toBe('');
    expect(sanitizeNoteText(12345)).toBe('');
    expect(sanitizeNoteText({})).toBe('');
  });

  it('preserves clean multiline text and tabs', () => {
    const input = 'Line 1\nLine 2\r\n\tTabbed content\n\nParagraph 2';
    expect(sanitizeNoteText(input)).toBe(input);
  });

  it('strips dangerous control characters and null bytes', () => {
    const malicious = 'Hello\x00World\x07\x08\x1B[31mRed\x1FText\x7F!';
    expect(sanitizeNoteText(malicious)).toBe('HelloWorld[31mRedText!');
  });

  it('normalizes Unicode characters into NFC', () => {
    // e + acute accent decomposed (NFD)
    const decomposed = 'e\u0301';
    // Single character é (NFC)
    const composed = '\u00e9';
    expect(sanitizeNoteText(decomposed)).toBe(composed);
  });

  it('truncates text exceeding MAX_NOTE_LENGTH', () => {
    const huge = 'a'.repeat(MAX_NOTE_LENGTH + 500);
    const result = sanitizeNoteText(huge);
    expect(result.length).toBe(MAX_NOTE_LENGTH);
  });

  it('validates note security constraints properly', () => {
    expect(validateNoteSecurity('Valid note content with\nlines.').valid).toBe(true);

    const withNull = validateNoteSecurity('Bad\x00note');
    expect(withNull.valid).toBe(false);
    expect(withNull.reason).toContain('disallowed control characters');

    const tooLong = validateNoteSecurity('x'.repeat(MAX_NOTE_LENGTH + 1));
    expect(tooLong.valid).toBe(false);
    expect(tooLong.reason).toContain('exceeds maximum length');

    const nonString = validateNoteSecurity(12345 as any);
    expect(nonString.valid).toBe(false);
    expect(nonString.reason).toContain('must be a string');
  });
});
