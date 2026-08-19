import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import type { VaultItem } from '../types';
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

const vaultCategory = fc.constantFrom<VaultItem['category']>('login', 'card', 'passkey', 'identity', 'secure_note');
const vaultString = fc.string({ maxLength: 96 });
const isoDate = fc.date({ min: new Date('2020-01-01T00:00:00.000Z'), max: new Date('2035-12-31T23:59:59.999Z') })
  .map((value) => value.toISOString());

const exportedVaultItem = fc.record({
  id: vaultString,
  title: vaultString,
  username: vaultString,
  password: fc.option(vaultString, { nil: undefined }),
  url: vaultString,
  totpSecret: fc.option(vaultString, { nil: undefined }),
  notes: fc.option(vaultString, { nil: undefined }),
  createdAt: isoDate,
  updatedAt: isoDate,
  category: vaultCategory,
  favorite: fc.boolean(),
  deleted: fc.option(fc.boolean(), { nil: undefined }),
  deletedAt: fc.option(isoDate, { nil: undefined }),
  cardholderName: fc.option(vaultString, { nil: undefined }),
  cardNumber: fc.option(vaultString, { nil: undefined }),
  cardExpiry: fc.option(vaultString, { nil: undefined }),
  cardCvv: fc.option(vaultString, { nil: undefined }),
  cardPin: fc.option(vaultString, { nil: undefined }),
  idNumber: fc.option(vaultString, { nil: undefined }),
  idFullName: fc.option(vaultString, { nil: undefined }),
  idBirthDate: fc.option(vaultString, { nil: undefined }),
  idExpiryDate: fc.option(vaultString, { nil: undefined }),
  idGender: fc.option(vaultString, { nil: undefined }),
  passkeyService: fc.option(vaultString, { nil: undefined }),
  passkeyPrivateExponent: fc.option(vaultString, { nil: undefined }),
  passkeyPublicId: fc.option(vaultString, { nil: undefined }),
  attachmentId: fc.option(vaultString, { nil: undefined }),
  attachmentName: fc.option(vaultString, { nil: undefined }),
  attachmentSize: fc.option(fc.integer({ min: 0, max: 250 * 1024 * 1024 }), { nil: undefined }),
  attachmentType: fc.option(vaultString, { nil: undefined }),
}, { requiredKeys: ['id', 'title', 'username', 'url', 'createdAt', 'updatedAt', 'category'] }) as fc.Arbitrary<VaultItem>;

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

function expectedString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * Mirrors the smart title fallback in `buildImportedTitle` (src/lib/importer.ts):
 *   1. explicit `title` (string) if non-empty
 *   2. `username` if non-empty
 *   3. `url` host if non-empty
 *   4. first line of `notes` if non-empty
 *   5. localized "İsimsiz Aktarım" placeholder
 *
 * The fuzz test exports a JSON array through the universal importer and
 * then expects every item to round-trip. The new smart title builder
 * means a JSON row with `title: ''` but a non-empty `username` will be
 * imported with the username as the title, so the round-trip expectation
 * has to mirror that behaviour or every such item fails the assertion.
 */
function expectedImportedTitle(
  item: { title?: unknown; username?: unknown; url?: unknown; notes?: unknown },
  placeholder: string,
): string {
  const title = expectedString(item.title).trim();
  if (title.length > 0) return title;
  const username = expectedString(item.username).trim();
  if (username.length > 0) return username;
  const url = expectedString(item.url).trim();
  if (url.length > 0) {
    try {
      const parsed = new URL(url.includes('://') ? url : `https://${url}`);
      const host = parsed.hostname.replace(/^www\./i, '');
      if (host) return host;
    } catch {
      const stripped = url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
      if (stripped) return stripped;
    }
  }
  const notes = expectedString(item.notes).trim();
  if (notes.length > 0) {
    const firstLine = notes.split(/\r?\n/)[0]!.trim();
    if (firstLine.length > 0 && firstLine.length <= 60) return firstLine;
  }
  return placeholder;
}

function expectedRoundTripItem(item: VaultItem): Partial<VaultItem> {
  return {
    title: expectedImportedTitle(item, expectedString(item.title, 'Untitled Import')),
    username: expectedString(item.username),
    password: expectedString(item.password),
    url: expectedString(item.url),
    notes: expectedString(item.notes),
    totpSecret: expectedString(item.totpSecret),
    category: expectedString(item.category, 'login') as VaultItem['category'],
    favorite: !!item.favorite,
    cardholderName: item.cardholderName,
    cardNumber: item.cardNumber,
    cardExpiry: item.cardExpiry,
    cardCvv: item.cardCvv,
    cardPin: item.cardPin,
    idNumber: item.idNumber,
    idFullName: item.idFullName,
    idBirthDate: item.idBirthDate,
    idExpiryDate: item.idExpiryDate,
    idGender: item.idGender,
    passkeyService: item.passkeyService,
    passkeyPrivateExponent: item.passkeyPrivateExponent,
    passkeyPublicId: item.passkeyPublicId,
  };
}

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

  it('round-trips native Aegis JSON exports through the universal importer without losing supported fields', () => {
    fc.assert(
      fc.property(fc.array(exportedVaultItem, { maxLength: 24 }), (items) => {
        const exportedJson = JSON.stringify(items);
        const result = parseUniversalImport(exportedJson);

        expect(result.type).toBe('success');
        if (result.type !== 'success') return;
        expect(result.items).toHaveLength(items.length);
        expect(result.items).toEqual(items.map(expectedRoundTripItem));
      }),
      { numRuns: 120, seed: 0xA3616 },
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
