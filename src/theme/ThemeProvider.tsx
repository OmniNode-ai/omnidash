import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

type ThemeName = string;

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (name: ThemeName) => void;
  availableThemes: ThemeName[];
  registerTheme: (name: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const BUILTIN_THEMES = ['dark', 'light'] as const;

export function ThemeProvider({ children, defaultTheme = 'dark' }: { children: ReactNode; defaultTheme?: ThemeName }) {
  const [theme, setThemeState] = useState<ThemeName>(defaultTheme);
  const [customThemes, setCustomThemes] = useState<ThemeName[]>([]);

  const setTheme = useCallback((name: ThemeName) => {
    setThemeState(name);
  }, []);

  const registerTheme = useCallback((name: ThemeName) => {
    setCustomThemes((prev) => (prev.includes(name) ? prev : [...prev, name]));
  }, []);

  useEffect(() => {
    const body = document.body;
    // Remove all theme-* classes
    body.className = body.className.replace(/\btheme-\S+/g, '').trim();
    body.classList.add(`theme-${theme}`);
  }, [theme]);

  const availableThemes = [...BUILTIN_THEMES, ...customThemes];

  return (
    <ThemeContext.Provider value={{ theme, setTheme, availableThemes, registerTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
