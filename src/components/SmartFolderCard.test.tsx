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

  it('triggers onRename via the Space key', () => {
    const onRename = vi.fn();
    render(
      <LanguageProvider>
        <SmartFolderCard
          folder={mockSmartFolder}
          count={0}
          isActive={false}
          onSelect={vi.fn()}
          onRename={onRename}
        />
      </LanguageProvider>,
    );

    fireEvent.keyDown(screen.getByRole('button', { name: /yeniden adlandır|rename/i }), { key: ' ' });

    expect(onRename).toHaveBeenCalledTimes(1);
  });

  it('triggers onDelete via keyboard for user-defined folders', () => {
    const onDelete = vi.fn();
    render(
      <LanguageProvider>
        <SmartFolderCard
          folder={mockSmartFolder}
          count={1}
          isActive={false}
          onSelect={vi.fn()}
          onDelete={onDelete}
        />
      </LanguageProvider>,
    );

    const deleteBtn = screen.getAllByRole('button', { name: /akıllı klasörü sil|sil|delete/i });
    if (deleteBtn[0]) {
      fireEvent.keyDown(deleteBtn[0], { key: 'Enter' });
      fireEvent.keyDown(deleteBtn[0], { key: ' ' });
      expect(onDelete).toHaveBeenCalledTimes(2);
    }
  });

  it('hides the delete button when onDelete is omitted', () => {
    render(
      <LanguageProvider>
        <SmartFolderCard
          folder={mockSmartFolder}
          count={0}
          isActive={false}
          onSelect={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(screen.queryByRole('button', { name: /akıllı klasörü sil|sil|delete/i })).toBeNull();
  });

  it('renders localized names and the built-in badge for built-in folders', () => {
    const builtInFolder: SmartFolder = {
      id: 'smart-favorites',
      name: 'Favorites',
      icon: 'star',
      color: 'amber',
      rules: [{ kind: 'favorite' }],
      builtIn: true,
      createdAt: '2026',
    };

    render(
      <LanguageProvider>
        <SmartFolderCard
          folder={builtInFolder}
          count={3}
          isActive={true}
          onSelect={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(screen.getByText('Favoriler')).toBeTruthy();
    expect(screen.getByText('YERLEŞİK')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /akıllı klasörü sil|sil|delete/i })).toBeNull();
  });

  it('renders the localized description and stops event propagation on rename click', () => {
    const onSelect = vi.fn();
    const onRename = vi.fn();
    const builtInFolder: SmartFolder = {
      id: 'smart-favorites',
      name: 'Favorites',
      icon: 'star',
      color: 'amber',
      rules: [{ kind: 'favorite' }],
      builtIn: true,
      createdAt: '2026',
      description: 'Built-in favourites',
    };

    render(
      <LanguageProvider>
        <SmartFolderCard
          folder={builtInFolder}
          count={3}
          isActive={false}
          onSelect={onSelect}
          onRename={onRename}
        />
      </LanguageProvider>,
    );

    expect(screen.getByText('Favori olarak işaretlediğiniz ögeler.')).toBeTruthy();
    fireEvent.click(screen.getByText('✎'));
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('falls back to the folder icon for unknown icon keys', () => {
    const unknownIcon: SmartFolder = {
      id: 'sf-x',
      name: 'Mystery',
      icon: 'does-not-exist' as SmartFolder['icon'],
      color: 'emerald',
      rules: [{ kind: 'category', categories: ['login'] }],
      builtIn: false,
      createdAt: '2026',
    };

    render(
      <LanguageProvider>
        <SmartFolderCard
          folder={unknownIcon}
          count={0}
          isActive={false}
          onSelect={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(screen.getByText('Mystery')).toBeTruthy();
    expect(screen.getByTestId('smart-folder-card')).toBeTruthy();
  });
});
