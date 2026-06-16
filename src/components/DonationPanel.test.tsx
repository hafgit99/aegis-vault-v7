/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../i18n/LanguageContext';
import DonationPanel from './DonationPanel';

function renderDonationPanel(copiedField: string | null = null, onCopyText = vi.fn()) {
  render(
    <LanguageProvider>
      <DonationPanel copiedField={copiedField} onCopyText={onCopyText} />
    </LanguageProvider>,
  );
  return onCopyText;
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('DonationPanel', () => {
  it('renders crypto donation addresses', () => {
    renderDonationPanel();

    expect(screen.getByText('Aegis Vault 7 Bağışları')).toBeTruthy();
    expect(screen.getAllByText('BTC')).toHaveLength(2);
    expect(screen.getByText('Ethereum / ERC-20')).toBeTruthy();
    expect(screen.getByText('bc1qqsuljwzs32ckkqdrsdus7wgqzuetty3g0x47l7')).toBeTruthy();
    expect(screen.getByText('TQBz3q8Ddjap3K8QdFQHtJKBxbvXMCi62E')).toBeTruthy();
  });

  it('copies the selected wallet address', () => {
    const onCopyText = renderDonationPanel();

    fireEvent.click(screen.getAllByText('Adresi Kopyala')[0]);

    expect(onCopyText).toHaveBeenCalledWith(
      'bc1qqsuljwzs32ckkqdrsdus7wgqzuetty3g0x47l7',
      'donation-btc',
    );
  });

  it('shows copied state for the active wallet', () => {
    renderDonationPanel('donation-btc');

    expect(screen.getByText('Kopyalandı')).toBeTruthy();
  });
});
