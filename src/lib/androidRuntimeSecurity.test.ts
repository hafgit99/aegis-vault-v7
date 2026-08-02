// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAndroidRuntimeSecurityPosture,
  parseAndroidRuntimeSecurityPosture,
} from './androidRuntimeSecurity';

const validPosture = JSON.stringify({
  releaseBuild: true,
  appDebuggable: false,
  debuggerAttached: false,
  riskDetected: true,
  mode: 'warning-only',
  signals: ['root_artifact'],
});

describe('Android runtime security bridge', () => {
  beforeEach(() => {
    delete window.AegisAndroidSecurity;
  });

  it('parses a bounded warning-only posture', () => {
    expect(parseAndroidRuntimeSecurityPosture(validPosture)).toEqual({
      releaseBuild: true,
      appDebuggable: false,
      debuggerAttached: false,
      riskDetected: true,
      mode: 'warning-only',
      signals: ['root_artifact'],
    });
  });

  it.each([
    null,
    '',
    '{',
    '[]',
    JSON.stringify({ releaseBuild: true }),
    JSON.stringify({ releaseBuild: false, appDebuggable: false, debuggerAttached: false, riskDetected: true, mode: 'warning-only', signals: ['root_artifact'] }),
    JSON.stringify({ releaseBuild: true, appDebuggable: false, debuggerAttached: false, riskDetected: true, mode: 'blocking', signals: ['root_artifact'] }),
    JSON.stringify({ releaseBuild: true, appDebuggable: false, debuggerAttached: false, riskDetected: true, mode: 'warning-only', signals: ['unknown'] }),
  ])('rejects malformed or unsupported posture payload %s', (payload) => {
    expect(parseAndroidRuntimeSecurityPosture(payload)).toBeNull();
  });

  it('returns null when the native bridge is unavailable or throws', () => {
    expect(getAndroidRuntimeSecurityPosture()).toBeNull();
    window.AegisAndroidSecurity = { getPosture: vi.fn(() => { throw new Error('bridge unavailable'); }) };
    expect(getAndroidRuntimeSecurityPosture()).toBeNull();
  });

  it('reads and validates posture from the native bridge', () => {
    window.AegisAndroidSecurity = { getPosture: vi.fn(() => validPosture) };
    expect(getAndroidRuntimeSecurityPosture()?.signals).toEqual(['root_artifact']);
  });
});