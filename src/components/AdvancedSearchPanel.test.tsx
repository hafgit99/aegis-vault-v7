/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AdvancedSearchPanel from './AdvancedSearchPanel';
import { LanguageProvider } from '../i18n/LanguageContext';

describe('AdvancedSearchPanel', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders all filter controls and handles interactions', () => {
    const onToggleFuzzy = vi.fn();
    const onToggleTag = vi.fn();
    const onClearTags = vi.fn();
    const onDateFieldChange = vi.fn();
    const onChangeDateRange = vi.fn();
    const onClearDateRange = vi.fn();
    const onResetAdvancedFilters = vi.fn();
    const onSelectRecent = vi.fn();
    const onRemoveRecent = vi.fn();
    const onClearRecent = vi.fn();

    render(
      <LanguageProvider>
        <AdvancedSearchPanel
          fuzzyEnabled={true}
          onToggleFuzzy={onToggleFuzzy}
          selectedTags={['Finance']}
          onToggleTag={onToggleTag}
          onClearTags={onClearTags}
          dateRange={{ from: '2026-01-01', to: '2026-12-31' }}
          dateField="createdAt"
          onDateFieldChange={onDateFieldChange}
          onChangeDateRange={onChangeDateRange}
          onClearDateRange={onClearDateRange}
          onResetAdvancedFilters={onResetAdvancedFilters}
          recentSearches={[{ query: 'github', lastUsedAt: '2026-01-01T00:00:00Z' }]}
          onSelectRecent={onSelectRecent}
          onRemoveRecent={onRemoveRecent}
          onClearRecent={onClearRecent}
          currentQuery=""
        />
      </LanguageProvider>,
    );

    expect(screen.getByTestId('advanced-search-panel')).toBeDefined();

    // Toggle fuzzy
    const fuzzyToggle = screen.getByTestId('advanced-search-fuzzy-toggle');
    fireEvent.click(fuzzyToggle);
    expect(onToggleFuzzy).toHaveBeenCalledWith(false);

    // Add tag draft
    const tagInput = screen.getByTestId('advanced-search-tag-input');
    fireEvent.change(tagInput, { target: { value: 'DevOps' } });
    const tagAddBtn = screen.getByTestId('advanced-search-tag-add');
    fireEvent.click(tagAddBtn);
    expect(onToggleTag).toHaveBeenCalledWith('DevOps');

    // Date range inputs
    const fromInput = screen.getByLabelText(/başlangıç|from/i);
    fireEvent.change(fromInput, { target: { value: '2026-02-01' } });
    expect(onChangeDateRange).toHaveBeenCalled();

    // Reset filters
    const resetBtn = screen.getByTestId('advanced-search-reset');
    fireEvent.click(resetBtn);
    expect(onResetAdvancedFilters).toHaveBeenCalled();
  });
});
