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

  it('tolerates a single-character typo when fuzzy search is enabled', () => {
    const { result } = renderHook(() =>
      useVaultQueries({
        items,
        searchQuery: 'githab', // one typo away from "github"
        favoritesOnly: false,
        selectedCategory: 'all',
        fuzzyEnabled: true,
      }),
    );

    expect(result.current.filteredItems.map((item) => item.id)).toContain('1');
  });

  it('does not match a typo when fuzzy search is disabled', () => {
    const { result } = renderHook(() =>
      useVaultQueries({
        items,
        searchQuery: 'githab',
        favoritesOnly: false,
        selectedCategory: 'all',
        fuzzyEnabled: false,
      }),
    );

    expect(result.current.filteredItems).toHaveLength(0);
  });

  it('exposes match metadata for highlighting', () => {
    const { result } = renderHook(() =>
      useVaultQueries({
        items,
        searchQuery: 'github',
        favoritesOnly: false,
        selectedCategory: 'all',
      }),
    );

    const hit = result.current.filteredItemResults.find((entry) => entry.item.id === '1');
    expect(hit).toBeDefined();
    expect(hit?.match?.matchedField).toBe('title');
    expect((hit?.match?.score ?? 0) > 0).toBe(true);
  });

  it('filters by an inclusive date range', () => {
    const dated: VaultItem[] = [
      item({ id: 'a', title: 'Old', createdAt: '2024-01-01', updatedAt: '2024-01-01' }),
      item({ id: 'b', title: 'New', createdAt: '2025-06-15', updatedAt: '2025-06-15' }),
      item({ id: 'c', title: 'Future', createdAt: '2026-12-31', updatedAt: '2026-12-31' }),
    ];

    const { result } = renderHook(() =>
      useVaultQueries({
        items: dated,
        searchQuery: '',
        favoritesOnly: false,
        selectedCategory: 'all',
        dateRange: { from: '2025-01-01', to: '2025-12-31' },
        dateField: 'updatedAt',
      }),
    );

    expect(result.current.filteredItems.map((item) => item.id)).toEqual(['b']);
  });
});

