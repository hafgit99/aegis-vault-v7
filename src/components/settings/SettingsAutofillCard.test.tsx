/**
 * @vitest-environment jsdom
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsAutofillCard } from './SettingsAutofillCard';

const t = (key: string) => {
  const translations: Record<string, string> = {
    'settings.autofill.title': 'Autofill',
    'settings.autofill.description': 'Android Autofill Integration',
    'settings.autofill.statusLabel': 'Status',
    'settings.autofill.statusActive': 'Active',
    'settings.autofill.statusSetup': 'Not Configured',
    'settings.autofill.safetyNote': 'Secure storage note.',
    'settings.autofill.openSettings': 'Open Settings',
  };
  return translations[key] || key;
};

describe('SettingsAutofillCard', () => {
  it('renders status and handles open settings click when disabled', () => {
    const handleOpen = vi.fn();
    render(
      <SettingsAutofillCard
        autofillEnabled={false}
        autofillMessage={null}
        autofillError={null}
        onOpenAutofillSettings={handleOpen}
        t={t}
      />
    );

    expect(screen.getByText('Status: Not Configured')).toBeTruthy();
    const btn = screen.getByText('Open Settings');
    fireEvent.click(btn);
    expect(handleOpen).toHaveBeenCalled();
  });

  it('renders status when enabled', () => {
    render(
      <SettingsAutofillCard
        autofillEnabled={true}
        autofillMessage={null}
        autofillError={null}
        onOpenAutofillSettings={vi.fn()}
        t={t}
      />
    );

    expect(screen.getByText('Status: Active')).toBeTruthy();
  });

  it('displays message and error banners', () => {
    render(
      <SettingsAutofillCard
        autofillEnabled={false}
        autofillMessage="Success message"
        autofillError="Error message"
        onOpenAutofillSettings={vi.fn()}
        t={t}
      />
    );

    expect(screen.getByText('Success message')).toBeTruthy();
    expect(screen.getByText('Error message')).toBeTruthy();
  });
});
