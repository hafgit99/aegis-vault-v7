// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VaultItem } from '../types';
import { useVaultQueries } from './useVaultQueries';

const item = (overrides: Partial<VaultItem>): VaultItem => ({
  id: 'id',
  title: 'Example',
  username: 'user@example.com',
  password: 'G8x#kL9@pQ2!mZ7',
  url: 'example.com',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  category: 'login',
  ...overrides,
});

describe('useVaultQueries', () => {
  const items: VaultItem[] = [
    item({ id: '1', title: 'GitHub', username: 'octo@example.com', url: 'github.com', favorite: true }),
    item({ id: '2', title: 'Bank Card', username: '4111111111111111', url: '', category: 'card' }),
    item({ id: '3', title: 'Recovery Note', username: '', url: '', category: 'secure_note' }),
    item({ id: '4', title: 'Deleted Login', username: 'deleted@example.com', deleted: true }),
  ];

  it('separates active and trash items', () => {
    const { result } = renderHook(() =>
      useVaultQueries({
        items,
        searchQuery: '',
        favoritesOnly: false,
        selectedCategory: 'all',
      }),
    );

    expect(result.current.activeItems).toHaveLength(3);
    expect(result.current.trashItems).toHaveLength(1);
    expect(result.current.filteredItems).toHaveLength(3);
  });

  it('filters by search query and favorites', () => {
    const { result } = renderHook(() =>
      useVaultQueries({
        items,
        searchQuery: 'github',
        favoritesOnly: true,
        selectedCategory: 'all',
      }),
    );

    expect(result.current.filteredItems).toHaveLength(1);
    expect(result.current.filteredItems[0].id).toBe('1');
  });

  it('returns category counters and audit report', () => {
    const { result } = renderHook(() =>
      useVaultQueries({
        items,
        searchQuery: '',
        favoritesOnly: false,
        selectedCategory: 'all',
      }),
    );

    expect(result.current.favoriteCount).toBe(1);
    expect(result.current.loginCount).toBe(1);
    expect(result.current.cardCount).toBe(1);
    expect(result.current.secureNoteCount).toBe(1);
    expect(result.current.auditReport.totalCount).toBe(3);
  });
});
