/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';
import DashboardQuickActions from './DashboardQuickActions';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('DashboardQuickActions', () => {
  it('renders the dashboard shortcuts', () => {
    render(<DashboardQuickActions onNewItem={vi.fn()} onOpenAudit={vi.fn()} onOpenGenerator={vi.fn()} />);

    expect(screen.getByText('HIZLI ERİŞİM VE ARAÇLAR')).toBeTruthy();
    expect(screen.getByText('Yeni Şifre Ekle')).toBeTruthy();
    expect(screen.getByText('Güvenlik Denetle')).toBeTruthy();
    expect(screen.getByText('Güçlü Şifre Üret')).toBeTruthy();
  });

  it('fires shortcut actions', () => {
    const onNewItem = vi.fn();
    const onOpenAudit = vi.fn();
    const onOpenGenerator = vi.fn();

    render(
      <DashboardQuickActions
        onNewItem={onNewItem}
        onOpenAudit={onOpenAudit}
        onOpenGenerator={onOpenGenerator}
      />,
    );

    fireEvent.click(screen.getByText('Yeni Şifre Ekle'));
    fireEvent.click(screen.getByText('Güvenlik Denetle'));
    fireEvent.click(screen.getByText('Güçlü Şifre Üret'));

    expect(onNewItem).toHaveBeenCalledTimes(1);
    expect(onOpenAudit).toHaveBeenCalledTimes(1);
    expect(onOpenGenerator).toHaveBeenCalledTimes(1);
  });

  it('renders shortcuts in the selected language', () => {
    window.localStorage.setItem(languageStorageKey, 'en');

    render(
      <LanguageProvider>
        <DashboardQuickActions onNewItem={vi.fn()} onOpenAudit={vi.fn()} onOpenGenerator={vi.fn()} />
      </LanguageProvider>,
    );

    expect(screen.getByText('QUICK ACCESS AND TOOLS')).toBeTruthy();
    expect(screen.getByText('Add New Password')).toBeTruthy();
    expect(screen.getByText('Run Security Audit')).toBeTruthy();
    expect(screen.getByText('Generate Strong Password')).toBeTruthy();
  });
});
