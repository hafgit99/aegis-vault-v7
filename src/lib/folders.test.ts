/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  createFolder,
  updateFolder,
  deleteFolder,
  childrenOf,
  ancestorsOf,
  subtreeOf,
  isDescendantOrSelf,
  depthOf,
  folderMatchSet,
  FolderCycleError,
  FolderDepthError,
  FolderLimitError,
  ROOT_FOLDER_ID,
  writeFolderLibrary,
  readFolderLibrary,
} from './folders';

describe('Folders Library', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('creates and reads folders', () => {
    const f1 = createFolder({ name: 'Work', parentId: null, color: 'blue', icon: 'briefcase' });
    expect(f1.id).toBeDefined();
    expect(f1.name).toBe('Work');
    expect(f1.parentId).toBeNull();
    expect(f1.color).toBe('blue');
    expect(f1.icon).toBe('briefcase');
  });

  it('detects depth limitations and throws', () => {
    let parentId: string | null = null;
    // Create folders up to MAX_DEPTH (8)
    for (let i = 0; i < 8; i++) {
      const f = createFolder({ name: `Folder ${i}`, parentId });
      parentId = f.id;
    }

    // Creating 9th level should throw FolderDepthError
    expect(() => {
      createFolder({ name: 'Deep', parentId });
    }).toThrow(FolderDepthError);
  });

  it('throws FolderLimitError when library is full', () => {
    const largeLibrary = Array.from({ length: 500 }, (_, i) => ({
      id: `mock-${i}`,
      name: `Folder ${i}`,
      parentId: null,
      color: 'slate' as const,
      icon: 'folder' as const,
      createdAt: '2026-07-07',
    }));
    localStorage.setItem('aegis-vault-v7-folder-library-v1', JSON.stringify(largeLibrary));
    expect(() => {
      createFolder({ name: 'Overflow', parentId: null });
    }).toThrow(FolderLimitError);
  });

  it('throws FolderCycleError when parent folder does not exist', () => {
    expect(() => {
      createFolder({ name: 'Bad Parent', parentId: 'non-existent-id' });
    }).toThrow(FolderCycleError);
  });

  it('throws FolderCycleError when trying to edit root pseudo-folder', () => {
    expect(() => {
      updateFolder(ROOT_FOLDER_ID, { name: 'Root Renamed' });
    }).toThrow(FolderCycleError);
  });

  it('throws FolderDepthError on update if parent folder depth is too deep', () => {
    let parentId: string | null = null;
    for (let i = 0; i < 7; i++) {
      const f = createFolder({ name: `Folder ${i}`, parentId });
      parentId = f.id;
    }
    const f8 = createFolder({ name: 'Folder 7', parentId });
    
    const another = createFolder({ name: 'Another', parentId: null });
    expect(() => {
      updateFolder(another.id, { parentId: f8.id });
    }).toThrow(FolderDepthError);
  });

  it('updates parent and prevents cycles', () => {
    const f1 = createFolder({ name: 'Root Folder', parentId: null });
    const f2 = createFolder({ name: 'Child Folder', parentId: f1.id });

    // Try to make f1 child of f2
    expect(() => {
      updateFolder(f1.id, { parentId: f2.id });
    }).toThrow(FolderCycleError);

    // Try to make f1 child of itself
    expect(() => {
      updateFolder(f1.id, { parentId: f1.id });
    }).toThrow(FolderCycleError);

    // Successful update
    const next = updateFolder(f2.id, { name: 'Updated Name', parentId: null });
    const updatedF2 = next.find(f => f.id === f2.id);
    expect(updatedF2!.name).toBe('Updated Name');
    expect(updatedF2!.parentId).toBeNull();
  });

  it('resolves ancestors, subtrees, and children correctly', () => {
    const f1 = createFolder({ name: 'Grandparent', parentId: null })!;
    const f2 = createFolder({ name: 'Parent', parentId: f1.id })!;
    const f3 = createFolder({ name: 'Child', parentId: f2.id })!;

    const library = [f1, f2, f3];

    const kids = childrenOf(library, f1.id);
    expect(kids.length).toBe(1);
    expect(kids[0]!.id).toBe(f2.id);

    const ancestors = ancestorsOf(library, f3.id);
    expect(ancestors.map(f => f.id)).toContain(f1.id);
    expect(ancestors.map(f => f.id)).toContain(f2.id);

    const subtree = subtreeOf(library, f1.id);
    expect(subtree.map(f => f.id)).toEqual([f1.id, f2.id, f3.id]);

    expect(isDescendantOrSelf(library, f3.id, f1.id)).toBe(true);
    expect(isDescendantOrSelf(library, f1.id, f3.id)).toBe(false);

    expect(depthOf(library, f3.id)).toBe(2);
  });

  it('deletes folder and recursively its descendants', () => {
    const f1 = createFolder({ name: 'Folder A', parentId: null })!;
    const f2 = createFolder({ name: 'Folder B', parentId: f1.id })!;
    
    const afterDelete = deleteFolder(f1.id);
    expect(afterDelete.some(f => f.id === f1.id)).toBe(false);
    expect(afterDelete.some(f => f.id === f2.id)).toBe(false);
  });

  it('generates correct folderMatchSet', () => {
    const f1 = createFolder({ name: 'Inbox', parentId: null })!;
    const library = [f1];

    expect(folderMatchSet(library, 'root')).toBe('root');
    expect(folderMatchSet(library, null)).toBe('root');
    
    const set = folderMatchSet(library, `folder:${f1.id}`) as Set<string>;
    expect(set.has(f1.id)).toBe(true);
  });

  it('covers remaining branches', () => {
    const initial = createFolder({ name: 'F', parentId: null });
    const written = writeFolderLibrary([initial]);
    expect(written).toEqual([initial]);

    localStorage.setItem('aegis-vault-v7-folder-library-v1', 'invalid-json-{');
    const list = readFolderLibrary();
    expect(list).toEqual([]);
  });

  it('sorts children by custom order and ignores root delete', () => {
    const f1 = { id: 'f-1', name: 'Zebra', parentId: null, order: 2, color: 'emerald' as const, icon: 'folder' as const, createdAt: '' };
    const f2 = { id: 'f-2', name: 'Apple', parentId: null, order: 1, color: 'emerald' as const, icon: 'folder' as const, createdAt: '' };

    const children = childrenOf([f1, f2], null);
    expect(children[0]!.id).toBe('f-2');
    expect(children[1]!.id).toBe('f-1');

    expect(deleteFolder(ROOT_FOLDER_ID)).toEqual([]);
  });
});
