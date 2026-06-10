/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuditReport, VaultItem } from '../types';
import VaultWorkspace from './VaultWorkspace';

const auditReport: AuditReport = {
  score: 80,
  weakCount: 1,
  reusedCount: 0,
  secureCount: 2,
  totalCount: 3,
};

const item = (id: string, title: string, favorite = false): VaultItem => ({
  id,
  title,
  username: `${id}@example.com`,
  password: `${id}-secret`,
  url: `https://${id}.example.com`,
  favorite,
  createdAt: '2026-06-10T12:00:00.000Z',
  updatedAt: '2026-06-10T12:00:00.000Z',
  category: 'login',
});

const activeItems = [item('mail', 'Aegis Mail', true), item('bank', 'Aegis Bank')];

function renderWorkspace(overrides: Partial<ComponentProps<typeof VaultWorkspace>> = {}) {
  const props: ComponentProps<typeof VaultWorkspace> = {
    selectedItem: null,
    mobileActiveView: 'list',
    filteredItems: activeItems,
    activeItems,
    filterFavoritesOnly: false,
    favoriteCount: 1,
    loginCount: 2,
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
    onNewItem: vi.fn(),
    onOpenProfile: vi.fn(),
    onOpenAudit: vi.fn(),
    onOpenGenerator: vi.fn(),
    onSetFavoritesOnly: vi.fn(),
    onSelectDashboard: vi.fn(),
    onBackToList: vi.fn(),
    onSelectItem: vi.fn(),
    onToggleFavorite: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onToggleReveal: vi.fn(),
    onCopyText: vi.fn(),
    onDownloadAttachment: vi.fn(),
    ...overrides,
  };

  render(<VaultWorkspace {...props} />);

  return props;
}

afterEach(() => {
  cleanup();
});

describe('VaultWorkspace', () => {
  it('renders vault list and dashboard overview', () => {
    renderWorkspace();

    expect(screen.getByText('Kişisel Kasa')).toBeTruthy();
    expect(screen.getByText('Aegis Kontrol Paneli')).toBeTruthy();
    expect(screen.getAllByText('Aegis Mail').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Aegis Bank').length).toBeGreaterThan(0);
    expect(screen.getByText('Kasa Paneli')).toBeTruthy();
    expect(screen.getByText('AegisHub')).toBeTruthy();
  });

  it('forwards list, filter and dashboard actions', () => {
    const props = renderWorkspace();

    fireEvent.click(screen.getByTitle('Yeni Şifre Ekle'));
    fireEvent.click(screen.getByText('Favoriler (1)'));
    fireEvent.click(screen.getByText('Aegis Kontrol Paneli'));
    fireEvent.click(screen.getAllByText('Aegis Mail')[0]);

    expect(props.onNewItem).toHaveBeenCalledTimes(1);
    expect(props.onSetFavoritesOnly).toHaveBeenCalledWith(true);
    expect(props.onSelectDashboard).toHaveBeenCalledTimes(1);
    expect(props.onSelectItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'mail' }));
  });

  it('renders selected item details and forwards mobile back action', () => {
    const props = renderWorkspace({
      selectedItem: activeItems[0],
      mobileActiveView: 'detail',
    });

    expect(screen.getByText('KART DETAYLARI')).toBeTruthy();
    expect(screen.getAllByText('mail@example.com').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText('Geri Dön'));

    expect(props.onBackToList).toHaveBeenCalledTimes(1);
  });
});
