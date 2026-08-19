/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';
import type { VaultItem } from '../types';
import RecentVaultPanel from './RecentVaultPanel';

const item = (id: string, title: string): VaultItem => ({
  id,
  title,
  username: `${id}@example.com`,
  password: `${id}-secret`,
  url: `https://${id}.example.com`,
  createdAt: '2026-06-10T12:00:00.000Z',
  updatedAt: '2026-06-10T12:00:00.000Z',
  category: 'login',
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('RecentVaultPanel', () => {
  it('renders the empty state', () => {
    render(<RecentVaultPanel items={[]} copiedField={null} onSelect={vi.fn()} onCopyText={vi.fn()} />);

    expect(screen.getByText('Son Eklenen Parolalar')).toBeTruthy();
    expect(screen.getByText('Henüz kayıtlı parola bulunmuyor.')).toBeTruthy();
  });

  it('renders recent panel copy in the selected language', () => {
    window.localStorage.setItem(languageStorageKey, 'en');

    render(
      <LanguageProvider>
        <RecentVaultPanel items={[]} copiedField={null} onSelect={vi.fn()} onCopyText={vi.fn()} />
      </LanguageProvider>,
    );

    expect(screen.getByText('Recently Added Passwords')).toBeTruthy();
    expect(screen.getByText('Quick Access')).toBeTruthy();
    expect(screen.getByText('No saved passwords yet.')).toBeTruthy();
  });

  it('renders the latest three items in newest-first order', () => {
    render(
      <RecentVaultPanel
        items={[item('one', 'One'), item('two', 'Two'), item('three', 'Three'), item('four', 'Four')]}
        copiedField={null}
        onSelect={vi.fn()}
        onCopyText={vi.fn()}
      />,
    );

    expect(screen.queryByText('One')).toBeNull();
    expect(screen.getByText('Four').compareDocumentPosition(screen.getByText('Three'))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByText('Three').compareDocumentPosition(screen.getByText('Two'))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('passes item actions through to recent rows', () => {
    const onSelect = vi.fn();
    const onCopyText = vi.fn();

    render(
      <RecentVaultPanel
        items={[item('one', 'One')]}
        copiedField={null}
        onSelect={onSelect}
        onCopyText={onCopyText}
      />,
    );

    fireEvent.click(screen.getByText('One'));
    fireEvent.click(screen.getByTitle('Şifreyi Kopyala'));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'one' }));
    expect(onCopyText).toHaveBeenCalledWith('one-secret', 'recent-pass-one');
  });
});
