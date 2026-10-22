import { THEME_INIT_SCRIPT } from "./theme";

/**
 * Inline pre-paint theme resolution. Rendered once, in the root layout's
 * <head> (app/layout.tsx), so it ships in the initial HTML and runs before
 * first paint — it must NOT be rendered from the workspace shell: a <script>
 * created by React on a client-side navigation is inert and logs a dev
 * warning. The script itself skips non-workspace routes (login, platform,
 * onboarding); see THEME_EXCLUDED_PATH_PREFIXES. Static string, no user
 * input: nothing to sanitise.
 */
export function ThemeInitScript({ nonce }: { nonce?: string }) {
  // suppressHydrationWarning: browser extensions inject their own <script>
  // at the top of <head> before React hydrates, and React then compares this
  // element against the extension's tag and logs a mismatch. The content is a
  // static string, so there is nothing real to reconcile here.
  return <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />;
}
