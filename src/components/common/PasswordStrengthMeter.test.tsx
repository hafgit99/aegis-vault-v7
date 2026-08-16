/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * @vitest-environment jsdom
 */

import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';
import { LanguageProvider } from '../../i18n/LanguageContext';

afterEach(cleanup);

describe('PasswordStrengthMeter', () => {
  it('returns null when password is empty', () => {
    const { container } = render(
      <LanguageProvider>
        <PasswordStrengthMeter password="" />
      </LanguageProvider>,
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders weak score and red indicator for short simple password', () => {
    render(
      <LanguageProvider>
        <PasswordStrengthMeter password="123" />
      </LanguageProvider>,
    );

    expect(screen.getByTestId('password-strength-meter')).toBeTruthy();
    expect(screen.getByTestId('password-strength-bar').className).toContain('bg-red-500');
    expect(screen.getByTestId('password-strength-label').textContent).toBe('ZAYIF');
  });

  it('renders secure score and emerald indicator for high-entropy password', () => {
    render(
      <LanguageProvider>
        <PasswordStrengthMeter password="K9#mX2$vL8@pQ7!zR4^w" />
      </LanguageProvider>,
    );

    expect(screen.getByTestId('password-strength-meter')).toBeTruthy();
    expect(screen.getByTestId('password-strength-bar').className).toContain('bg-emerald-400');
    expect(screen.getByTestId('password-strength-label').textContent).toBe('GÜVENLİ');
  });
});
