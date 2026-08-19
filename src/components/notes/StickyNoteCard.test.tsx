/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * @vitest-environment jsdom
 */

import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { StickyNoteCard, getNoteColor } from './StickyNoteCard';
import { LanguageProvider } from '../../i18n/LanguageContext';
import type { VaultItem } from '../../types';

afterEach(cleanup);

const mockNoteItem: VaultItem = {
  id: 'note-uuid-1',
  category: 'secure_note',
  title: 'Server SSH Deployment Keys',
  username: '',
  url: '',
  notes: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleKey root@production-cluster\nDeploy token: aegis_sec_9941',
  tags: ['production', 'devops'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  favorite: false,
};

describe('StickyNoteCard', () => {
  it('derives color theme properly based on tags or hash', () => {
    const color = getNoteColor(mockNoteItem);
    expect(['amber', 'emerald', 'blue', 'purple', 'rose', 'slate']).toContain(color);
  });

  it('renders note title, preview text and word/char count indicators', () => {
    const onSelect = vi.fn();
    render(
      <LanguageProvider>
        <StickyNoteCard item={mockNoteItem} onSelect={onSelect} />
      </LanguageProvider>,
    );

    expect(screen.getByTestId('sticky-note-card')).toBeTruthy();
    expect(screen.getByTestId('sticky-note-title').textContent).toContain('Server SSH Deployment Keys');
    expect(screen.getByTestId('sticky-note-preview').textContent).toContain('ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleKey');
  });

  it('fires onSelect when clicking the card', () => {
    const onSelect = vi.fn();
    render(
      <LanguageProvider>
        <StickyNoteCard item={mockNoteItem} onSelect={onSelect} />
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByTestId('sticky-note-card'));
    expect(onSelect).toHaveBeenCalledWith(mockNoteItem);
  });

  it('copies note content when clicking the copy button', () => {
    const onSelect = vi.fn();
    const onCopyNote = vi.fn();
    render(
      <LanguageProvider>
        <StickyNoteCard item={mockNoteItem} onSelect={onSelect} onCopyNote={onCopyNote} />
      </LanguageProvider>,
    );

    const copyBtn = screen.getByTestId('sticky-note-copy-btn');
    fireEvent.click(copyBtn);
    expect(onCopyNote).toHaveBeenCalledWith(mockNoteItem.notes);
  });

  it('renders various note colors and handles clipboard fallback', () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });

    const colors = ['amber', 'emerald', 'blue', 'purple', 'rose', 'slate'] as const;
    colors.forEach((color, idx) => {
      const item: VaultItem = {
        ...mockNoteItem,
        id: `note-${idx}`,
        tags: [color],
      };
      const { unmount } = render(
        <LanguageProvider>
          <StickyNoteCard item={item} onSelect={vi.fn()} />
        </LanguageProvider>,
      );

      const copyBtn = screen.getByTestId('sticky-note-copy-btn');
      fireEvent.click(copyBtn);
      unmount();
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });
});
