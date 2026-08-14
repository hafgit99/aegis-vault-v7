import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  damerauLevenshteinDistance,
  isFuzzyMatch,
  normalizeForSearch,
  scoreField,
  scoreMultiField,
} from './fuzzySearch';

const fuzzConfig = { numRuns: 150, seed: 0x82A1B };

describe('fuzzy search fuzz tests', () => {
  it('normalizeForSearch strips diacritics and lowercases arbitrary strings safely', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 128 }),
        (str) => {
          const norm = normalizeForSearch(str);
          expect(typeof norm).toBe('string');
          expect(norm).toBe(norm.toLowerCase());
          expect(norm).toBe(norm.trim());
        },
      ),
      fuzzConfig,
    );
  });

  it('damerauLevenshteinDistance satisfies metric axioms (identity, non-negativity, symmetry)', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 24 }),
        fc.string({ maxLength: 24 }),
        (a, b) => {
          const distAB = damerauLevenshteinDistance(a, b);
          const distBA = damerauLevenshteinDistance(b, a);

          expect(distAB).toBeGreaterThanOrEqual(0);
          expect(distAB).toBe(distBA); // Symmetry

          if (a === b) {
            expect(distAB).toBe(0); // Identity
          }
        },
      ),
      fuzzConfig,
    );
  });

  it('scoreField returns valid bounded score for arbitrary haystacks and queries without throwing', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 256 }),
        fc.string({ maxLength: 64 }),
        (haystack, needle) => {
          const result = scoreField(haystack, needle);
          expect(result.score).toBeGreaterThanOrEqual(0);

          if (isFuzzyMatch(result)) {
            expect(result.score).toBeGreaterThan(0);
          } else {
            expect(result.score).toBe(0);
          }
        },
      ),
      fuzzConfig,
    );
  });

  it('scoreMultiField awards exact field matches and never crashes on malicious/random inputs', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 4, maxLength: 30 }).filter((s) => !/[^a-zA-Z0-9]/.test(s)),
        fc.string({ maxLength: 100 }),
        fc.string({ maxLength: 100 }),
        (token, user, notes) => {
          const fields = [
            { field: 'title' as const, value: `Service ${token} Production` },
            { field: 'username' as const, value: user },
            { field: 'notes' as const, value: notes },
          ];

          const score = scoreMultiField(fields, token);
          expect(score.score).toBeGreaterThanOrEqual(100);
          expect(score.matchedField).toBe('title');
        },
      ),
      fuzzConfig,
    );
  });
});
