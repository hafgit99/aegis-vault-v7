/**
 * @file notes.ts
 * @description Secure text sanitization and normalization for free-form vault
 * item notes, preventing control character injections, memory bloat, and rendering issues.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

export const MAX_NOTE_LENGTH = 100_000;

/**
 * Sanitizes and normalizes free-form note text:
 * 1. Strips dangerous non-printable ASCII control characters (preserving \n, \r, \t).
 * 2. Normalizes Unicode to standard NFC form.
 * 3. Enforces bounded string length (MAX_NOTE_LENGTH) to prevent memory exhaustion.
 */
export function sanitizeNoteText(raw: unknown): string {
  if (typeof raw !== 'string') {
    return '';
  }

  // 1. Remove dangerous control characters (0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F, 0x7F)
  // Keep tab (\t = 0x09), newline (\n = 0x0A), carriage return (\r = 0x0D)
  let sanitized = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // 2. Unicode normalization (NFC)
  try {
    sanitized = sanitized.normalize('NFC');
  } catch {
    // Fall back to original if environment lacks normalize
  }

  // 3. Enforce maximum note length
  if (sanitized.length > MAX_NOTE_LENGTH) {
    sanitized = sanitized.slice(0, MAX_NOTE_LENGTH);
  }

  return sanitized;
}

/**
 * Validates whether a note text conforms to security constraints.
 */
export function validateNoteSecurity(note: string): { valid: boolean; reason?: string } {
  if (typeof note !== 'string') {
    return { valid: false, reason: 'Note must be a string' };
  }
  if (note.length > MAX_NOTE_LENGTH) {
    return { valid: false, reason: `Note exceeds maximum length of ${MAX_NOTE_LENGTH} characters` };
  }
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(note)) {
    return { valid: false, reason: 'Note contains disallowed control characters' };
  }
  return { valid: true };
}
