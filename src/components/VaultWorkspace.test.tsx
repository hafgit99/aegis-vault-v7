/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';
import { APP_NAME } from '../lib/branding';
import type { AuditReport, VaultItem } from '../types';
import VaultWorkspace from './VaultWorkspace';
import type { UseBulkSelectionResult } from '../hooks/useOrganisation';

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
const autofillItems = [
  { ...item('unrelated', 'Unrelated'), url: 'https://unrelated.test' },
  { ...item('target', 'Target Login'), url: 'https://login.example.com' },
];

function buttonByText(text: string) {
  const button = screen.getAllByRole('button').find((element) => element.textContent?.includes(text));
  if (!button) {
    throw new Error(`Button not found: ${text}`);
  }
  return button;
}

function bulkSelectionStub(overrides: Partial<UseBulkSelectionResult> = {}): UseBulkSelectionResult {
  return {
    selectedIds: new Set<string>(),
    isSelectionMode: true,
    selectionCount: 0,
    isSelected: () => false,
    toggle: vi.fn(),
    selectOnly: vi.fn(),
    selectAll: vi.fn(),
    clear: vi.fn(),
    selectRange: vi.fn(),
    enterSelectionMode: vi.fn(),
    exitSelectionMode: vi.fn(),
    ...overrides,
  };
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
    filteredItemResults: activeItems.map((item) => ({ item, match: null })),
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
    fireEvent.click(screen.getAllByText('Aegis Mail')[0]!);

    expect(props.onNewItem).toHaveBeenCalledTimes(1);
    expect(props.onSetFavoritesOnly).toHaveBeenCalledWith(true);
    expect(props.onSelectDashboard).toHaveBeenCalledTimes(1);
    expect(props.onSelectItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'mail' }));
  });

  it('renders active favorite filter state and can switch back to all items', () => {
    const props = renderWorkspace({
      filterFavoritesOnly: true,
      filteredItems: [activeItems[0]!],
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
      autofillRequest: {
        requestId: 'request-1',
        createdAt: 123,
        source: 'android-autofill',
        appPackage: 'com.example.app',
        webDomain: 'login.example.com',
        usernameFieldCount: 1,
        passwordFieldCount: 1,
        fillableFieldCount: 2,
      },
      onCancelAutofill: vi.fn(),
    });

    expect(screen.getByTestId('vault-autofill-mode-banner')).toBeTruthy();
    expect(screen.getByText('Autofill Modu')).toBeTruthy();
    expect(screen.getByText((_, element) => element?.textContent === 'Hedef: login.example.com')).toBeTruthy();
    expect(screen.queryByTestId('vault-autofill-diagnostics')).toBeNull();

    fireEvent.click(screen.getByTestId('vault-autofill-cancel-button'));

    expect(props.onCancelAutofill).toHaveBeenCalledTimes(1);
  });

  it('promotes matching Android Autofill login items in the vault list', () => {
    renderWorkspace({
      isAutofillMode: true,
      filteredItems: autofillItems,
      activeItems: autofillItems,
      loginCount: 2,
      autofillRequest: {
        requestId: 'request-1',
        createdAt: 123,
        source: 'android-autofill',
        webDomain: 'login.example.com',
      },
    });

    const rows = screen.getAllByText(/Target Login|Unrelated/);

    expect(rows[0]!.textContent).toContain('Target Login');
    expect(screen.getByText('1 eşleşen kayıt öne çıkarıldı')).toBeTruthy();
    expect(screen.getByTestId('autofill-recommended-badge')).toBeTruthy();
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

  it('renders secure note card view when secure_note category is active', () => {
    const noteItem: VaultItem = {
      id: 'note-1',
      title: 'Server Keys',
      username: '',
      url: 'https://notes.example.com',
      notes: 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQAB...',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      category: 'secure_note',
    };

    renderWorkspace({
      selectedCategory: 'secure_note',
      filteredItems: [noteItem],
      activeItems: [noteItem],
    });

    expect(screen.getByTestId('sticky-note-title')).toBeTruthy();
  });

  it('handles folder sidebar button and secure share trigger', () => {
    const onOpenFolderSidebar = vi.fn();
    const onSecureShare = vi.fn();

    renderWorkspace({
      selectedItem: activeItems[0],
      onOpenFolderSidebar,
      onSecureShare,
    });

    const folderBtn = screen.getByTitle('Kasa Organizasyonu');
    fireEvent.click(folderBtn);
    expect(onOpenFolderSidebar).toHaveBeenCalledTimes(1);
  });

  it('renders bulk selection checkboxes and toggles rows in selection mode', () => {
    const toggle = vi.fn();
    const bulkSelection = bulkSelectionStub({
      selectedIds: new Set(['mail']),
      selectionCount: 1,
      isSelected: (id) => id === 'mail',
      toggle,
    });

    renderWorkspace({ bulkSelection });

    const checkboxes = screen.getAllByTestId('bulk-select-checkbox') as HTMLInputElement[];
    expect(checkboxes.length).toBe(2);
    expect(checkboxes[0]!.checked).toBe(true);
    expect(checkboxes[1]!.checked).toBe(false);

    fireEvent.click(screen.getAllByText('Aegis Bank')[0]!);
    expect(toggle).toHaveBeenCalledWith('bank');
  });

  it('performs shift range selection from the selected anchor item', () => {
    const selectRange = vi.fn();
    const bulkSelection = bulkSelectionStub({
      selectedIds: new Set(['mail']),
      selectionCount: 1,
      isSelected: (id) => id === 'mail',
      selectRange,
    });

    renderWorkspace({ bulkSelection });

    fireEvent.click(screen.getAllByText('Aegis Bank')[0]!, { shiftKey: true });

    expect(selectRange).toHaveBeenCalledWith(['mail', 'bank'], 'mail', 'bank');
  });

  it('falls back to toggling when shift-selecting without an anchor', () => {
    const toggle = vi.fn();
    const selectRange = vi.fn();
    const bulkSelection = bulkSelectionStub({ toggle, selectRange });

    renderWorkspace({ bulkSelection });

    fireEvent.click(screen.getAllByText('Aegis Bank')[0]!, { shiftKey: true });

    expect(selectRange).not.toHaveBeenCalled();
    expect(toggle).toHaveBeenCalledWith('bank');
  });

  it('enters bulk selection via ctrl+click on a row outside selection mode', () => {
    const selectOnly = vi.fn();
    const bulkSelection = bulkSelectionStub({ isSelectionMode: false, selectOnly });

    renderWorkspace({ bulkSelection });

    expect(screen.queryByTestId('bulk-select-checkbox')).toBeNull();

    fireEvent.click(screen.getAllByText('Aegis Mail')[0]!, { ctrlKey: true });

    expect(selectOnly).toHaveBeenCalledWith('mail');
  });

  it('toggles compact density and persists the choice', () => {
    renderWorkspace();

    const toggleButton = screen.getByTestId('vault-density-toggle-button');
    fireEvent.click(toggleButton);
    expect(window.localStorage.getItem('aegis_vault_view_density')).toBe('compact');

    fireEvent.click(toggleButton);
    expect(window.localStorage.getItem('aegis_vault_view_density')).toBe('comfortable');
  });

  it('paginates the vault list through the load-more sentinel', async () => {
    const many = Array.from({ length: 100 }, (_, index) => item(`item-${index}`, `Item ${index}`));
    renderWorkspace({ filteredItems: many, activeItems: many });

    const loadMore = screen.getByTestId('vault-list-load-more');
    expect(loadMore.textContent).toContain('60/100');

    fireEvent.click(loadMore);
    await waitFor(() => {
      expect(screen.getByTestId('vault-list-load-more').textContent).toContain('90/100');
    });

    fireEvent.click(screen.getByTestId('vault-list-load-more'));
    await waitFor(() => {
      expect(screen.queryByTestId('vault-list-load-more')).toBeNull();
    });
  });

  it('selects categories from the chip row', () => {
    const props = renderWorkspace();

    fireEvent.click(screen.getByTestId('category-chip-card'));

    expect(props.onSelectCategory).toHaveBeenCalledWith('card');
  });

  it('moves items onto category chips via drag and drop', () => {
    const onUpdateItemCategory = vi.fn();
    renderWorkspace({ onUpdateItemCategory });

    const chip = screen.getByTestId('category-chip-card');
    fireEvent.dragEnter(chip);
    fireEvent.drop(chip, { dataTransfer: { getData: () => 'mail' } });

    expect(onUpdateItemCategory).toHaveBeenCalledWith('mail', 'card');
  });

  it('ignores drops on the "all" chip', () => {
    const onUpdateItemCategory = vi.fn();
    renderWorkspace({ onUpdateItemCategory });

    const chip = screen.getByTestId('category-chip-all');
    fireEvent.drop(chip, { dataTransfer: { getData: () => 'mail' } });

    expect(onUpdateItemCategory).not.toHaveBeenCalled();
  });

  it('falls back to regular list rows for secure notes in compact density', () => {
    window.localStorage.setItem('aegis_vault_view_density', 'compact');
    const noteItem: VaultItem = {
      id: 'note-1',
      title: 'Server Keys',
      username: '',
      url: 'https://notes.example.com',
      notes: 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQAB...',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      category: 'secure_note',
    };

    renderWorkspace({
      selectedCategory: 'secure_note',
      filteredItems: [noteItem],
      activeItems: [noteItem],
    });

    expect(screen.queryByTestId('sticky-note-title')).toBeNull();
    expect(screen.getAllByText('Server Keys').length).toBeGreaterThan(0);
  });
});
