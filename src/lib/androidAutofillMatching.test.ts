import { describe, expect, it } from 'vitest';

import type { AndroidAutofillRequest } from './androidAutofill';
import { isAndroidAutofillTargetMatch, sortAndroidAutofillMatches } from './androidAutofillMatching';
import type { VaultItem } from '../types';

const request: AndroidAutofillRequest = {
  requestId: 'request-1',
  createdAt: 123,
  source: 'android-autofill',
  webDomain: 'login.example.com',
  appPackage: 'com.example.app',
};

function item(id: string, url: string, category: VaultItem['category'] = 'login'): VaultItem {
  return {
    id,
    title: id,
    username: `${id}@example.com`,
    password: 'secret',
    url,
    category,
    favorite: false,
    createdAt: '2026-06-10T12:00:00.000Z',
    updatedAt: '2026-06-10T12:00:00.000Z',
  };
}

describe('androidAutofillMatching', () => {
  it('matches login items by target web domain and subdomains', () => {
    expect(isAndroidAutofillTargetMatch(item('exact', 'https://login.example.com'), request)).toBe(true);
    expect(isAndroidAutofillTargetMatch(item('parent', 'https://example.com'), request)).toBe(true);
    expect(isAndroidAutofillTargetMatch(item('other', 'https://evil-example.com'), request)).toBe(false);
    expect(isAndroidAutofillTargetMatch(item('note', 'https://login.example.com', 'secure_note'), request)).toBe(false);
  });

  it('promotes matching login items without removing non-matches', () => {
    const items = [
      item('unrelated', 'https://unrelated.test'),
      item('matching', 'https://login.example.com'),
      item('parent', 'example.com'),
    ];

    expect(sortAndroidAutofillMatches(items, request).map((entry) => entry.id)).toEqual([
      'matching',
      'parent',
      'unrelated',
    ]);
    expect(items.map((entry) => entry.id)).toEqual(['unrelated', 'matching', 'parent']);
  });

  it('falls back to package-name matching when no web domain is available', () => {
    const packageRequest: AndroidAutofillRequest = {
      requestId: 'request-2',
      createdAt: 456,
      source: 'android-autofill',
      appPackage: 'accounts.example.com',
    };

    expect(isAndroidAutofillTargetMatch(item('package', 'https://accounts.example.com'), packageRequest)).toBe(true);
  });
});
