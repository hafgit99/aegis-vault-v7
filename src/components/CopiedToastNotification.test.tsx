/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CopiedToastNotification } from './CopiedToastNotification';
import { LanguageProvider } from '../i18n/LanguageContext';

describe('CopiedToastNotification', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders nothing when copiedField is null', () => {
    const { container } = render(
      <LanguageProvider>
        <CopiedToastNotification copiedField={null} />
      </LanguageProvider>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders notification when copiedField is provided', () => {
    render(
      <LanguageProvider>
        <CopiedToastNotification copiedField="password" />
      </LanguageProvider>,
    );
    expect(screen.getByTestId('copy-toast-notification')).toBeDefined();
  });
});
