/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TagManager from './TagManager';
import { LanguageProvider } from '../i18n/LanguageContext';
import React from 'react';
import type { TagDefinition } from '../types';

const mockTags: TagDefinition[] = [
  { id: 'tag-1', name: 'Finance', slug: 'finance', color: 'emerald', createdAt: '2026-01-01' },
  { id: 'tag-2', name: 'Security', slug: 'security', color: 'indigo', createdAt: '2026-01-01' },
];

const renderComponent = (props: Partial<React.ComponentProps<typeof TagManager>> = {}) => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    library: mockTags,
    tagUsage: { 'finance': 3, 'security': 1 },
    onCreate: vi.fn((input) => ({ id: 'new-id', name: input.name, slug: input.name.toLowerCase(), color: input.color, createdAt: '2026', updatedAt: '2026' })),
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    ...props,
  };

  return {
    ...render(
      <LanguageProvider>
        <TagManager {...defaultProps} />
      </LanguageProvider>,
    ),
    props: defaultProps,
  };
};

describe('TagManager', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders tag list with usage counts', () => {
    renderComponent();

    expect(screen.queryByText('Finance')).not.toBeNull();
    expect(screen.queryByText('Security')).not.toBeNull();
  });

  it('creates a new tag when input is submitted', () => {
    const { props } = renderComponent();

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Work' } });

    const createBtn = screen.getByRole('button', { name: /oluştur|create|ekle|add/i });
    fireEvent.click(createBtn);

    expect(props.onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Work' }),
    );
  });

  it('triggers delete on tag row', () => {
    const { props } = renderComponent();

    const deleteButtons = screen.getAllByTestId('tag-manager-delete');
    if (deleteButtons[0]) {
      fireEvent.click(deleteButtons[0]);
      expect(props.onDelete).toHaveBeenCalledWith('tag-1');
    }
  });

  it('allows inline name editing and color change', () => {
    const { props } = renderComponent();

    // Click name button to begin editing
    const nameBtn = screen.getAllByTestId('tag-manager-name-button')[0];
    fireEvent.click(nameBtn!);

    const editInput = screen.getByTestId('tag-manager-edit-input');
    fireEvent.change(editInput, { target: { value: 'Finance Updated' } });
    fireEvent.keyDown(editInput, { key: 'Enter' });

    expect(props.onUpdate).toHaveBeenCalledWith('tag-1', { name: 'Finance Updated' });

    // Change color dropdown
    const colorSelect = screen.getAllByTestId('tag-manager-row-color')[0];
    fireEvent.change(colorSelect!, { target: { value: 'amber' } });
    expect(props.onUpdate).toHaveBeenCalledWith('tag-1', { color: 'amber' });
  });

  it('handles blur, escape key and empty library in TagManager', () => {
    renderComponent();

    // Begin edit and cancel with Escape
    const nameBtn = screen.getAllByTestId('tag-manager-name-button')[0];
    fireEvent.click(nameBtn!);
    const editInput = screen.getByTestId('tag-manager-edit-input');
    fireEvent.keyDown(editInput, { key: 'Escape' });

    // Change draft color select
    const draftColorSelect = screen.getByTestId('tag-manager-color');
    fireEvent.change(draftColorSelect, { target: { value: 'rose' } });

    // Render empty library
    cleanup();
    renderComponent({ library: [] });
    expect(screen.getByTestId('tag-manager-empty')).toBeTruthy();
  });
});
