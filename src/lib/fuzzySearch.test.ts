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
});
