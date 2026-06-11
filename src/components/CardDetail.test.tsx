/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';
import { VaultItem } from '../types';
import CardDetail from './CardDetail';

const cardItem: VaultItem = {
  id: 'card-1',
  title: 'Personal Card',
  username: '4111111111111111',
  url: '',
  cardholderName: 'Ada Lovelace',
  cardNumber: '4111111111111111',
  cardExpiry: '12/30',
  cardCvv: '123',
  cardPin: '9876',
  createdAt: '2026-06-10T12:00:00.000Z',
  updatedAt: '2026-06-11T12:00:00.000Z',
  category: 'card',
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('CardDetail', () => {
  it('renders nothing for non-card items', () => {
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

    expect(container.textContent).toBe('');
  });

  it('renders masked card details', () => {
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

    expect(screen.getByText('KART SAHİBİ')).toBeTruthy();
    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
    expect(screen.getByText('•••• •••• •••• 1111')).toBeTruthy();
    expect(screen.getAllByText('***')).toHaveLength(1);
    expect(screen.getAllByText('****')).toHaveLength(1);
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

    expect(screen.getByText('4111 1111 1111 1111')).toBeTruthy();
    expect(screen.getByText('123')).toBeTruthy();
    expect(screen.getByText('9876')).toBeTruthy();
  });

  it('fires copy and reveal actions', () => {
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

    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);
    fireEvent.click(buttons[2]);
    fireEvent.click(buttons[3]);
    fireEvent.click(buttons[4]);
    fireEvent.click(buttons[5]);
    fireEvent.click(buttons[6]);
    fireEvent.click(buttons[7]);

    expect(onCopyText).toHaveBeenCalledWith('Ada Lovelace', 'cardholderName');
    expect(onToggleReveal).toHaveBeenCalledWith('cardNumber');
    expect(onCopyText).toHaveBeenCalledWith('4111111111111111', 'cardNumber');
    expect(onCopyText).toHaveBeenCalledWith('12/30', 'cardExpiry');
    expect(onToggleReveal).toHaveBeenCalledWith('cardCvv');
    expect(onCopyText).toHaveBeenCalledWith('123', 'cardCvv');
    expect(onToggleReveal).toHaveBeenCalledWith('cardPin');
    expect(onCopyText).toHaveBeenCalledWith('9876', 'cardPin');
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

    expect(screen.getByText('Belirtilmemiş')).toBeTruthy();
    expect(screen.getByText('AA/YY')).toBeTruthy();
    expect(screen.getByText('***')).toBeTruthy();
    expect(screen.getByText('****')).toBeTruthy();

    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[2]);
    fireEvent.click(buttons[3]);
    fireEvent.click(buttons[5]);
    fireEvent.click(buttons[7]);

    expect(onCopyText).toHaveBeenCalledWith('', 'cardholderName');
    expect(onCopyText).toHaveBeenCalledWith('', 'cardNumber');
    expect(onCopyText).toHaveBeenCalledWith('', 'cardExpiry');
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
