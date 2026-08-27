/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { SettingsUpdateCard } from './SettingsUpdateCard';
import * as updaterLib from '../../lib/updater';

vi.mock('../../lib/environment', () => ({
  isDesktopRuntime: vi.fn(() => true),
}));

describe('SettingsUpdateCard', () => {
  const t = (key: string) => key;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders SettingsUpdateCard with current version and check button', () => {
    render(<SettingsUpdateCard t={t} />);

    expect(screen.getByTestId('app-updates-card')).toBeDefined();
    expect(screen.getByTestId('current-version-badge').textContent).toContain('v7.0.2');
    expect(screen.getByTestId('check-updates-button')).toBeDefined();
  });

  it('handles update check when app is up to date', async () => {
    vi.spyOn(updaterLib, 'checkAppUpdate').mockResolvedValueOnce({
      supported: true,
      hasUpdate: false,
    });

    render(<SettingsUpdateCard t={t} />);

    const checkButton = screen.getByTestId('check-updates-button');
    await act(async () => {
      fireEvent.click(checkButton);
    });

    expect(screen.getByTestId('up-to-date-badge')).toBeDefined();
    expect(screen.getByTestId('up-to-date-badge').textContent).toContain('settings.updates.upToDate');
  });

  it('displays available update with release notes and download button', async () => {
    vi.spyOn(updaterLib, 'checkAppUpdate').mockResolvedValueOnce({
      supported: true,
      hasUpdate: true,
      updateInfo: {
        currentVersion: '7.0.2',
        version: '7.0.3',
        body: 'Security patches and performance improvements.',
        date: '2026-08-27T12:00:00Z',
      },
    });

    render(<SettingsUpdateCard t={t} />);

    const checkButton = screen.getByTestId('check-updates-button');
    await act(async () => {
      fireEvent.click(checkButton);
    });

    expect(screen.getByTestId('update-available-badge')).toBeDefined();
    expect(screen.getByTestId('update-available-badge').textContent).toContain('v7.0.3');
    expect(screen.getByTestId('update-release-notes').textContent).toContain('Security patches');
    expect(screen.getByTestId('download-update-button')).toBeDefined();
  });

  it('handles download and install progress flow and restart trigger', async () => {
    vi.spyOn(updaterLib, 'checkAppUpdate').mockResolvedValueOnce({
      supported: true,
      hasUpdate: true,
      updateInfo: {
        currentVersion: '7.0.2',
        version: '7.0.3',
      },
    });

    const downloadSpy = vi.spyOn(updaterLib, 'downloadAndApplyUpdate').mockImplementation(async (onProgress) => {
      onProgress?.({ total: 1000, downloaded: 500, percent: 50 });
      onProgress?.({ total: 1000, downloaded: 1000, percent: 100 });
      return { success: true };
    });

    const restartSpy = vi.spyOn(updaterLib, 'restartApplication').mockResolvedValueOnce();

    render(<SettingsUpdateCard t={t} />);

    // Step 1: Check for updates
    await act(async () => {
      fireEvent.click(screen.getByTestId('check-updates-button'));
    });

    // Step 2: Click download & install
    const downloadButton = screen.getByTestId('download-update-button');
    await act(async () => {
      fireEvent.click(downloadButton);
    });

    expect(downloadSpy).toHaveBeenCalled();
    expect(screen.getByTestId('downloaded-badge')).toBeDefined();
    expect(screen.getByTestId('restart-app-button')).toBeDefined();

    // Step 3: Click restart
    await act(async () => {
      fireEvent.click(screen.getByTestId('restart-app-button'));
    });

    expect(restartSpy).toHaveBeenCalled();
  });

  it('displays error message when update check fails', async () => {
    vi.spyOn(updaterLib, 'checkAppUpdate').mockResolvedValueOnce({
      supported: true,
      hasUpdate: false,
      error: 'Network connection failed',
    });

    render(<SettingsUpdateCard t={t} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('check-updates-button'));
    });

    expect(screen.getByTestId('update-error-message')).toBeDefined();
    expect(screen.getByTestId('update-error-message').textContent).toContain('Network connection failed');
  });

  it('displays localized error message when errorKey is returned', async () => {
    vi.spyOn(updaterLib, 'checkAppUpdate').mockResolvedValueOnce({
      supported: true,
      hasUpdate: false,
      error: 'Could not fetch a valid release JSON from the remote',
      errorKey: 'settings.updates.errorNotFound',
    });

    render(<SettingsUpdateCard t={t} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('check-updates-button'));
    });

    expect(screen.getByTestId('update-error-message')).toBeDefined();
    expect(screen.getByTestId('update-error-message').textContent).toContain('settings.updates.errorNotFound');
  });
});
