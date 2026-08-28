/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import {
  isBiometricAndroidBridgeAvailable,
  isBiometricHandle,
} from './biometricAndroid';

describe('isBiometricHandle', () => {
  it('detects an opaque wrapped handle produced by the native wrap operation', () => {
    const handle = JSON.stringify({ v: 2, iv: 'aGVsbG8=', ct: 'eHh4' });
    expect(isBiometricHandle(handle)).toBe(true);
  });

  it('detects handles with surrounding whitespace', () => {
    expect(isBiometricHandle('  {"v":2,"iv":"a","ct":"b"}  ')).toBe(true);
  });

  it('rejects legacy raw base64 secrets and unrelated JSON', () => {
    expect(isBiometricHandle('c2VjcmV0LWtleS1ieXRlcw==')).toBe(false);
    expect(isBiometricHandle('{"foo":"bar"}')).toBe(false);
    expect(isBiometricHandle('')).toBe(false);
  });
});

describe('isBiometricAndroidBridgeAvailable', () => {
  it('returns false when the native bridge is absent', () => {
    expect(isBiometricAndroidBridgeAvailable()).toBe(false);
  });
});
