/**
 * @vitest-environment jsdom
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsSyncSection } from './SettingsSyncSection';

afterEach(() => {
  cleanup();
});

describe('SettingsSyncSection', () => {
  const defaultProps = {
    syncProvider: 'disabled' as const,
    setSyncProvider: vi.fn(),
    syncUrl: '',
    setSyncUrl: vi.fn(),
    syncUsername: '',
    setSyncUsername: vi.fn(),
    syncPassword: '',
    setSyncPassword: vi.fn(),
    s3Endpoint: '',
    setS3Endpoint: vi.fn(),
    s3Region: '',
    setS3Region: vi.fn(),
    s3Bucket: '',
    setS3Bucket: vi.fn(),
    s3AccessKeyId: '',
    setS3AccessKeyId: vi.fn(),
    s3SecretAccessKey: '',
    setS3SecretAccessKey: vi.fn(),
    syncStatus: 'idle' as const,
    syncMessage: null,
    syncLastAt: null,
    syncTestResult: null,
    syncTestLoading: false,
    syncLoading: false,
    onSyncTest: vi.fn(),
    onSyncSave: vi.fn(),
    onSyncDisable: vi.fn(),
    onSyncNow: vi.fn(),
    t: (key: string) => key,
  };

  it('renders disabled state overview', () => {
    render(<SettingsSyncSection {...defaultProps} />);

    expect(screen.getByText('settings.sync.title')).toBeTruthy();
    expect(screen.getByText('settings.sync.description')).toBeTruthy();
    expect(screen.queryByLabelText('settings.sync.configure.url')).toBeNull();
  });

  it('calls setSyncProvider when provider selection changes', () => {
    render(<SettingsSyncSection {...defaultProps} />);

    const webdavBtn = screen.getByText('WebDAV / Nextcloud');
    fireEvent.click(webdavBtn);

    expect(defaultProps.setSyncProvider).toHaveBeenCalledWith('webdav');
  });

  it('renders WebDAV fields when provider is webdav', () => {
    const props = {
      ...defaultProps,
      syncProvider: 'webdav' as const,
      syncUrl: 'https://example.com/dav',
      syncUsername: 'user123',
      syncPassword: 'password123',
    };

    render(<SettingsSyncSection {...props} />);

    const urlInput = screen.getByPlaceholderText('settings.sync.configure.urlPlaceholder') as HTMLInputElement;
    const userInput = screen.getByPlaceholderText('settings.sync.configure.usernamePlaceholder') as HTMLInputElement;
    const passInput = screen.getByPlaceholderText('settings.sync.configure.passwordPlaceholder') as HTMLInputElement;

    expect(urlInput.value).toBe('https://example.com/dav');
    expect(userInput.value).toBe('user123');
    expect(passInput.value).toBe('password123');

    fireEvent.change(urlInput, { target: { value: 'https://new.com' } });
    expect(props.setSyncUrl).toHaveBeenCalledWith('https://new.com');

    fireEvent.change(userInput, { target: { value: 'new-user' } });
    expect(props.setSyncUsername).toHaveBeenCalledWith('new-user');

    fireEvent.change(passInput, { target: { value: 'new-pass' } });
    expect(props.setSyncPassword).toHaveBeenCalledWith('new-pass');
  });

  it('triggers action buttons', () => {
    const props = {
      ...defaultProps,
      syncProvider: 'webdav' as const,
    };

    render(<SettingsSyncSection {...props} />);

    fireEvent.click(screen.getByText('settings.sync.configure.testConnection'));
    expect(props.onSyncTest).toHaveBeenCalled();

    fireEvent.click(screen.getByText('settings.sync.configure.save'));
    expect(props.onSyncSave).toHaveBeenCalled();

    fireEvent.click(screen.getByText('settings.sync.configure.disable'));
    expect(props.onSyncDisable).toHaveBeenCalled();

    fireEvent.click(screen.getByText('settings.sync.syncNow'));
    expect(props.onSyncNow).toHaveBeenCalled();
  });

  it('displays connection test results and loader', () => {
    const props = {
      ...defaultProps,
      syncProvider: 'webdav' as const,
      syncTestResult: 'settings.sync.test.success',
      syncTestLoading: true,
    };

    const { rerender } = render(<SettingsSyncSection {...props} />);
    expect(screen.getByText('…')).toBeTruthy();
    expect(screen.getByText('settings.sync.test.success')).toBeTruthy();

    const propsFailed = {
      ...props,
      syncTestResult: 'settings.sync.test.failed',
      syncTestLoading: false,
    };
    rerender(<SettingsSyncSection {...propsFailed} />);
    expect(screen.getByText('settings.sync.configure.testConnection')).toBeTruthy();
    expect(screen.getByText('settings.sync.test.failed')).toBeTruthy();
  });

  it('renders last sync timestamp', () => {
    const timeStr = '2026-07-05T12:00:00.000Z';
    const props = {
      ...defaultProps,
      syncProvider: 'webdav' as const,
      syncLastAt: timeStr,
    };

    render(<SettingsSyncSection {...props} />);
    expect(screen.getByText(new Date(timeStr).toLocaleString())).toBeTruthy();
  });

  it('renders conflict UI detail', () => {
    const props = {
      ...defaultProps,
      syncProvider: 'webdav' as const,
      syncStatus: 'conflict' as const,
      syncMessage: 'conflict occurred',
    };

    render(<SettingsSyncSection {...props} />);
    expect(screen.getByText('settings.sync.status.conflict')).toBeTruthy();
    expect(screen.getByText('settings.sync.conflict.title')).toBeTruthy();
    expect(screen.getByText('settings.sync.conflict.description')).toBeTruthy();
    expect(screen.getByText(/— conflict occurred/)).toBeTruthy();
  });

  it('renders syncing and error statuses', () => {
    const props = {
      ...defaultProps,
      syncProvider: 'webdav' as const,
      syncStatus: 'syncing' as const,
      syncLoading: true,
      syncMessage: 'sync details',
    };

    const { rerender } = render(<SettingsSyncSection {...props} />);
    expect(screen.getByText('settings.sync.status.syncing')).toBeTruthy();
    expect(screen.getByText('settings.sync.syncNowLoading')).toBeTruthy();
    expect(screen.getByText(/— sync details/)).toBeTruthy();

    const propsError = {
      ...props,
      syncStatus: 'error' as const,
      syncLoading: false,
    };
    rerender(<SettingsSyncSection {...propsError} />);
    expect(screen.getByText('settings.sync.status.error')).toBeTruthy();
    expect(screen.getByText('settings.sync.syncNow')).toBeTruthy();

    const propsSuccess = {
      ...props,
      syncStatus: 'success' as const,
      syncLoading: false,
    };
    rerender(<SettingsSyncSection {...propsSuccess} />);
    expect(screen.getByText('settings.sync.status.success')).toBeTruthy();
  });
});
