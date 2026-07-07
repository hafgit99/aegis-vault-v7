import React, { createContext, useContext, useState, useEffect } from 'react';

export type ThemeMode = 'dark' | 'light';
export type ThemePalette = 'emerald' | 'blue' | 'purple' | 'orange' | 'red';

interface ThemeContextType {
  themeMode: ThemeMode;
  themePalette: ThemePalette;
  setThemeMode: (mode: ThemeMode) => void;
  setThemePalette: (palette: ThemePalette) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('aegis-theme-mode');
    return (saved === 'light' || saved === 'dark') ? saved : 'dark';
  });

  const [themePalette, setThemePaletteState] = useState<ThemePalette>(() => {
    const saved = localStorage.getItem('aegis-theme-palette');
    const valid: ThemePalette[] = ['emerald', 'blue', 'purple', 'orange', 'red'];
    return valid.includes(saved as ThemePalette) ? (saved as ThemePalette) : 'emerald';
  });

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    localStorage.setItem('aegis-theme-mode', mode);
  };

  const setThemePalette = (palette: ThemePalette) => {
    setThemePaletteState(palette);
    localStorage.setItem('aegis-theme-palette', palette);
  };

  useEffect(() => {
    const root = document.documentElement;
    
    // Remove existing classes
    root.classList.remove('light', 'dark');
    root.classList.remove(
      'palette-emerald',
      'palette-blue',
      'palette-purple',
      'palette-orange',
      'palette-red'
    );

    // Add current classes
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
