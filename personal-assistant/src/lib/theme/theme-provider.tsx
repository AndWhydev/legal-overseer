'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  DEFAULT_THEME_NAME,
  resolveStoredThemeName,
  resolveThemeColor,
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

  // Sync with initial DOM state (set by blocking script in layout)
  useEffect(() => {
    setThemeState(resolveStoredThemeName(localStorage.getItem('bb-theme')));
    setMounted(true);
  }, []);

  const setTheme = useCallback((newTheme: ThemeName) => {
    setThemeState(newTheme);
    localStorage.setItem('bb-theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);

    // Update meta theme-color for mobile browsers
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const mode = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
      meta.setAttribute('content', resolveThemeColor(mode, newTheme));
    }
  }, []);

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
