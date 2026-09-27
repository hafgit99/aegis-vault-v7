/**
 * @vitest-environment jsdom
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const initializeStorage = vi.hoisted(() => vi.fn(async () => undefined));
const isVaultStorageUnavailableError = vi.hoisted(() => (err: unknown) =>
  err instanceof Error && err.message.startsWith('vault-storage-unavailable:'));

vi.mock('./lib/storage', () => ({
  initializeStorage,
  isVaultStorageUnavailableError,
}));

vi.mock('./components/LockScreen', () => ({
  default: () => <div data-testid="lock-screen">LockScreen</div>,
}));

vi.mock('./UnlockedApp', () => ({
  default: () => <div data-testid="unlocked-app">UnlockedApp</div>,
}));

vi.mock('./i18n/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => ({
      'lock.error.vaultStorageUnavailableTitle': 'Your vault could not be opened right now',
      'lock.error.vaultStorageUnavailable': 'Your vault database could not be opened.',
      'lock.error.vaultStorageRetry': 'Try again',
    })[key] ?? key,
  }),
}));

import App from './App';

describe('App vault storage unavailable handling (Y-13)', () => {
  beforeEach(() => {
    initializeStorage.mockReset();
    initializeStorage.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows the storage-unavailable screen instead of the lock screen', async () => {
    initializeStorage.mockRejectedValue(
      new Error('vault-storage-unavailable:persisted-wa-sqlite-backend-unavailable'),
    );

    render(<App />);

    expect(await screen.findByText('Your vault could not be opened right now')).toBeTruthy();
    // The regression: a password prompt that cannot possibly succeed.
    expect(screen.queryByTestId('lock-screen')).toBeNull();
  });

  it('offers a retry action that reloads the page', async () => {
    initializeStorage.mockRejectedValue(
      new Error('vault-storage-unavailable:persisted-wa-sqlite-backend-unavailable'),
    );
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });

    render(<App />);

    const retry = await screen.findByText('Try again');
    retry.click();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not surface the unavailable screen for an unrelated storage error', async () => {
    initializeStorage.mockRejectedValue(new Error('some-other-failure'));

    render(<App />);

    expect(await screen.findByTestId('lock-screen')).toBeTruthy();
    expect(screen.queryByText('Your vault could not be opened right now')).toBeNull();
  });

  it('does not surface the unavailable screen when storage initializes cleanly', async () => {
    render(<App />);

    expect(await screen.findByTestId('lock-screen')).toBeTruthy();
    expect(screen.queryByText('Your vault could not be opened right now')).toBeNull();
  });
});
