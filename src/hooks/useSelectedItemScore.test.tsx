/**
 * @vitest-environment jsdom
 */

import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { VaultItem } from '../types';
import { useSelectedItemScore } from './useSelectedItemScore';

const item = (password?: string): VaultItem => ({
  id: 'mail',
  title: 'Mail',
  username: 'mail@example.com',
  password,
  url: 'https://mail.example.com',
  createdAt: '2026-06-10T12:00:00.000Z',
  updatedAt: '2026-06-10T12:00:00.000Z',
  category: 'login',
});

afterEach(() => {
  cleanup();
});

describe('useSelectedItemScore', () => {
  it('returns zero when no item is selected', () => {
    const { result } = renderHook(() => useSelectedItemScore(null));

    expect(result.current).toBe(0);
  });

  it('scores the selected item password', () => {
    const { result } = renderHook(() => useSelectedItemScore(item('StrongPass123!')));

    expect(result.current).toBeGreaterThan(0);
  });

  it('handles selected items without a password', () => {
    const { result } = renderHook(() => useSelectedItemScore(item(undefined)));

    expect(result.current).toBe(0);
  });
});
