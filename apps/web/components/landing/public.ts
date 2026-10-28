import type { CSSProperties } from 'react';

/** Pages that open without the app shell (no side menu, no top bar): the landing page, the pitch page and the Innovation page of an idea. */
export const isPublicPath = (path: string) => path === '/welcome' || path.startsWith('/welcome/') || path === '/ideas/new' || /^\/ideas\/[^/]+$/.test(path);

/** The blue-to-purple fill used for the product name. It uses the theme's chart colours, so it also works in dark mode. */
export const NAME_GRADIENT: CSSProperties = {
  backgroundImage: 'linear-gradient(90deg, var(--chart-1), var(--chart-5))',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
};

/** The product the person opened last in this browser, if any (the side menu keeps the same note). */
export function lastProduct(): string | null {
  try { return localStorage.getItem('sahayogi.lastProduct'); } catch { return null; }
}

/** The idea this browser pitched last, so its status can be shown again later. */
export const MY_IDEA_KEY = 'sahayogi.myIdea';

/** Set (for this tab only) when "Pitch it" fills the screen with colour, so the next page knows to fade it away. */
export const WARP_KEY = 'sahayogi.warp';
