/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateShareUrl, decryptShareUrl, base64urlEncode, base64urlDecode, MAX_SHARE_DURATION_HOURS } from './share';
import type { VaultItem } from '../types';

const testItem: VaultItem = {
  id: 'test-id',
  title: 'GitHub Test',
  username: 'test-user',
  password: 'test-password',
  url: 'github.com',
  notes: 'test notes',
  category: 'login',
  totpSecret: 'JBSWY3DPEHPK3PXP',
  createdAt: '2026-07-07',
  updatedAt: '2026-07-07',
};

const TEST_SHARE_PASSWORD = 'test-share-password-2026';

describe('Password Sharing Library', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('correctly encodes and decodes base64url with and without padding lengths', () => {
    const bytes1 = new Uint8Array([72, 101, 108, 108, 111, 33]); // Hello!
    const encoded1 = base64urlEncode(bytes1);
    expect(encoded1).toBe('SGVsbG8h');
    expect(base64urlDecode(encoded1)).toEqual(bytes1);

    const bytes2 = new Uint8Array([1, 2, 3, 4]);
    const encoded2 = base64urlEncode(bytes2);
    expect(base64urlDecode(encoded2)).toEqual(bytes2);

    const bytes3 = new Uint8Array([1, 2]);
    const encoded3 = base64urlEncode(bytes3);
    expect(base64urlDecode(encoded3)).toEqual(bytes3);
  });

  it('generates a valid share URL and decrypts it back with correct password', async () => {
    const shareUrl = await generateShareUrl(testItem, 2, TEST_SHARE_PASSWORD);
    expect(shareUrl).toContain('#share=');
    expect(shareUrl).toContain('&s=');
    // Key must NOT be in the URL anymore
    expect(shareUrl).not.toContain('&k=');

    const hash = shareUrl.substring(shareUrl.indexOf('#'));
    const decrypted = await decryptShareUrl(hash, TEST_SHARE_PASSWORD);

    expect(decrypted).not.toBeNull();
    expect(decrypted!.title).toBe(testItem.title);
    expect(decrypted!.username).toBe(testItem.username);
    expect(decrypted!.password).toBe(testItem.password);
    expect(decrypted!.notes).toBe(testItem.notes);
    expect(decrypted!.category).toBe(testItem.category);
    expect(decrypted!.totpSecret).toBe(testItem.totpSecret);
    expect(decrypted!.expiresAt).toBeGreaterThan(Date.now());
  });

  it('fails to decrypt with wrong password', async () => {
    const shareUrl = await generateShareUrl(testItem, 2, TEST_SHARE_PASSWORD);
    const hash = shareUrl.substring(shareUrl.indexOf('#'));
    const decrypted = await decryptShareUrl(hash, 'wrong-password-completely');
    expect(decrypted).toBeNull();
  });

  it('fails to decrypt without a password (empty string)', async () => {
    const shareUrl = await generateShareUrl(testItem, 2, TEST_SHARE_PASSWORD);
    const hash = shareUrl.substring(shareUrl.indexOf('#'));
    const decrypted = await decryptShareUrl(hash, '');
    expect(decrypted).toBeNull();
  });

  it('rejects share password shorter than minimum length', async () => {
    const shortPassword = 'ab'; // Less than MIN_SHARE_PASSWORD_LENGTH
    await expect(generateShareUrl(testItem, 2, shortPassword)).rejects.toThrow('share-password-too-short');
  });

  it('clamps duration to MAX_SHARE_DURATION_HOURS', async () => {
    const shareUrl = await generateShareUrl(testItem, 100, TEST_SHARE_PASSWORD);
    const hash = shareUrl.substring(shareUrl.indexOf('#'));
    const decrypted = await decryptShareUrl(hash, TEST_SHARE_PASSWORD);
    expect(decrypted).not.toBeNull();
    // Expiry should be at most MAX_SHARE_DURATION_HOURS from now (with a small tolerance)
    const maxExpiry = Date.now() + MAX_SHARE_DURATION_HOURS * 3600 * 1000 + 5000;
    expect(decrypted!.expiresAt).toBeLessThanOrEqual(maxExpiry);
  });

  it('fails gracefully when parameters are missing or invalid', async () => {
    expect(await decryptShareUrl('', TEST_SHARE_PASSWORD)).toBeNull();
    expect(await decryptShareUrl('#share=abc', TEST_SHARE_PASSWORD)).toBeNull();
    expect(await decryptShareUrl('#s=abc', TEST_SHARE_PASSWORD)).toBeNull();
    expect(await decryptShareUrl('#share=invalid&s=invalid', TEST_SHARE_PASSWORD)).toBeNull();
    expect(await decryptShareUrl('#share=e30&s=e30', TEST_SHARE_PASSWORD)).toBeNull();
  });

  it('rejects expired share URLs', async () => {
    const shareUrl = await generateShareUrl(testItem, 2, TEST_SHARE_PASSWORD);
    const hash = shareUrl.substring(shareUrl.indexOf('#'));
    
    // Simulate future time beyond 2 hours
    const futureTime = Date.now() + 3 * 60 * 60 * 1000;
    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(futureTime);

    const decrypted = await decryptShareUrl(hash, TEST_SHARE_PASSWORD);
    expect(decrypted).toBeNull();
    dateSpy.mockRestore();
  });
});
