/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';

interface ProgressFillProps {
  /** Fill percentage, clamped to [0, 100]. */
  percent: number;
  className: string;
  /** Optional test hook (rendered as data-testid). */
  testId?: string;
}

/**
 * Dynamic-width progress fill. JSX inline `style` props are banned by the
 * `security:csp` strict-style gate, so the width is applied through the DOM
 * (ref) instead. Keeps the Tailwind transition classes fully functional.
 *
 * N-3: the prop list is intentionally CLOSED — no `...rest` spread. A rest
 * spread would let callers pass an inline style object through untyped, past
 * the regex-based CSP gate (which only scans literal JSX style-prop
 * occurrences in source), silently re-introducing the very hole this
 * component was extracted to close. Because the list is closed, a typo such as
 * `data-testid` instead of `testId` is dropped at runtime without a
 * `typecheck` error (hyphenated JSX attribute names skip TypeScript's
 * excess-property check), so the prop contract is pinned by
 * `ProgressFill.test.tsx` instead.
 */
export function ProgressFill({ percent, className, testId }: ProgressFillProps) {
  const fillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const clamped = Math.max(0, Math.min(100, percent));
    fillRef.current?.style.setProperty('width', `${clamped}%`);
  }, [percent]);

  return <div ref={fillRef} className={className} data-progress={percent} data-testid={testId} />;
}
