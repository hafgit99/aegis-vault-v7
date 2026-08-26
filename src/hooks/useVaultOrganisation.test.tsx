// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useVaultOrganisation } from './useVaultOrganisation';
import { LanguageProvider } from '../i18n/LanguageContext';
import {
  TAG_LIBRARY_STORAGE_KEY,
  createTag,
} from '../lib/tags';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <LanguageProvider>{children}</LanguageProvider>
);

describe('useVaultOrganisation', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('exposes the organisation collections and selection state', () => {
    const { result } = renderHook(() => useVaultOrganisation([]), { wrapper });

    expect(result.current.tags).toEqual([]);
    expect(result.current.folders).toEqual([]);
    expect(result.current.smartFolders.length).toBeGreaterThan(0);
    expect(result.current.selectedFolderId).toBeNull();
    expect(result.current.activeSmartFolderId).toBeNull();

    act(() => {
      result.current.setSelectedFolderId('folder-1');
      result.current.setActiveSmartFolderId('smart-1');
    });
    expect(result.current.selectedFolderId).toBe('folder-1');
    expect(result.current.activeSmartFolderId).toBe('smart-1');
  });

  it('creates a folder through the prompt handler and clears a deleted selection', () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Work');
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { result } = renderHook(() => useVaultOrganisation([]), { wrapper });

    act(() => {
      result.current.handleCreateFolder(null);
    });
    expect(result.current.folders.some((f) => f.name === 'Work')).toBe(true);

    const folderId = result.current.folders[0]!.id;
    act(() => {
      result.current.setSelectedFolderId(folderId);
    });

    act(() => {
      result.current.handleDeleteFolder(folderId);
    });
    expect(result.current.folders.some((f) => f.id === folderId)).toBe(false);
    // Deleting the selected folder resets the selection.
    expect(result.current.selectedFolderId).toBeNull();

    promptSpy.mockRestore();
    confirmSpy.mockRestore();
  });

  it('ignores blank folder names and cancelled delete confirmations', () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('   ');
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { result } = renderHook(() => useVaultOrganisation([]), { wrapper });

    act(() => {
      result.current.handleCreateFolder(null);
    });
    expect(result.current.folders).toEqual([]);

    promptSpy.mockReturnValue('Keep');
    act(() => {
      result.current.handleCreateFolder(null);
    });
    const folderId = result.current.folders[0]!.id;
    act(() => {
      result.current.handleDeleteFolder(folderId);
    });
    expect(result.current.folders.some((f) => f.id === folderId)).toBe(true);

    promptSpy.mockRestore();
    confirmSpy.mockRestore();
  });

  it('delegates tag creation to the tag library', () => {
    const { result } = renderHook(() => useVaultOrganisation([]), { wrapper });

    act(() => {
      result.current.createTag({ name: 'Social', color: 'cyan' });
    });
    expect(result.current.tags.some((t) => t.slug === 'social')).toBe(true);
    expect(localStorage.getItem(TAG_LIBRARY_STORAGE_KEY)).toContain('social');

    // The underlying lib-level duplicate guard still applies.
    expect(createTag({ name: 'Social' })!.slug).toBe('social');
  });
});
