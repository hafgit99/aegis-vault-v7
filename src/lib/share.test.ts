/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import { generateShareUrl, decryptShareUrl, base64urlEncode, base64urlDecode } from './share';
import { VaultItem } from '../types';

const testItem: VaultItem = {
  id: 'test-id',
  title: 'GitHub Test',
  username: 'test-user',
  password: 'test-password',
  url: 'github.com',
  notes: 'test notes',
  category: 'login',
  createdAt: '2026-07-07',
  updatedAt: '2026-07-07',
};

describe('Password Sharing Library', () => {
  it('correctly encodes and decodes base64url', () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111, 33]); // Hello!
    const encoded = base64urlEncode(bytes);
    expect(encoded).toBe('SGVsbG8h');
    const decoded = base64urlDecode(encoded);
    expect(decoded).toEqual(bytes);
  });

  it('generates a valid share URL and decrypts it back', async () => {
    const shareUrl = await generateShareUrl(testItem, 1);
    expect(shareUrl).toContain('#share=');
    expect(shareUrl).toContain('&k=');

    const hash = shareUrl.substring(shareUrl.indexOf('#'));
    const decrypted = await decryptShareUrl(hash);

    expect(decrypted).not.toBeNull();
    expect(decrypted!.title).toBe(testItem.title);
    expect(decrypted!.username).toBe(testItem.username);
    expect(decrypted!.password).toBe(testItem.password);
    expect(decrypted!.notes).toBe(testItem.notes);
    expect(decrypted!.category).toBe(testItem.category);
    expect(decrypted!.expiresAt).toBeGreaterThan(Date.now());
  });

  it('fails gracefully on invalid hashes', async () => {
    const decrypted = await decryptShareUrl('#share=invalid&k=invalid');
    expect(decrypted).toBeNull();
  });
});
