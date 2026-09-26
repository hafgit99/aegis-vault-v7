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
 */
export function ProgressFill({ percent, className, testId }: ProgressFillProps) {
  const fillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const clamped = Math.max(0, Math.min(100, percent));
    fillRef.current?.style.setProperty('width', `${clamped}%`);
  }, [percent]);

  return <div ref={fillRef} className={className} data-progress={percent} data-testid={testId} />;
}
