/**
 * @vitest-environment jsdom
 */

/**
 * @file SettingsSnapshotHistoryCard.test.tsx
 * @description Unit and integration tests for SettingsSnapshotHistoryCard component.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { SettingsSnapshotHistoryCard } from './SettingsSnapshotHistoryCard';
import * as snapshotsLib from '../../lib/snapshots';
import { LanguageProvider } from '../../i18n/LanguageContext';

const mockSnapshots: snapshotsLib.VaultSnapshotRecord[] = [
  {
    id: 'snap-1',
    createdAt: '2026-09-24T12:00:00.000Z',
    itemCount: 42,
    attachmentCount: 2,
    sizeBytes: 2048,
    trigger: 'manual',
    label: 'Manual Backup',
    encryptedPayload: '{}',
    checksum: 'checksum1',
  },
  {
    id: 'snap-2',
    createdAt: '2026-09-23T10:00:00.000Z',
    itemCount: 40,
    attachmentCount: 1,
    sizeBytes: 1500,
    trigger: 'auto',
    label: '',
    encryptedPayload: '{}',
    checksum: 'checksum2',
  },
];

function renderWithProviders(ui: React.ReactElement) {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

describe('SettingsSnapshotHistoryCard', () => {
  const mockOnDatabaseChanged = vi.fn();
  const mockOnNotify = vi.fn();

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(snapshotsLib, 'getVaultSnapshots').mockResolvedValue([...mockSnapshots]);
    vi.spyOn(snapshotsLib, 'createVaultSnapshot').mockResolvedValue({
      id: 'snap-new',
      createdAt: new Date().toISOString(),
      itemCount: 45,
      attachmentCount: 2,
      sizeBytes: 2100,
      trigger: 'manual',
      label: 'New Test Snapshot',
      encryptedPayload: '{}',
      checksum: 'checksum3',
    });
    vi.spyOn(snapshotsLib, 'deleteVaultSnapshot').mockResolvedValue();
    vi.spyOn(snapshotsLib, 'restoreVaultSnapshot').mockResolvedValue({
      restoredItems: 42,
      restoredAttachments: 2,
      safetySnapshotId: 'safety-1',
    });
    vi.spyOn(snapshotsLib, 'exportVaultSnapshotToFile').mockResolvedValue(true);
  });

  it('renders snapshot history card and lists existing snapshots', async () => {
    renderWithProviders(
      <SettingsSnapshotHistoryCard
        onDatabaseChanged={mockOnDatabaseChanged}
        onNotify={mockOnNotify}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('vault-snapshot-history-card')).toBeDefined();
    });

    expect(screen.getByText('Manual Backup')).toBeDefined();
    expect(screen.getByTestId('snapshot-item-snap-1')).toBeDefined();
    expect(screen.getByTestId('snapshot-item-snap-2')).toBeDefined();
  });

  it('displays empty state when no snapshots exist', async () => {
    vi.spyOn(snapshotsLib, 'getVaultSnapshots').mockResolvedValue([]);

    renderWithProviders(
      <SettingsSnapshotHistoryCard
        onDatabaseChanged={mockOnDatabaseChanged}
        onNotify={mockOnNotify}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('snapshot-empty-state')).toBeDefined();
    });
  });

  it('allows creating a new snapshot with optional label', async () => {
    renderWithProviders(
      <SettingsSnapshotHistoryCard
        onDatabaseChanged={mockOnDatabaseChanged}
        onNotify={mockOnNotify}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('create-snapshot-button')).toBeDefined();
    });

    // Click to open label input
    fireEvent.click(screen.getByTestId('create-snapshot-button'));

    expect(screen.getByTestId('snapshot-label-input')).toBeDefined();
    fireEvent.change(screen.getByTestId('snapshot-label-input'), {
      target: { value: 'Before Migration' },
    });

    // Click submit
    fireEvent.click(screen.getByTestId('snapshot-label-submit'));

    await waitFor(() => {
      expect(snapshotsLib.createVaultSnapshot).toHaveBeenCalledWith('manual', 'Before Migration');
    });
  });

  it('prompts confirmation modal before restoring a snapshot', async () => {
    renderWithProviders(
      <SettingsSnapshotHistoryCard
        onDatabaseChanged={mockOnDatabaseChanged}
        onNotify={mockOnNotify}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('restore-snapshot-snap-1')).toBeDefined();
    });

    // Click restore
    fireEvent.click(screen.getByTestId('restore-snapshot-snap-1'));

    // Modal appears
    expect(screen.getByTestId('confirm-restore-modal')).toBeDefined();

    // Confirm restore
    fireEvent.click(screen.getByTestId('confirm-restore-submit'));

    await waitFor(() => {
      expect(snapshotsLib.restoreVaultSnapshot).toHaveBeenCalledWith('snap-1');
      expect(mockOnDatabaseChanged).toHaveBeenCalled();
    });
  });

  it('deletes a snapshot when delete button is clicked', async () => {
    renderWithProviders(
      <SettingsSnapshotHistoryCard
        onDatabaseChanged={mockOnDatabaseChanged}
        onNotify={mockOnNotify}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('delete-snapshot-snap-1')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('delete-snapshot-snap-1'));

    await waitFor(() => {
      expect(snapshotsLib.deleteVaultSnapshot).toHaveBeenCalledWith('snap-1');
    });
  });

  it('exports snapshot to file when export button is clicked', async () => {
    renderWithProviders(
      <SettingsSnapshotHistoryCard
        onDatabaseChanged={mockOnDatabaseChanged}
        onNotify={mockOnNotify}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('export-snapshot-snap-1')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('export-snapshot-snap-1'));

    await waitFor(() => {
      expect(snapshotsLib.exportVaultSnapshotToFile).toHaveBeenCalledWith(mockSnapshots[0]);
    });
  });

  it('toggles auto snapshot settings panel and updates configuration', async () => {
    const saveSettingsSpy = vi.spyOn(snapshotsLib, 'saveSnapshotSettings');

    render(
      <SettingsSnapshotHistoryCard
        onDatabaseChanged={mockOnDatabaseChanged}
        onNotify={mockOnNotify}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('auto-settings-toggle-btn')).toBeTruthy();
    });

    // Toggle open settings panel
    fireEvent.click(screen.getByTestId('auto-settings-toggle-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('auto-settings-panel')).toBeTruthy();
      expect(screen.getByTestId('auto-enabled-toggle')).toBeTruthy();
      expect(screen.getByTestId('auto-frequency-select')).toBeTruthy();
      expect(screen.getByTestId('auto-retention-select')).toBeTruthy();
    });

    // Change frequency to on_lock
    fireEvent.change(screen.getByTestId('auto-frequency-select'), {
      target: { value: 'on_lock' },
    });
    expect(saveSettingsSpy).toHaveBeenCalledWith(expect.objectContaining({ frequency: 'on_lock' }));

    // Change retention to 50
    fireEvent.change(screen.getByTestId('auto-retention-select'), {
      target: { value: '50' },
    });
    expect(saveSettingsSpy).toHaveBeenCalledWith(expect.objectContaining({ maxSnapshots: 50 }));

    // Toggle auto-enabled switch
    fireEvent.click(screen.getByTestId('auto-enabled-toggle'));
    expect(saveSettingsSpy).toHaveBeenCalledWith(expect.objectContaining({ autoEnabled: false }));
  });
});
