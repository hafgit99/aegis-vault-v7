/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./argon2id', () => ({
  deriveArgon2idKey: async (password: string) => new TextEncoder().encode(password.padEnd(32, '.')).slice(0, 32),
  enforceMinimumKdfFloor: (opts: any) => ({ memoryKiB: 32768, iterations: 3, parallelism: 1, hashLength: 32, ...opts }),
}));

vi.mock('./webcrypto', () => ({
  generateSafeIv: () => '00'.repeat(12),
  derivePerItemKey: async (key: Uint8Array) => new Uint8Array(32).fill(key[0] || 7),
  webCryptoAesGcmEncrypt: async (plaintext: string, key: Uint8Array, iv: string) => ({
    iv,
    tag: Array.from(key).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32),
    ciphertext: btoa(plaintext),
  }),
  webCryptoAesGcmDecrypt: async (payload: { tag: string; ciphertext: string }, key: Uint8Array) => {
    const expectedTag = Array.from(key).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
    if (payload.tag !== expectedTag) throw new Error('wrong key');
    return atob(payload.ciphertext);
  },
}));

import {
  clearSyncConfig,
  getLastSyncTime,
  hasSyncConfig,
  loadSyncConfig,
  saveLastSyncTime,
  saveSyncConfig,
  validateWebDavConfig,
  validateS3Config,
} from './sync/syncConfigStorage';
import { SyncError, syncErrorCodes, type SyncConfig } from './sync/syncTypes';

describe('syncConfigStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('round-trips encrypted WebDAV config and never stores plaintext credentials', async () => {
    const config: SyncConfig = {
      type: 'webdav',
      url: 'https://cloud.example.com/remote.php/dav/files/aegis',
      username: 'alice',
      password: 'app-token',
    };

    await saveSyncConfig(config, 'master-password');

    const raw = localStorage.getItem('aegis_sync_config_v1');
    expect(raw).toBeTruthy();
    expect(raw).not.toContain('app-token');
    expect(raw).not.toContain('alice');
    expect(hasSyncConfig()).toBe(true);
    await expect(loadSyncConfig('master-password')).resolves.toEqual(config);
  });

  it('round-trips encrypted S3 config and never stores plaintext credentials', async () => {
    const config: SyncConfig = {
      type: 's3',
      endpoint: 'https://s3.us-east-1.amazonaws.com',
      region: 'us-east-1',
      bucket: 'my-bucket',
      accessKeyId: 'AKIA1234567890',
      secretAccessKey: 'secretKey1234567890',
    };

    await saveSyncConfig(config, 'master-password');

    const raw = localStorage.getItem('aegis_sync_config_v1');
    expect(raw).toBeTruthy();
    expect(raw).not.toContain('AKIA1234567890');
    expect(raw).not.toContain('secretKey1234567890');
    expect(hasSyncConfig()).toBe(true);
    await expect(loadSyncConfig('master-password')).resolves.toEqual(config);
  });

  it('removes config when disabled is saved', async () => {
    await saveSyncConfig({ type: 'disabled' }, 'master-password');
    expect(hasSyncConfig()).toBe(false);
    await expect(loadSyncConfig('master-password')).resolves.toEqual({ type: 'disabled' });
  });

  it('returns disabled for missing, malformed, or unsupported envelopes', async () => {
    expect(await loadSyncConfig('master-password')).toEqual({ type: 'disabled' });

    localStorage.setItem('aegis_sync_config_v1', '{bad json');
    expect(await loadSyncConfig('master-password')).toEqual({ type: 'disabled' });

    localStorage.setItem('aegis_sync_config_v1', JSON.stringify({ version: 2, payload: {} }));
    expect(await loadSyncConfig('master-password')).toEqual({ type: 'disabled' });

    localStorage.setItem('aegis_sync_config_v1', JSON.stringify({ version: 1 }));
    expect(await loadSyncConfig('master-password')).toEqual({ type: 'disabled' });
  });

  it('throws a sync auth error for wrong passwords or corrupt payloads', async () => {
    const config: SyncConfig = {
      type: 'webdav',
      url: 'https://cloud.example.com/dav',
      username: 'alice',
      password: 'token',
    };
    await saveSyncConfig(config, 'right-password');

    await expect(loadSyncConfig('wrong-password')).rejects.toMatchObject({
      code: syncErrorCodes.authFailed,
    } satisfies Partial<SyncError>);
  });

  it('clears config and last sync metadata', async () => {
    await saveSyncConfig({ type: 'webdav', url: 'https://example.com/dav', username: 'u', password: 'p' }, 'master');
    saveLastSyncTime('2026-07-04T20:00:00.000Z');
    expect(getLastSyncTime()).toBe('2026-07-04T20:00:00.000Z');

    clearSyncConfig();

    expect(hasSyncConfig()).toBe(false);
    expect(getLastSyncTime()).toBeNull();
  });

  it('validates WebDAV config requirements and local HTTP exceptions', () => {
    expect(validateWebDavConfig({})).toBe('URL gereklidir.');
    expect(validateWebDavConfig({ url: 'not a url' })).toBe('Ge\u00e7ersiz URL format\u0131.');
    expect(validateWebDavConfig({ url: 'http://example.com', username: 'u', password: 'p' })).toBe('G\u00fcvenlik i\u00e7in HTTPS gereklidir (yerel a\u011f adresleri muaf tutulur).');
    expect(validateWebDavConfig({ url: 'https://example.com', password: 'p' })).toBe('Kullan\u0131c\u0131 ad\u0131 gereklidir.');
    expect(validateWebDavConfig({ url: 'https://example.com', username: 'u' })).toBe('\u015eifre veya uygulama token gereklidir.');
    expect(validateWebDavConfig({ url: 'http://localhost:8080/dav', username: 'u', password: 'p' })).toBeNull();
    expect(validateWebDavConfig({ url: 'http://192.168.1.5/dav', username: 'u', password: 'p' })).toBeNull();
    expect(validateWebDavConfig({ url: 'https://example.com/dav', username: 'u', password: 'p' })).toBeNull();
  });

  it('validates S3 config requirements and local HTTP exceptions', () => {
    expect(validateS3Config({})).toBe('S3 Endpoint URL gereklidir.');
    expect(validateS3Config({ endpoint: 'not a url' })).toBe('Ge\u00e7ersiz Endpoint URL format\u0131.');
    expect(validateS3Config({ endpoint: 'http://s3.example.com' })).toBe('G\u00fcvenlik i\u00e7in HTTPS gereklidir (yerel a\u011f adresleri muaf tutulur).');
    expect(validateS3Config({ endpoint: 'https://s3.example.com' })).toBe('Bucket ad\u0131 gereklidir.');
    expect(validateS3Config({ endpoint: 'https://s3.example.com', bucket: 'b' })).toBe('Access Key ID gereklidir.');
    expect(validateS3Config({ endpoint: 'https://s3.example.com', bucket: 'b', accessKeyId: 'ak' })).toBe('Secret Access Key gereklidir.');
    expect(validateS3Config({ endpoint: 'http://127.0.0.1:9000', bucket: 'b', accessKeyId: 'ak', secretAccessKey: 'sk' })).toBeNull();
    expect(validateS3Config({ endpoint: 'https://s3.us-east-1.amazonaws.com', bucket: 'b', accessKeyId: 'ak', secretAccessKey: 'sk' })).toBeNull();
  });
});



