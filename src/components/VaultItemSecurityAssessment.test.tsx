/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';
import VaultItemSecurityAssessment from './VaultItemSecurityAssessment';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('VaultItemSecurityAssessment', () => {
  it('renders the strong password assessment', () => {
    render(<VaultItemSecurityAssessment score={91} onOpenAudit={vi.fn()} />);

    expect(screen.getByText('Güvenlik Değerlendirmesi')).toBeTruthy();
    expect(screen.getByText('%91')).toBeTruthy();
    expect(screen.getByText(/Muazzam güç/)).toBeTruthy();
  });

  it('renders the medium password assessment', () => {
    render(<VaultItemSecurityAssessment score={62} onOpenAudit={vi.fn()} />);

    expect(screen.getByText('%62')).toBeTruthy();
    expect(screen.getByText(/Güçlü yapıda/)).toBeTruthy();
  });

  it('renders the critical password assessment', () => {
    render(<VaultItemSecurityAssessment score={20} onOpenAudit={vi.fn()} />);

    expect(screen.getByText('%20')).toBeTruthy();
    expect(screen.getByText(/Kritik derecede zayıf/)).toBeTruthy();
  });

  it('opens the full audit view', () => {
    const onOpenAudit = vi.fn();

    render(<VaultItemSecurityAssessment score={44} onOpenAudit={onOpenAudit} />);
    fireEvent.click(screen.getByText('Tümünü Denetle'));

    expect(onOpenAudit).toHaveBeenCalledTimes(1);
  });

  it('renders assessment copy in the selected language', () => {
    window.localStorage.setItem(languageStorageKey, 'zh');

    render(
      <LanguageProvider>
        <VaultItemSecurityAssessment score={91} onOpenAudit={vi.fn()} />
      </LanguageProvider>,
    );

    expect(screen.getByText('安全评估')).toBeTruthy();
    expect(screen.getByText(/强度极佳/)).toBeTruthy();
    expect(screen.getByText('全部审计')).toBeTruthy();
  });
});
