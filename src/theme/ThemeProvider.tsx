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

export function ThemeProvider({ children, defaultTheme = 'dark', persistPreference = false }: { children: ReactNode; defaultTheme?: ThemeName; persistPreference?: boolean }) {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    if (persistPreference) {
      try {
        const saved = localStorage.getItem('omnidash.theme.v1');
        if (saved === 'light' || saved === 'dark') return saved;
      } catch { /* A denied browser storage permission must not prevent rendering. */ }
    }
    return defaultTheme;
  });
  const [customThemes, setCustomThemes] = useState<ThemeName[]>([]);

  const setTheme = useCallback((name: ThemeName) => {
    setThemeState(name);
    if (persistPreference && (name === 'light' || name === 'dark')) {
      try { localStorage.setItem('omnidash.theme.v1', name); } catch { /* Keep the session toggle usable. */ }
    }
  }, [persistPreference]);

  const registerTheme = useCallback((name: ThemeName) => {
    setCustomThemes((prev) => (prev.includes(name) ? prev : [...prev, name]));
  }, []);

  useEffect(() => {
    // Two parallel theme systems share this state:
    //
    //   1. Prototype OKLCH tokens in src/styles/globals.css activate via
    //      `[data-theme="dark"]` on <html> for the dark override; light
    //      is the implicit default. We set data-theme on documentElement.
    //
    //   2. Vanilla-extract theme tokens (src/theme/themes.css.ts) activate
    //      via `.theme-dark` / `.theme-light` classes on <body>. These are
    //      legacy, but still consumed by AgentChatPanel and older components.
    //
    // Both must be driven from the same theme state or the two halves of
    // the app drift apart visually.
    const html = document.documentElement;
    const body = document.body;

    if (theme === 'dark') {
      html.setAttribute('data-theme', 'dark');
    } else {
      html.removeAttribute('data-theme');
    }

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
