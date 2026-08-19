/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SmartFolderCard from './SmartFolderCard';
import { LanguageProvider } from '../i18n/LanguageContext';
import React from 'react';
import type { SmartFolder } from '../types';

const mockSmartFolder: SmartFolder = {
  id: 'sf-1',
  name: 'Custom Filter',
  icon: 'folder',
  color: 'emerald',
  rules: [{ kind: 'category', categories: ['login'] }],
  builtIn: false,
  createdAt: '2026',
};

describe('SmartFolderCard', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders smart folder name and match count', () => {
    const onSelect = vi.fn();
    render(
      <LanguageProvider>
        <SmartFolderCard
          folder={mockSmartFolder}
          count={5}
          isActive={false}
          onSelect={onSelect}
          onDelete={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(screen.queryByText('Custom Filter')).not.toBeNull();
    expect(screen.queryByText('5')).not.toBeNull();
  });

  it('triggers onSelect when card is clicked', () => {
    const onSelect = vi.fn();
    render(
      <LanguageProvider>
        <SmartFolderCard
          folder={mockSmartFolder}
          count={5}
          isActive={false}
          onSelect={onSelect}
          onDelete={vi.fn()}
        />
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByText('Custom Filter'));
    expect(onSelect).toHaveBeenCalled();
  });

  it('triggers onDelete when delete button is clicked on user-defined smart folder', () => {
    const onDelete = vi.fn();
    render(
      <LanguageProvider>
        <SmartFolderCard
          folder={mockSmartFolder}
          count={5}
          isActive={false}
          onSelect={vi.fn()}
          onDelete={onDelete}
        />
      </LanguageProvider>,
    );

    const deleteBtn = screen.getAllByRole('button', { name: /akıllı klasörü sil|sil|delete/i });
    if (deleteBtn[0]) {
      fireEvent.click(deleteBtn[0]);
      expect(onDelete).toHaveBeenCalled();
    }
  });

  it('triggers onRename and keyboard actions on rename button', () => {
    const onRename = vi.fn();
    render(
      <LanguageProvider>
        <SmartFolderCard
          folder={mockSmartFolder}
          count={5}
          isActive={false}
          onSelect={vi.fn()}
          onRename={onRename}
        />
      </LanguageProvider>,
    );

    const renameBtn = screen.getByRole('button', { name: /yeniden adlandır|rename/i });
    fireEvent.click(renameBtn);
    expect(onRename).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(renameBtn, { key: 'Enter' });
    expect(onRename).toHaveBeenCalledTimes(2);
  });
});
