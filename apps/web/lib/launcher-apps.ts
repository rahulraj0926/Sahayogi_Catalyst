import type { LucideIcon } from 'lucide-react';

/** One tile in the 9-dot launcher. `href` opens inside this app, `liveUrl` opens another Sahayogi app in a new tab. */
export interface LauncherApp {
  id: string;
  name: string;
  href?: string;
  liveUrl?: string;
  /** Picture for an app that has its own logo; without one the icon (or first letter) is used. */
  logoUrl?: string;
  icon?: LucideIcon;
  /** Short text shown on the tile when there is no logo or icon (default: the first letter). */
  mark?: string;
  /** Icon colour; the tile behind it is a soft tint of the same colour, so it works in light and dark. */
  fg?: string;
}

/**
 * The Sahayogi products (Products_list.xlsx). None has a web address or a logo on file yet, so each shows a coloured tile with a short mark and
 * stays dimmed. To switch one on, add its web address (and logo) in PRODUCT_LINKS below, using the product's id. Nothing else needs to change.
 * Sahayogi Catalyst is this website, so it opens here. The pages of this website (tasks, notes, members...) are in the side menu, not in this launcher.
 */
const PRODUCTS: Array<[id: string, name: string, mark: string, fg: string]> = [
  ['setu', 'Sahayogi Setu', 'Se', '#2563EB'],
  ['one', 'Sahayogi One', '1', '#7C3AED'],
  ['boss-by-office', 'Boss By Office Sahayogi', 'B', '#DC2626'],
  ['chat', 'Chat With Sahayogi', 'Ch', '#0D9488'],
  ['tax', 'Tax Sahayogi', 'Tx', '#059669'],
  ['mail', 'Sahayogi Mail', 'Ma', '#EA580C'],
  ['drive', 'Sahayogi Drive', 'Dr', '#D97706'],
  ['ai', 'Sahayogi AI', 'AI', '#9333EA'],
  ['my', 'My Sahayogi', 'My', '#0891B2'],
  ['studio', 'Studio Sahayogi', 'St', '#DB2777'],
  ['cloud', 'Sahayogi Cloud', 'Cl', '#0284C7'],
  ['office', 'Office Sahayogi', 'Of', '#4F46E5'],
  ['investor', 'Investor Sahayogi', 'In', '#16A34A'],
  ['boss-bridge', 'Boss Bridge', 'BB', '#B91C1C'],
  ['calendar', 'Sahayogi Calender', 'Ca', '#E11D48'],
  ['teams', 'Sahayogi Teams', 'Te', '#6D28D9'],
  ['cdn', 'Sahayogi CDN', 'CDN', '#0F766E'],
  ['dns', 'Sahayogi DNS', 'DNS', '#475569'],
  ['secrets', 'Sahayogi Secrets', 'Sc', '#334155'],
  ['developer', 'Sahayogi Developer', 'Dv', '#1D4ED8'],
  ['catalyst', 'Sahayogi Catalyst', 'Ct', '#C2410C'],
];

/** Fill in a product's web address (opens in a new tab) and logo here. Example: setu: { liveUrl: 'https://setu.example.com', logoUrl: '/launcher/setu.png' } */
export const PRODUCT_LINKS: Record<string, { href?: string; liveUrl?: string; logoUrl?: string }> = { catalyst: { href: '/' } };

export const PRODUCT_APPS: LauncherApp[] = PRODUCTS.map(([id, name, mark, fg]) => ({ id: `product-${id}`, name, mark, fg, ...PRODUCT_LINKS[id] }));

/** Other Sahayogi apps that open in a new tab. Example: { id: 'chat', name: 'Chat', liveUrl: 'https://...', logoUrl: '/chat.png' } */
export const EXTERNAL_APPS: LauncherApp[] = [];

/** An app opens only when it has an address. Without one its tile is shown dimmed and does nothing. */
export const isLinked = (a: LauncherApp) => Boolean(a.href || a.liveUrl);

/** Shown as favorites until the person changes them. */
export const DEFAULT_FAVORITES = ['product-catalyst'];

export const LAUNCHER_APPS: LauncherApp[] = [...PRODUCT_APPS, ...EXTERNAL_APPS.filter((a) => a.liveUrl)];
