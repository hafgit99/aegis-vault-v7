/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it } from 'vitest';
import { isDesktopRuntime, isTestEnv } from './environment';

describe('environment detection', () => {
  afterEach(() => {
    delete (window as any).__TAURI_INTERNALS__;
  });

  it('detects desktop runtime when tauri internals exist on window', () => {
    expect(isDesktopRuntime()).toBe(false);
    (window as any).__TAURI_INTERNALS__ = {};
    expect(isDesktopRuntime()).toBe(true);
  });

  it('identifies test environment correctly', () => {
    expect(isTestEnv).toBe(true);
  });
});
