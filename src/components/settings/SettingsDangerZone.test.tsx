/**
 * @vitest-environment jsdom
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsDangerZone } from './SettingsDangerZone';

const t = (key: string) => {
  const translations: Record<string, string> = {
    'settings.danger.title': 'Extreme Danger Zone',
    'settings.danger.description': 'This will delete everything.',
    'settings.danger.resetAll': 'Reset System',
  };
  return translations[key] || key;
};

describe('SettingsDangerZone', () => {
  it('renders and calls onResetAll on click', () => {
    const handleReset = vi.fn();
    render(<SettingsDangerZone onResetAll={handleReset} t={t} />);

    expect(screen.getByText('Extreme Danger Zone')).toBeTruthy();
    expect(screen.getByText('This will delete everything.')).toBeTruthy();

    const btn = screen.getByText('Reset System');
    fireEvent.click(btn);
    expect(handleReset).toHaveBeenCalled();
  });
});
