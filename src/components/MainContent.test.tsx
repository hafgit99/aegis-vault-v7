/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuditReport, VaultItem } from '../types';
import MainContent from './MainContent';

vi.mock('./VaultWorkspace', () => ({
  default: () => <div>Vault Workspace Mock</div>,
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
    activeItems: [item('mail')],
    trashItems: [item('trash')],
    filterFavoritesOnly: false,
    favoriteCount: 0,
    loginCount: 1,
    cardCount: 0,
    secureNoteCount: 0,
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
    onOpenAudit: vi.fn(),
    onOpenGenerator: vi.fn(),
    onSetFavoritesOnly: vi.fn(),
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

  it('renders the trash tab', () => {
    renderMainContent({ activeTab: 'trash' });
    expect(screen.getByText('Trash Workspace Mock')).toBeTruthy();
  });
});
