/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  createSmartFolder,
  updateSmartFolder,
  deleteSmartFolder,
  applySmartFolder,
  countSmartFolder,
  buildContext,
  builtInSmartFolders,
  readSmartFolders,
  ensureBuiltInPresents,
} from './smartFolders';
import { VaultItem } from '../types';

const mockItems = (): VaultItem[] => [
  {
    id: '1',
    title: 'Favorite Login',
    username: 'user1',
    password: 'password123',
    category: 'login',
    favorite: true,
    totpSecret: 'JBSWY3DPEHPK3PXP',
    tags: ['work'],
    notes: 'some notes',
    attachmentId: 'attach-1',
    url: '',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  },
  {
    id: '2',
    title: 'Normal Card',
    username: '',
    password: '',
    category: 'card',
    favorite: false,
    url: '',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: '3',
    title: 'Reused Password Login',
    username: 'user3',
    password: 'password123',
    category: 'login',
    favorite: false,
    url: '',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  },
];

describe('Smart Folders Library', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('correctly loads built-in presets', () => {
    const list = readSmartFolders();
    expect(list.some(f => f.id === 'smart-favorites')).toBe(true);
    expect(list.some(f => f.id === 'smart-2fa')).toBe(true);
  });

  it('creates, updates and deletes user smart folders', () => {
    const folder = createSmartFolder({
      name: 'Custom Smart',
      description: 'Custom description',
      rules: [{ kind: 'category', categories: ['login'] }],
    });
    expect(folder.id).toBeDefined();
    expect(folder.name).toBe('Custom Smart');

    const updated = updateSmartFolder(folder.id, { name: 'New Custom Name' });
    const target = updated.find(f => f.id === folder.id);
    expect(target!.name).toBe('New Custom Name');

    const afterDelete = deleteSmartFolder(folder.id);
    expect(afterDelete.some(f => f.id === folder.id)).toBe(false);
  });

  it('ensures built-in folders are present', () => {
    const list = ensureBuiltInPresents();
    expect(list.length).toBeGreaterThanOrEqual(builtInSmartFolders().length);
  });

  it('evaluates all rule kinds correctly', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-07T12:00:00.000Z'));

    const items = mockItems();
    const context = buildContext(items);

    const testRule = (rule: any, expectedIds: string[]) => {
      const folder = createSmartFolder({
        name: 'Test Folder',
        rules: [rule],
      });
      const results = applySmartFolder(folder, items, context);
      expect(results.map(i => i.id)).toEqual(expectedIds);
    };

    // Category
    testRule({ kind: 'category', categories: ['card'] }, ['2']);

    // Favorite / Unfavorite
    testRule({ kind: 'favorite' }, ['1']);
    testRule({ kind: 'unfavorite' }, ['2', '3']);

    // HasTag / MissingTag
    testRule({ kind: 'hasTag', tag: 'work' }, ['1']);
    testRule({ kind: 'missingTag', tag: 'work' }, ['2', '3']);

    // HasTotp / NoTotp
    testRule({ kind: 'hasTotp' }, ['1']);
    testRule({ kind: 'noTotp' }, ['2', '3']);

    // HasNotes / NoNotes
    testRule({ kind: 'hasNotes' }, ['1']);
    testRule({ kind: 'noNotes' }, ['2', '3']);

    // HasAttachment / NoAttachment
    testRule({ kind: 'hasAttachment' }, ['1']);
    testRule({ kind: 'noAttachment' }, ['2', '3']);

    // Password Length
    testRule({ kind: 'passwordLengthAtLeast', length: 10 }, ['1', '3']);

    // Date range
    const fOlder = createSmartFolder({
      name: 'Older',
      rules: [{ kind: 'olderThanDays', days: 30 }],
    });
    const oldResults = applySmartFolder(fOlder, items, context);
    expect(oldResults.map(i => i.id)).toEqual(['2']);

    const fNewer = createSmartFolder({
      name: 'Newer',
      rules: [{ kind: 'newerThanDays', days: 10 }],
    });
    const newResults = applySmartFolder(fNewer, items, context);
    expect(newResults.map(i => i.id)).toContain('1');
    expect(newResults.map(i => i.id)).toContain('3');
  });

  it('covers remaining branches', () => {
    localStorage.setItem('aegis-vault-v7-smart-folders-v1', 'invalid-json-{');
    const list = readSmartFolders();
    expect(list.some(f => f.id === 'smart-favorites')).toBe(true);

    const invalidFolder = {
      id: 'invalid-folder',
      name: 'Invalid Rule Folder',
      rules: [{ kind: 'non-existent-rule-kind' }],
    };
    localStorage.setItem('aegis-vault-v7-smart-folders-v1', JSON.stringify([invalidFolder]));
    const list2 = readSmartFolders();
    const loadedInvalid = list2.find(f => f.id === 'invalid-folder');
    expect(loadedInvalid!.rules.length).toBe(0);
  });
});
