import type { LucideIcon } from 'lucide-react';

/** One tile in the 9-dot launcher. `href` opens inside this app, `liveUrl` opens another Sahayogi app in a new tab. */
export interface LauncherApp {
  id: string;
  name: string;
  href?: string;
  liveUrl?: string;
  /** The app's own logo, shown as it is. An app without one gets a blank tile (or its icon, if it has one). */
  logoUrl?: string;
  icon?: LucideIcon;
}

/**
 * The Sahayogi products (Products_list.xlsx). Most have no web address yet, so they stay dimmed and do nothing when clicked. To switch one on, add its
 * web address in PRODUCT_LINKS below, using the product's id. Nothing else needs to change.
 * Logos are the ones shown on https://sahayogi.in/products/, copied unchanged into public/launcher/. A product that has no logo on that page shows a blank tile.
 * Sahayogi Catalyst is this website, so it opens here. The pages of this website (tasks, notes, members...) are in the side menu, not in this launcher.
 */
const PRODUCTS: Array<[id: string, name: string]> = [
  ['setu', 'Sahayogi Setu'],
  ['one', 'Sahayogi One'],
  ['boss-by-office', 'Boss By Office Sahayogi'],
  ['chat', 'Chat With Sahayogi'],
  ['tax', 'Tax Sahayogi'],
  ['mail', 'Sahayogi Mail'],
  ['drive', 'Sahayogi Drive'],
  ['ai', 'Sahayogi AI'],
  ['my', 'My Sahayogi'],
  ['studio', 'Studio Sahayogi'],
  ['cloud', 'Sahayogi Cloud'],
  ['office', 'Office Sahayogi'],
  ['investor', 'Investor Sahayogi'],
  ['boss-bridge', 'Boss Bridge'],
  ['calendar', 'Sahayogi Calender'],
  ['teams', 'Sahayogi Teams'],
  ['cdn', 'Sahayogi CDN'],
  ['dns', 'Sahayogi DNS'],
  ['secrets', 'Sahayogi Secrets'],
  ['developer', 'Sahayogi Developer'],
  ['catalyst', 'Sahayogi Catalyst'],
];

/** Fill in a product's web address (opens in a new tab) and logo here. Example: setu: { liveUrl: 'https://setu.example.com', logoUrl: '/launcher/setu.png' } */
export const PRODUCT_LINKS: Record<string, { href?: string; liveUrl?: string; logoUrl?: string }> = {
  one: { logoUrl: '/launcher/one.png' },
  'boss-by-office': { logoUrl: '/launcher/boss-by-office.png' }, // shown as "BoSS" on the website
  chat: { logoUrl: '/launcher/chat.png' },
  tax: { logoUrl: '/launcher/tax.png' },
  my: { logoUrl: '/launcher/my.png' },
  studio: { logoUrl: '/launcher/studio.png' },
  cloud: { logoUrl: '/launcher/cloud.png' },
  office: { logoUrl: '/launcher/office.png' },
  investor: { logoUrl: '/launcher/investor.png' },
  catalyst: { href: '/' },
};

export const PRODUCT_APPS: LauncherApp[] = PRODUCTS.map(([id, name]) => ({ id: `product-${id}`, name, ...PRODUCT_LINKS[id] }));

/** Other Sahayogi apps that open in a new tab. Example: { id: 'chat', name: 'Chat', liveUrl: 'https://...', logoUrl: '/chat.png' } */
export const EXTERNAL_APPS: LauncherApp[] = [];

/** An app opens only when it has an address. Without one its tile is shown dimmed and does nothing. */
export const isLinked = (a: LauncherApp) => Boolean(a.href || a.liveUrl);

/** Shown as favorites until the person changes them. */
export const DEFAULT_FAVORITES = ['product-catalyst'];

export const LAUNCHER_APPS: LauncherApp[] = [...PRODUCT_APPS, ...EXTERNAL_APPS.filter((a) => a.liveUrl)];
