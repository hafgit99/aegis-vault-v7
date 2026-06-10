/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import CryptoShieldPanel from './CryptoShieldPanel';

afterEach(() => {
  cleanup();
});

describe('CryptoShieldPanel', () => {
  it('renders the local encryption status details', () => {
    render(<CryptoShieldPanel />);

    expect(screen.getByText('Kriptoloji Kalkanı Bilgileri')).toBeTruthy();
    expect(screen.getByText('AES-256-GCM (Yerel)')).toBeTruthy();
    expect(screen.getByText('Zero-Knowledge (Tümleşik)')).toBeTruthy();
    expect(screen.getByText('100.000 İterasyon')).toBeTruthy();
    expect(screen.getByText('Aegis Kalkanı Koruyor')).toBeTruthy();
  });
});
