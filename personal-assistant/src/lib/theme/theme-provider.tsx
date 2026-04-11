'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  DEFAULT_THEME_NAME,
  resolveStoredThemeName,
  resolveThemeColor,
  themeToColorMode,
  type ThemeName,
} from '@/lib/theme/defaults';

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME_NAME,
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(DEFAULT_THEME_NAME);
  const [mounted, setMounted] = useState(false);

  const applyThemeToDOM = useCallback((newTheme: ThemeName) => {
    document.documentElement.setAttribute('data-theme', newTheme);
    const colorMode = themeToColorMode(newTheme);
    document.documentElement.className = colorMode;
    document.documentElement.style.colorScheme = colorMode;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', resolveThemeColor(colorMode, newTheme));
    }
  }, []);

  // Re-apply DOM attributes after hydration (hydration may reset them to server defaults)
  useEffect(() => {
    const stored = resolveStoredThemeName(localStorage.getItem('bb-theme'));
    setThemeState(stored);
    applyThemeToDOM(stored);
    setMounted(true);
  }, [applyThemeToDOM]);

  const setTheme = useCallback((newTheme: ThemeName) => {
    setThemeState(newTheme);
    localStorage.setItem('bb-theme', newTheme);
    localStorage.setItem('bitbit-theme', themeToColorMode(newTheme));
    applyThemeToDOM(newTheme);
  }, [applyThemeToDOM]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export { ThemeContext };
export type { ThemeName };
