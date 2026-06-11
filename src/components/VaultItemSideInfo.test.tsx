/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';
import { VaultItem } from '../types';
import VaultItemSideInfo from './VaultItemSideInfo';

const baseItem: VaultItem = {
  id: 'item-1',
  title: 'Internal Wiki',
  username: 'team@example.com',
  password: 'secret',
  url: 'https://wiki.example.com',
  notes: 'Recovery code is stored offline.',
  createdAt: '2026-06-10T12:00:00.000Z',
  updatedAt: '2026-06-11T12:00:00.000Z',
  category: 'login',
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('VaultItemSideInfo', () => {
  it('renders metadata and notes for regular vault items', () => {
    render(<VaultItemSideInfo item={baseItem} />);

    expect(screen.getByText('BİLGİLER VE TARİHÇE')).toBeTruthy();
    expect(screen.getByText('2026-06-10T12:00:00.000Z')).toBeTruthy();
    expect(screen.getByText('2026-06-11T12:00:00.000Z')).toBeTruthy();
    expect(screen.getByText('Giriş Bilgisi')).toBeTruthy();
    expect(screen.getByText('Recovery code is stored offline.')).toBeTruthy();
  });

  it('renders category labels for non-login item types', () => {
    const { rerender } = render(<VaultItemSideInfo item={{ ...baseItem, category: 'card' }} />);
    expect(screen.getByText('Ödeme Kartı')).toBeTruthy();

    rerender(<VaultItemSideInfo item={{ ...baseItem, category: 'passkey' }} />);
    expect(screen.getByText('Passkey / API')).toBeTruthy();

    rerender(<VaultItemSideInfo item={{ ...baseItem, category: 'identity' }} />);
    expect(screen.getByText('Kimlik Belgesi')).toBeTruthy();
  });

  it('hides the extra notes card for secure notes', () => {
    render(<VaultItemSideInfo item={{ ...baseItem, category: 'secure_note' }} />);

    expect(screen.getByText('Güvenli Not')).toBeTruthy();
    expect(screen.queryByText('Özel Notlar')).toBeNull();
  });

  it('renders metadata labels and empty notes in the selected language', () => {
    window.localStorage.setItem(languageStorageKey, 'en');

    render(
      <LanguageProvider>
        <VaultItemSideInfo item={{ ...baseItem, notes: '' }} />
      </LanguageProvider>,
    );

    expect(screen.getByText('INFO AND HISTORY')).toBeTruthy();
    expect(screen.getByText('Created')).toBeTruthy();
    expect(screen.getByText('Last Changed')).toBeTruthy();
    expect(screen.getByText('Vault Category')).toBeTruthy();
    expect(screen.getByText('Login')).toBeTruthy();
    expect(screen.getByText('Private Notes')).toBeTruthy();
    expect(screen.getByText('No private recovery or backup-code note has been added.')).toBeTruthy();
  });
});
