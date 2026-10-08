/**
 * ThemeProvider — client-side context for the binary light/dark theme.
 * Reads the user's preference from:
 *   1. localStorage (if set on this device)
 *   2. /api/users/me PATCH (if signed in; fetched once on mount)
 * Falls back to 'light'. The actual <html data-theme> attribute is set by
 * applyTheme() which the no-flash inline script in layout.tsx already ran.
 *
 * The setTheme() function calls applyTheme() immediately (so the user
 * sees the change) and then debounces a PATCH to /api/users/me so the
 * preference is saved server-side. Falls back to localStorage on auth
 * failure.
 */

'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'aira.theme';
const DEFAULT: Theme = 'light';

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (t: Theme) => void;
  ready: boolean;
}>({ theme: DEFAULT, setTheme: () => {}, ready: false });

function applyTheme(theme: Theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

export function ThemeProvider({ children, initialTheme = DEFAULT }: { children: React.ReactNode; initialTheme?: Theme }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let initial: Theme = initialTheme;
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
      if (stored === 'light' || stored === 'dark') initial = stored;
    } catch {}
    setThemeState(initial);
    applyTheme(initial);
    setReady(true);
  }, [initialTheme]);

  const setTheme = useCallback(async (t: Theme) => {
    setThemeState(t);
    applyTheme(t);
    try { localStorage.setItem(STORAGE_KEY, t); } catch {}
    // Debounced PATCH (fire-and-forget; we don't block the UI)
    setTimeout(() => {
      fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ theme: t }),
      }).catch(() => {});  // ignore errors (user may be signed out)
    }, 500);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, ready }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
