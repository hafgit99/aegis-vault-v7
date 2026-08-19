/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BulkActionBar from './BulkActionBar';
import { LanguageProvider } from '../i18n/LanguageContext';
import React from 'react';
import type { VaultItem } from '../types';

const mockItems: VaultItem[] = [
  { id: 'i1', title: 'Item 1', username: 'u1', password: 'p1', url: '', category: 'login', favorite: false, createdAt: '2026', updatedAt: '2026' },
  { id: 'i2', title: 'Item 2', username: 'u2', password: 'p2', url: '', category: 'login', favorite: true, createdAt: '2026', updatedAt: '2026' },
];

describe('BulkActionBar', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders bulk action bar with selected count', () => {
    const onClear = vi.fn();
    const onApply = vi.fn();

    render(
      <LanguageProvider>
        <BulkActionBar
          selectedIds={new Set(['i1', 'i2'])}
          selectedItems={mockItems}
          folders={[]}
          library={[]}
          onClear={onClear}
          onApply={onApply}
        />
      </LanguageProvider>,
    );

    expect(screen.getByTestId('bulk-count').textContent).toBe('2');
  });

  it('triggers favorite action toggle', () => {
    const onApply = vi.fn();

    render(
      <LanguageProvider>
        <BulkActionBar
          selectedIds={new Set(['i1'])}
          selectedItems={[mockItems[0]!]}
          folders={[]}
          library={[]}
          onClear={vi.fn()}
          onApply={onApply}
        />
      </LanguageProvider>,
    );

    const favBtn = screen.getByTestId('bulk-favorite');
    fireEvent.click(favBtn);

    expect(onApply).toHaveBeenCalledWith({ kind: 'favorite' });
  });

  it('triggers bulk delete action', () => {
    const onApply = vi.fn();

    render(
      <LanguageProvider>
        <BulkActionBar
          selectedIds={new Set(['i1'])}
          selectedItems={[mockItems[0]!]}
          folders={[]}
          library={[]}
          onClear={vi.fn()}
          onApply={onApply}
        />
      </LanguageProvider>,
    );

    const deleteBtn = screen.getByRole('button', { name: /çöp|sil|delete|trash/i });
    fireEvent.click(deleteBtn);

    expect(onApply).toHaveBeenCalledWith({ kind: 'delete' });
  });

  it('triggers bulk add tag and move to folder actions', () => {
    const onApply = vi.fn();

    render(
      <LanguageProvider>
        <BulkActionBar
          selectedIds={new Set(['i1'])}
          selectedItems={[mockItems[0]!]}
          folders={[{ id: 'f-1', name: 'Work', parentId: null, color: 'emerald', icon: 'folder', createdAt: '' }]}
          library={[{ name: 'Finance', color: 'emerald' }]}
          onClear={vi.fn()}
          onApply={onApply}
        />
      </LanguageProvider>,
    );

    // Add tag
    const tagInput = screen.getByTestId('bulk-tag-input');
    fireEvent.change(tagInput, { target: { value: 'Finance' } });
    const addTagBtn = screen.getByTestId('bulk-add-tag');
    fireEvent.click(addTagBtn);
    expect(onApply).toHaveBeenCalledWith({ kind: 'addTag', tag: 'Finance' });

    // Move to folder
    const folderSelect = screen.getByTestId('bulk-folder-select');
    fireEvent.change(folderSelect, { target: { value: 'f-1' } });
    const moveBtn = screen.getByTestId('bulk-move');
    fireEvent.click(moveBtn);
    expect(onApply).toHaveBeenCalledWith({ kind: 'moveToFolder', folderId: 'f-1' });

    // Remove from folder (__none__)
    fireEvent.change(folderSelect, { target: { value: '__none__' } });
    fireEvent.click(moveBtn);
    expect(onApply).toHaveBeenCalledWith({ kind: 'removeFromFolder' });
  });
});
