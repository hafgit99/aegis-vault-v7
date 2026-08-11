/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncStatusBadge } from './SyncStatusBadge';

describe('SyncStatusBadge', () => {
  afterEach(() => {
    cleanup();
  });
  it('renders disabled status when not configured', () => {
    render(<SyncStatusBadge status="idle" lastSyncAt={null} isConfigured={false} />);
    expect(screen.getByText('Eşleşme Yok')).toBeTruthy();
  });

  it('renders syncing state and disables click', () => {
    const onManualSync = vi.fn();
    render(<SyncStatusBadge status="syncing" lastSyncAt={null} isConfigured={true} onManualSync={onManualSync} />);

    const button = screen.getByRole('button');
    expect(button).toBeTruthy();
    expect(screen.getByText('Eşleniyor...')).toBeTruthy();

    fireEvent.click(button);
    expect(onManualSync).not.toHaveBeenCalled();
  });

  it('renders success state with last sync time and handles click', () => {
    const onManualSync = vi.fn();
    const isoTime = '2026-08-11T12:00:00.000Z';
    render(<SyncStatusBadge status="success" lastSyncAt={isoTime} isConfigured={true} onManualSync={onManualSync} />);

    const button = screen.getByRole('button');
    expect(button).toBeTruthy();
    expect(screen.getByText(/Eşlendi/)).toBeTruthy();

    fireEvent.click(button);
    expect(onManualSync).toHaveBeenCalledTimes(1);
  });

  it('renders error state', () => {
    const onManualSync = vi.fn();
    render(<SyncStatusBadge status="error" lastSyncAt={null} isConfigured={true} onManualSync={onManualSync} />);

    expect(screen.getByText('Hata')).toBeTruthy();
  });

  it('renders conflict state', () => {
    const onManualSync = vi.fn();
    render(<SyncStatusBadge status="conflict" lastSyncAt={null} isConfigured={true} onManualSync={onManualSync} />);

    expect(screen.getByText('Çakışma')).toBeTruthy();
  });
});
