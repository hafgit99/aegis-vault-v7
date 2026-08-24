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
import type { VaultItem } from '../types';

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

  describe('comprehensive rule evaluation and edge cases', () => {
    const fixedNow = new Date('2026-07-15T12:00:00.000Z').getTime();

    it('handles empty rules gracefully', () => {
      const folder = createSmartFolder({ name: 'Empty Rules', rules: [] });
      const items = mockItems();
      expect(applySmartFolder(folder, items)).toHaveLength(0);
    });

    it('evaluates weakPassword and reusedPassword rules accurately', () => {
      const items: VaultItem[] = [
        {
          id: 'w1',
          title: 'Weak 1',
          username: 'u1',
          password: '123', // WEAK
          category: 'login',
          favorite: false,
          url: '',
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
        {
          id: 's1',
          title: 'Strong 1',
          username: 'u2',
          password: 'kX9#mQ2$vL8!zR5@pW1*', // STRONG & unique
          category: 'login',
          favorite: false,
          url: '',
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
        {
          id: 'r1',
          title: 'Reused A',
          username: 'u3',
          password: 'MySharedComplexPass#99',
          category: 'login',
          favorite: false,
          url: '',
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
        {
          id: 'r2',
          title: 'Reused B',
          username: 'u4',
          password: 'MySharedComplexPass#99',
          category: 'login',
          favorite: false,
          url: '',
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
        {
          id: 'nopass',
          title: 'No Pass Card',
          username: '',
          category: 'card',
          favorite: false,
          url: '',
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      ];

      const context = buildContext(items);

      // Weak password folder
      const weakFolder = createSmartFolder({
        name: 'Weak',
        rules: [{ kind: 'weakPassword' }],
      });
      const weakMatched = applySmartFolder(weakFolder, items, context);
      expect(weakMatched.map((i) => i.id)).toEqual(['w1']);

      // Reused password folder
      const reusedFolder = createSmartFolder({
        name: 'Reused',
        rules: [{ kind: 'reusedPassword' }],
      });
      const reusedMatched = applySmartFolder(reusedFolder, items, context);
      expect(reusedMatched.map((i) => i.id)).toEqual(['r1', 'r2']);
    });

    it('evaluates date range rules with boundary and invalid date conditions', () => {
      vi.useFakeTimers();
      vi.setSystemTime(fixedNow);

      const items: VaultItem[] = [
        {
          id: 'exact-10-days',
          title: '10 Days Old',
          username: '',
          category: 'login',
          favorite: false,
          url: '',
          createdAt: '',
          updatedAt: new Date(fixedNow - 10 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: 'exact-30-days',
          title: '30 Days Old',
          username: '',
          category: 'login',
          favorite: false,
          url: '',
          createdAt: '',
          updatedAt: new Date(fixedNow - 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: 'invalid-date',
          title: 'Invalid Date',
          username: '',
          category: 'login',
          favorite: false,
          url: '',
          createdAt: '',
          updatedAt: 'not-a-valid-date-string',
        },
      ];

      // Helper function to test with fixed timestamp
      const matchWithTime = (rules: any[], item: VaultItem | undefined) => {
        if (!item) return false;
        const folder = createSmartFolder({ name: 'T', rules });
        const ctx = buildContext([item]);
        return applySmartFolder(folder, [item], ctx).length > 0;
      };

      expect(matchWithTime([{ kind: 'newerThanDays', days: 10 }], items[0])).toBe(true);
      expect(matchWithTime([{ kind: 'olderThanDays', days: 10 }], items[0])).toBe(true);
      expect(matchWithTime([{ kind: 'newerThanDays', days: 5 }], items[0])).toBe(false);
      expect(matchWithTime([{ kind: 'olderThanDays', days: 20 }], items[0])).toBe(false);
      expect(matchWithTime([{ kind: 'newerThanDays', days: 10 }], items[2])).toBe(false);
      expect(matchWithTime([{ kind: 'olderThanDays', days: 10 }], items[2])).toBe(false);
    });

    it('evaluates tag matching case-insensitively and handles items without tags', () => {
      const items: VaultItem[] = [
        {
          id: 'tag-1',
          title: 'Work Item',
          username: '',
          category: 'login',
          favorite: false,
          tags: ['Work', 'Finance'],
          url: '',
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'tag-none',
          title: 'No Tags',
          username: '',
          category: 'login',
          favorite: false,
          url: '',
          createdAt: '',
          updatedAt: '',
        },
      ];

      const fHasTag = createSmartFolder({
        name: 'Has Tag',
        rules: [{ kind: 'hasTag', tag: '  work  ' }],
      });
      expect(applySmartFolder(fHasTag, items).map((i) => i.id)).toEqual(['tag-1']);

      const fMissingTag = createSmartFolder({
        name: 'Missing Tag',
        rules: [{ kind: 'missingTag', tag: 'work' }],
      });
      expect(applySmartFolder(fMissingTag, items).map((i) => i.id)).toEqual(['tag-none']);
    });

    it('evaluates multi-rule folders with AND semantics and counts matches accurately', () => {
      const items = mockItems();
      const folder = createSmartFolder({
        name: 'Favorite with TOTP',
        rules: [
          { kind: 'favorite' },
          { kind: 'hasTotp' },
          { kind: 'category', categories: ['login'] },
        ],
      });

      expect(applySmartFolder(folder, items).map((i) => i.id)).toEqual(['1']);
      expect(countSmartFolder(folder, items)).toBe(1);
    });

    it('handles parser edge cases for invalid rules, empty names, and non-object entries', () => {
      const corruptedPayload = [
        null,
        123,
        'string',
        {},
        { id: '', name: 'Empty Id', rules: [] },
        { id: 'ok-1', name: '   ', rules: [] },
        { id: 'ok-2', name: 'Valid Folder', rules: 'not-array' },
        {
          id: 'ok-3',
          name: 'Folder with bad rules',
          rules: [
            null,
            { kind: 'category', categories: 'not-array' },
            { kind: 'hasTag', tag: 123 },
            { kind: 'olderThanDays', days: 'not-number' },
            { kind: 'passwordLengthAtLeast', length: 'not-number' },
            { kind: 'favorite' },
          ],
        },
      ];

      localStorage.setItem('aegis-vault-v7-smart-folders-v1', JSON.stringify(corruptedPayload));
      const loaded = readSmartFolders();
      const folderWithBadRules = loaded.find((f) => f.id === 'ok-3');
      expect(folderWithBadRules).toBeDefined();
      expect(folderWithBadRules!.rules).toHaveLength(1);
      expect(folderWithBadRules!.rules[0]?.kind).toBe('favorite');
    });

    it('tests createSmartFolder fallbacks and comprehensive updateSmartFolder patch options', () => {
      const fallbackFolder = createSmartFolder({
        name: '   ',
        rules: [{ kind: 'favorite' }],
      });
      expect(fallbackFolder.name).toBe('Untitled smart folder');
      expect(fallbackFolder.icon).toBe('folder');
      expect(fallbackFolder.color).toBe('indigo');

      const updatedList = updateSmartFolder(fallbackFolder.id, {
        name: '  Patched Name  ',
        description: 'New Description',
        icon: 'key-round',
        color: 'rose',
        rules: [{ kind: 'hasTotp' }],
      });

      const patched = updatedList.find((f) => f.id === fallbackFolder.id);
      expect(patched!.name).toBe('Patched Name');
      expect(patched!.description).toBe('New Description');
      expect(patched!.icon).toBe('key-round');
      expect(patched!.color).toBe('rose');
      expect(patched!.rules).toEqual([{ kind: 'hasTotp' }]);

      // Test updating non-existent id
      const nonExistent = updateSmartFolder('non-existent-id-999', { name: 'Ignored' });
      expect(nonExistent.find((f) => f.id === 'non-existent-id-999')).toBeUndefined();
    });

    it('tests passwordLengthAtLeast strict boundaries', () => {
      const itemWith8: VaultItem = {
        id: 'p8',
        title: '8 Chars',
        username: '',
        password: '12345678',
        category: 'login',
        favorite: false,
        url: '',
        createdAt: '',
        updatedAt: '',
      };
      const itemNoPass: VaultItem = {
        id: 'p0',
        title: 'No Pass',
        username: '',
        password: '',
        category: 'login',
        favorite: false,
        url: '',
        createdAt: '',
        updatedAt: '',
      };

      const folder8 = createSmartFolder({
        name: 'Len 8',
        rules: [{ kind: 'passwordLengthAtLeast', length: 8 }],
      });
      const folder9 = createSmartFolder({
        name: 'Len 9',
        rules: [{ kind: 'passwordLengthAtLeast', length: 9 }],
      });

      expect(applySmartFolder(folder8, [itemWith8])).toHaveLength(1);
      expect(applySmartFolder(folder9, [itemWith8])).toHaveLength(0);
      expect(applySmartFolder(folder8, [itemNoPass])).toHaveLength(0);
    });
  });
});
