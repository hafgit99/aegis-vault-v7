/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { APP_NAME } from '../lib/branding';
import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';
import DashboardHeader from './DashboardHeader';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('DashboardHeader', () => {
  it('renders dashboard title and profile identity', () => {
    render(<DashboardHeader profileName="Aegis User" onOpenProfile={vi.fn()} onLock={vi.fn()} />);

    expect(screen.getByText('Kasa Paneli')).toBeTruthy();
    expect(screen.getByText(APP_NAME)).toBeTruthy();
    expect(screen.getByText('Aegis User')).toBeTruthy();
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByTestId('dashboard-lock-button')).toBeTruthy();
  });

  it('opens the profile editor from the avatar button', () => {
    const onOpenProfile = vi.fn();

    render(<DashboardHeader profileName="Hafiz" onOpenProfile={onOpenProfile} onLock={vi.fn()} />);
    fireEvent.click(screen.getByText('H'));

    expect(onOpenProfile).toHaveBeenCalledTimes(1);
  });

  it('locks the vault from the dashboard header action', () => {
    const onLock = vi.fn();

    render(<DashboardHeader profileName="Hafiz" onOpenProfile={vi.fn()} onLock={onLock} />);
    fireEvent.click(screen.getByTestId('dashboard-lock-button'));

    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it('renders translated dashboard copy from the selected language', () => {
    window.localStorage.setItem(languageStorageKey, 'zh');

    render(
      <LanguageProvider>
        <DashboardHeader profileName="Aegis User" onOpenProfile={vi.fn()} onLock={vi.fn()} />
      </LanguageProvider>,
    );

    expect(screen.getByText('保险库仪表板')).toBeTruthy();
    expect(screen.getByText('自动锁定保护')).toBeTruthy();
  });
});
