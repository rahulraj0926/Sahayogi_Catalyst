/**
 * engine/units.ts - unit and currency helpers (spec 3.12: a number never travels without unit/currency;
 * GB is decimal (10^9 bytes) unless the Product says otherwise).
 */

/** Factor to convert a data-volume unit into GB (decimal). */
export const GB_FACTORS: Record<string, number> = { MB: 0.001, GB: 1, TB: 1000, PB: 1000000 };

export interface Fx { [currency: string]: number | string }
export const DEFAULT_FX: Fx = { INR: 1, USD: 87, EUR: 95, date: '2026-10-01', source: 'assumed rate used by the prototype (Rs 87 per USD, as in the competitor design report)' };

/** Normalise a PricePoint to INR per GB. Returns null when the price is not a per-volume price. */
export interface PriceLike { amount?: unknown; value_metric?: string; unit?: string; currency?: string; price_type?: string }
export function normalisePrice(price: PriceLike | null | undefined, fx: Fx = DEFAULT_FX): number | null {
  if (!price || typeof price.amount !== 'number') return null;
  if (!['egress', 'storage', 'requests'].includes(price.value_metric as string)) return null;
  if (price.value_metric === 'requests') return null;
  const m = /^(MB|GB|TB|PB)(?:\/(month|mo))?$/i.exec(String(price.unit || '').trim());
  if (!m) return null;
  const factor = GB_FACTORS[m[1].toUpperCase()];
  const rate = Number(fx[price.currency as string]);
  if (!rate || !factor) return null;
  return Math.round((((price.amount as number) * rate) / factor) * 10000) / 10000;
}

/**
 * What a price is "for": the plain choices a person sees, each with the exact record values behind it.
 * usage = billed on how much data is used (per GB, per TB); only offered to products that sell usage.
 */
export interface PriceChoice { v: string; label: string; usage?: boolean; f: Record<string, string> }
export const PRICE_FOR: PriceChoice[] = [
  { v: 'dealer_month', label: 'per dealer, per month', f: { value_metric: 'dealer', unit: 'dealer/month', billing_model: 'subscription', billing_period: 'month' } },
  { v: 'dealer_year', label: 'per dealer, per year', f: { value_metric: 'dealer', unit: 'dealer/year', billing_model: 'subscription', billing_period: 'year' } },
  { v: 'site_month', label: 'per site, per month', f: { value_metric: 'site', unit: 'site/month', billing_model: 'subscription', billing_period: 'month' } },
  { v: 'site_year', label: 'per site, per year', f: { value_metric: 'site', unit: 'site/year', billing_model: 'subscription', billing_period: 'year' } },
  { v: 'user_month', label: 'per user, per month', f: { value_metric: 'user', unit: 'user/month', billing_model: 'subscription', billing_period: 'month' } },
  { v: 'user_year', label: 'per user, per year', f: { value_metric: 'user', unit: 'user/year', billing_model: 'subscription', billing_period: 'year' } },
  { v: 'device_month', label: 'per device, per month', f: { value_metric: 'device', unit: 'device/month', billing_model: 'subscription', billing_period: 'month' } },
  { v: 'device_year', label: 'per device, per year', f: { value_metric: 'device', unit: 'device/year', billing_model: 'subscription', billing_period: 'year' } },
  { v: 'unit_once', label: 'per device or unit, paid once', f: { value_metric: 'device', unit: 'unit', billing_model: 'one_time', billing_period: 'one_time' } },
  { v: 'plan_month', label: 'per plan, per month', f: { value_metric: 'plan', unit: 'plan/month', billing_model: 'subscription', billing_period: 'month' } },
  { v: 'plan_year', label: 'per plan, per year', f: { value_metric: 'plan', unit: 'plan/year', billing_model: 'subscription', billing_period: 'year' } },
  { v: 'flat_month', label: 'a flat fee per month', f: { value_metric: 'flat', unit: 'month', billing_model: 'subscription', billing_period: 'month' } },
  { v: 'flat_year', label: 'a flat fee per year', f: { value_metric: 'flat', unit: 'year', billing_model: 'subscription', billing_period: 'year' } },
  { v: 'flat_once', label: 'a one-time fee', f: { value_metric: 'flat', unit: 'once', billing_model: 'one_time', billing_period: 'one_time' } },
  { v: 'gb_use', label: 'per GB of data used, billed on use', usage: true, f: { value_metric: 'egress', unit: 'GB', billing_model: 'usage', billing_period: 'month' } },
  { v: 'tb_use', label: 'per TB of data used, billed on use', usage: true, f: { value_metric: 'egress', unit: 'TB', billing_model: 'usage', billing_period: 'month' } },
  { v: 'gb_stored', label: 'per GB stored, billed on use', usage: true, f: { value_metric: 'storage', unit: 'GB', billing_model: 'usage', billing_period: 'month' } },
];
export const priceFor = (key: string): Record<string, string> | null => { const x = PRICE_FOR.find((p) => p.v === key); return x ? { ...x.f } : null; };
/** Does this kind of product sell by how much is used? Only sold software can; hardware, services and internal tools do not. */
export const sellsUsage = (profile: { kind?: string; audience?: string } | null | undefined): boolean => !!profile && profile.kind === 'software' && profile.audience !== 'internal';
/** The "what is the price for" choices that fit a product; `keep` lets an already-saved usage price still read correctly. */
export function priceChoices(profile: { kind?: string; audience?: string } | null | undefined, keep?: string) {
  return PRICE_FOR.filter((x) => !x.usage || sellsUsage(profile) || x.v === keep).map((x) => ({ value: x.v, label: x.label, usage: !!x.usage }));
}

/** The machine's local calendar date (YYYY-MM-DD), not the UTC date: in India the UTC date is a day behind until 05:30. */
export function localDate(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** A timestamp (or a plain date) as a LOCAL calendar date YYYY-MM-DD. Never slice a UTC timestamp: in India that is yesterday until 05:30. */
export function dayOf(v: unknown): string {
  if (!v) return '';
  const t = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? t.slice(0, 10) : localDate(d);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** A date or timestamp in words for a reader: "6 Oct 2026". A timestamp is first turned into the LOCAL calendar date. */
export function dateWords(v: unknown): string {
  const iso = dayOf(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return v ? String(v) : '';
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}
const MONTH_NAMES: Record<string, number> = { jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12 };
/** The first calendar date written in a piece of text (2026-10-05, 5 Oct 2026, October 5, 2026, 05/10/2026 read day first), as YYYY-MM-DD, or null. */
export function dateInText(text: unknown): string | null {
  const t = String(text || '');
  const iso = (y: string | number, m: number, d: number): string | null => { const s = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; return dateRangeProblem(s, s)?.level === 'error' ? null : s; };
  let m = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/.exec(t); if (m) { const r = iso(m[1], +m[2], +m[3]); if (r) return r; }
  m = /\b(\d{1,2})(?:st|nd|rd|th)?[ \-\/.]+([A-Za-z]{3,9})\.?,?[ \-\/.]+(20\d{2})\b/.exec(t); if (m && MONTH_NAMES[m[2].toLowerCase()]) { const r = iso(m[3], MONTH_NAMES[m[2].toLowerCase()], +m[1]); if (r) return r; }
  m = /\b([A-Za-z]{3,9})\.? (\d{1,2})(?:st|nd|rd|th)?,? (20\d{2})\b/.exec(t); if (m && MONTH_NAMES[m[1].toLowerCase()]) { const r = iso(m[3], MONTH_NAMES[m[1].toLowerCase()], +m[2]); if (r) return r; }
  m = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2})\b/.exec(t); if (m && +m[2] >= 1 && +m[2] <= 12) { const r = iso(m[3], +m[2], +m[1]); if (r) return r; }
  return null;
}
/** The date a price or rating was seen when it comes from a file: a date written in the quote, else the day the file was uploaded, else today. Never later than today. */
export function sourceDate(attachment: { uploaded_on?: string } | null | undefined, quote: unknown, today?: string): string {
  const t = today || localDate();
  const found = dateInText(quote);
  if (found && found <= t) return found;
  const up = attachment && attachment.uploaded_on && /^\d{4}-\d{2}-\d{2}$/.test(attachment.uploaded_on) ? attachment.uploaded_on : null;
  return up && up <= t ? up : t;
}

/** Every ISO date or timestamp inside a sentence turned into words ("due 2026-10-06" -> "due 6 Oct 2026"). */
export function datesInText(text: unknown): string {
  return String(text === undefined || text === null ? '' : text).replace(/\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?/g, (m) => dateWords(m));
}
/**
 * Is a typed date sensible? Returns null when fine, else { level: 'error'|'warn', message }.
 * error: not a real calendar date, or year below 2000 / above 2100. warn: more than a year ago or more than five years ahead of `today`.
 */
export function dateRangeProblem(iso: unknown, today?: string): { level: 'error' | 'warn'; message: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return { level: 'error', message: 'That is not a date. Use the date picker.' };
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3]);
  const real = new Date(Date.UTC(y, mo - 1, d));
  if (real.getUTCFullYear() !== y || real.getUTCMonth() !== mo - 1 || real.getUTCDate() !== d) return { level: 'error', message: 'That day does not exist in the calendar. Pick the date again.' };
  if (y < 2000 || y > 2100) return { level: 'error', message: 'That year looks wrong (it must be between 2000 and 2100). Pick the date again.' };
  const t = /^(\d{4})-(\d{2})-(\d{2})$/.test(String(today || '')) ? (today as string) : localDate();
  const back = addDays(t, -366); const ahead = addDays(t, 5 * 366);
  if ((iso as string) < back) return { level: 'warn', message: 'That is more than a year ago. Is the date right?' };
  if ((iso as string) > ahead) return { level: 'warn', message: 'That is more than five years away. Is the date right?' };
  return null;
}

/** "Gateway unitGateway unit" -> "Gateway unit": a box that already held the text and was typed into again. */
export function undouble<T>(s: T): T | string {
  if (typeof s !== 'string') return s;
  const t = s.trim();
  const m = /^(.{2,}?)\s*\1$/.exec(t);
  return m && !/^\d+$/.test(m[1]) ? m[1] : s;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

export function addDays(date: string, n: number): string {
  const d = new Date(Date.parse(date) + n * 86400000);
  return d.toISOString().slice(0, 10);
}

