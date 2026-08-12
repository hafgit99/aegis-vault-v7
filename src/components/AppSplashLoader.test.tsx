/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * @vitest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AppSplashLoader } from './AppSplashLoader';
import { LanguageProvider } from '../i18n/LanguageContext';

describe('AppSplashLoader', () => {
  it('renders dark splash screen with brand title and loading indicator', () => {
    render(
      <LanguageProvider>
        <AppSplashLoader />
      </LanguageProvider>
    );

    expect(screen.getByText('Aegis Vault 7')).toBeDefined();
    expect(screen.getByText('Güvenli Kasa Başlatılıyor...')).toBeDefined();
  });
});
