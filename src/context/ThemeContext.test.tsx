/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ThemeProvider, useTheme } from './ThemeContext';

function ThemeProbe() {
  const { themeMode, themePalette, setThemeMode, setThemePalette } = useTheme();

  return (
    <div>
      <span data-testid="mode">{themeMode}</span>
      <span data-testid="palette">{themePalette}</span>
      <button type="button" onClick={() => setThemeMode('light')}>
        Light
      </button>
      <button type="button" onClick={() => setThemePalette('blue')}>
        Blue
      </button>
    </div>
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.className = '';
});

describe('ThemeProvider', () => {
  it('defaults to dark mode with emerald palette', () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('mode').textContent).toBe('dark');
    expect(screen.getByTestId('palette').textContent).toBe('emerald');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('palette-emerald')).toBe(true);
  });

  it('honors the setThemeMode parameter and persists it', () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByText('Light'));

    expect(screen.getByTestId('mode').textContent).toBe('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(window.localStorage.getItem('aegis-theme-mode')).toBe('light');
  });

  it('updates and persists the palette', () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByText('Blue'));

    expect(screen.getByTestId('palette').textContent).toBe('blue');
    expect(document.documentElement.classList.contains('palette-blue')).toBe(true);
    expect(window.localStorage.getItem('aegis-theme-palette')).toBe('blue');
  });

  it('restores persisted mode and palette on mount', () => {
    window.localStorage.setItem('aegis-theme-mode', 'light');
    window.localStorage.setItem('aegis-theme-palette', 'red');

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('mode').textContent).toBe('light');
    expect(screen.getByTestId('palette').textContent).toBe('red');
  });
});