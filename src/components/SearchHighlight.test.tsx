/**
 * @vitest-environment jsdom
 */

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import SearchHighlight from './SearchHighlight';

describe('SearchHighlight', () => {
  it('renders plain text when no match is provided', () => {
    const { container } = render(<SearchHighlight text="GitHub" matchStart={-1} matchEnd={-1} />);
    expect(container.textContent).toBe('GitHub');
    expect(container.querySelector('mark')).toBeNull();
  });

  it('highlights a single contiguous range', () => {
    const { container } = render(
      <SearchHighlight text="GitHub Enterprise" matchStart={0} matchEnd={6} />,
    );
    const mark = container.querySelector('mark');
    expect(mark?.textContent).toBe('GitHub');
    expect(container.textContent).toBe('GitHub Enterprise');
  });

  it('falls back to query-based highlight when indexes are unknown', () => {
    const { container } = render(
      <SearchHighlight
        text="GitHub Enterprise"
        matchStart={-1}
        matchEnd={-1}
        query="github"
      />,
    );
    const mark = container.querySelector('mark');
    expect(mark?.textContent).toBe('GitHub');
  });
});
