/**
 * @vitest-environment jsdom
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsDangerZone } from './SettingsDangerZone';

// M10 Dilim 1: translations resolve through useLanguage() — assertions use
// the real default (tr) locale strings.
describe('SettingsDangerZone', () => {
  it('renders and calls onResetAll on click', () => {
    const handleReset = vi.fn();
    render(<SettingsDangerZone onResetAll={handleReset} />);

    expect(screen.getByText('TEHLİKELİ BÖLGE (DANGER ZONE)')).toBeTruthy();
    expect(screen.getByText('Tüm Kasayı Kalıcı Olarak Sıfırla')).toBeTruthy();

    const btn = screen.getByText('Tüm Kasayı Kalıcı Olarak Sıfırla');
    fireEvent.click(btn);
    expect(handleReset).toHaveBeenCalled();
  });
});
