/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Lightweight fuzzy / typo-tolerant search helpers for the Aegis Vault
 * advanced search feature.
 *
 * The matcher is intentionally dependency-free and fast — the vault can
 * easily contain hundreds or thousands of items, and the search runs on
 * every keystroke. We therefore use a small, deterministic scoring
 * function instead of pulling in a heavy fuzzy library.
 *
 * Scoring rules (higher is better, > 0 means a match):
 *  - Exact substring match (case-insensitive)              → 100 + bonus
 *  - Subsequence match (chars in order, gaps allowed)      → 25 + density bonus
 *  - Approximate match (Damerau–Levenshtein, normalised)   →  0..20
 */

const MIN_QUERY_LENGTH_FOR_FUZZY = 3;
const APPROXIMATE_MATCH_MIN_SCORE = 0.55;

/**
 * Normalise a value for search: lower-case, trimmed, diacritics stripped.
 * Used for accent-insensitive matching (e.g. "gmail" matches "Gmáil").
 */
export function normalizeForSearch(value: string): string {
  if (!value) return '';
  return value
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function containsSubstring(haystack: string, needle: string): boolean {
  if (!needle) return true;
  return haystack.includes(needle);
}

function isSubsequence(haystack: string, needle: string): boolean {
  if (!needle) return true;
  let hi = 0;
  for (let ni = 0; ni < needle.length; ni += 1) {
    const ch = needle.charAt(ni);
    const idx = haystack.indexOf(ch, hi);
    if (idx === -1) return false;
    hi = idx + 1;
  }
  return true;
}

/**
 * Damerau–Levenshtein distance — supports adjacent transpositions which
 * the classic Levenshtein algorithm does not. This is what catches
 * most typing mistakes like "githbu" → "github".
 *
 * Reference: Brill & Moore (2000) — improved Damerau–Levenshtein.
 */
export function damerauLevenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const inf = a.length + b.length;
  const da: Record<string, number> = {};
  const d: number[][] = [];

  for (let i = 0; i < a.length + 2; i += 1) {
    d[i] = new Array(b.length + 2).fill(0);
  }
  d[0]![0] = inf;
  for (let i = 0; i <= a.length; i += 1) {
    d[i + 1]![1] = i;
    d[i + 1]![0] = inf;
  }
  for (let j = 0; j <= b.length; j += 1) {
    d[1]![j + 1] = j;
    d[0]![j + 1] = inf;
  }

  for (let i = 1; i <= a.length; i += 1) {
    let db = 0;
    for (let j = 1; j <= b.length; j += 1) {
      // 1-based indices, matching the algorithm in Wikipedia:
      //   https://en.wikipedia.org/wiki/Damerau%E2%80%93Levenshtein_distance
      const k = da[b[j - 1] ?? ''] ?? 0;
      const l = db;
      const i1 = i;
      const j1 = j;
      let cost = 1;
      if ((a[i1 - 1] ?? '') === (b[j1 - 1] ?? '')) {
        cost = 0;
        db = j;
      }
      d[i + 1]![j + 1] = Math.min(
        d[i]![j]! + cost, // substitution
        d[i + 1]![j]! + 1, // insertion
        d[i]![j + 1]! + 1, // deletion
        d[k]![l]! + (i1 - k - 1) + 1 + (j1 - l - 1), // transposition
      );
    }
    da[a[i - 1] ?? ''] = i;
  }

  return d[a.length + 1]![b.length + 1]!;
}

/**
 * Normalised similarity in the range [0, 1] where 1 means identical
 * strings. Uses Damerau–Levenshtein distance relative to the longer
 * of the two strings.
 */
export function approximateSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const distance = damerauLevenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - distance / maxLen;
}

function indexOfSubstring(haystack: string, needle: string): number {
  if (!needle) return -1;
  return haystack.indexOf(needle);
}

export interface FuzzyScore {
  /** Aggregate score, higher is better. 0 means "not a match". */
  score: number;
  /** Start index of the matched range in the original haystack (-1 if unknown). */
  matchStart: number;
  /** End index of the matched range in the original haystack (-1 if unknown). */
  matchEnd: number;
  /** The specific matched field, useful for highlighting. Set by scoreMultiField. */
  matchedField: 'title' | 'username' | 'url' | 'notes' | null;
}

const emptyScore: FuzzyScore = { score: 0, matchStart: -1, matchEnd: -1, matchedField: null };

/**
 * Compute a fuzzy score for a single haystack field against a query.
 * Returns score = 0 if the field does not match. The caller is
 * responsible for setting `matchedField`.
 */
export function scoreField(value: string, query: string): FuzzyScore {
  if (!value) return emptyScore;
  if (!query) {
    return { score: 1, matchStart: 0, matchEnd: 0, matchedField: null };
  }

  const haystack = normalizeForSearch(value);
  const needle = normalizeForSearch(query);
  if (!needle) {
    return { score: 1, matchStart: 0, matchEnd: 0, matchedField: null };
  }

  // 1) Exact substring match — strongest signal.
  if (containsSubstring(haystack, needle)) {
    const idx = indexOfSubstring(haystack, needle);
    const len = needle.length;
    const prefixBonus = idx === 0 ? 25 : 0;
    const lengthBonus = Math.max(0, 10 - Math.floor(haystack.length / 8));
    return {
      score: 100 + prefixBonus + lengthBonus,
      matchStart: idx,
      matchEnd: idx + len,
      matchedField: null,
    };
  }

  // 2) Subsequence match — useful for short queries across longer fields.
  //    (The former word-prefix branch was removed: any token prefixed by
  //    the needle is by definition a substring, so branch 1 always won.)
  if (isSubsequence(haystack, needle)) {
    let hi = -1;
    let matched = 0;
    for (let ni = 0; ni < needle.length; ni += 1) {
      const ch = needle.charAt(ni);
      const idx = haystack.indexOf(ch, hi + 1);
      if (idx === -1) break;
      hi = idx;
      matched += 1;
    }
    if (matched === needle.length) {
      const density = needle.length / Math.max(haystack.length, 1);
      return {
        score: 25 + Math.round(density * 30),
        matchStart: -1,
        matchEnd: -1,
        matchedField: null,
      };
    }
  }

  // 3) Approximate (Damerau–Levenshtein) match — only for longer queries
  //    to avoid noisy matches. We compare the needle against a sliding
  //    window in the haystack, NOT the full haystack, because the
  //    haystack can be much longer than the needle (e.g. notes) and
  //    a full-string comparison would always look terrible.
  if (needle.length >= MIN_QUERY_LENGTH_FOR_FUZZY) {
    const window = Math.max(needle.length, 2);
    let bestSim = 0;
    let bestIdx = -1;
    const limit = haystack.length - window;
    for (let i = 0; i <= limit; i += 1) {
      const sub = haystack.slice(i, i + window);
      const s = approximateSimilarity(sub, needle);
      if (s > bestSim) {
        bestSim = s;
        bestIdx = i;
      }
    }
    if (bestSim >= APPROXIMATE_MATCH_MIN_SCORE) {
      return {
        score: Math.round(bestSim * 20),
        matchStart: bestIdx,
        matchEnd: bestIdx === -1 ? -1 : bestIdx + window,
        matchedField: null,
      };
    }
  }

  return emptyScore;
}

/**
 * Aggregate fuzzy score across multiple fields. The strongest matching
 * field wins, with a small bonus when multiple fields match (so a query
 * that hits the title and the username ranks higher than a single hit).
 */
export interface FuzzyFieldInput {
  field: 'title' | 'username' | 'url' | 'notes';
  value: string;
}

export function scoreMultiField(fields: FuzzyFieldInput[], query: string): FuzzyScore {
  let best: FuzzyScore = { score: 0, matchStart: -1, matchEnd: -1, matchedField: null };
  let hits = 0;

  for (const f of fields) {
    const s = scoreField(f.value, query);
    if (s.score > best.score) {
      best = { ...s, matchedField: f.field };
    }
    if (s.score > 0) hits += 1;
  }

  if (best.score > 0) {
    // Small bonus for title hits — usually what the user remembers.
    if (best.matchedField === 'title') best.score += 5;
    // Bonus when more than one field matches — strong relevance signal.
    if (hits > 1) best.score += 3;
  }

  return best;
}

/**
 * Convenience predicate: does this score count as a match?
 */
export function isFuzzyMatch(score: FuzzyScore): boolean {
  return score.score > 0;
}

