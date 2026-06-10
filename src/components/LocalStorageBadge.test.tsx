// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LocalStorageBadge from './LocalStorageBadge';

describe('LocalStorageBadge', () => {
  it('renders the local storage status label', () => {
    render(<LocalStorageBadge />);

    expect(screen.getByText('LOCAL STORAGE ONLY')).toBeTruthy();
  });
});
