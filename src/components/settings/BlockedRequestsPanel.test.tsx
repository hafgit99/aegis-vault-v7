// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BlockedRequestsPanel } from './BlockedRequestsPanel';
import { LanguageProvider } from '../../i18n/LanguageContext';
import {
  logSecurityEvent,
  securityEventCodes,
  clearBlockedNetworkEvents
} from '../../lib/securityEvents';
import React from 'react';

const renderComponent = () => {
  return render(
    <LanguageProvider>
      <BlockedRequestsPanel />
    </LanguageProvider>
  );
};

beforeEach(() => {
  clearBlockedNetworkEvents();
});

afterEach(() => {
  cleanup();
});

describe('BlockedRequestsPanel', () => {
  it('renders empty state when there are no blocked requests', () => {
    renderComponent();
    expect(screen.getByText('Engellenen ağ isteği yok — air-gap politikası aktif.')).toBeTruthy();
  });

  it('renders a list of blocked requests with protocol, time and target details', () => {
    logSecurityEvent(
      securityEventCodes.networkBlocked,
      'Blocked outbound network request by air-gap policy.',
      'critical',
      { url: 'https://leak.example.org/api/steal' }
    );

    renderComponent();

    expect(screen.queryByText('Engellenen ağ isteği yok — air-gap politikası aktif.')).toBeNull();
    expect(screen.getByText(/http\/https/i)).toBeTruthy();
    expect(screen.getByText('https://leak.example.org/api/steal')).toBeTruthy();
    expect(screen.getByText('Geçmişi Temizle')).toBeTruthy();
  });

  it('clears history when clear button is clicked', () => {
    logSecurityEvent(
      securityEventCodes.networkBlocked,
      'Blocked outbound network request by air-gap policy.',
      'critical',
      { url: 'https://leak.example.org/api/steal' }
    );

    renderComponent();

    const clearBtn = screen.getByText('Geçmişi Temizle');
    fireEvent.click(clearBtn);

    expect(screen.getByText('Engellenen ağ isteği yok — air-gap politikası aktif.')).toBeTruthy();
    expect(screen.queryByText('https://leak.example.org/api/steal')).toBeNull();
  });
});
