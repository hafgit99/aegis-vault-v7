// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TrashEmptyState from './TrashEmptyState';

describe('TrashEmptyState', () => {
  it('renders the empty trash message', () => {
    render(<TrashEmptyState />);

    expect(screen.getByText('Çöp Kutusu Boş')).toBeTruthy();
    expect(screen.getByText(/bekleyen silinmiş herhangi bir parola/i)).toBeTruthy();
  });
});
