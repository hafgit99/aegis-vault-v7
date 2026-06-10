/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import DashboardSecurityScoreCard from './DashboardSecurityScoreCard';

afterEach(() => {
  cleanup();
});

describe('DashboardSecurityScoreCard', () => {
  it('renders the strong vault state and counters', () => {
    render(
      <DashboardSecurityScoreCard
        activeItemCount={9}
        auditReport={{
          score: 92,
          weakCount: 0,
          reusedCount: 0,
          secureCount: 9,
          totalCount: 9,
        }}
      />,
    );

    expect(screen.getByText('Sanal Koruma Skoru')).toBeTruthy();
    expect(screen.getByText('%92')).toBeTruthy();
    expect(screen.getByText('Kasanız Tamamen Güvende')).toBeTruthy();
    expect(screen.getByText('9')).toBeTruthy();
  });

  it('renders the medium vault state', () => {
    render(
      <DashboardSecurityScoreCard
        activeItemCount={5}
        auditReport={{
          score: 64,
          weakCount: 1,
          reusedCount: 0,
          secureCount: 4,
          totalCount: 5,
        }}
      />,
    );

    expect(screen.getByText('Orta Düzey Güvenlik Seviyesi')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('renders the critical vault state and reused count', () => {
    render(
      <DashboardSecurityScoreCard
        activeItemCount={4}
        auditReport={{
          score: 24,
          weakCount: 2,
          reusedCount: 3,
          secureCount: 1,
          totalCount: 4,
        }}
      />,
    );

    expect(screen.getByText('Kritik Parola Güvenliği Açığı!')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });
});
