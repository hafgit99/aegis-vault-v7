/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getSecureStorageItem,
  isSecureStorageAvailable,
  removeSecureStorageItem,
  secureStorageKeys,
  setSecureStorageItem,
} from './secureStorage';

afterEach(() => {
  delete window.AegisAndroidSecureStorage;
  vi.restoreAllMocks();
});

describe('secure storage bridge', () => {
  it('reports unavailable when the Android bridge is missing', () => {
    expect(isSecureStorageAvailable()).toBe(false);
    expect(getSecureStorageItem(secureStorageKeys.rememberedSecretKey)).toBeNull();
    expect(setSecureStorageItem(secureStorageKeys.rememberedSecretKey, 'secret')).toBe(false);
    expect(removeSecureStorageItem(secureStorageKeys.rememberedSecretKey)).toBe(false);
  });

  it('reports unavailable when the Android bridge shape is incomplete', () => {
    const incompleteBridges = [
      { getItem: vi.fn(() => null) },
      { setItem: vi.fn(() => true) },
      { removeItem: vi.fn(() => true) },
      { getItem: 'not-a-function', setItem: vi.fn(() => true), removeItem: vi.fn(() => true) },
      { getItem: vi.fn(() => null), setItem: 'not-a-function', removeItem: vi.fn(() => true) },
      { getItem: vi.fn(() => null), setItem: vi.fn(() => true), removeItem: 'not-a-function' },
    ];

    for (const bridge of incompleteBridges) {
      window.AegisAndroidSecureStorage = bridge as unknown as typeof window.AegisAndroidSecureStorage;
      expect(isSecureStorageAvailable()).toBe(false);
      expect(getSecureStorageItem(secureStorageKeys.rememberedSecretKey)).toBeNull();
      expect(setSecureStorageItem(secureStorageKeys.rememberedSecretKey, 'secret')).toBe(false);
      expect(removeSecureStorageItem(secureStorageKeys.rememberedSecretKey)).toBe(false);
    }
  });

  it('routes get, set, and remove through the Android secure storage bridge', () => {
    const values = new Map<string, string>();
    window.AegisAndroidSecureStorage = {
      getItem: vi.fn((key) => values.get(key) ?? null),
      setItem: vi.fn((key, value) => {
        values.set(key, value);
        return true;
      }),
      removeItem: vi.fn((key) => values.delete(key)),
    };

    expect(isSecureStorageAvailable()).toBe(true);
    expect(setSecureStorageItem(secureStorageKeys.rememberedSecretKey, 'secret')).toBe(true);
    expect(getSecureStorageItem(secureStorageKeys.rememberedSecretKey)).toBe('secret');
    expect(removeSecureStorageItem(secureStorageKeys.rememberedSecretKey)).toBe(true);
    expect(getSecureStorageItem(secureStorageKeys.rememberedSecretKey)).toBeNull();
  });

  it('fails closed when the bridge throws', () => {
    window.AegisAndroidSecureStorage = {
      getItem: vi.fn(() => {
        throw new Error('bridge failed');
      }),
      setItem: vi.fn(() => {
        throw new Error('bridge failed');
      }),
      removeItem: vi.fn(() => {
        throw new Error('bridge failed');
      }),
    };

    expect(getSecureStorageItem(secureStorageKeys.biometricInfo)).toBeNull();
    expect(setSecureStorageItem(secureStorageKeys.biometricInfo, '{}')).toBe(false);
    expect(removeSecureStorageItem(secureStorageKeys.biometricInfo)).toBe(false);
  });
});
