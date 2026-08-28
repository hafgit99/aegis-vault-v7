/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OrganisationSidebar from './OrganisationSidebar';
import { LanguageProvider } from '../i18n/LanguageContext';
import React from 'react';
import type { SmartFolder, TagDefinition, VaultFolder, VaultItem } from '../types';

const mockFolders: VaultFolder[] = [
  { id: 'f1', name: 'Personal', parentId: null, icon: 'folder', color: 'indigo', createdAt: '2026' },
];

const mockTags: TagDefinition[] = [
  { id: 't1', name: 'Important', slug: 'important', color: 'rose', createdAt: '2026' },
];

const mockSmartFolders: SmartFolder[] = [
  {
    id: 'sf-weak',
    name: 'Weak Passwords',
    icon: 'folder',
    color: 'emerald',
    rules: [{ kind: 'weakPassword' }],
    builtIn: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

const mockItems: VaultItem[] = [
  { id: 'i1', title: 'Test 1', username: 'u', password: '123', url: '', category: 'login', folderId: 'f1', tags: ['important'], createdAt: '2026', updatedAt: '2026' } as any,
];

describe('OrganisationSidebar', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders folders, smart folders, and tag manager button', () => {
    render(
      <LanguageProvider>
        <OrganisationSidebar
          folders={mockFolders}
          tags={mockTags}
          smartFolders={mockSmartFolders}
          smartFolderCounts={{ 'sf-weak': 1 }}
          items={mockItems}
          activeFolderId={null}
          activeSmartFolderId={null}
          onSelectFolder={vi.fn()}
          onSelectSmartFolder={vi.fn()}
          onCreateFolder={vi.fn()}
          onDeleteFolder={vi.fn()}
          onCreateTag={vi.fn()}
          onUpdateTag={vi.fn()}
          onDeleteTag={vi.fn()}
          onCreateSmartFolder={vi.fn()}
          onDeleteSmartFolder={vi.fn()}
          isOpen={true}
        />
      </LanguageProvider>,
    );

    expect(screen.queryByText('Personal')).not.toBeNull();
    expect(screen.queryByText('Weak Passwords')).not.toBeNull();
  });

  it('opens tag manager modal on manage tags click', () => {
    render(
      <LanguageProvider>
        <OrganisationSidebar
          folders={mockFolders}
          tags={mockTags}
          smartFolders={mockSmartFolders}
          smartFolderCounts={{ 'sf-weak': 1 }}
          items={mockItems}
          activeFolderId={null}
          activeSmartFolderId={null}
          onSelectFolder={vi.fn()}
          onSelectSmartFolder={vi.fn()}
          onCreateFolder={vi.fn()}
          onDeleteFolder={vi.fn()}
          onCreateTag={vi.fn()}
          onUpdateTag={vi.fn()}
          onDeleteTag={vi.fn()}
          onCreateSmartFolder={vi.fn()}
          onDeleteSmartFolder={vi.fn()}
          isOpen={true}
        />
      </LanguageProvider>,
    );

    const manageTagsBtn = screen.getByRole('button', { name: /yönet|manage|etiketler|tags/i });
    fireEvent.click(manageTagsBtn);

    expect(screen.getByTestId('tag-manager')).not.toBeNull();

    // Close tag manager
    const closeBtn = screen.getByRole('button', { name: /kapat|close/i });
    fireEvent.click(closeBtn);
  });

  it('selects smart folder and clears folder filter', () => {
    const onSelectFolder = vi.fn();
    const onSelectSmartFolder = vi.fn();

    render(
      <LanguageProvider>
        <OrganisationSidebar
          folders={mockFolders}
          tags={mockTags}
          smartFolders={mockSmartFolders}
          smartFolderCounts={{ 'sf-weak': 1 }}
          items={mockItems}
          activeFolderId={null}
          activeSmartFolderId={null}
          onSelectFolder={onSelectFolder}
          onSelectSmartFolder={onSelectSmartFolder}
          onCreateFolder={vi.fn()}
          onDeleteFolder={vi.fn()}
          onCreateTag={vi.fn()}
          onUpdateTag={vi.fn()}
          onDeleteTag={vi.fn()}
          onCreateSmartFolder={vi.fn()}
          onDeleteSmartFolder={vi.fn()}
          isOpen={true}
        />
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByText('Weak Passwords'));
    expect(onSelectFolder).toHaveBeenCalledWith(null);
    expect(onSelectSmartFolder).toHaveBeenCalledWith('sf-weak');
  });

  it('shows an empty-tags hint when no tags exist', () => {
    render(
      <LanguageProvider>
        <OrganisationSidebar
          folders={mockFolders}
          tags={[]}
          smartFolders={mockSmartFolders}
          smartFolderCounts={{ 'sf-weak': 1 }}
          items={mockItems}
          activeFolderId={null}
          activeSmartFolderId={null}
          onSelectFolder={vi.fn()}
          onSelectSmartFolder={vi.fn()}
          onCreateFolder={vi.fn()}
          onDeleteFolder={vi.fn()}
          onCreateTag={vi.fn()}
          onUpdateTag={vi.fn()}
          onDeleteTag={vi.fn()}
          onCreateSmartFolder={vi.fn()}
          onDeleteSmartFolder={vi.fn()}
          isOpen={true}
        />
      </LanguageProvider>,
    );

    const pills = screen.getByTestId('org-tag-pills');
    expect(pills.textContent).toContain('Kayıtlı etiket yok');
  });

  it('creates a favourite smart folder through the prompt', () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Work Favs');
    const onCreateSmartFolder = vi.fn();

    render(
      <LanguageProvider>
        <OrganisationSidebar
          folders={mockFolders}
          tags={mockTags}
          smartFolders={[]}
          smartFolderCounts={{}}
          items={mockItems}
          activeFolderId={null}
          activeSmartFolderId={null}
          onSelectFolder={vi.fn()}
          onSelectSmartFolder={vi.fn()}
          onCreateFolder={vi.fn()}
          onDeleteFolder={vi.fn()}
          onCreateTag={vi.fn()}
          onUpdateTag={vi.fn()}
          onDeleteTag={vi.fn()}
          onCreateSmartFolder={onCreateSmartFolder}
          onDeleteSmartFolder={vi.fn()}
          isOpen={true}
        />
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByTestId('org-new-smart-folder'));

    expect(onCreateSmartFolder).toHaveBeenCalledWith({
      name: 'Work Favs',
      rules: [{ kind: 'favorite' }],
    });

    promptSpy.mockRestore();
  });

  it('ignores a cancelled smart-folder prompt', () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null);
    const onCreateSmartFolder = vi.fn();

    render(
      <LanguageProvider>
        <OrganisationSidebar
          folders={mockFolders}
          tags={mockTags}
          smartFolders={[]}
          smartFolderCounts={{}}
          items={mockItems}
          activeFolderId={null}
          activeSmartFolderId={null}
          onSelectFolder={vi.fn()}
          onSelectSmartFolder={vi.fn()}
          onCreateFolder={vi.fn()}
          onDeleteFolder={vi.fn()}
          onCreateTag={vi.fn()}
          onUpdateTag={vi.fn()}
          onDeleteTag={vi.fn()}
          onCreateSmartFolder={onCreateSmartFolder}
          onDeleteSmartFolder={vi.fn()}
          isOpen={true}
        />
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByTestId('org-new-smart-folder'));

    expect(onCreateSmartFolder).not.toHaveBeenCalled();

    promptSpy.mockRestore();
  });

  it('keeps the sidebar off-screen when closed', () => {
    render(
      <LanguageProvider>
        <OrganisationSidebar
          folders={mockFolders}
          tags={mockTags}
          smartFolders={mockSmartFolders}
          smartFolderCounts={{ 'sf-weak': 1 }}
          items={mockItems}
          activeFolderId={null}
          activeSmartFolderId={null}
          onSelectFolder={vi.fn()}
          onSelectSmartFolder={vi.fn()}
          onCreateFolder={vi.fn()}
          onDeleteFolder={vi.fn()}
          onCreateTag={vi.fn()}
          onUpdateTag={vi.fn()}
          onDeleteTag={vi.fn()}
          onCreateSmartFolder={vi.fn()}
          onDeleteSmartFolder={vi.fn()}
          isOpen={false}
        />
      </LanguageProvider>,
    );

    expect(screen.getByTestId('organisation-sidebar').className).toContain('-translate-x-full');
  });

  it('selects a folder and clears the active smart folder', () => {
    const onSelectFolder = vi.fn();
    const onSelectSmartFolder = vi.fn();

    render(
      <LanguageProvider>
        <OrganisationSidebar
          folders={mockFolders}
          tags={mockTags}
          smartFolders={mockSmartFolders}
          smartFolderCounts={{ 'sf-weak': 1 }}
          items={mockItems}
          activeFolderId={null}
          activeSmartFolderId={null}
          onSelectFolder={onSelectFolder}
          onSelectSmartFolder={onSelectSmartFolder}
          onCreateFolder={vi.fn()}
          onDeleteFolder={vi.fn()}
          onCreateTag={vi.fn()}
          onUpdateTag={vi.fn()}
          onDeleteTag={vi.fn()}
          onCreateSmartFolder={vi.fn()}
          onDeleteSmartFolder={vi.fn()}
          isOpen={true}
        />
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByText('Personal'));

    expect(onSelectFolder).toHaveBeenCalledWith('f1');
    expect(onSelectSmartFolder).toHaveBeenCalledWith(null);
  });
});
