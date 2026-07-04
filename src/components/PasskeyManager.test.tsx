// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

import { PasskeyManager } from './PasskeyManager';
import { LanguageProvider } from '../i18n/LanguageContext';
import { openVaultSession, closeVaultSession } from '../lib/vaultSession';
import type { PasskeyRecord } from '../lib/passkey';

const SAMPLE_RECORD: PasskeyRecord = {
  itemId: 'item-1',
  credentialId: 'YWJjZGVmZ2hpamtsbW5vcA',
  publicKey: '04abcdef',
  privateKeyBundle: { iv: '00', tag: '00', ciphertext: 'AA' },
  rpId: 'example.com',
  rpName: 'Example',
  userName: 'alice@example.com',
  userHandle: 'dXNlcmhhbmRsZQ',
  signCount: 0,
  algorithm: 'ES256',
  createdAt: new Date('2026-01-01T00:00:00Z').toISOString(),
  transports: ['usb', 'nfc'],
  attachment: 'platform',
};

const renderComponent = (records: PasskeyRecord[] = []) => {
  return render(
    <LanguageProvider>
      <PasskeyManager records={records} t={(key) => key as string} />
    </LanguageProvider>
  );
};

beforeEach(() => {
  openVaultSession('aegis-test-master', 'aegis-test-master', new Uint8Array(32).fill(5));

  // jsdom does not expose PublicKeyCredential by default.
  Object.defineProperty(globalThis, 'PublicKeyCredential', {
    configurable: true,
    value: function PublicKeyCredential() {},
  });
  Object.defineProperty(navigator, 'credentials', {
    configurable: true,
    value: { create: vi.fn(), get: vi.fn() },
  });
  (PublicKeyCredential as unknown as { isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean> })
    .isUserVerifyingPlatformAuthenticatorAvailable = vi.fn(async () => true);
});

afterEach(() => {
  closeVaultSession();
  delete (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential;
  delete (navigator as { credentials?: unknown }).credentials;
  cleanup();
});

describe('PasskeyManager', () => {
  it('renders the localized title and description', () => {
    renderComponent();
    expect(screen.getByText('passkey.tab.title')).toBeTruthy();
    expect(screen.getByText('passkey.tab.description')).toBeTruthy();
  });

  it('shows the unavailable state while the capability probe is in flight', () => {
    renderComponent();
    expect(screen.getByText('passkey.status.unavailable')).toBeTruthy();
  });

  it('shows the unsupported state when no PublicKeyCredential is available', async () => {
    delete (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential;
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('passkey.status.unsupported')).toBeTruthy();
    });
  });

  it('shows the platform authenticator ready state when UVPA is available', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('passkey.status.platform')).toBeTruthy();
    });
  });

  it('renders the empty state when no records are passed', () => {
    renderComponent();
    expect(screen.getByText('passkey.list.empty')).toBeTruthy();
  });

  it('renders each registered passkey with its Relying Party metadata', () => {
    renderComponent([SAMPLE_RECORD]);
    expect(screen.getByTestId('passkey-record')).toBeTruthy();
    expect(screen.getByText('Example')).toBeTruthy();
    expect(screen.getByText('example.com · alice@example.com')).toBeTruthy();
    expect(screen.getByText('ES256')).toBeTruthy();
    expect(screen.getByText('passkey.list.signCount: 0')).toBeTruthy();
  });

  it('exposes the credential id on each record for testing harnesses', () => {
    renderComponent([SAMPLE_RECORD]);
    const record = screen.getByTestId('passkey-record');
    expect(record.getAttribute('data-credential-id')).toBe(SAMPLE_RECORD.credentialId);
  });

  it('renders an external status message when statusKey is provided', () => {
    render(
      <LanguageProvider>
        <PasskeyManager
          records={[]}
          statusKey="passkey.create.success"
          statusKind="success"
          t={(key) => key as string}
        />
      </LanguageProvider>
    );
    expect(screen.getByText('passkey.create.success')).toBeTruthy();
    const status = screen.getByRole('status');
    expect(status).toBeTruthy();
  });

  it('uses the alert role for error status messages', () => {
    render(
      <LanguageProvider>
        <PasskeyManager
          records={[]}
          statusKey="passkey.create.failed"
          statusKind="error"
          t={(key) => key as string}
        />
      </LanguageProvider>
    );
    expect(screen.getByText('passkey.create.failed')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});
