/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PrivacyShieldBackdrop } from './PrivacyShieldBackdrop';
import { LanguageProvider } from '../i18n/LanguageContext';

describe('PrivacyShieldBackdrop', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders nothing when visible is false', () => {
    const { container } = render(
      <LanguageProvider>
        <PrivacyShieldBackdrop visible={false} screenRecordingDetected={false} />
      </LanguageProvider>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders shield active state when visible is true', () => {
    render(
      <LanguageProvider>
        <PrivacyShieldBackdrop visible={true} screenRecordingDetected={false} />
      </LanguageProvider>,
    );
    expect(screen.getByText('Aegis Vault')).toBeDefined();
    expect(screen.getByText('Secure display shield active')).toBeDefined();
  });

  it('renders screen capture warning when screen recording is detected', () => {
    render(
      <LanguageProvider>
        <PrivacyShieldBackdrop visible={true} screenRecordingDetected={true} />
      </LanguageProvider>,
    );
    expect(screen.getByText('Aegis Vault')).toBeDefined();
  });
});
