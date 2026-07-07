/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Folder library + tree algorithms for the 5.3 organisation feature.
 *
 * The library holds the user's `VaultFolder` tree. Items reference
 * folders by id (`VaultItem.folderId`). A folder with `parentId = null`
 * is a top-level entry; nested folders form a strict tree (cycles
 * are rejected by every mutator).
 *
 * The helpers in this file are pure functions over the folder list —
 * they don't depend on React. The hook layer (`useVaultFolders.ts`)
 * owns persistence and state.
 */

import type { FolderIconKey, TagColorKey, VaultFolder } from '../types';

export const FOLDER_LIBRARY_STORAGE_KEY = 'aegis-vault-v7-folder-library-v1';
export const ROOT_FOLDER_ID = '__root__';
export const MAX_FOLDER_DEPTH = 8;
export const MAX_FOLDER_ENTRIES = 500;

/** Special placeholder for "no folder" / "all items at root". */
export const ROOT_FOLDER: VaultFolder = {
  id: ROOT_FOLDER_ID,
  name: 'Root',
  parentId: null,
  color: 'slate',
  icon: 'inbox',
  createdAt: '1970-01-01T00:00:00.000Z',
};

function isStorageAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function isValidColor(value: unknown): value is TagColorKey {
  const allowed: TagColorKey[] = [
    'rose', 'pink', 'fuchsia', 'purple', 'violet', 'indigo',
    'blue', 'sky', 'cyan', 'teal', 'emerald', 'green', 'lime',
    'yellow', 'amber', 'orange', 'red', 'slate',
  ];
  return typeof value === 'string' && (allowed as string[]).includes(value);
}

const VALID_ICONS: FolderIconKey[] = [
  'folder', 'inbox', 'star', 'briefcase', 'home', 'credit-card',
  'key-round', 'shield', 'lock', 'tag', 'user', 'globe', 'archive', 'file-text',
];

function isValidIcon(value: unknown): value is FolderIconKey {
  return typeof value === 'string' && (VALID_ICONS as string[]).includes(value);
}

function parseEntry(raw: unknown): VaultFolder | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== 'string' || obj.id.length === 0) return null;
  if (typeof obj.name !== 'string' || obj.name.trim().length === 0) return null;
  if (obj.parentId !== null && typeof obj.parentId !== 'string') return null;
  if (!isValidColor(obj.color)) return null;
  if (!isValidIcon(obj.icon)) return null;
  if (typeof obj.createdAt !== 'string') return null;
  return {
    id: obj.id,
    name: obj.name.trim(),
    parentId: obj.parentId as string | null,
    color: obj.color,
    icon: obj.icon,
    order: typeof obj.order === 'number' ? obj.order : undefined,
    createdAt: obj.createdAt,
  };
}

function readRaw(): VaultFolder[] {
  if (!isStorageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(FOLDER_LIBRARY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: VaultFolder[] = [];
    for (const entry of parsed) {
      const valid = parseEntry(entry);
      if (valid) out.push(valid);
    }
    return out.slice(0, MAX_FOLDER_ENTRIES);
  } catch {
    return [];
  }
}

function writeRaw(entries: VaultFolder[]): void {
  if (!isStorageAvailable()) return;
  try {
    window.localStorage.setItem(FOLDER_LIBRARY_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* ignore quota errors */
  }
}

/* ---------------------------------------------------------------- *
 * Tree algorithms
 * ---------------------------------------------------------------- */

/**
 * Build a parent → children map for fast lookups. The root
 * pseudo-folder is intentionally not included — callers can use
 * `childrenOf(null)` to get top-level folders.
 */
export function buildTree(folders: VaultFolder[]): Map<string | null, VaultFolder[]> {
  const map = new Map<string | null, VaultFolder[]>();
  for (const folder of folders) {
    if (folder.id === ROOT_FOLDER_ID) continue;
    const list = map.get(folder.parentId) ?? [];
    list.push(folder);
    map.set(folder.parentId, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => {
      const ao = a.order ?? Number.MAX_SAFE_INTEGER;
      const bo = b.order ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return a.name.localeCompare(b.name);
    });
  }
  return map;
}

export function childrenOf(folders: VaultFolder[], parentId: string | null): VaultFolder[] {
  return buildTree(folders).get(parentId) ?? [];
}

/**
 * Walk from a folder up to the root, returning the chain in order
 * `[root, ..., folder]`. The root pseudo-folder is the first element.
 */
export function ancestorsOf(folders: VaultFolder[], id: string): VaultFolder[] {
  const map = new Map(folders.map((entry) => [entry.id, entry]));
  const out: VaultFolder[] = [];
  let current: VaultFolder | undefined = map.get(id);
  while (current) {
    out.unshift(current);
    if (current.parentId === null) break;
    const next = map.get(current.parentId);
    if (!next || out.includes(next)) break; // guard against cycles
    current = next;
  }
  out.unshift(ROOT_FOLDER);
  return out;
}

/**
 * Return the folder itself and every descendant beneath it.
 * Useful when filtering items by "this folder or any nested folder".
 */
export function subtreeOf(folders: VaultFolder[], id: string): VaultFolder[] {
  const map = buildTree(folders);
  const root = folders.find((entry) => entry.id === id);
  if (!root) return [];
  const out: VaultFolder[] = [root];
  const stack: VaultFolder[] = [root];
  const visited = new Set<string>([root.id]);
  while (stack.length > 0) {
    const next = stack.pop()!;
    const kids = map.get(next.id) ?? [];
    for (const kid of kids) {
      if (visited.has(kid.id)) continue;
      visited.add(kid.id);
      out.push(kid);
      stack.push(kid);
    }
  }
  return out;
}

/** Returns true if `candidateId` is a descendant of (or equal to) `ancestorId`. */
export function isDescendantOrSelf(
  folders: VaultFolder[],
  candidateId: string,
  ancestorId: string,
): boolean {
  if (candidateId === ancestorId) return true;
  return subtreeOf(folders, ancestorId).some((entry) => entry.id === candidateId);
}

/**
 * Compute the depth (0 = top level) of a folder, capped at
 * MAX_FOLDER_DEPTH - 1. Returns -1 for unknown folders.
 */
export function depthOf(folders: VaultFolder[], id: string): number {
  if (id === ROOT_FOLDER_ID) return 0;
  const map = new Map(folders.map((entry) => [entry.id, entry]));
  let depth = 0;
  let current = map.get(id);
  while (current && current.parentId !== null) {
    depth += 1;
    if (depth > MAX_FOLDER_DEPTH) return MAX_FOLDER_DEPTH;
    const next = map.get(current.parentId);
    if (!next || next === current) break;
    current = next;
  }
  return depth;
}

/**
 * Return a list of folder ids that match a given filter mode:
 *  - `'folder:<id>'` — the folder and all its descendants
 *  - `'root'`       — items with no folder
 *  - any other id   — just that folder
 */
export function folderMatchSet(
  folders: VaultFolder[],
  mode: string | null | undefined,
): Set<string> | 'root' {
  if (!mode || mode === 'root') return 'root';
  if (mode.startsWith('folder:')) {
    const id = mode.slice('folder:'.length);
    return new Set(subtreeOf(folders, id).map((entry) => entry.id));
  }
  return new Set([mode]);
}

/* ---------------------------------------------------------------- *
 * CRUD
 * ---------------------------------------------------------------- */

let _counter = 0;
function uniqueId(): string {
  _counter += 1;
  return `folder-${Date.now().toString(36)}-${_counter.toString(36)}`;
}

export class FolderCycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FolderCycleError';
  }
}

export class FolderDepthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FolderDepthError';
  }
}

export class FolderLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FolderLimitError';
  }
}

export function readFolderLibrary(): VaultFolder[] {
  return readRaw();
}

export function writeFolderLibrary(entries: VaultFolder[]): VaultFolder[] {
  const safe = entries.slice(0, MAX_FOLDER_ENTRIES);
  writeRaw(safe);
  return safe;
}

export interface CreateFolderInput {
  name: string;
  parentId: string | null;
  color?: TagColorKey;
  icon?: FolderIconKey;
  order?: number;
}

export function createFolder(input: CreateFolderInput): VaultFolder {
  const library = readRaw();
  if (library.length >= MAX_FOLDER_ENTRIES) {
    throw new FolderLimitError('Folder library is full');
  }
  if (input.parentId !== null) {
    const parent = library.find((entry) => entry.id === input.parentId);
    if (!parent) {
      throw new FolderCycleError('Parent folder does not exist');
    }
    if (depthOf(library, input.parentId) >= MAX_FOLDER_DEPTH - 1) {
      throw new FolderDepthError('Maximum folder depth reached');
    }
  }
  const folder: VaultFolder = {
    id: uniqueId(),
    name: input.name.trim() || 'Untitled',
    parentId: input.parentId,
    color: input.color ?? 'indigo',
    icon: input.icon ?? 'folder',
    order: input.order,
    createdAt: new Date().toISOString(),
  };
  writeRaw([...library, folder]);
  return folder;
}

export interface UpdateFolderInput {
  name?: string;
  parentId?: string | null;
  color?: TagColorKey;
  icon?: FolderIconKey;
  order?: number;
}

export function updateFolder(id: string, patch: UpdateFolderInput): VaultFolder[] {
  if (id === ROOT_FOLDER_ID) {
    throw new FolderCycleError('Cannot edit the root pseudo-folder');
  }
  const library = readRaw();
  const next: VaultFolder[] = [];
  for (const entry of library) {
    if (entry.id === id) {
      next.push({
        ...entry,
        name: patch.name?.trim() || entry.name,
        parentId: patch.parentId === undefined ? entry.parentId : patch.parentId,
        color: patch.color ?? entry.color,
        icon: patch.icon ?? entry.icon,
        order: patch.order ?? entry.order,
      });
    } else {
      next.push(entry);
    }
  }
  if (patch.parentId !== undefined && patch.parentId !== null) {
    if (patch.parentId === id) {
      throw new FolderCycleError('A folder cannot be its own parent');
    }
    if (subtreeOf(next, id).some((entry) => entry.id === patch.parentId)) {
      throw new FolderCycleError('Cannot move a folder into one of its descendants');
    }
    if (depthOf(next, patch.parentId) >= MAX_FOLDER_DEPTH - 1) {
      throw new FolderDepthError('Maximum folder depth reached');
    }
  }
  writeRaw(next);
  return next;
}

export function deleteFolder(id: string): VaultFolder[] {
  if (id === ROOT_FOLDER_ID) return readRaw();
  const library = readRaw();
  const subtreeIds = new Set(subtreeOf(library, id).map((entry) => entry.id));
  const next = library.filter((entry) => !subtreeIds.has(entry.id));
  writeRaw(next);
  return next;
}


