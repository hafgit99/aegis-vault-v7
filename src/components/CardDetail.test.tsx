/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

    expect(onCopyText).toHaveBeenCalledWith('Ada Lovelace', 'cardholderName');
    expect(onToggleReveal).toHaveBeenCalledWith('cardNumber');
    expect(onCopyText).toHaveBeenCalledWith('4111111111111111', 'cardNumber');
    expect(onCopyText).toHaveBeenCalledWith('12/30', 'cardExpiry');
    expect(onToggleReveal).toHaveBeenCalledWith('cardCvv');
    expect(onCopyText).toHaveBeenCalledWith('123', 'cardCvv');
    expect(onToggleReveal).toHaveBeenCalledWith('cardPin');
  });
});
