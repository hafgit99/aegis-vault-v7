/**
 * @vitest-environment jsdom
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsLanguageCard } from './SettingsLanguageCard';

afterEach(() => {
  cleanup();
});

describe('SettingsLanguageCard', () => {
  const defaultProps = {
    language: 'tr' as const,
    onLanguageChange: vi.fn(),
    t: (key: string) => key,
  };

  it('renders correctly with labels and options', () => {
    render(<SettingsLanguageCard {...defaultProps} />);

    expect(screen.getByText('settings.language.title')).toBeTruthy();
    expect(screen.getByText('settings.language.description')).toBeTruthy();
    expect(screen.getByText('settings.language.label')).toBeTruthy();

    const select = screen.getByTestId('language-select') as HTMLSelectElement;
    expect(select.value).toBe('tr');

    // options count
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(12);
  });

  it('calls onLanguageChange when option is selected', () => {
    render(<SettingsLanguageCard {...defaultProps} />);

    const select = screen.getByTestId('language-select');
    fireEvent.change(select, { target: { value: 'en' } });

    expect(defaultProps.onLanguageChange).toHaveBeenCalledWith('en');
  });
});
