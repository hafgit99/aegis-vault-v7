/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';

import {
  approximateSimilarity,
  damerauLevenshteinDistance,
  isFuzzyMatch,
  normalizeForSearch,
  scoreField,
  scoreMultiField,
} from './fuzzySearch';

describe('normalizeForSearch', () => {
  it('lowercases, trims, and strips diacritics', () => {
    expect(normalizeForSearch('  Gmáil  ')).toBe('gmail');
  });

  it('returns an empty string for non-string inputs', () => {
    expect(normalizeForSearch(undefined as unknown as string)).toBe('');
  });
});

describe('damerauLevenshteinDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(damerauLevenshteinDistance('github', 'github')).toBe(0);
  });

  it('counts single substitutions', () => {
    expect(damerauLevenshteinDistance('github', 'githab')).toBe(1);
  });

  it('counts adjacent transpositions as a single edit', () => {
    // 'githbu' -> 'github' is actually a substitution + insertion (2 edits),
    // so use a real single-transposition pair here: 'abc' <-> 'bac'.
    expect(damerauLevenshteinDistance('abc', 'bac')).toBe(1);
  });

  it('handles empty inputs', () => {
    expect(damerauLevenshteinDistance('', 'abc')).toBe(3);
    expect(damerauLevenshteinDistance('abc', '')).toBe(3);
  });
});

describe('approximateSimilarity', () => {
  it('returns 1 for identical strings', () => {
    expect(approximateSimilarity('hello', 'hello')).toBe(1);
  });

  it('returns 0 when either side is empty', () => {
    expect(approximateSimilarity('', 'abc')).toBe(0);
    expect(approximateSimilarity('abc', '')).toBe(0);
  });

  it('produces a high score for very similar strings', () => {
    expect(approximateSimilarity('github', 'githab')).toBeGreaterThan(0.7);
  });
});

describe('scoreField', () => {
  it('returns a high score for an exact substring match', () => {
    const result = scoreField('GitHub Enterprise', 'github');
    expect(result.score).toBeGreaterThan(0);
    expect(result.matchStart).toBe(0);
    expect(result.matchEnd).toBe('github'.length);
  });

  it('returns a positive score for a word-prefix match', () => {
    const result = scoreField('My GitHub account', 'github');
    expect(result.score).toBeGreaterThan(0);
  });

  it('returns 0 when the query is too short for fuzzy matching', () => {
    // 1-character query can still be a literal substring match
    // (handled by the early substring branch), but the query "q"
    // is not present in "GitHub" so we expect 0.
    expect(scoreField('GitHub', 'q').score).toBe(0);
  });

  it('tolerates a single-character typo for queries of length >= 3', () => {
    const result = scoreField('GitHub Enterprise', 'githab');
    expect(result.score).toBeGreaterThan(0);
  });

  it('returns 0 for unrelated values', () => {
    const result = scoreField('GitHub', 'completely unrelated search phrase');
    expect(result.score).toBe(0);
  });
});

describe('scoreMultiField', () => {
  const fields = [
    { field: 'title' as const, value: 'GitHub' },
    { field: 'username' as const, value: 'octo@example.com' },
    { field: 'url' as const, value: 'github.com' },
    { field: 'notes' as const, value: 'Personal coding account' },
  ];

  it('matches the strongest field and tags it', () => {
    const result = scoreMultiField(fields, 'personal');
    expect(result.score).toBeGreaterThan(0);
    expect(result.matchedField).toBe('notes');
  });

  it('prefers a title match over a username match', () => {
    const result = scoreMultiField(fields, 'github');
    expect(result.matchedField).toBe('title');
  });

  it('reports no match when the query is unrelated', () => {
    const result = scoreMultiField(fields, 'unknown query that does not match anything');
    expect(isFuzzyMatch(result)).toBe(false);
  });

  it('matches subsequence in longer strings', () => {
    // Subsequence match: 'gthb' in 'github'
    const result = scoreField('github', 'gthb');
    expect(result.score).toBeGreaterThan(0);
  });

  it('matches prefix tokens correctly across spaces', () => {
    const result = scoreField('alpha beta gamma', 'gam');
    expect(result.score).toBeGreaterThan(0);
  });

  it('returns default match for empty query and verifies isFuzzyMatch helper', () => {
    const emptyMatch = scoreField('some text', '');
    expect(emptyMatch.score).toBe(1);
    expect(isFuzzyMatch(emptyMatch)).toBe(true);

    const zeroMatch = scoreField('some text', 'nomatchpossibleatallxyz');
    expect(isFuzzyMatch(zeroMatch)).toBe(false);
  });
});

describe('exact scoring contracts', () => {
  it('pins the exact substring score including prefix and length bonuses', () => {
    // haystack 'github' (len 6): prefixBonus 25 (idx 0), lengthBonus max(0, 10 - floor(6/8)) = 10
    const prefixHit = scoreField('github', 'git');
    expect(prefixHit.score).toBe(100 + 25 + 10);
    expect(prefixHit.matchStart).toBe(0);
    expect(prefixHit.matchEnd).toBe(3);

    // haystack 'my github repo' (len 14): idx 3 → no prefix bonus,
    // lengthBonus max(0, 10 - floor(14/8)) = 9
    const midHit = scoreField('my github repo', 'github');
    expect(midHit.score).toBe(100 + 0 + 9);
    expect(midHit.matchStart).toBe(3);
    expect(midHit.matchEnd).toBe(9);
  });

  it('pins the exact subsequence score with density bonus', () => {
    // density = 4 / max(6, 1) = 0.666… → round(0.666… * 30) = 20
    const result = scoreField('github', 'gthb');
    expect(result.score).toBe(25 + 20);
    expect(result.matchStart).toBe(-1);
    expect(result.matchEnd).toBe(-1);

    // sparser subsequence: haystack 'a b c d e f g' (len 13), density = 3/13
    // → round(0.2307… * 30) = 7
    const sparse = scoreField('a b c d e f g', 'adg');
    expect(sparse.score).toBe(25 + 7);
  });

  it('pins the exact approximate-match score for a single transposition', () => {
    // 'githbu' vs sliding window 'githbu': Damerau–Levenshtein distance 1
    // similarity = 1 - 1/6 ≈ 0.8333 → score round(16.66…) = 17? No:
    // score = round(sim * 20) = round(16.66…) = 17 — pinned below.
    const result = scoreField('githbu', 'github');
    expect(result.score).toBe(Math.round((1 - 1 / 6) * 20));
    expect(result.matchStart).toBe(0);
    expect(result.matchEnd).toBe(6);
  });

  it('rejects approximate matches below the similarity threshold', () => {
    // No substring, no subsequence, every 3-char window is maximally
    // dissimilar from 'zzz' → sim 0 < 0.55 → no match.
    expect(scoreField('abcdefgh', 'zzz').score).toBe(0);
  });

  it('returns the canonical empty score for an empty value', () => {
    expect(scoreField('', 'anything')).toEqual({
      score: 0,
      matchStart: -1,
      matchEnd: -1,
      matchedField: null,
    });
  });

  it('applies multi-field bonuses exactly (title +5, multi-hit +3)', () => {
    // title 'github' → 135; username 'my github x' (len 11, idx 3) → 109;
    // hits = 2 → best (title) gets +5 (title) and +3 (multi-hit) = 143.
    const both = scoreMultiField(
      [
        { field: 'title', value: 'github' },
        { field: 'username', value: 'my github x' },
      ],
      'github',
    );
    expect(both.score).toBe(135 + 5 + 3);
    expect(both.matchedField).toBe('title');

    // single hit on username: no title/multi bonus → raw 109
    const single = scoreMultiField(
      [
        { field: 'title', value: 'zzz entry' },
        { field: 'username', value: 'octo github' },
      ],
      'github',
    );
    expect(single.score).toBe(109);
    expect(single.matchedField).toBe('username');
  });
});

describe('damerauLevenshteinDistance reference values', () => {
  it('matches well-known reference distances', () => {
    expect(damerauLevenshteinDistance('kitten', 'sitting')).toBe(3);
    expect(damerauLevenshteinDistance('flaw', 'lawn')).toBe(2);
    expect(damerauLevenshteinDistance('ab', 'ba')).toBe(1);
    expect(damerauLevenshteinDistance('a', 'a')).toBe(0);
    expect(damerauLevenshteinDistance('a', 'b')).toBe(1);
  });

  it('handles asymmetric lengths correctly', () => {
    // 'ca' -> 'ac' (transposition) -> 'abc' (insertion) = 2 edits
    expect(damerauLevenshteinDistance('ca', 'abc')).toBe(2);
    expect(damerauLevenshteinDistance('abc', 'ca')).toBe(2);
  });
});

describe('approximateSimilarity exact values', () => {
  it('computes normalised similarity relative to the longer string', () => {
    expect(approximateSimilarity('github', 'githab')).toBeCloseTo(1 - 1 / 6, 10);
    expect(approximateSimilarity('ab', 'abcd')).toBeCloseTo(0.5, 10);
    expect(approximateSimilarity('xyz', 'xyz')).toBe(1);
  });
});

describe('normalizeForSearch edge cases', () => {
  it('strips combining diacritics from accented characters', () => {
    expect(normalizeForSearch('Café')).toBe('cafe');
    expect(normalizeForSearch('Ünïcödé')).toBe('unicode');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeForSearch('')).toBe('');
  });
});
