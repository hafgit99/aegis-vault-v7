/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RecentSearches from './RecentSearches';
import { LanguageProvider } from '../i18n/LanguageContext';

describe('RecentSearches', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders empty state when there are no entries', () => {
    render(
      <LanguageProvider>
        <RecentSearches
          entries={[]}
          onSelect={vi.fn()}
          onRemove={vi.fn()}
          onClear={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(screen.getByTestId('recent-searches-empty')).toBeDefined();
  });

  it('renders search chips and handles select, remove, clear clicks', () => {
    const onSelect = vi.fn();
    const onRemove = vi.fn();
    const onClear = vi.fn();

    const entries = [
      { query: 'github', lastUsedAt: '2026-01-01T00:00:00Z' },
      { query: 'google', lastUsedAt: '2026-01-02T00:00:00Z' },
    ];

    render(
      <LanguageProvider>
        <RecentSearches
          entries={entries}
          onSelect={onSelect}
          onRemove={onRemove}
          onClear={onClear}
        />
      </LanguageProvider>,
    );

    expect(screen.getByTestId('recent-searches')).toBeDefined();
    const chips = screen.getAllByTestId('recent-search-chip');
    expect(chips).toHaveLength(2);

    // Select query
    fireEvent.click(screen.getByText('github'));
    expect(onSelect).toHaveBeenCalledWith('github');

    // Remove query
    const removeButtons = screen.getAllByTitle(/kaldır|remove/i);
    if (removeButtons[0]) {
      fireEvent.click(removeButtons[0]);
      expect(onRemove).toHaveBeenCalledWith('github');
    }

    // Clear history
    const clearButton = screen.getByTitle(/geçmişi temizle|clear/i);
    fireEvent.click(clearButton);
    expect(onClear).toHaveBeenCalled();
  });
});
