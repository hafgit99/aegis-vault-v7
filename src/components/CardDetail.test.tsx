/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * @vitest-environment jsdom
 */

import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CardDetail from './CardDetail';
import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';
import type { VaultItem } from '../types';

const cardItem: VaultItem = {
  id: 'card-1',
  category: 'card',
  title: 'My Visa Card',
  username: '',
  url: '',
  cardholderName: 'Ada Lovelace',
  cardNumber: '4111111111111111',
  cardExpiry: '12/30',
  cardCvv: '123',
  cardPin: '9876',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  favorite: false,
};

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('CardDetail', () => {
  it('returns null if item category is not card', () => {
    const { container } = render(
      <CardDetail
        item={{ ...cardItem, category: 'login' }}
        copiedField={null}
        isCardNumberRevealed={false}
        isCvvRevealed={false}
        isPinRevealed={false}
        onToggleReveal={vi.fn()}
        onCopyText={vi.fn()}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders card fields masked by default', () => {
    render(
      <CardDetail
        item={cardItem}
        copiedField={null}
        isCardNumberRevealed={false}
        isCvvRevealed={false}
        isPinRevealed={false}
        onToggleReveal={vi.fn()}
        onCopyText={vi.fn()}
      />,
    );

    expect(screen.getByTestId('card-cardholder-value').textContent).toContain('Ada Lovelace');
    expect(screen.getByTestId('card-number-value').textContent).toContain('•••• •••• •••• 1111');
    expect(screen.getByTestId('card-cvv-value').textContent).toBe('***');
    expect(screen.getByTestId('card-pin-value').textContent).toBe('****');
  });

  it('reveals card number, cvv and pin', () => {
    render(
      <CardDetail
        item={cardItem}
        copiedField={null}
        isCardNumberRevealed={true}
        isCvvRevealed={true}
        isPinRevealed={true}
        onToggleReveal={vi.fn()}
        onCopyText={vi.fn()}
      />,
    );

    expect(screen.getByTestId('card-number-value').textContent).toContain('4111 1111 1111 1111');
    expect(screen.getByTestId('card-cvv-value').textContent).toBe('123');
    expect(screen.getByTestId('card-pin-value').textContent).toBe('9876');
  });

  it('fires copy and reveal actions from panel buttons', () => {
    const onToggleReveal = vi.fn();
    const onCopyText = vi.fn();

    render(
      <CardDetail
        item={cardItem}
        copiedField={null}
        isCardNumberRevealed={false}
        isCvvRevealed={false}
        isPinRevealed={false}
        onToggleReveal={onToggleReveal}
        onCopyText={onCopyText}
      />,
    );

    fireEvent.click(screen.getByTestId('card-number-reveal-button'));
    expect(onToggleReveal).toHaveBeenCalledWith('cardNumber');

    fireEvent.click(screen.getByTestId('card-number-copy-button'));
    expect(onCopyText).toHaveBeenCalledWith('4111111111111111', 'cardNumber');

    fireEvent.click(screen.getByTestId('card-cvv-reveal-button'));
    expect(onToggleReveal).toHaveBeenCalledWith('cardCvv');

    fireEvent.click(screen.getByTestId('card-cvv-copy-button'));
    expect(onCopyText).toHaveBeenCalledWith('123', 'cardCvv');

    fireEvent.click(screen.getByTestId('card-pin-reveal-button'));
    expect(onToggleReveal).toHaveBeenCalledWith('cardPin');

    fireEvent.click(screen.getByTestId('card-pin-copy-button'));
    expect(onCopyText).toHaveBeenCalledWith('9876', 'cardPin');

    // Copy cardholder
    fireEvent.click(screen.getByTestId('card-cardholder-copy-button'));
    expect(onCopyText).toHaveBeenCalledWith('Ada Lovelace', 'cardholderName');

    // Copy expiry
    fireEvent.click(screen.getByTestId('card-expiry-copy-button'));
    expect(onCopyText).toHaveBeenCalledWith('12/30', 'cardExpiry');
  });

  it('renders copied states for each copyable card field', () => {
    const copiedFields = [
      'cardholderName',
      'cardNumber',
      'cardExpiry',
      'cardCvv',
      'cardPin',
    ];

    copiedFields.forEach((copiedField) => {
      const { container, unmount } = render(
        <CardDetail
          item={cardItem}
          copiedField={copiedField}
          isCardNumberRevealed={false}
          isCvvRevealed={false}
          isPinRevealed={false}
          onToggleReveal={vi.fn()}
          onCopyText={vi.fn()}
        />,
      );

      if (copiedField === 'cardholderName' || copiedField === 'cardNumber') {
        expect(container.querySelector('.text-brand-tertiary')).toBeTruthy();
      } else {
        expect(container.textContent).toContain('✓');
      }
      unmount();
    });
  });

  it('uses fallback values and copies empty strings when card fields are missing', () => {
    const onCopyText = vi.fn();
    const fallbackItem: VaultItem = {
      ...cardItem,
      cardholderName: undefined,
      cardNumber: undefined,
      cardExpiry: undefined,
      cardCvv: undefined,
      cardPin: undefined,
    };

    render(
      <CardDetail
        item={fallbackItem}
        copiedField={null}
        isCardNumberRevealed={true}
        isCvvRevealed={true}
        isPinRevealed={true}
        onToggleReveal={vi.fn()}
        onCopyText={onCopyText}
      />,
    );

    expect(screen.getByTestId('card-cardholder-value').textContent).toContain('Belirtilmemiş');
    expect(screen.getByTestId('card-expiry-value').textContent).toBe('AA/YY');
    expect(screen.getByTestId('card-cvv-value').textContent).toBe('***');
    expect(screen.getByTestId('card-pin-value').textContent).toBe('****');

    fireEvent.click(screen.getByTestId('card-number-copy-button'));
    fireEvent.click(screen.getByTestId('card-cvv-copy-button'));
    fireEvent.click(screen.getByTestId('card-pin-copy-button'));

    expect(onCopyText).toHaveBeenCalledWith('', 'cardNumber');
    expect(onCopyText).toHaveBeenCalledWith('', 'cardCvv');
    expect(onCopyText).toHaveBeenCalledWith('', 'cardPin');
  });

  it('renders card detail labels and controls in the selected language', () => {
    window.localStorage.setItem(languageStorageKey, 'en');

    render(
      <LanguageProvider>
        <CardDetail
          item={{
            ...cardItem,
            cardholderName: undefined,
            cardNumber: undefined,
            cardExpiry: undefined,
          }}
          copiedField={null}
          isCardNumberRevealed={true}
          isCvvRevealed={false}
          isPinRevealed={false}
          onToggleReveal={vi.fn()}
          onCopyText={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(screen.getByText('CARDHOLDER')).toBeTruthy();
    expect(screen.getByText('CARD NUMBER')).toBeTruthy();
    expect(screen.getByText('EXPIRY')).toBeTruthy();
    expect(screen.getByText('SECURITY CODE (CVV)')).toBeTruthy();
    expect(screen.getByText('ATM / BANK PIN')).toBeTruthy();
    expect(screen.getByText('Not specified')).toBeTruthy();
    expect(screen.getByText('MM/YY')).toBeTruthy();
    expect(screen.getAllByTitle('Copy').length).toBeGreaterThan(0);
    expect(screen.getAllByTitle('Show').length).toBeGreaterThan(0);
  });
});
