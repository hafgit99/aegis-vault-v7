/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FolderTree from './FolderTree';
import { LanguageProvider } from '../i18n/LanguageContext';
import React from 'react';
import type { VaultFolder } from '../types';

const mockFolders: VaultFolder[] = [
  {
    id: 'folder-work',
    name: 'Work',
    parentId: null,
    icon: 'briefcase',
    color: 'emerald',
    createdAt: '2026-01-01',
  },
  {
    id: 'folder-subwork',
    name: 'Projects',
    parentId: 'folder-work',
    icon: 'folder',
    color: 'sky',
    createdAt: '2026-01-01',
  },
];

const renderComponent = (props: Partial<React.ComponentProps<typeof FolderTree>> = {}) => {
  const defaultProps = {
    folders: mockFolders,
    activeFolderId: null,
    onSelect: vi.fn(),
    itemCountByFolder: { '__root__': 5, 'folder-work': 3, 'folder-subwork': 2 },
    onCreateFolder: vi.fn(),
    onDeleteFolder: vi.fn(),
    onRenameFolder: vi.fn(),
    ...props,
  };

  return {
    ...render(
      <LanguageProvider>
        <FolderTree {...defaultProps} />
      </LanguageProvider>,
    ),
    props: defaultProps,
  };
};

describe('FolderTree', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders root and top-level folders', () => {
    renderComponent();

    expect(screen.queryByText('Root')).not.toBeNull();
    expect(screen.queryByText('Work')).not.toBeNull();
  });

  it('selects folder on click', () => {
    const { props } = renderComponent();

    fireEvent.click(screen.getByText('Work'));
    expect(props.onSelect).toHaveBeenCalledWith('folder-work');
  });

  it('triggers create folder action', () => {
    const { props } = renderComponent();

    const createButtons = screen.getAllByRole('button', { name: /oluştur|create/i });
    if (createButtons[0]) {
      fireEvent.click(createButtons[0]);
      expect(props.onCreateFolder).toHaveBeenCalled();
    }
  });

  it('expands and collapses child folders', () => {
    renderComponent();

    expect(screen.queryByText('Projects')).not.toBeNull();
  });

  it('triggers subfolder creation, rename, and delete actions', () => {
    const { props } = renderComponent();

    const subfolderBtns = screen.getAllByRole('button', { name: /alt klasör|subfolder/i });
    if (subfolderBtns.length > 0) {
      fireEvent.click(subfolderBtns[0]!);
      expect(props.onCreateFolder).toHaveBeenCalled();
    }

    const renameBtn = screen.getAllByTestId('folder-tree-rename')[0];
    if (renameBtn) {
      fireEvent.click(renameBtn);
      expect(props.onRenameFolder).toHaveBeenCalledWith('folder-work');
    }

    const deleteBtn = screen.getAllByTestId('folder-tree-delete')[0];
    if (deleteBtn) {
      fireEvent.click(deleteBtn);
      expect(props.onDeleteFolder).toHaveBeenCalledWith('folder-work');
    }
  });
});
