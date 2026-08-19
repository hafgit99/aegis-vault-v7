/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { VaultItem } from '../types';
import AppModals from './AppModals';

vi.mock('./VaultFormModal', () => ({
  default: ({
    isOpen,
    onClose,
    onSave,
    editingItem,
    onNotify,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onSave: (item: VaultItem) => void;
    editingItem: VaultItem | null;
    onNotify: (notification: { title: string; message: string; type: 'success' }) => void;
  }) =>
    isOpen ? (
      <section>
        <div>Vault Form Mock</div>
        <div>{editingItem?.title}</div>
        <button onClick={onClose}>Close Vault Form</button>
        <button onClick={() => onSave(item('saved'))}>Save Vault Item</button>
        <button onClick={() => onNotify({ title: 'Saved', message: 'Done', type: 'success' })}>
          Notify Vault
        </button>
      </section>
    ) : null,
}));

vi.mock('./ProfileModal', () => ({
  default: ({
    isOpen,
    onClose,
    currentAvatar,
    currentName,
    onSave,
  }: {
    isOpen: boolean;
    onClose: () => void;
    currentAvatar: string;
    currentName: string;
    onSave: (name: string, avatar: string) => void;
  }) =>
    isOpen ? (
      <section>
        <div>Profile Modal Mock</div>
        <div>{currentName}</div>
        <div>{currentAvatar}</div>
        <button onClick={onClose}>Close Profile</button>
        <button onClick={() => onSave('Ada', 'avatar-next')}>Save Profile</button>
      </section>
    ) : null,
}));

vi.mock('./ConfirmModal', () => ({
  default: ({
    isOpen,
    title,
    message,
    confirmText,
    cancelText,
    onConfirm,
    onCancel,
  }: {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel: () => void;
  }) =>
    isOpen ? (
      <section>
        <div>Confirm Modal Mock</div>
        <div>{title}</div>
        <div>{message}</div>
        <button onClick={onConfirm}>{confirmText || 'Onayla'}</button>
        <button onClick={onCancel}>{cancelText || 'Vazgec'}</button>
      </section>
    ) : null,
}));

const item = (id: string): VaultItem => ({
  id,
  title: id,
  username: `${id}@example.com`,
  password: `${id}-secret`,
  url: `https://${id}.example.com`,
  createdAt: '2026-06-10T12:00:00.000Z',
  updatedAt: '2026-06-10T12:00:00.000Z',
  category: 'login',
});

function renderAppModals(overrides: Partial<ComponentProps<typeof AppModals>> = {}) {
  const props: ComponentProps<typeof AppModals> = {
    isVaultFormOpen: true,
    editingItem: item('editing'),
    isProfileOpen: true,
    profileAvatar: 'avatar-current',
    profileName: 'Hafiz',
    confirmConfig: {
      isOpen: true,
      title: 'Confirm title',
      message: 'Confirm message',
      type: 'warning',
      confirmText: 'Proceed',
      cancelText: 'Cancel',
      onConfirm: vi.fn(),
    },
    onCloseVaultForm: vi.fn(),
    onSaveVaultItem: vi.fn(),
    onNotify: vi.fn(),
    onCloseProfile: vi.fn(),
    onSaveProfile: vi.fn(),
    onCancelConfirm: vi.fn(),
    folders: [],
    tags: [],
    isShareOpen: false,
    sharingItem: null,
    onCloseShare: vi.fn(),
    isReceiveOpen: false,
    receivedPayload: null,
    onCloseReceive: vi.fn(),
    onImportShare: vi.fn(),
    ...overrides,
  };

  render(<AppModals {...props} />);

  return props;
}

afterEach(() => {
  cleanup();
});

describe('AppModals', () => {
  it('renders all modal surfaces with their current data', () => {
    renderAppModals();

    expect(screen.getByText('Vault Form Mock')).toBeTruthy();
    expect(screen.getByText('editing')).toBeTruthy();
    expect(screen.getByText('Profile Modal Mock')).toBeTruthy();
    expect(screen.getByText('Hafiz')).toBeTruthy();
    expect(screen.getByText('avatar-current')).toBeTruthy();
    expect(screen.getByText('Confirm Modal Mock')).toBeTruthy();
    expect(screen.getByText('Confirm title')).toBeTruthy();
    expect(screen.getByText('Confirm message')).toBeTruthy();
  });

  it('forwards modal action callbacks', () => {
    const props = renderAppModals();

    fireEvent.click(screen.getByText('Close Vault Form'));
    fireEvent.click(screen.getByText('Save Vault Item'));
    fireEvent.click(screen.getByText('Notify Vault'));
    fireEvent.click(screen.getByText('Close Profile'));
    fireEvent.click(screen.getByText('Save Profile'));
    fireEvent.click(screen.getByText('Proceed'));
    fireEvent.click(screen.getByText('Cancel'));

    expect(props.onCloseVaultForm).toHaveBeenCalledTimes(1);
    expect(props.onSaveVaultItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'saved' }));
    expect(props.onNotify).toHaveBeenCalledWith(expect.objectContaining({ title: 'Saved' }));
    expect(props.onCloseProfile).toHaveBeenCalledTimes(1);
    expect(props.onSaveProfile).toHaveBeenCalledWith('Ada', 'avatar-next');
    expect(props.confirmConfig.onConfirm).toHaveBeenCalledTimes(1);
    expect(props.onCancelConfirm).toHaveBeenCalledTimes(1);
  });

  it('does not render closed modals', () => {
    renderAppModals({
      isVaultFormOpen: false,
      isProfileOpen: false,
      confirmConfig: {
        isOpen: false,
        title: '',
        message: '',
        type: 'info',
        onConfirm: vi.fn(),
      },
    });

    expect(screen.queryByText('Vault Form Mock')).toBeNull();
    expect(screen.queryByText('Profile Modal Mock')).toBeNull();
    expect(screen.queryByText('Confirm Modal Mock')).toBeNull();
  });
});
