/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';
import DashboardSecurityScoreCard from './DashboardSecurityScoreCard';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
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

  it('renders security score copy in the selected language', () => {
    window.localStorage.setItem(languageStorageKey, 'zh');

    render(
      <LanguageProvider>
        <DashboardSecurityScoreCard
          activeItemCount={3}
          auditReport={{
            score: 91,
            weakCount: 0,
            reusedCount: 0,
            secureCount: 3,
            totalCount: 3,
          }}
        />
      </LanguageProvider>,
    );

    expect(screen.getByText('虚拟保护评分')).toBeTruthy();
    expect(screen.getByText('您的保险库完全安全')).toBeTruthy();
    expect(screen.getByText('已保存项目')).toBeTruthy();
  });
});
