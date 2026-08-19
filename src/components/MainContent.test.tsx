/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AuditReport, VaultItem } from '../types';
import MainContent from './MainContent';

vi.mock('./VaultWorkspace', () => ({
  default: (props: any) => (
    <div>
      <span>Vault Workspace Mock</span>
      <button data-testid="test-open-folder-sidebar" onClick={props.onOpenFolderSidebar}>Open Folder</button>
      <button data-testid="test-apply-bulk" onClick={() => props.onApplyBulkAction({ kind: 'delete' })}>Bulk Delete</button>
    </div>
  ),
}));

vi.mock('./OrganisationSidebar', () => ({
  default: (props: any) => (
    <div>
      <span>Organisation Sidebar Mock</span>
      <button data-testid="test-select-folder" onClick={() => props.onSelectFolder('f-1')}>Select Folder</button>
      <button data-testid="test-select-smart-folder" onClick={() => props.onSelectSmartFolder('sf-1')}>Select Smart Folder</button>
    </div>
  ),
}));

vi.mock('./SecurityAudit', () => ({
  default: () => <div>Security Audit Mock</div>,
}));

vi.mock('./PasswordGenerator', () => ({
  default: () => <div>Password Generator Mock</div>,
}));

vi.mock('./SettingsPanel', () => ({
  default: () => <div>Settings Panel Mock</div>,
}));

vi.mock('./DonationPanel', () => ({
  default: () => <div>Donation Panel Mock</div>,
}));

vi.mock('./TrashWorkspace', () => ({
  default: () => <div>Trash Workspace Mock</div>,
}));

const auditReport: AuditReport = {
  score: 80,
  weakCount: 1,
  reusedCount: 0,
  secureCount: 2,
  totalCount: 3,
};

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

function renderMainContent(overrides: Partial<ComponentProps<typeof MainContent>> = {}) {
  const props: ComponentProps<typeof MainContent> = {
    activeTab: 'vault',
    selectedItem: null,
    mobileActiveView: 'list',
    filteredItems: [item('mail')],
    filteredItemResults: [],
    activeItems: [item('mail')],
    trashItems: [item('trash')],
    filterFavoritesOnly: false,
    favoriteCount: 0,
    loginCount: 1,
    cardCount: 0,
    secureNoteCount: 0,
    passkeyCount: 0,
    identityCount: 0,
    selectedCategory: 'all',
    auditReport,
    profileName: 'Hafız',
    copiedField: null,
    score: 64,
    isPasswordRevealed: false,
    isCardNumberRevealed: false,
    isCvvRevealed: false,
    isPinRevealed: false,
    isPasskeyPrivateExponentRevealed: false,
    totpCountdown: 22,
    autoLockDuration: 300,
    onNewItem: vi.fn(),
    onOpenProfile: vi.fn(),
    onLock: vi.fn(),
    onOpenAudit: vi.fn(),
    onOpenGenerator: vi.fn(),
    onSetFavoritesOnly: vi.fn(),
    onSelectCategory: vi.fn(),
    onSelectDashboard: vi.fn(),
    onBackToList: vi.fn(),
    onSelectItem: vi.fn(),
    onSelectAuditItem: vi.fn(),
    onToggleFavorite: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onToggleReveal: vi.fn(),
    onCopyText: vi.fn(),
    onDownloadAttachment: vi.fn(),
    onDatabaseChanged: vi.fn(),
    onAutoLockDurationChange: vi.fn(),
    onNotify: vi.fn(),
    onEmptyTrash: vi.fn(),
    onRestoreTrashItem: vi.fn(),
    onDeleteTrashItemPermanently: vi.fn(),
    ...overrides,
  };

  render(<MainContent {...props} />);
}

afterEach(() => {
  cleanup();
});

describe('MainContent', () => {
  it('renders the vault workspace tab', () => {
    renderMainContent({ activeTab: 'vault' });
    expect(screen.getByText('Vault Workspace Mock')).toBeTruthy();
  });

  it('renders the audit tab', () => {
    renderMainContent({ activeTab: 'audit' });
    expect(screen.getByText('Security Audit Mock')).toBeTruthy();
  });

  it('renders the generator tab', () => {
    renderMainContent({ activeTab: 'generator' });
    expect(screen.getByText('Password Generator Mock')).toBeTruthy();
  });

  it('renders the settings tab', () => {
    renderMainContent({ activeTab: 'settings' });
    expect(screen.getByText('Settings Panel Mock')).toBeTruthy();
  });

  it('renders the donate tab', () => {
    renderMainContent({ activeTab: 'donate' });
    expect(screen.getByText('Donation Panel Mock')).toBeTruthy();
  });

  it('renders the trash tab', () => {
    renderMainContent({ activeTab: 'trash' });
    expect(screen.getByText('Trash Workspace Mock')).toBeTruthy();
  });

  it('handles folder selection and smart folder selection callbacks', () => {
    const onSelectFolder = vi.fn();
    const onSelectSmartFolder = vi.fn();
    const onItemsChange = vi.fn();

    renderMainContent({
      activeTab: 'vault',
      onSelectFolder,
      onSelectSmartFolder,
      onItemsChange,
      folders: [{ id: 'f-1', name: 'Work', parentId: null, color: 'emerald', icon: 'folder', createdAt: '' }],
      smartFolders: [{ id: 'sf-1', name: 'Weak', icon: 'shield', color: 'rose', rules: [{ kind: 'weakPassword' }], builtIn: true, createdAt: '' }],
    });

    expect(screen.getByText('Vault Workspace Mock')).toBeTruthy();

    fireEvent.click(screen.getByTestId('test-open-folder-sidebar'));
    fireEvent.click(screen.getByTestId('test-select-folder'));
    expect(onSelectFolder).toHaveBeenCalledWith('f-1');

    fireEvent.click(screen.getByTestId('test-select-smart-folder'));
    expect(onSelectSmartFolder).toHaveBeenCalledWith('sf-1');

    fireEvent.click(screen.getByTestId('test-apply-bulk'));
  });
});
