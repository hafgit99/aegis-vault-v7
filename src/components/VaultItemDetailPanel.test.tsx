/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VaultItem } from '../types';
import VaultItemDetailPanel from './VaultItemDetailPanel';

const loginItem: VaultItem = {
  id: 'login-1',
  title: 'Aegis Mail',
  username: 'ada@example.com',
  password: 'CorrectHorseBatteryStaple',
  url: 'https://example.com',
  totpSecret: 'JBSWY3DPEHPK3PXP',
  createdAt: '2026-06-10T12:00:00.000Z',
  updatedAt: '2026-06-11T12:00:00.000Z',
  category: 'login',
};

function renderPanel(overrides: Partial<ComponentProps<typeof VaultItemDetailPanel>> = {}) {
  const props: ComponentProps<typeof VaultItemDetailPanel> = {
    item: loginItem,
    copiedField: null,
    score: 72,
    isPasswordRevealed: false,
    isCardNumberRevealed: false,
    isCvvRevealed: false,
    isPinRevealed: false,
    isPasskeyPrivateExponentRevealed: false,
    totpCountdown: 19,
    onBackToList: vi.fn(),
    onOpenAudit: vi.fn(),
    onToggleFavorite: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onToggleReveal: vi.fn(),
    onCopyText: vi.fn(),
    onDownloadAttachment: vi.fn(),
    ...overrides,
  };

  render(<VaultItemDetailPanel {...props} />);

  return props;
}

afterEach(() => {
  cleanup();
});

describe('VaultItemDetailPanel', () => {
  it('renders selected item details and side information', () => {
    renderPanel();

    expect(screen.getByText('Aegis Mail')).toBeTruthy();
    expect(screen.getByText('ada@example.com')).toBeTruthy();
    expect(screen.getByText('KART DETAYLARI')).toBeTruthy();
    expect(screen.getByText('19 sn kaldı')).toBeTruthy();
  });

  it('forwards navigation and audit actions', () => {
    const props = renderPanel();

    fireEvent.click(screen.getByText('Geri Dön'));
    fireEvent.click(screen.getByText(/Denetle/));

    expect(props.onBackToList).toHaveBeenCalledTimes(1);
    expect(props.onOpenAudit).toHaveBeenCalledTimes(1);
  });

  it('forwards reveal and copy actions from child details', () => {
    const props = renderPanel();

    fireEvent.click(screen.getByTitle('Göster'));
    fireEvent.click(screen.getAllByTitle('Kopyala')[0]);

    expect(props.onToggleReveal).toHaveBeenCalledWith('password');
    expect(props.onCopyText).toHaveBeenCalledWith('ada@example.com', 'username');
  });

  it('renders Autofill approval action for login items', () => {
    const props = renderPanel({
      isAutofillMode: true,
      autofillRequest: {
        requestId: 'request-1',
        createdAt: 123,
        source: 'android-autofill',
        appPackage: 'com.example.app',
      },
      onApproveAutofill: vi.fn(),
    });

    expect(screen.getByTestId('autofill-approval-panel')).toBeTruthy();
    expect(screen.getByText((_, element) => element?.textContent === 'Hedef: com.example.app')).toBeTruthy();

    fireEvent.click(screen.getByTestId('autofill-approve-button'));

    expect(props.onApproveAutofill).toHaveBeenCalledWith(loginItem);
  });

  it('does not render Autofill approval action for non-login items', () => {
    renderPanel({
      item: {
        ...loginItem,
        id: 'note-1',
        category: 'secure_note',
        password: '',
      },
      isAutofillMode: true,
      onApproveAutofill: vi.fn(),
    });

    expect(screen.queryByTestId('autofill-approval-panel')).toBeNull();
  });
});
