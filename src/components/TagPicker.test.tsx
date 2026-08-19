/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TagPicker from './TagPicker';
import { LanguageProvider } from '../i18n/LanguageContext';
import React from 'react';
import type { TagDefinition } from '../types';

const mockLibrary: TagDefinition[] = [
  { id: 't1', name: 'finance', slug: 'finance', color: 'emerald', createdAt: '2026' },
  { id: 't2', name: 'work', slug: 'work', color: 'indigo', createdAt: '2026' },
];

describe('TagPicker', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders selected tag chips', () => {
    const onChange = vi.fn();
    render(
      <LanguageProvider>
        <TagPicker selected={['finance', 'work']} library={mockLibrary} onChange={onChange} />
      </LanguageProvider>,
    );

    expect(screen.queryByText('finance')).not.toBeNull();
    expect(screen.queryByText('work')).not.toBeNull();
  });

  it('removes a tag on chip remove click', () => {
    const onChange = vi.fn();
    render(
      <LanguageProvider>
        <TagPicker selected={['finance', 'work']} library={mockLibrary} onChange={onChange} />
      </LanguageProvider>,
    );

    const removeButtons = screen.getAllByRole('button');
    if (removeButtons[0]) {
      fireEvent.click(removeButtons[0]);
      expect(onChange).toHaveBeenCalledWith(['work']);
    }
  });

  it('adds a new tag when draft is entered', () => {
    const onChange = vi.fn();
    render(
      <LanguageProvider>
        <TagPicker selected={['finance']} library={mockLibrary} onChange={onChange} />
      </LanguageProvider>,
    );

    const input = screen.getByTestId('tag-picker-input');
    fireEvent.change(input, { target: { value: 'personal' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(onChange).toHaveBeenCalledWith(['finance', 'personal']);
  });

  it('handles add button click, duplicate tags and empty state', () => {
    const onChange = vi.fn();
    render(
      <LanguageProvider>
        <TagPicker selected={['finance']} library={mockLibrary} onChange={onChange} />
      </LanguageProvider>,
    );

    // Try adding duplicate tag
    const input = screen.getByTestId('tag-picker-input');
    fireEvent.change(input, { target: { value: 'finance' } });
    const addBtn = screen.getByTestId('tag-picker-add');
    fireEvent.click(addBtn);
    expect(onChange).not.toHaveBeenCalled();

    // Add unique tag via button click
    fireEvent.change(input, { target: { value: 'social' } });
    fireEvent.click(addBtn);
    expect(onChange).toHaveBeenCalledWith(['finance', 'social']);
  });

  it('renders empty picker placeholder when no tags are selected', () => {
    render(
      <LanguageProvider>
        <TagPicker selected={[]} library={mockLibrary} onChange={vi.fn()} />
      </LanguageProvider>,
    );

    expect(screen.getByTestId('tag-picker')).toBeTruthy();
  });
});
