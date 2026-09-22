/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import {
  clearPasswordHistory,
  getPasswordHistory,
  MAX_FREE_PASSWORD_HISTORY,
  recordPasswordHistory,
} from './passwordHistory';
import type { VaultItem } from '../types';

describe('passwordHistory module', () => {
  it('has a free tier cap of 3 passwords', () => {
    expect(MAX_FREE_PASSWORD_HISTORY).toBe(3);
  });

  it('records previous password when password changes', () => {
    const history = recordPasswordHistory([], 'oldPass123', 'newPass456', '2026-09-01T12:00:00.000Z');

    expect(history).toHaveLength(1);
    expect(history[0]).toEqual({
      password: 'oldPass123',
      changedAt: '2026-09-01T12:00:00.000Z',
    });
  });

  it('does not record when old password is empty or undefined', () => {
    expect(recordPasswordHistory([], '', 'newPass')).toHaveLength(0);
    expect(recordPasswordHistory([], undefined, 'newPass')).toHaveLength(0);
  });

  it('does not record when old and new password are identical', () => {
    const existing = [{ password: 'prior', changedAt: '2026-08-01' }];
    const history = recordPasswordHistory(existing, 'samePass', 'samePass');

    expect(history).toEqual(existing);
  });

  it('caps history at 3 entries and preserves newest first', () => {
    let history = recordPasswordHistory([], 'pass1', 'pass2', '2026-01-01');
    history = recordPasswordHistory(history, 'pass2', 'pass3', '2026-02-01');
    history = recordPasswordHistory(history, 'pass3', 'pass4', '2026-03-01');
    history = recordPasswordHistory(history, 'pass4', 'pass5', '2026-04-01');

    expect(history).toHaveLength(3);
    expect(history[0]?.password).toBe('pass4');
    expect(history[1]?.password).toBe('pass3');
    expect(history[2]?.password).toBe('pass2');
  });

  it('getPasswordHistory returns empty array when item has no history', () => {
    const item: VaultItem = {
      id: '1',
      title: 'Site',
      username: 'user',
      url: 'https://example.com',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      category: 'login',
    };

    expect(getPasswordHistory(item)).toEqual([]);
  });

  it('clearPasswordHistory removes all entries', () => {
    const item: VaultItem = {
      id: '1',
      title: 'Site',
      username: 'user',
      url: 'https://example.com',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      category: 'login',
      passwordHistory: [
        { password: 'p1', changedAt: '2026-01-01' },
        { password: 'p2', changedAt: '2026-02-01' },
      ],
    };

    const cleared = clearPasswordHistory(item);
    expect(cleared.passwordHistory).toEqual([]);
  });
});
