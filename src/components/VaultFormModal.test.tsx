/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VaultItem } from '../types';
import VaultFormModal from './VaultFormModal';

vi.mock('../lib/attachments', () => ({
  getAttachmentBlob: vi.fn(),
  saveAttachment: vi.fn(),
}));

const editingItem: VaultItem = {
  id: 'item-1',
  title: 'GitHub',
  username: 'hafgit99',
  password: 'secret-password',
  url: 'https://github.com',
  notes: 'Recovery codes are stored offline.',
  createdAt: '2026-06-10',
  updatedAt: '2026-06-10',
  category: 'login',
  favorite: true,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('VaultFormModal', () => {
  it('does not render when closed', () => {
    render(
      <VaultFormModal
        isOpen={false}
        editingItem={null}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.queryByText('Kasaya Güvenli Öge Ekle')).toBeNull();
  });

  it('saves a new login item with trimmed fields', async () => {
    const onClose = vi.fn();
    const onSave = vi.fn();

    render(
      <VaultFormModal
        isOpen={true}
        editingItem={null}
        onClose={onClose}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('örn. GitHub, Chase Bank, Nüfus Cüzdanı'), {
      target: { value: '  GitHub  ' },
    });
    fireEvent.change(screen.getByPlaceholderText('örn. github.com'), {
      target: { value: '  https://github.com  ' },
    });
    fireEvent.change(screen.getByPlaceholderText('örn. blt1.koc@gmail.com'), {
      target: { value: '  hafgit99  ' },
    });
    fireEvent.change(screen.getByPlaceholderText('Şifrenizi belirleyin'), {
      target: { value: 'secret-password' },
    });
    fireEvent.change(screen.getByPlaceholderText('Kurtarma ipuçları, ek bilgiler vb.'), {
      target: { value: '  backup codes  ' },
    });

    fireEvent.click(screen.getByText('Güvenle Kaydet'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '',
          title: 'GitHub',
          username: 'hafgit99',
          password: 'secret-password',
          url: 'https://github.com',
          notes: 'backup codes',
          category: 'login',
          favorite: false,
        }),
      );
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('hydrates existing item fields in edit mode', () => {
    render(
      <VaultFormModal
        isOpen={true}
        editingItem={editingItem}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText('Kasa Ögesini Güncelle')).toBeTruthy();
    expect(screen.getByDisplayValue('GitHub')).toBeTruthy();
    expect(screen.getByDisplayValue('hafgit99')).toBeTruthy();
    expect(screen.getByDisplayValue('secret-password')).toBeTruthy();
    expect(screen.getByDisplayValue('https://github.com')).toBeTruthy();
    expect(screen.getByDisplayValue('Recovery codes are stored offline.')).toBeTruthy();
  });
});
