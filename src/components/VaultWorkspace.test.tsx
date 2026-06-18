/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';
import { APP_NAME } from '../lib/branding';
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

function buttonByText(text: string) {
  const button = screen.getAllByRole('button').find((element) => element.textContent?.includes(text));
  if (!button) {
    throw new Error(`Button not found: ${text}`);
  }
  return button;
}

interface RenderWorkspaceOptions {
  language?: string;
}

function renderWorkspace(
  overrides: Partial<ComponentProps<typeof VaultWorkspace>> = {},
  options: RenderWorkspaceOptions = {},
) {
  if (options.language) {
    window.localStorage.setItem(languageStorageKey, options.language);
  }

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
    onToggleFavorite: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onToggleReveal: vi.fn(),
    onCopyText: vi.fn(),
    onDownloadAttachment: vi.fn(),
    ...overrides,
  };

  render(
    <LanguageProvider>
      <VaultWorkspace {...props} />
    </LanguageProvider>,
  );

  return props;
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('VaultWorkspace', () => {
  it('renders vault list and dashboard overview', () => {
    renderWorkspace();

    expect(screen.getByText('Kişisel Kasa')).toBeTruthy();
    expect(screen.getByText('Aegis Kontrol Paneli')).toBeTruthy();
    expect(screen.getAllByText('Aegis Mail').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Aegis Bank').length).toBeGreaterThan(0);
    expect(screen.getByText('Kasa Paneli')).toBeTruthy();
    expect(screen.getByText(APP_NAME)).toBeTruthy();
    expect(screen.getByTestId('dashboard-lock-button')).toBeTruthy();
    expect(screen.getByTestId('mobile-dashboard-lock-button')).toBeTruthy();
  });

  it('forwards list, filter and dashboard actions', () => {
    const props = renderWorkspace();

    fireEvent.click(screen.getByTestId('new-vault-item-button'));
    fireEvent.click(screen.getByText('Favoriler (1)'));
    fireEvent.click(screen.getByText('Aegis Kontrol Paneli'));
    fireEvent.click(screen.getAllByText('Aegis Mail')[0]);

    expect(props.onNewItem).toHaveBeenCalledTimes(1);
    expect(props.onSetFavoritesOnly).toHaveBeenCalledWith(true);
    expect(props.onSelectDashboard).toHaveBeenCalledTimes(1);
    expect(props.onSelectItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'mail' }));
  });

  it('renders active favorite filter state and can switch back to all items', () => {
    const props = renderWorkspace({
      filterFavoritesOnly: true,
      filteredItems: [activeItems[0]],
    });

    const allButton = buttonByText('Tümü (2)');
    const favoritesButton = buttonByText('Favoriler (1)');

    expect(allButton.className).toContain('text-on-surface-variant');
    expect(favoritesButton.className).toContain('bg-brand-primary/15');
    expect(screen.getByText((_, element) => element?.tagName === 'P' && element?.textContent?.trim().replace(/\s+/g, ' ') === '1 öğe listeleniyor')).toBeTruthy();

    fireEvent.click(allButton);

    expect(props.onSetFavoritesOnly).toHaveBeenCalledWith(false);
  });

  it('renders Android Autofill mode and forwards cancel action', () => {
    const props = renderWorkspace({
      isAutofillMode: true,
      onCancelAutofill: vi.fn(),
    });

    expect(screen.getByTestId('vault-autofill-mode-banner')).toBeTruthy();
    expect(screen.getByText('Autofill Modu')).toBeTruthy();

    fireEvent.click(screen.getByTestId('vault-autofill-cancel-button'));

    expect(props.onCancelAutofill).toHaveBeenCalledTimes(1);
  });

  it('renders the empty filtered-list fallback', () => {
    renderWorkspace({
      filteredItems: [],
      filterFavoritesOnly: true,
    });

    expect(
      screen
        .getAllByText((_, element) => element?.textContent?.includes('Arama sonucu') ?? false)
        .some((element) => element.className.includes('italic')),
    ).toBe(true);
    expect(screen.getByText((_, element) => element?.tagName === 'P' && element?.textContent?.trim().replace(/\s+/g, ' ') === '0 öğe listeleniyor')).toBeTruthy();
  });

  it('renders vault list controls in the selected language', () => {
    renderWorkspace({}, { language: 'zh' });

    expect(screen.getByText('个人保险库')).toBeTruthy();
    expect(screen.getByText('Aegis 控制面板')).toBeTruthy();
    expect(screen.getByText('全部 (2)')).toBeTruthy();
    expect(screen.getByText('收藏 (1)')).toBeTruthy();
    expect(screen.getByText((_, element) => element?.tagName === 'P' && element?.textContent?.trim().replace(/\s+/g, ' ') === '2 项已列出')).toBeTruthy();
    expect(screen.getByTitle('添加新密码')).toBeTruthy();
  });

  it('forwards dashboard header and quick action callbacks', () => {
    const props = renderWorkspace();

    fireEvent.click(screen.getByTestId('mobile-dashboard-lock-button'));
    fireEvent.click(screen.getByTestId('dashboard-lock-button'));
    fireEvent.click(screen.getByText('H'));
    fireEvent.click(buttonByText('Yeni Şifre Ekle'));
    fireEvent.click(buttonByText('Güvenlik Denetle'));
    fireEvent.click(buttonByText('Güçlü Şifre Üret'));

    expect(props.onLock).toHaveBeenCalledTimes(2);
    expect(props.onOpenProfile).toHaveBeenCalledTimes(1);
    expect(props.onNewItem).toHaveBeenCalledTimes(1);
    expect(props.onOpenAudit).toHaveBeenCalledTimes(1);
    expect(props.onOpenGenerator).toHaveBeenCalledTimes(1);
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
