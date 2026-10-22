"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import {
  DEFAULT_THEME_MODE,
  readStoredThemeMode,
  resolveTheme,
  writeStoredThemeMode,
  type ResolvedTheme,
  type ThemeMode,
} from "./theme";

type ThemeContextValue = {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** null where matchMedia doesn't exist (SSR, very old browsers): treated as "light". */
function darkMedia(): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(DARK_QUERY) : null;
}

function systemPrefersDark(): boolean {
  return darkMedia()?.matches ?? false;
}

function applyTheme(resolved: ResolvedTheme) {
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

/**
 * Light / dark / system, ported from Setu's ThemeProvider (toggles `dark` on
 * <html>) with per-browser persistence added. State starts at the default and
 * the stored choice is read in an effect — never during render — so server
 * and first client render agree. The effects are layout effects so the class
 * lands before paint on a client-side arrival (sign-in -> dashboard); on a
 * hard load the inline ThemeInitScript has already set it.
 *
 * On unmount (leaving the workspace for /login, say) it removes the class it
 * added, so the pages outside the workspace never inherit dark.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(DEFAULT_THEME_MODE);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");
  // Don't apply the default until the stored mode has been read, or a stored
  // "dark" on a light-OS machine would flash light first.
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const stored = readStoredThemeMode();
    if (stored) setModeState(stored);
    setReady(true);
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    writeStoredThemeMode(next);
  }, []);

  useLayoutEffect(() => {
    if (!ready) return;
    const resolved = resolveTheme(mode, systemPrefersDark());
    setResolvedTheme(resolved);
    applyTheme(resolved);

    if (mode !== "system") return;

    const media = darkMedia();
    if (!media) return;
    function handleChange(event: MediaQueryListEvent) {
      const next = resolveTheme("system", event.matches);
      setResolvedTheme(next);
      applyTheme(next);
    }
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [mode, ready]);

  useEffect(() => () => document.documentElement.classList.remove("dark"), []);

  const value = useMemo(() => ({ mode, resolvedTheme, setMode }), [mode, resolvedTheme, setMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
