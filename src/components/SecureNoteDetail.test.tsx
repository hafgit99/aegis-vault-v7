/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VaultItem } from '../types';
import SecureNoteDetail from './SecureNoteDetail';

const baseItem: VaultItem = {
  id: 'note-1',
  title: 'Recovery Note',
  username: '',
  url: '',
  notes: 'Store this phrase offline.',
  createdAt: '2026-06-10T12:00:00.000Z',
  updatedAt: '2026-06-11T12:00:00.000Z',
  category: 'secure_note',
};

afterEach(() => {
  cleanup();
});

describe('SecureNoteDetail', () => {
  it('renders nothing for non-secure-note items', () => {
    const { container } = render(
      <SecureNoteDetail item={{ ...baseItem, category: 'login' }} copiedField={null} onCopyText={vi.fn()} />,
    );

    expect(container.textContent).toBe('');
  });

  it('renders note content and copies it', () => {
    const onCopyText = vi.fn();

    render(<SecureNoteDetail item={baseItem} copiedField={null} onCopyText={onCopyText} />);

    expect(screen.getByText('GÜVENLİ NOT ENKRİPTED DETAYI')).toBeTruthy();
    expect(screen.getByText('Store this phrase offline.')).toBeTruthy();

    fireEvent.click(screen.getByText('Metni Kopyala'));
    expect(onCopyText).toHaveBeenCalledWith('Store this phrase offline.', 'secure_notes_copy');
  });

  it('renders copied state and empty note fallback', () => {
    const onCopyText = vi.fn();
    render(<SecureNoteDetail item={{ ...baseItem, notes: '' }} copiedField="secure_notes_copy" onCopyText={onCopyText} />);

    expect(screen.getByText('Tümü Kopyalandı!')).toBeTruthy();
    expect(screen.getByText('Herhangi bir içerik yazılmamış.')).toBeTruthy();

    fireEvent.click(screen.getByText('Tümü Kopyalandı!'));

    expect(onCopyText).toHaveBeenCalledWith('', 'secure_notes_copy');
  });
});
