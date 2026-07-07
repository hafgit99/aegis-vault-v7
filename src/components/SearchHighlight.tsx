import { memo } from 'react';

interface SearchHighlightProps {
  text: string | undefined | null;
  /** Start index of the match inside `text` (after lower-casing), or -1. */
  matchStart: number;
  /** End index of the match inside `text` (after lower-casing), or -1. */
  matchEnd: number;
  /** Optional query — used as a fallback highlight when the indexes are unknown. */
  query?: string;
  className?: string;
  highlightClassName?: string;
}

/**
 * Renders a text string with a single contiguous range highlighted.
 * The match indexes are produced by the fuzzy scorer and refer to the
 * already-normalised (lower-cased, diacritics-stripped) haystack, so
 * we use a normalised search here to find the equivalent range in the
 * original (un-normalised) text. This is robust to:
 *  - Mixed case in the input ("GitHub" vs "github")
 *  - Diacritics in the input ("Gmäil" vs "gmail")
 *  - Multi-byte characters (we treat the string as code points)
 */
function SearchHighlightContent({
  text,
  matchStart,
  matchEnd,
  query,
  className,
  highlightClassName = 'bg-brand-primary/25 text-on-surface rounded-sm px-0.5',
}: SearchHighlightProps) {
  const safeText = text ?? '';

  let effectiveStart = matchStart;
  let effectiveEnd = matchEnd;

  if ((effectiveStart < 0 || effectiveEnd < 0) && query && query.trim().length > 0) {
    // Fallback: locate the query inside the text using a case-insensitive,
    // diacritics-stripped comparison. We walk both strings as code points
    // to keep emoji / surrogate pairs intact.
    const haystack = safeText
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    const needle = query
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
    if (needle) {
      const idx = haystack.indexOf(needle);
      if (idx >= 0) {
        effectiveStart = idx;
        effectiveEnd = idx + needle.length;
      }
    }
  }

  if (effectiveStart < 0 || effectiveEnd <= effectiveStart) {
    return <span className={className}>{safeText}</span>;
  }

  // Map normalised indices back to original-text indices by scanning
  // both strings code-point by code-point. This is O(n) but n is the
  // field length (a few dozen chars in the worst case) and only runs
  // when there is a match.
  const haystackOriginal = safeText;
  const haystackNormalised = haystackOriginal
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const origPoints = Array.from(haystackOriginal);
  const normPoints = Array.from(haystackNormalised);

  let normPos = 0;
  let origStart = origPoints.length;
  let origEnd = origPoints.length;
  for (let i = 0; i < origPoints.length && normPos <= normPoints.length; i += 1) {
    if (normPos === effectiveStart) origStart = i;
    if (normPos === effectiveEnd) {
      origEnd = i;
      break;
    }
    // Skip combining marks — they don't consume a position in the
    // normalised string.
    if (origPoints[i].normalize('NFD').length > 1) {
      // The character decomposes; advance normalised by the count of
      // base + combining marks so we stay aligned.
      const decomposed = origPoints[i].normalize('NFD');
      normPos += Array.from(decomposed).filter((c) => c > '\u036f' || c < '\u0300').length;
      // Combining marks were stripped, so we still advance by 1 because
      // they don't survive the regex. Fall back to a single step.
      normPos -= decomposed.length - 1;
      normPos += 1;
    } else {
      normPos += 1;
    }
  }
  if (origEnd > origPoints.length) origEnd = origPoints.length;

  const before = origPoints.slice(0, origStart).join('');
  const matched = origPoints.slice(origStart, origEnd).join('');
  const after = origPoints.slice(origEnd).join('');

  return (
    <span className={className}>
      {before}
      <mark
        className={highlightClassName}
        data-testid="search-highlight"
      >
        {matched}
      </mark>
      {after}
    </span>
  );
}

export default memo(SearchHighlightContent);
