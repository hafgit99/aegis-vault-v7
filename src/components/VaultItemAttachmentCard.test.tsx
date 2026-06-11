/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';
import { VaultItem } from '../types';
import VaultItemAttachmentCard from './VaultItemAttachmentCard';

const baseItem: VaultItem = {
  id: 'item-1',
  title: 'Internal Wiki',
  username: 'team@example.com',
  password: 'secret',
  url: 'https://wiki.example.com',
  createdAt: '2026-06-10T12:00:00.000Z',
  updatedAt: '2026-06-11T12:00:00.000Z',
  category: 'login',
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('VaultItemAttachmentCard', () => {
  it('renders nothing without an attachment id', () => {
    const { container } = render(<VaultItemAttachmentCard item={baseItem} onDownload={vi.fn()} />);

    expect(container.textContent).toBe('');
  });

  it('renders attachment metadata and downloads it', () => {
    const onDownload = vi.fn();

    render(
      <VaultItemAttachmentCard
        item={{
          ...baseItem,
          attachmentId: 'attachment-1',
          attachmentName: 'recovery.pdf',
          attachmentSize: 1536,
        }}
        onDownload={onDownload}
      />,
    );

    expect(screen.getByText('GÜVENLİ ŞİFRELİ KASA ELEMANI')).toBeTruthy();
    expect(screen.getByText('recovery.pdf')).toBeTruthy();
    expect(screen.getByText('1.5 KB')).toBeTruthy();

    fireEvent.click(screen.getByTitle('İndir ve Güvenle Çöz'));
    expect(onDownload).toHaveBeenCalledWith('attachment-1', 'recovery.pdf');
  });

  it('renders a zero-byte fallback when attachment size is missing', () => {
    render(
      <VaultItemAttachmentCard
        item={{
          ...baseItem,
          attachmentId: 'attachment-2',
          attachmentName: 'empty.txt',
        }}
        onDownload={vi.fn()}
      />,
    );

    expect(screen.getByText('empty.txt')).toBeTruthy();
    expect(screen.getByText('0 B')).toBeTruthy();
  });

  it('renders attachment labels in the selected language', () => {
    window.localStorage.setItem(languageStorageKey, 'en');

    render(
      <LanguageProvider>
        <VaultItemAttachmentCard
          item={{
            ...baseItem,
            attachmentId: 'attachment-3',
            attachmentName: 'backup.zip',
            attachmentSize: 2048,
          }}
          onDownload={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(screen.getByText('SECURE ENCRYPTED VAULT ITEM')).toBeTruthy();
    expect(screen.getByText('DECRYPTS ON DOWNLOAD')).toBeTruthy();
    expect(screen.getByTitle('Download and Decrypt Safely')).toBeTruthy();
  });
});
