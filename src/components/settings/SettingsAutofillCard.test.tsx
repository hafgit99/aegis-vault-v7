/**
 * @vitest-environment jsdom
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsAutofillCard } from './SettingsAutofillCard';

// M10 Dilim 1: the component resolves translations through useLanguage() —
// these tests assert against the real default (tr) locale strings.
describe('SettingsAutofillCard', () => {
  it('renders status and handles open settings click when disabled', () => {
    const handleOpen = vi.fn();
    render(
      <SettingsAutofillCard
        autofillEnabled={false}
        autofillMessage={null}
        autofillError={null}
        onOpenAutofillSettings={handleOpen}
      />
    );

    expect(screen.getByText('Durum: Kurulum bekliyor')).toBeTruthy();
    const btn = screen.getByText('Android Autofill Ayarlarını Aç');
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
      />
    );

    expect(screen.getByText('Durum: Sistem tarafından etkin')).toBeTruthy();
  });

  it('displays message and error banners', () => {
    render(
      <SettingsAutofillCard
        autofillEnabled={false}
        autofillMessage="Success message"
        autofillError="Error message"
        onOpenAutofillSettings={vi.fn()}
      />
    );

    expect(screen.getByText('Success message')).toBeTruthy();
    expect(screen.getByText('Error message')).toBeTruthy();
  });
});
