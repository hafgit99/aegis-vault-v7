/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { APP_SECURITY_BRAND } from '../lib/branding';
import AegisGuardReport from './AegisGuardReport';

afterEach(() => {
  cleanup();
});

describe('AegisGuardReport', () => {
  it('renders the secure report when the audit score is high', () => {
    render(
      <AegisGuardReport
        auditReport={{
          score: 95,
          weakCount: 0,
          reusedCount: 0,
          secureCount: 8,
          totalCount: 8,
        }}
      />,
    );

    expect(screen.getByText(`${APP_SECURITY_BRAND} Güvenlik Raporu`)).toBeTruthy();
    expect(screen.getByText(/Hiçbir riskli nokta tespit edilemedi/)).toBeTruthy();
  });

  it('renders the risky report with weak and reused counts', () => {
    render(
      <AegisGuardReport
        auditReport={{
          score: 42,
          weakCount: 3,
          reusedCount: 2,
          secureCount: 1,
          totalCount: 6,
        }}
      />,
    );

    expect(screen.getByText(/3 adet zayıf/)).toBeTruthy();
    expect(screen.getByText(/2 adet çift kullanılmış/)).toBeTruthy();
  });
});
