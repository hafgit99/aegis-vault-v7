import React, { createContext, useContext, useState, useEffect } from 'react';

export type ThemeMode = 'dark' | 'light';
export type ThemePalette = 'emerald' | 'blue' | 'purple' | 'orange' | 'red';

const THEME_MODE_KEY = 'aegis-theme-mode';
const THEME_PALETTE_KEY = 'aegis-theme-palette';

const VALID_MODES: readonly ThemeMode[] = ['dark', 'light'];
const VALID_PALETTES: readonly ThemePalette[] = ['emerald', 'blue', 'purple', 'orange', 'red'];

interface ThemeContextType {
  themeMode: ThemeMode;
  themePalette: ThemePalette;
  setThemeMode: (mode: ThemeMode) => void;
  setThemePalette: (palette: ThemePalette) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function readStoredMode(): ThemeMode {
  const saved = localStorage.getItem(THEME_MODE_KEY);
  return VALID_MODES.includes(saved as ThemeMode) ? (saved as ThemeMode) : 'dark';
}

function readStoredPalette(): ThemePalette {
  const saved = localStorage.getItem(THEME_PALETTE_KEY);
  return VALID_PALETTES.includes(saved as ThemePalette) ? (saved as ThemePalette) : 'emerald';
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(readStoredMode);
  const [themePalette, setThemePaletteState] = useState<ThemePalette>(readStoredPalette);

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    localStorage.setItem(THEME_MODE_KEY, mode);
  };

  const setThemePalette = (palette: ThemePalette) => {
    setThemePaletteState(palette);
    localStorage.setItem(THEME_PALETTE_KEY, palette);
  };

  useEffect(() => {
    const root = document.documentElement;

    // Remove existing mode and palette classes
    root.classList.remove('light', 'dark');
    root.classList.remove('palette-emerald', 'palette-blue', 'palette-purple', 'palette-orange', 'palette-red');

    root.classList.add(themeMode);
    root.classList.add(`palette-${themePalette}`);
  }, [themeMode, themePalette]);

  return (
    <ThemeContext.Provider value={{ themeMode, themePalette, setThemeMode, setThemePalette }}>
      {children}
    </ThemeContext.Provider>
  );
};

const defaultThemeContext: ThemeContextType = {
  themeMode: 'dark',
  themePalette: 'emerald',
  setThemeMode: () => {},
  setThemePalette: () => {},
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  return context ?? defaultThemeContext;
};