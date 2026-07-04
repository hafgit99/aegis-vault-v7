import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { parseCSV, parseUniversalImport } from './importer';

const fuzzConfig = { numRuns: 150, seed: 0xA3615 };
const smallString = fc.string({ maxLength: 256 });

const jsonPrimitive = fc.oneof(
  fc.string({ maxLength: 80 }),
  fc.integer({ min: -10_000, max: 10_000 }),
  fc.boolean(),
  fc.constant(null),
);

const jsonValue = fc.letrec((tie) => ({
  value: fc.oneof(
    jsonPrimitive,
    fc.array(tie('value'), { maxLength: 6 }),
    fc.dictionary(fc.string({ maxLength: 24 }), tie('value'), { maxKeys: 8 }),
  ),
})).value;

const itemFieldValue = fc.oneof(
  fc.string({ maxLength: 96 }),
  fc.boolean(),
  fc.integer({ min: -10_000, max: 10_000 }),
  fc.constant(null),
  fc.constant(undefined),
);

const aegisLikeItem = fc.record({
  title: itemFieldValue,
  username: itemFieldValue,
  password: itemFieldValue,
  url: itemFieldValue,
  notes: itemFieldValue,
  totpSecret: itemFieldValue,
  category: itemFieldValue,
  favorite: itemFieldValue,
  cardholderName: itemFieldValue,
  cardNumber: itemFieldValue,
  cardExpiry: itemFieldValue,
  cardCvv: itemFieldValue,
  cardPin: itemFieldValue,
  idNumber: itemFieldValue,
  idFullName: itemFieldValue,
  idBirthDate: itemFieldValue,
  idExpiryDate: itemFieldValue,
  idGender: itemFieldValue,
  passkeyService: itemFieldValue,
  passkeyPrivateExponent: itemFieldValue,
  passkeyPublicId: itemFieldValue,
}, { requiredKeys: [] });

function expectValidImportResult(content: string): void {
  const result = parseUniversalImport(content);

  if (result.type === 'success') {
    expect(Array.isArray(result.items)).toBe(true);
    expect(typeof result.formatName).toBe('string');
    for (const item of result.items) {
      expect(item).toEqual(expect.any(Object));
      expect(typeof item.title).toBe('string');
      expect(typeof item.username).toBe('string');
      expect(typeof item.url).toBe('string');
      expect(typeof item.notes).toBe('string');
      expect(typeof item.category).toBe('string');
      expect(typeof item.favorite).toBe('boolean');
    }
    return;
  }

  if (result.type === 'encrypted_aegis') {
    expect(result.envelope).toEqual(expect.any(Object));
    return;
  }

  expect(result.type).toBe('error');
  expect(typeof result.message).toBe('string');
  expect(result.message.length).toBeGreaterThan(0);
}

describe('universal importer fuzz boundaries', () => {
  it('never throws for arbitrary import text and returns a typed result', () => {
    fc.assert(
      fc.property(smallString, (content) => {
        expect(() => expectValidImportResult(content)).not.toThrow();
      }),
      fuzzConfig,
    );
  });

  it('never throws for arbitrary JSON-compatible values', () => {
    fc.assert(
      fc.property(jsonValue, (value) => {
        expect(() => expectValidImportResult(JSON.stringify(value))).not.toThrow();
      }),
      fuzzConfig,
    );
  });

  it('normalizes native Aegis array backups without leaking non-string defaults', () => {
    fc.assert(
      fc.property(fc.array(aegisLikeItem, { maxLength: 12 }), (items) => {
        const result = parseUniversalImport(JSON.stringify(items));

        expect(result.type).toBe('success');
        if (result.type !== 'success') return;
        expect(result.items).toHaveLength(items.length);
        for (const item of result.items) {
          expect(typeof item.title).toBe('string');
          expect(typeof item.username).toBe('string');
          expect(typeof item.password).toBe('string');
          expect(typeof item.url).toBe('string');
          expect(typeof item.notes).toBe('string');
          expect(typeof item.totpSecret).toBe('string');
          expect(typeof item.category).toBe('string');
          expect(typeof item.favorite).toBe('boolean');
        }
      }),
      fuzzConfig,
    );
  });

  it('keeps CSV parser row output rectangular enough for importer use', () => {
    fc.assert(
      fc.property(fc.array(fc.array(fc.string({ maxLength: 40 }), { maxLength: 8 }), { maxLength: 20 }), (rows) => {
        const csv = rows.map((row) => row.map((cell) => JSON.stringify(cell)).join(',')).join('\n');
        const parsed = parseCSV(csv);

        expect(Array.isArray(parsed)).toBe(true);
        for (const row of parsed) {
          expect(Array.isArray(row)).toBe(true);
          for (const cell of row) {
            expect(typeof cell).toBe('string');
          }
        }
      }),
      fuzzConfig,
    );
  });
});
