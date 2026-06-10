/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { APP_NAME } from '../lib/branding';
import DashboardHeader from './DashboardHeader';

afterEach(() => {
  cleanup();
});

describe('DashboardHeader', () => {
  it('renders dashboard title and profile identity', () => {
    render(<DashboardHeader profileName="Aegis Kullanıcısı" onOpenProfile={vi.fn()} />);

    expect(screen.getByText('Kasa Paneli')).toBeTruthy();
    expect(screen.getByText(APP_NAME)).toBeTruthy();
    expect(screen.getByText('Aegis Kullanıcısı')).toBeTruthy();
    expect(screen.getByText('A')).toBeTruthy();
  });

  it('opens the profile editor from the avatar button', () => {
    const onOpenProfile = vi.fn();

    render(<DashboardHeader profileName="Hafız" onOpenProfile={onOpenProfile} />);
    fireEvent.click(screen.getByText('H'));

    expect(onOpenProfile).toHaveBeenCalledTimes(1);
  });
});
