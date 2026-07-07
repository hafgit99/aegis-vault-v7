import { useCallback, useEffect, useState } from 'react';

import {
  applyBulkAction,
  type BulkActionInput,
  type BulkActionResult,
} from '../lib/bulkActions';
import {
  createFolder,
  deleteFolder,
  readFolderLibrary,
  ROOT_FOLDER_ID,
  updateFolder,
  writeFolderLibrary,
  type CreateFolderInput,
  type UpdateFolderInput,
} from '../lib/folders';
import {
  applySmartFolder,
  buildContext as buildSmartContext,
  builtInSmartFolders,
  countSmartFolder,
  createSmartFolder,
  deleteSmartFolder,
  readSmartFolders,
  updateSmartFolder,
  type CreateSmartFolderInput,
  type UpdateSmartFolderInput,
} from '../lib/smartFolders';
import {
  createTag,
  deleteTag,
  readTagLibrary,
  updateTag,
  writeTagLibrary,
  type UpdateTagInput,
} from '../lib/tags';
import type {
  SmartFolder,
  TagColorKey,
  TagDefinition,
  VaultFolder,
  VaultItem,
} from '../types';

/* ---------------------------------------------------------------- *
 * Tag library
 * ---------------------------------------------------------------- */

export function useTagLibrary() {
  const [tags, setTags] = useState<TagDefinition[]>(() => readTagLibrary());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'aegis-vault-v7-tag-library-v1') {
        setTags(readTagLibrary());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const upsert = useCallback(
    (input: { name: string; color?: TagColorKey }) => {
      const next = createTag(input);
      if (next) setTags(readTagLibrary());
      return next;
    },
    [],
  );

  const patch = useCallback((id: string, patch: UpdateTagInput) => {
    const next = updateTag(id, patch);
    setTags(next);
    return next;
  }, []);

  const remove = useCallback((id: string) => {
    const next = deleteTag(id);
    setTags(next);
    return next;
  }, []);

  const setAll = useCallback((entries: TagDefinition[]) => {
    const next = writeTagLibrary(entries);
    setTags(next);
    return next;
  }, []);

  return { tags, createTag: upsert, updateTag: patch, deleteTag: remove, writeTagLibrary: setAll };
}

/* ---------------------------------------------------------------- *
 * Folder library
 * ---------------------------------------------------------------- */

export function useVaultFolders() {
  const [folders, setFolders] = useState<VaultFolder[]>(() => readFolderLibrary());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'aegis-vault-v7-folder-library-v1') {
        setFolders(readFolderLibrary());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const create = useCallback((input: CreateFolderInput) => {
    const folder = createFolder(input);
    setFolders(readFolderLibrary());
    return folder;
  }, []);

  const patch = useCallback((id: string, input: UpdateFolderInput) => {
    const next = updateFolder(id, input);
    setFolders(next);
    return next;
  }, []);

  const remove = useCallback((id: string) => {
    const next = deleteFolder(id);
    setFolders(next);
    return next;
  }, []);

  const setAll = useCallback((entries: VaultFolder[]) => {
    const next = writeFolderLibrary(entries);
    setFolders(next);
    return next;
  }, []);

  return {
    folders,
    createFolder: create,
    updateFolder: patch,
    deleteFolder: remove,
    writeFolderLibrary: setAll,
    rootFolderId: ROOT_FOLDER_ID,
  };
}

/* ---------------------------------------------------------------- *
 * Smart folders
 * ---------------------------------------------------------------- */

export function useSmartFolders(items: VaultItem[]) {
  const [folders, setFolders] = useState<SmartFolder[]>(() => readSmartFolders());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'aegis-vault-v7-smart-folders-v1') {
        setFolders(readSmartFolders());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const create = useCallback((input: CreateSmartFolderInput) => {
    const next = createSmartFolder(input);
    setFolders(readSmartFolders());
    return next;
  }, []);

  const patch = useCallback((id: string, input: UpdateSmartFolderInput) => {
    const next = updateSmartFolder(id, input);
    setFolders(readSmartFolders());
    return next;
  }, []);

  const remove = useCallback((id: string) => {
    const next = deleteSmartFolder(id);
    setFolders(readSmartFolders());
    return next;
  }, []);

  // Compute counts for the current vault items.
  const counts = (() => {
    const context = buildSmartContext(items);
    const map: Record<string, number> = {};
    for (const folder of folders) {
      map[folder.id] = countSmartFolder(folder, items, context);
    }
    return map;
  })();

  return {
    smartFolders: folders,
    builtInSmartFolders: builtInSmartFolders(),
    createSmartFolder: create,
    updateSmartFolder: patch,
    deleteSmartFolder: remove,
    applySmartFolder: (folder: SmartFolder) => applySmartFolder(folder, items),
    counts,
  };
}

/* ---------------------------------------------------------------- *
 * Bulk selection
 * ---------------------------------------------------------------- */

export interface UseBulkSelectionResult {
  selectedIds: Set<string>;
  isSelectionMode: boolean;
  selectionCount: number;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  selectOnly: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clear: () => void;
  selectRange: (ids: string[], fromId: string, toId: string) => void;
  enterSelectionMode: (initialId?: string) => void;
  exitSelectionMode: () => void;
}

export function useBulkSelection(): UseBulkSelectionResult {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  const toggle = useCallback((id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectOnly = useCallback((id: string) => {
    setSelectedIds(new Set([id]));
    setIsSelectionMode(true);
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const clear = useCallback(() => {
    setSelectedIds(new Set());
    setIsSelectionMode(false);
  }, []);

  const selectRange = useCallback((ids: string[], fromId: string, toId: string) => {
    const fromIndex = ids.indexOf(fromId);
    const toIndex = ids.indexOf(toId);
    if (fromIndex < 0 || toIndex < 0) return;
    const [start, end] = fromIndex < toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex];
    const slice = ids.slice(start, end + 1);
    setSelectedIds(new Set(slice));
  }, []);

  const enterSelectionMode = useCallback((initialId?: string) => {
    setIsSelectionMode(true);
    if (initialId) {
      setSelectedIds(new Set([initialId]));
    }
  }, []);

  const exitSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  return {
    selectedIds,
    isSelectionMode,
    selectionCount: selectedIds.size,
    isSelected: (id: string) => selectedIds.has(id),
    toggle,
    selectOnly,
    selectAll,
    clear,
    selectRange,
    enterSelectionMode,
    exitSelectionMode,
  };
}

/* ---------------------------------------------------------------- *
 * Combined bulk-action dispatcher
 * ---------------------------------------------------------------- */

export function useBulkActionRunner(items: VaultItem[], onChange: (items: VaultItem[]) => void) {
  return useCallback(
    (input: BulkActionInput): BulkActionResult => {
      const result = applyBulkAction(items, input);
      if (result.affected > 0) onChange(result.items);
      return result;
    },
    [items, onChange],
  );
}

