export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

/** Per-browser persistence key. localStorage only — the preference is a
 *  presentation choice, never sent to the API. */
export const THEME_STORAGE_KEY = "sahayogi.theme";
export const DEFAULT_THEME_MODE: ThemeMode = "system";

/** Narrow an untrusted stored value (corrupt, stale, hand-edited) to a mode. */
export function parseThemeMode(raw: string | null | undefined): ThemeMode | null {
  return raw === "light" || raw === "dark" || raw === "system" ? raw : null;
}

export function resolveTheme(mode: ThemeMode, systemPrefersDark: boolean): ResolvedTheme {
  if (mode === "system") return systemPrefersDark ? "dark" : "light";
  return mode;
}

/** Read the stored mode; any failure (private mode, blocked storage, junk) is "no preference". */
export function readStoredThemeMode(): ThemeMode | null {
  try {
    return parseThemeMode(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeStoredThemeMode(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Quota / private mode: the choice still applies for this page view.
  }
}

/**
 * Route prefixes that are NOT the workspace and must never be put in dark by
 * the pre-paint script: sign-in, the platform console, and the public
 * onboarding form. They have no theme switch, so a stored "dark" must not
 * leak into them on a hard load.
 */
export const THEME_EXCLUDED_PATH_PREFIXES = ["/login", "/platform", "/onboarding"] as const;

/**
 * Runs inline in <head> (see ThemeInitScript) before anything paints, so a
 * stored "dark" (or an OS-dark "system") never flashes light first on a hard
 * load of a workspace route. Must stay in lockstep with
 * parseThemeMode/resolveTheme above — it is the same logic written as a string
 * because it executes before any bundle loads. Every step is guarded: a
 * failure here must never block rendering.
 */
export const THEME_INIT_SCRIPT = `(function () {
  try {
    var path = window.location.pathname;
    var excluded = ${JSON.stringify(THEME_EXCLUDED_PATH_PREFIXES)};
    for (var i = 0; i < excluded.length; i++) {
      if (path === excluded[i] || path.indexOf(excluded[i] + "/") === 0) return;
    }
    var stored = null;
    try { stored = window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}); } catch (e) {}
    var mode = stored === "light" || stored === "dark" || stored === "system" ? stored : ${JSON.stringify(DEFAULT_THEME_MODE)};
    var dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  } catch (e) {}
})();`;
