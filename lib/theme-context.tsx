'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type Theme = 'dark' | 'light';

type ThemeContextValue = {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'domio-theme';

// Domio ships one light brand theme for now. The dark styles are unfinished
// (navy text on black), and the DB default for themePreference is 'dark', so a
// saved preference would flip owners into an unreadable screen. Until dark mode
// is designed, always render light. Set to true to bring the toggle back.
const DARK_MODE_ENABLED = false;

export function ThemeProvider({
  initialTheme = 'dark',
  children,
}: {
  initialTheme?: Theme;
  children: ReactNode;
}) {
  const [theme, setThemeState] = useState<Theme>(DARK_MODE_ENABLED ? initialTheme : 'light');
  // Once the user explicitly toggles, an in-flight mount fetch must not clobber
  // their choice (avoids a late GET reverting the theme).
  const userChanged = useRef(false);

  // Reflect the theme onto <html data-theme="…"> so the CSS overrides apply.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // On mount, reconcile with the saved preference (localStorage first for an
  // instant read, then the DB which is authoritative across devices). Skips if
  // the user has already toggled this session.
  useEffect(() => {
    if (!DARK_MODE_ENABLED) return;
    let cancelled = false;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!userChanged.current && (stored === 'light' || stored === 'dark')) {
        setThemeState(stored);
      }
    } catch {
      /* ignore */
    }
    fetch('/api/user/theme')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (
          !cancelled &&
          !userChanged.current &&
          (data?.theme === 'light' || data?.theme === 'dark')
        ) {
          setThemeState(data.theme);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const setTheme = (t: Theme) => {
    if (!DARK_MODE_ENABLED) t = 'light';
    userChanged.current = true;
    setThemeState(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* ignore */
    }
    fetch('/api/user/theme', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: t }),
    }).catch(() => {});
  };

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
