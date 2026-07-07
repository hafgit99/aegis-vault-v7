/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Smart folders: predicate-driven virtual groupings of vault items.
 *
 * A smart folder is a saved `SmartFolder` record (see `src/types.ts`)
 * plus a predicate function evaluated against every item. Items don't
 * *belong* to a smart folder — they merely *match* it. The library
 * also ships with a few built-in presets that the user can rename or
 * disable but not delete.
 *
 * The matcher is intentionally dependency-free; "weak / reused
 * password" rules are powered by the same helpers used by the
 * security audit (`src/lib/security.ts`) so the two views stay in
 * sync.
 */

import { runVaultAudit, getStrengthLabel } from './security';
import type {
  FolderIconKey,
  SmartFolder,
  SmartFolderRule,
  TagColorKey,
  VaultItem,
} from '../types';

export const SMART_FOLDER_LIBRARY_STORAGE_KEY = 'aegis-vault-v7-smart-folders-v1';

const DAY_MS = 24 * 60 * 60 * 1000;

let _counter = 0;
function uniqueId(): string {
  _counter += 1;
  return `smart-${Date.now().toString(36)}-${_counter.toString(36)}`;
}

function isStorageAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function parseEntry(raw: unknown): SmartFolder | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== 'string' || obj.id.length === 0) return null;
  if (typeof obj.name !== 'string' || obj.name.trim().length === 0) return null;
  if (!Array.isArray(obj.rules)) return null;
  const rules: SmartFolderRule[] = [];
  for (const r of obj.rules) {
    const valid = parseRule(r);
    if (valid) rules.push(valid);
  }
  return {
    id: obj.id,
    name: obj.name.trim(),
    description: typeof obj.description === 'string' ? obj.description : undefined,
    icon: typeof obj.icon === 'string' ? (obj.icon as FolderIconKey) : 'folder',
    color: typeof obj.color === 'string' ? (obj.color as TagColorKey) : 'indigo',
    builtIn: Boolean(obj.builtIn),
    rules,
    createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : new Date().toISOString(),
  };
}

function parseRule(raw: unknown): SmartFolderRule | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  switch (r.kind) {
    case 'category':
      return Array.isArray(r.categories) ? { kind: 'category', categories: r.categories as VaultItem['category'][] } : null;
    case 'hasTag':
    case 'missingTag':
      return typeof r.tag === 'string' ? { kind: r.kind, tag: r.tag } : null;
    case 'favorite':
    case 'unfavorite':
    case 'hasTotp':
    case 'noTotp':
    case 'hasNotes':
    case 'noNotes':
    case 'hasAttachment':
    case 'noAttachment':
    case 'weakPassword':
    case 'reusedPassword':
      return { kind: r.kind } as SmartFolderRule;
    case 'olderThanDays':
    case 'newerThanDays':
      return typeof r.days === 'number' ? { kind: r.kind, days: r.days } : null;
    case 'passwordLengthAtLeast':
      return typeof r.length === 'number' ? { kind: r.kind, length: r.length } : null;
    default:
      return null;
  }
}

function readRaw(): SmartFolder[] {
  if (!isStorageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(SMART_FOLDER_LIBRARY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: SmartFolder[] = [];
    for (const entry of parsed) {
      const valid = parseEntry(entry);
      if (valid) out.push(valid);
    }
    return out;
  } catch {
    return [];
  }
}

function writeRaw(entries: SmartFolder[]): void {
  if (!isStorageAvailable()) return;
  try {
    window.localStorage.setItem(SMART_FOLDER_LIBRARY_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* ignore */
  }
}

/* ---------------------------------------------------------------- *
 * Built-in presets
 * ---------------------------------------------------------------- */

export function builtInSmartFolders(): SmartFolder[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'smart-favorites',
      name: 'Favorites',
      description: 'Items you have marked as favourite.',
      icon: 'star',
      color: 'amber',
      builtIn: true,
      rules: [{ kind: 'favorite' }],
      createdAt: now,
    },
    {
      id: 'smart-recent-30',
      name: 'Last 30 days',
      description: 'Items updated in the last month.',
      icon: 'globe',
      color: 'emerald',
      builtIn: true,
      rules: [{ kind: 'newerThanDays', days: 30 }],
      createdAt: now,
    },
    {
      id: 'smart-2fa',
      name: 'Has 2FA',
      description: 'Items with a TOTP secret configured.',
      icon: 'shield',
      color: 'cyan',
      builtIn: true,
      rules: [{ kind: 'hasTotp' }],
      createdAt: now,
    },
    {
      id: 'smart-no-2fa',
      name: 'Missing 2FA',
      description: 'Logins without TOTP — review and enable 2FA where possible.',
      icon: 'shield',
      color: 'orange',
      builtIn: true,
      rules: [{ kind: 'category', categories: ['login'] }, { kind: 'noTotp' }],
      createdAt: now,
    },
    {
      id: 'smart-weak',
      name: 'Weak passwords',
      description: 'Passwords that the security audit flags as weak.',
      icon: 'lock',
      color: 'red',
      builtIn: true,
      rules: [{ kind: 'weakPassword' }],
      createdAt: now,
    },
    {
      id: 'smart-reused',
      name: 'Reused passwords',
      description: 'Passwords shared by more than one item.',
      icon: 'key-round',
      color: 'rose',
      builtIn: true,
      rules: [{ kind: 'reusedPassword' }],
      createdAt: now,
    },
    {
      id: 'smart-archive',
      name: 'Old & forgotten',
      description: 'Items not updated in over a year.',
      icon: 'archive',
      color: 'slate',
      builtIn: true,
      rules: [{ kind: 'olderThanDays', days: 365 }],
      createdAt: now,
    },
  ];
}

/* ---------------------------------------------------------------- *
 * Evaluation
 * ---------------------------------------------------------------- */

export interface SmartFolderContext {
  passwordFrequency: Map<string, number>;
  weakPasswords: Set<string>;
}

export function buildContext(items: VaultItem[]): SmartFolderContext {
  const passwordFrequency = new Map<string, number>();
  const weakPasswords = new Set<string>();
  for (const item of items) {
    if (item.password) {
      passwordFrequency.set(item.password, (passwordFrequency.get(item.password) ?? 0) + 1);
    }
  }
  try {
    const report = runVaultAudit(items);
    if (report.weakCount > 0) {
      for (const item of items) {
        if (!item.password) continue;
        const label = getStrengthLabel(item.password);
        if (label.label === 'WEAK') weakPasswords.add(item.password);
      }
    }
  } catch {
    /* ignore */
  }
  return { passwordFrequency, weakPasswords };
}

function hasTag(item: VaultItem, tag: string): boolean {
  if (!item.tags || item.tags.length === 0) return false;
  const needle = tag.trim().toLowerCase();
  return item.tags.some((t) => t.toLowerCase() === needle);
}

function evaluateRule(
  rule: SmartFolderRule,
  item: VaultItem,
  context: SmartFolderContext,
  now: number,
): boolean {
  switch (rule.kind) {
    case 'category':
      return rule.categories.includes(item.category);
    case 'hasTag':
      return hasTag(item, rule.tag);
    case 'missingTag':
      return !hasTag(item, rule.tag);
    case 'favorite':
      return Boolean(item.favorite);
    case 'unfavorite':
      return !item.favorite;
    case 'hasTotp':
      return Boolean(item.totpSecret && item.totpSecret.length > 0);
    case 'noTotp':
      return !item.totpSecret;
    case 'hasNotes':
      return Boolean(item.notes && item.notes.length > 0);
    case 'noNotes':
      return !item.notes;
    case 'hasAttachment':
      return Boolean(item.attachmentId);
    case 'noAttachment':
      return !item.attachmentId;
    case 'olderThanDays': {
      const ts = Date.parse(item.updatedAt);
      if (Number.isNaN(ts)) return false;
      return now - ts >= rule.days * DAY_MS;
    }
    case 'newerThanDays': {
      const ts = Date.parse(item.updatedAt);
      if (Number.isNaN(ts)) return false;
      return now - ts <= rule.days * DAY_MS;
    }
    case 'weakPassword': {
      if (!item.password) return false;
      if (context.weakPasswords.has(item.password)) return true;
      return getStrengthLabel(item.password).label === 'WEAK';
    }
    case 'reusedPassword': {
      if (!item.password) return false;
      return (context.passwordFrequency.get(item.password) ?? 0) > 1;
    }
    case 'passwordLengthAtLeast':
      return Boolean(item.password) && (item.password?.length ?? 0) >= rule.length;
    default:
      return false;
  }
}

export function evaluateSmartFolder(
  folder: SmartFolder,
  item: VaultItem,
  context: SmartFolderContext,
  now = Date.now(),
): boolean {
  if (folder.rules.length === 0) return false;
  return folder.rules.every((rule) => evaluateRule(rule, item, context, now));
}

export function applySmartFolder(
  folder: SmartFolder,
  items: VaultItem[],
  context?: SmartFolderContext,
): VaultItem[] {
  const ctx = context ?? buildContext(items);
  return items.filter((item) => evaluateSmartFolder(folder, item, ctx));
}

export function countSmartFolder(
  folder: SmartFolder,
  items: VaultItem[],
  context?: SmartFolderContext,
): number {
  const ctx = context ?? buildContext(items);
  let count = 0;
  for (const item of items) {
    if (evaluateSmartFolder(folder, item, ctx)) count += 1;
  }
  return count;
}

/* ---------------------------------------------------------------- *
 * CRUD
 * ---------------------------------------------------------------- */

export function readSmartFolders(): SmartFolder[] {
  const stored = readRaw();
  const builtIns = builtInSmartFolders();
  const userFolders = stored.filter((entry) => !entry.builtIn);
  return [...builtIns, ...userFolders];
}

export interface CreateSmartFolderInput {
  name: string;
  description?: string;
  icon?: FolderIconKey;
  color?: TagColorKey;
  rules: SmartFolderRule[];
}

export interface UpdateSmartFolderInput {
  name?: string;
  description?: string;
  icon?: FolderIconKey;
  color?: TagColorKey;
  rules?: SmartFolderRule[];
}

export function createSmartFolder(input: CreateSmartFolderInput): SmartFolder {
  const library = readRaw();
  const entry: SmartFolder = {
    id: uniqueId(),
    name: input.name.trim() || 'Untitled smart folder',
    description: input.description?.trim() || undefined,
    icon: input.icon ?? 'folder',
    color: input.color ?? 'indigo',
    rules: input.rules,
    createdAt: new Date().toISOString(),
  };
  writeRaw([...library, entry]);
  return entry;
}

export function updateSmartFolder(
  id: string,
  patch: UpdateSmartFolderInput,
): SmartFolder[] {
  const library = readRaw();
  const next = library.map((entry) => {
    if (entry.id !== id) return entry;
    return {
      ...entry,
      name: patch.name?.trim() || entry.name,
      description: patch.description !== undefined ? patch.description : entry.description,
      icon: patch.icon ?? entry.icon,
      color: patch.color ?? entry.color,
      rules: patch.rules ?? entry.rules,
    };
  });
  writeRaw(next);
  return next;
}

export function deleteSmartFolder(id: string): SmartFolder[] {
  const library = readRaw();
  writeRaw(library.filter((entry) => entry.id !== id));
  return library.filter((entry) => entry.id !== id);
}

export function ensureBuiltInPresents(): SmartFolder[] {
  const builtIns = builtInSmartFolders();
  const library = readRaw();
  const userFolders = library.filter((entry) => !entry.builtIn);
  writeRaw(userFolders);
  return [...builtIns, ...userFolders];
}

