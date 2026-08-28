/**
 * @vitest-environment jsdom
 */

import React from 'react';
import type { ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AdvancedSearchPanel from './AdvancedSearchPanel';
import { LanguageProvider } from '../i18n/LanguageContext';

function renderPanel(overrides: Partial<ComponentProps<typeof AdvancedSearchPanel>> = {}) {
  const props: ComponentProps<typeof AdvancedSearchPanel> = {
    fuzzyEnabled: true,
    onToggleFuzzy: vi.fn(),
    selectedTags: [],
    onToggleTag: vi.fn(),
    onClearTags: vi.fn(),
    dateRange: { from: null, to: null },
    dateField: 'createdAt',
    onDateFieldChange: vi.fn(),
    onChangeDateRange: vi.fn(),
    onClearDateRange: vi.fn(),
    onResetAdvancedFilters: vi.fn(),
    recentSearches: [],
    onSelectRecent: vi.fn(),
    onRemoveRecent: vi.fn(),
    onClearRecent: vi.fn(),
    currentQuery: '',
    ...overrides,
  };

  render(
    <LanguageProvider>
      <AdvancedSearchPanel {...props} />
    </LanguageProvider>,
  );

  return props;
}

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

  it('commits a valid date range change', () => {
    const props = renderPanel();

    fireEvent.change(screen.getByTestId('advanced-search-date-from'), { target: { value: '2026-02-01' } });

    expect(props.onChangeDateRange).toHaveBeenCalledWith({ from: '2026-02-01', to: null });
  });

  it('rejects an invalid date range with an inline alert', () => {
    const props = renderPanel({ dateRange: { from: '2026-01-15', to: '2026-01-20' } });

    fireEvent.change(screen.getByTestId('advanced-search-date-from'), { target: { value: '2026-12-31' } });

    expect(props.onChangeDateRange).not.toHaveBeenCalled();
    expect(screen.getByTestId('advanced-search-date-error')).toBeTruthy();
    expect(screen.getByTestId('advanced-search-date-from').getAttribute('aria-invalid')).toBe('true');
  });

  it('clears the date range through the dedicated button', () => {
    const props = renderPanel({ dateRange: { from: '2026-01-01', to: '2026-12-31' } });

    fireEvent.click(screen.getByTestId('advanced-search-date-clear'));

    expect(props.onClearDateRange).toHaveBeenCalledTimes(1);
  });

  it('switches the date field between createdAt and updatedAt', () => {
    const props = renderPanel();

    fireEvent.change(screen.getByTestId('advanced-search-date-field'), { target: { value: 'updatedAt' } });

    expect(props.onDateFieldChange).toHaveBeenCalledWith('updatedAt');
  });

  it('adds and removes tag filters, then clears them all', () => {
    const props = renderPanel({ selectedTags: ['Finance', 'Work'] });

    // Add a tag via the form submit.
    fireEvent.change(screen.getByTestId('advanced-search-tag-input'), { target: { value: 'DevOps' } });
    fireEvent.click(screen.getByTestId('advanced-search-tag-add'));
    expect(props.onToggleTag).toHaveBeenCalledWith('DevOps');

    // Remove an individual tag chip.
    const removeButtons = screen.getAllByTestId('advanced-search-tag-remove');
    fireEvent.click(removeButtons[0]!);
    expect(props.onToggleTag).toHaveBeenCalledWith('Finance');

    // Clear every tag.
    fireEvent.click(screen.getByTestId('advanced-search-tags-clear'));
    expect(props.onClearTags).toHaveBeenCalledTimes(1);
  });

  it('shows the active filter count badge when filters are active', () => {
    renderPanel({
      fuzzyEnabled: false,
      selectedTags: ['Finance', 'Work'],
      dateRange: { from: '2026-01-01', to: null },
    });

    // fuzzy off (1) + 2 tags + 1 date bound = 4
    expect(screen.getByText('4')).toBeTruthy();
  });

  it('renders the active query line under recent searches', () => {
    renderPanel({ currentQuery: 'github' });

    expect(screen.getByText(/github/)).toBeTruthy();
  });

  it('initialises local date inputs from the parent range', () => {
    renderPanel({ dateRange: { from: '2026-01-01', to: '2026-12-31' } });

    const from = screen.getByTestId('advanced-search-date-from') as HTMLInputElement;
    const to = screen.getByTestId('advanced-search-date-to') as HTMLInputElement;

    expect(from.value).toBe('2026-01-01');
    expect(to.value).toBe('2026-12-31');

    fireEvent.change(from, { target: { value: '2026-03-01' } });
    expect(from.value).toBe('2026-03-01');
  });
});
