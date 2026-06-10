/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import DashboardCategoryStats from './DashboardCategoryStats';

afterEach(() => {
  cleanup();
});

describe('DashboardCategoryStats', () => {
  it('renders category labels and counts', () => {
    render(<DashboardCategoryStats loginCount={7} cardCount={2} secureNoteCount={4} />);

    expect(screen.getByText('Hesap Parolaları')).toBeTruthy();
    expect(screen.getByText('Ödeme Kartları')).toBeTruthy();
    expect(screen.getByText('Güvenli Notlar')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
  });
});
