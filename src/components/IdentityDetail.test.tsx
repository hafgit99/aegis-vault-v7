/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VaultItem } from '../types';
import IdentityDetail from './IdentityDetail';

const identityItem: VaultItem = {
  id: 'identity-1',
  title: 'Passport',
  username: 'A1234567',
  url: '',
  idFullName: 'Ada Lovelace',
  idBirthDate: '1815-12-10',
  idExpiryDate: '2030-01-01',
  idGender: 'Female',
  createdAt: '2026-06-10T12:00:00.000Z',
  updatedAt: '2026-06-11T12:00:00.000Z',
  category: 'identity',
};

afterEach(() => {
  cleanup();
});

describe('IdentityDetail', () => {
  it('renders nothing for non-identity items', () => {
    const { container } = render(
      <IdentityDetail item={{ ...identityItem, category: 'login' }} copiedField={null} onCopyText={vi.fn()} />,
    );

    expect(container.textContent).toBe('');
  });

  it('renders identity fields', () => {
    render(<IdentityDetail item={identityItem} copiedField={null} onCopyText={vi.fn()} />);

    expect(screen.getByText('BELGEDEKİ TAM AD SOYAD')).toBeTruthy();
    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
    expect(screen.getByText('A1234567')).toBeTruthy();
    expect(screen.getByText('1815-12-10')).toBeTruthy();
    expect(screen.getByText('2030-01-01')).toBeTruthy();
    expect(screen.getByText('Kadın / F')).toBeTruthy();
  });

  it('copies name and document number', () => {
    const onCopyText = vi.fn();

    render(<IdentityDetail item={identityItem} copiedField={null} onCopyText={onCopyText} />);
    fireEvent.click(screen.getAllByRole('button')[0]);
    fireEvent.click(screen.getAllByRole('button')[1]);

    expect(onCopyText).toHaveBeenCalledWith('Ada Lovelace', 'idFullName');
    expect(onCopyText).toHaveBeenCalledWith('A1234567', 'idNumber');
  });

  it('renders copied states for name and document number', () => {
    ['idFullName', 'idNumber'].forEach((copiedField) => {
      const { container, unmount } = render(
        <IdentityDetail
          item={identityItem}
          copiedField={copiedField}
          onCopyText={vi.fn()}
        />,
      );

      expect(container.querySelector('.text-brand-tertiary')).toBeTruthy();
      unmount();
    });
  });

  it('renders the male gender label', () => {
    render(
      <IdentityDetail
        item={{
          ...identityItem,
          idGender: 'Male',
        }}
        copiedField={null}
        onCopyText={vi.fn()}
      />,
    );

    expect(screen.getByText('Erkek / M')).toBeTruthy();
  });

  it('renders fallback values for missing optional identity fields', () => {
    const onCopyText = vi.fn();
    render(
      <IdentityDetail
        item={{
          ...identityItem,
          idFullName: '',
          idBirthDate: '',
          idExpiryDate: '',
          idGender: '',
        }}
        copiedField={null}
        onCopyText={onCopyText}
      />,
    );

    expect(screen.getByText('Girilmedi')).toBeTruthy();
    expect(screen.getAllByText('Belirtilmedi')).toHaveLength(2);
    expect(screen.getByText('Sınırsız / Yok')).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button')[0]);

    expect(onCopyText).toHaveBeenCalledWith('', 'idFullName');
  });
});
