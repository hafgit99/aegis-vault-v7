/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { ProgressFill } from './ProgressFill';

afterEach(() => {
  cleanup();
});

describe('ProgressFill', () => {
  it('applies the fill width through the DOM instead of an inline style prop', () => {
    render(<ProgressFill percent={40} className="h-full" testId="fill" />);

    const fill = screen.getByTestId('fill');
    // The width is a runtime value, so it can only reach the DOM through the
    // style attribute — but it must be written imperatively via the ref, never
    // authored as a JSX inline style prop, which the `security:csp` gate bans.
    expect(fill.style.width).toBe('40%');
    expect(fill.getAttribute('style')).toContain('width: 40%');
    // No JSX-authored style attribute means no other declarations can ride along.
    expect(fill.style.length).toBe(1);
  });

  it('clamps the percentage into [0, 100]', () => {
    const { rerender } = render(<ProgressFill percent={-25} className="h-full" testId="fill" />);
    expect(screen.getByTestId('fill').style.width).toBe('0%');

    rerender(<ProgressFill percent={480} className="h-full" testId="fill" />);
    expect(screen.getByTestId('fill').style.width).toBe('100%');
  });

  it('exposes the raw percentage for assertions and renders the testId hook', () => {
    render(<ProgressFill percent={65} className="h-full" testId="tour-progress-bar" />);

    const fill = screen.getByTestId('tour-progress-bar');
    expect(fill.getAttribute('data-progress')).toBe('65');
    expect(fill.className).toBe('h-full');
  });

  it('omits the test hook entirely when no testId is provided', () => {
    const { container } = render(<ProgressFill percent={10} className="h-full" />);

    const fill = container.firstElementChild as HTMLElement;
    expect(fill.hasAttribute('data-testid')).toBe(false);
  });
});
