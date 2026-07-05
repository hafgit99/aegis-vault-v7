/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearAllSetupFlags,
  clearAllSetupFlagsSync,
  getIndexedDbItem,
  getIndexedDbItemSync,
  initializeIndexedDbStorage,
  removeIndexedDbItem,
  removeIndexedDbItemSync,
  setIndexedDbItem,
  setIndexedDbItemSync,
} from './indexedDbStorage';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('indexedDbStorage', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearAllSetupFlags();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await clearAllSetupFlags();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('stores, reads, removes, and clears setup flags through IndexedDB', async () => {
    await setIndexedDbItem('aegis_is_setup', 'true');
    expect(await getIndexedDbItem('aegis_is_setup')).toBe('true');

    await removeIndexedDbItem('aegis_is_setup');
    expect(await getIndexedDbItem('aegis_is_setup')).toBeNull();

    await setIndexedDbItem('aegis_account_secret_profile', 'profile');
    await setIndexedDbItem('aegis_sqlite_fallback', 'payload');
    await clearAllSetupFlags();
    expect(await getIndexedDbItem('aegis_account_secret_profile')).toBeNull();
    expect(await getIndexedDbItem('aegis_sqlite_fallback')).toBeNull();
  });

  it('migrates known localStorage keys into IndexedDB and synchronous cache', async () => {
    localStorage.setItem('aegis_is_setup', 'true');
    localStorage.setItem('aegis_account_secret_key_remembered', 'secret');

    await initializeIndexedDbStorage();

    expect(getIndexedDbItemSync('aegis_is_setup')).toBe('true');
    expect(getIndexedDbItemSync('aegis_account_secret_key_remembered')).toBe('secret');
    expect(localStorage.getItem('aegis_is_setup')).toBeNull();
    expect(await getIndexedDbItem('aegis_is_setup')).toBe('true');
  });

  it('hydrates null values for missing known keys during initialization', async () => {
    await initializeIndexedDbStorage();
    expect(getIndexedDbItemSync('aegis_vault_storage_active_backend')).toBeNull();
  });

  it('keeps synchronous cache in step with async writes and deletes', async () => {
    setIndexedDbItemSync('custom_key', 'value');
    expect(getIndexedDbItemSync('custom_key')).toBe('value');
    await flush();
    expect(await getIndexedDbItem('custom_key')).toBe('value');

    removeIndexedDbItemSync('custom_key');
    expect(getIndexedDbItemSync('custom_key')).toBeNull();
    await flush();
    expect(await getIndexedDbItem('custom_key')).toBeNull();
  });

  it('falls back to localStorage when sync cache has no value', () => {
    localStorage.setItem('early_boot_key', 'fallback');
    expect(getIndexedDbItemSync('early_boot_key')).toBe('fallback');
  });

  it('clears synchronous cache values', () => {
    setIndexedDbItemSync('sync_clear_key', 'value');
    clearAllSetupFlagsSync();
    expect(getIndexedDbItemSync('sync_clear_key')).toBeNull();
  });

  it('gracefully no-ops when IndexedDB is unavailable', async () => {
    const originalIndexedDb = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined });
    localStorage.setItem('early_boot_without_idb', 'legacy');

    await expect(getIndexedDbItem('missing')).resolves.toBeNull();
    await expect(setIndexedDbItem('missing', 'value')).resolves.toBeUndefined();
    await expect(removeIndexedDbItem('missing')).resolves.toBeUndefined();
    await expect(clearAllSetupFlags()).resolves.toBeUndefined();
    expect(getIndexedDbItemSync('early_boot_without_idb')).toBe('legacy');

    if (originalIndexedDb) {
      Object.defineProperty(globalThis, 'indexedDB', originalIndexedDb);
    }
  });

  it('logs and swallows async sync-cache persistence failures', async () => {
    const originalIndexedDb = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined });

    setIndexedDbItemSync('no_idb_set_key', 'value');
    removeIndexedDbItemSync('no_idb_set_key');
    clearAllSetupFlagsSync();
    await flush();

    expect(console.error).not.toHaveBeenCalled();
    if (originalIndexedDb) {
      Object.defineProperty(globalThis, 'indexedDB', originalIndexedDb);
    }
  });});

