/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * @vitest-environment jsdom
 */

import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RealisticCreditCard, detectCardBrand, maskCardNumberDisplay, formatCardNumberDisplay } from './RealisticCreditCard';
import { LanguageProvider } from '../../i18n/LanguageContext';
import type { VaultItem } from '../../types';

afterEach(cleanup);

const mockCardItem: VaultItem = {
  id: 'card-1',
  category: 'card',
  title: 'Corporate Visa Card',
  username: '',
  url: '',
  cardholderName: 'ALEX R. JENSEN',
  cardNumber: '4532112233445566',
  cardExpiry: '08/28',
  cardCvv: '789',
  cardPin: '1234',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  favorite: false,
};

describe('RealisticCreditCard', () => {
  describe('Card Brand & Format Utilities', () => {
    it('detects brand based on BIN prefix', () => {
      expect(detectCardBrand('4111 2222 3333 4444')).toBe('visa');
      expect(detectCardBrand('5123 4567 8901 2345')).toBe('mastercard');
      expect(detectCardBrand('3782 822463 10005')).toBe('amex');
      expect(detectCardBrand('6011 0000 0000 0000')).toBe('discover');
      expect(detectCardBrand('9792 0000 0000 0000')).toBe('troy');
      expect(detectCardBrand('1234 5678')).toBe('generic');
    });

    it('formats and masks card numbers properly', () => {
      expect(formatCardNumberDisplay('4532112233445566')).toBe('4532 1122 3344 5566');
      expect(maskCardNumberDisplay('4532112233445566')).toBe('•••• •••• •••• 5566');
    });
  });

  describe('Component Rendering & Interactions', () => {
    it('renders the card with EMV chip, holder, expiry and masked number by default', () => {
      render(
        <LanguageProvider>
          <RealisticCreditCard item={mockCardItem} isRevealed={false} />
        </LanguageProvider>,
      );

      expect(screen.getByTestId('realistic-credit-card')).toBeTruthy();
      expect(screen.getByTestId('card-emv-chip')).toBeTruthy();
      expect(screen.getByTestId('realistic-card-holder').textContent).toContain('ALEX R. JENSEN');
      expect(screen.getByTestId('realistic-card-expiry').textContent).toContain('08/28');
      expect(screen.getByTestId('realistic-card-number').textContent).toContain('•••• •••• •••• 5566');
    });

    it('displays unmasked card number when isRevealed is true', () => {
      render(
        <LanguageProvider>
          <RealisticCreditCard item={mockCardItem} isRevealed={true} />
        </LanguageProvider>,
      );

      expect(screen.getByTestId('realistic-card-number').textContent).toContain('4532 1122 3344 5566');
    });

    it('triggers onToggleReveal and onCopy callbacks', () => {
      const onToggleReveal = vi.fn();
      const onCopy = vi.fn();

      render(
        <LanguageProvider>
          <RealisticCreditCard
            item={mockCardItem}
            isRevealed={false}
            onToggleReveal={onToggleReveal}
            onCopy={onCopy}
          />
        </LanguageProvider>,
      );

      const revealBtn = screen.getByTestId('card-reveal-btn');
      fireEvent.click(revealBtn);
      expect(onToggleReveal).toHaveBeenCalledWith('cardNumber');

      const copyBtn = screen.getByTestId('card-copy-number-btn');
      fireEvent.click(copyBtn);
      expect(onCopy).toHaveBeenCalledWith('4532112233445566', 'cardNumber');

      const cvvToggleBtn = screen.getByTestId('card-toggle-cvv-btn');
      fireEvent.click(cvvToggleBtn);
      expect(onToggleReveal).toHaveBeenCalledWith('cardCvv');
    });
  });
});
