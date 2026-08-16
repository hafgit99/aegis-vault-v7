/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * @vitest-environment jsdom
 */

import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { TotpCountdownRing } from './TotpCountdownRing';
import { LanguageProvider } from '../../i18n/LanguageContext';

afterEach(cleanup);

describe('TotpCountdownRing', () => {
  it('renders normal countdown ring when secondsLeft > 5', () => {
    render(
      <LanguageProvider>
        <TotpCountdownRing secondsLeft={22} totalDuration={30} />
      </LanguageProvider>,
    );

    const ring = screen.getByTestId('totp-countdown-ring');
    expect(ring).toBeTruthy();
    expect(ring.className).not.toContain('animate-pulse');
    expect(screen.getByTestId('totp-countdown-text').textContent).toContain('22 sn kaldı');

    const circle = screen.getByTestId('totp-ring-circle');
    expect(circle.getAttribute('stroke')).toBe('#00ffb2');
  });

  it('renders urgent red pulsating countdown ring when secondsLeft <= 5', () => {
    render(
      <LanguageProvider>
        <TotpCountdownRing secondsLeft={4} totalDuration={30} />
      </LanguageProvider>,
    );

    const ring = screen.getByTestId('totp-countdown-ring');
    expect(ring).toBeTruthy();
    expect(ring.className).toContain('animate-pulse');
    expect(ring.className).toContain('text-red-400');
    expect(screen.getByTestId('totp-countdown-text').textContent).toContain('4 sn kaldı');

    const circle = screen.getByTestId('totp-ring-circle');
    expect(circle.getAttribute('stroke')).toBe('#ef4444');
  });

  it('clamps negative seconds to 0', () => {
    render(
      <LanguageProvider>
        <TotpCountdownRing secondsLeft={-3} totalDuration={30} />
      </LanguageProvider>,
    );

    expect(screen.getByTestId('totp-countdown-text').textContent).toContain('0 sn kaldı');
  });
});
