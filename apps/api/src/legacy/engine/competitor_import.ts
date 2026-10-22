/**
 * engine/competitor_import.ts - bring competitors, their plans and the features each plan includes in from a CSV or Excel file,
 * or from rows typed into the "Add a competitor" dialog. One engine for both: every source becomes rows, rows become one model, the model
 * is either checked (preview) or saved (commit). Nothing is saved on a preview.
 *
 * What a file may hold (one sheet each, or all in one):
 *   - a list of competitors: Competitor, Tier, Website, Module ...      - or tiers side by side: columns "Tier 1", "Tier 2", "Tier 3"
 *   - plans: Competitor, Product, Plan, Level, Users, Monthly / Yearly / Lifetime price, Currency, GST included, Features
 *   - features: Competitor, Plan, Feature, Included    - or a ticked grid: one row per feature, one column per plan
 * Headers are matched by meaning, not by exact spelling, so a sheet exported from someone else's tool usually just works.
 * Names are matched to what is already stored (ignoring case, spaces and punctuation), so importing twice adds nothing twice.
 */
import { extractOffice } from './extract_office';
import { cellsOf, lineOf, liveCompetitors, scopeKey } from './competitor_owner';
import { featureKey, catalogIndex } from './competitor_plans';

const httpErr = (status: number, message: string) => Object.assign(new Error(message), { status });
const MAX_ROWS = 5000;
const LEVELS = ['free', 'entry', 'mid', 'top', 'enterprise'];
const nkey = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const canon = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const str = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());

// ------------------------------------------------------------------ reading files
export interface Table { name: string; rows: string[][]; rowNumbers: number[] }

/** CSV / TSV text into rows. Handles quotes, doubled quotes, line breaks inside quotes, a BOM and , ; tab as the separator. */
export function parseCsvNumbered(input: string): { rows: string[][]; numbers: number[] } {
  const text = input.replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] || '';
  const count = (ch: string) => first.split(ch).length - 1;
  const delim = ([['\t', count('\t')], [';', count(';')], [',', count(',')]] as [string, number][]).sort((a, b) => b[1] - a[1])[0];
  const sep = delim[1] > 0 ? delim[0] : ',';
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; rows.push(row); row = []; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const keep: string[][] = []; const numbers: number[] = [];
  rows.forEach((r, i) => { if (r.some((c) => str(c) !== '')) { keep.push(r); numbers.push(i + 1); } });
  return { rows: keep, numbers };
}
export function parseCsv(input: string): string[][] { return parseCsvNumbered(input).rows; }

/** Text of a CSV file. UTF-8 when it is valid UTF-8, otherwise Windows-1252 (what Excel on Windows saves as "CSV"). */
export function decodeText(buf: Buffer): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { /* not UTF-8 */ }
  try { return new TextDecoder('windows-1252').decode(buf); } catch { return buf.toString('latin1'); }
}

export function readTables(filename: string, buf: Buffer): Table[] {
  const ext = String(filename || '').toLowerCase().split('.').pop();
  const base = String(filename || 'file').replace(/\.[^.]+$/, '');
  if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
    const { rows, numbers } = parseCsvNumbered(decodeText(buf));
    return [{ name: base, rows, rowNumbers: numbers }];
  }
  if (ext === 'xls') throw httpErr(422, 'Old .xls files cannot be read. Open the file in Excel and save it as .xlsx or .csv, then upload it again.');
  if (ext === 'xlsx' || ext === 'xlsm') {
    const r: any = extractOffice(buf, 'xlsx');
    if (r.status === 'failed') throw httpErr(422, `The Excel file could not be read: ${(r.warnings || []).join('; ') || 'unknown problem'}`);
    return (r.sheets || []).filter((s) => s.ok !== false && s.tables && s.tables[0]).map((s) => ({ name: s.title, rows: s.tables[0].rows.map((x) => x.map(str)), rowNumbers: s.tables[0].row_numbers }));
  }
  throw httpErr(422, 'Upload a .csv or .xlsx file.');
}

// ------------------------------------------------------------------ understanding headers and values
const COLS: [string, RegExp][] = [
  ['features', /^((key )?(modules )?(and )?features( included| list)?|included features|includes|what is included|inclusions|key modules( features)?( included)?|modules included)$/],
  ['feature', /^(feature|feature name|capability|capability name)$/],
  ['included', /^(included|has it|available|supported|provided|offered)$/],
  ['their_name', /^(their name|their feature name|called|vendor name for it|as named by them|competitor feature name)$/],
  ['category', /^(category|feature category|feature group|group)$/],
  ['product', /^(product|product line|product name|suite|product family)$/],
  ['plan_level', /^(plan level|level|our level|our tag|plan tag|tier tag|plan tier|plan type|tag)$/],
  ['plan', /^(plan|plan name|plan edition|plan or edition|package|package name|edition|variant|sku|subscription)$/],
  ['tier', /^(tier|competitor tier|company tier)$/],
  ['seat_model', /^(licence type|license type|licence|license|seat model|user type|user model|licensing)$/],
  ['max_users', /^(max users|maximum users|users included|included users|user limit|users allowed|number of users|no of users|users|seats|user count|users covered)$/],
  ['currency', /^(currency|curr|ccy)$/],
  ['tax', /^(tax|tax basis|gst|gst included|incl gst|tax included|price includes gst|includes gst)$/],
  ['period', /^(billing|billing period|billing cycle|billing type|period|billed|cycle|price period)$/],
  ['competitor', /^(competitor|competitor name|company|company name|vendor|vendor name|brand|name|software)$/],
  ['website', /^(website|url|web site|site|link|web)$/],
  ['kind', /^(kind|competitor type|competitor kind)$/],
  ['positioning', /^(positioning|description|about|summary|how they compete)$/],
  ['scopes', /^(module|modules|scope|scopes|product area|competes with|competes in|our module|our modules|module scope)$/],
];
const PRICE_WORD = /\b(price|cost|amount|fee|rate|charges?|mrp)\b/;
const periodOf = (c: string): string | null => (/\bper (user |seat )?(per )?month\b/.test(c) ? 'month' : /\b(one time|onetime|lifetime|perpetual|once)\b/.test(c) ? 'one_time' : /\b(quarter|quarterly|3 months?|three months?)\b/.test(c) ? 'quarter' : /\b(year|yearly|annual|annually|12 months?|per annum|pa)\b/.test(c) ? 'year' : /\b(month|monthly|1 month|mo)\b/.test(c) ? 'month' : null);

interface HeaderMap { col: Record<string, number>; prices: { i: number; period: string | null; tax: string | null }[]; tierCols: { i: number; tier: string }[]; unknown: number[] }
function mapHeaders(headers: string[]): HeaderMap {
  const m: HeaderMap = { col: {}, prices: [], tierCols: [], unknown: [] };
  headers.forEach((h, i) => {
    const c = canon(h);
    if (!c) return;
    const t = /^tier ([123s])\b/.exec(c) || /^t([123])$/.exec(c);
    if (t) { m.tierCols.push({ i, tier: t[1] === 's' ? 'S' : `T${t[1]}` }); return; }
    if (/^(substitutes?|alternatives?)$/.test(c)) { m.tierCols.push({ i, tier: 'S' }); return; }
    for (const [field, re] of COLS) if (re.test(c) && m.col[field] === undefined) { m.col[field] = i; return; }
    const p = periodOf(c);
    if (PRICE_WORD.test(c) || (p && c.split(' ').length <= 3)) { m.prices.push({ i, period: p, tax: /\b(excl|excluding|exclusive|ex gst|without gst|pre gst)\b/.test(c) ? 'excl_gst' : /\b(incl|including|inclusive|with gst)\b/.test(c) ? 'incl_gst' : null }); return; }
    m.unknown.push(i);
  });
  // on a price list, a "Category" column is the product line the plan belongs to
  if (m.col.category !== undefined && m.col.product === undefined && m.col.feature === undefined && (m.col.plan !== undefined || m.prices.length > 0)) { m.col.product = m.col.category; delete m.col.category; }
  return m;
}

const TIER_WORDS: [RegExp, string][] = [[/^(t ?1|tier ?1|1|tier one|one|direct|main|primary)$/, 'T1'], [/^(t ?2|tier ?2|2|tier two|two|secondary|next)$/, 'T2'], [/^(t ?3|tier ?3|3|tier three|three|watch|watchlist)$/, 'T3'], [/^(s|substitute|substitutes|alternative|alternatives|do nothing|manual|in house)$/, 'S']];
export function parseTier(v: unknown): string | null { const c = canon(v); for (const [re, t] of TIER_WORDS) if (re.test(c)) return t; return null; }

const KINDS = ['direct', 'indirect', 'alternative', 'in_house', 'adjacent_entrant', 'open_source', 'aspirational'];
const parseKind = (v: unknown): string | null => { const k = canon(v).replace(/ /g, '_'); return KINDS.includes(k) ? k : null; };

const LEVEL_WORDS: [string, RegExp][] = [
  ['free', /\b(free|freemium|trial|community|forever free)\b/],
  ['enterprise', /\b(enterprise|ent|corporate|custom|contact sales|contact us|on request)\b/],
  ['top', /\b(top|ultimate|ultra|platinum|elite|max|maximum|complete|all access|premier|diamond|unlimited)\b/],
  ['entry', /\b(entry|basic|starter|lite|essential|essentials|solo|personal|individual|bronze|silver|launch|small|mini)\b/],
  ['mid', /\b(mid|standard|plus|professional|pro|business|team|teams|growth|advanced|premium|gold|medium|scale)\b/],
];
/** Level written by a person: only an exact meaning is accepted. */
export function parseLevel(v: unknown): string | null { const c = canon(v); if (!c) return null; if (LEVELS.includes(c)) return c; if (/^(freemium|free plan|trial)$/.test(c)) return 'free'; return null; }
/** Level guessed from a plan's name (and from the plan having no public price). Always flagged to the person. */
export function guessLevel(name: string, quote: boolean, amount: number | null): string | null {
  const c = canon(name);
  if (amount === 0) return 'free';
  for (const [lvl, re] of LEVEL_WORDS) if (re.test(c)) return lvl;
  if (quote) return 'enterprise';
  return null;
}

function parseSeat(v: unknown): { model: string | null; max: number | null } {
  const c = canon(v); if (!c) return { model: null, max: null };
  if (/\b(unlimited|no limit)\b/.test(c)) return { model: 'unlimited_users', max: null };
  if (/\b(per user|each user|user wise|per seat|per head)\b/.test(c)) return { model: 'per_user', max: null };
  const num = /(\d+)/.exec(c);
  if (/\b(single|one user|1 user|individual|solo|standalone|1)\b/.test(c) && !(num && Number(num[1]) > 1)) return { model: 'single_user', max: null };
  if (/\b(multi|multiple|team|shared|network|lan|concurrent)\b/.test(c) || (num && Number(num[1]) > 1)) return { model: 'multi_user', max: num && Number(num[1]) > 1 ? Number(num[1]) : null };
  return { model: null, max: null };
}

interface Money { amount: number | null; currency: string | null; quote: boolean; period: string | null; per_user: boolean }
export function parseMoney(v: unknown): Money | null {
  const raw = str(v); if (!raw) return null;
  const c = raw.toLowerCase();
  if (/^(included|part of|bundled|incl\b)|\b(pages?|credits?|invoices?|transactions?|gb|mb)\b/.test(c) || /^not (specified|stated|available|published)/.test(c)) return null;
  const per_user = /(per|\/)\s*(user|seat)/.test(c);
  const period = /(per|\/)\s*(month|mo)\b/.test(c) ? 'month' : /(per|\/)\s*(year|yr|annum)\b/.test(c) ? 'year' : /(per|\/)\s*quarter/.test(c) ? 'quarter' : /(lifetime|one.?time|perpetual)/.test(c) ? 'one_time' : null;
  const cur = /₹|\brs\.?\b|\binr\b/.test(c) ? 'INR' : /\$|\busd\b/.test(c) ? 'USD' : /€|\beur\b/.test(c) ? 'EUR' : /£|\bgbp\b/.test(c) ? 'GBP' : null;
  if (/^(free|nil|no cost|free forever)$/.test(c)) return { amount: 0, currency: cur, quote: false, period, per_user };
  if (/^(custom|contact|contact sales|contact us|on request|quote|call us|tbd|n\/?a|na|-|—|–|ask)$/.test(c) || (/(contact|custom|quote|request)/.test(c) && !/\d/.test(c))) return { amount: null, currency: cur, quote: true, period, per_user };
  const m = /(\d[\d,]*(?:\.\d+)?)/.exec(raw.replace(/\s/g, ''));
  if (!m) return { amount: null, currency: cur, quote: true, period, per_user };
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? { amount: n, currency: cur, quote: false, period, per_user } : null;
}
const parseCurrency = (v: unknown): string | null => { const c = str(v).toUpperCase(); if (/^[A-Z]{3}$/.test(c)) return c; const m = parseMoney(`${str(v)} 1`); return m ? m.currency : null; };
const parseTax = (v: unknown): string | null => { const c = canon(v); if (!c) return null; if (/^(n a|na|not applicable|none)$/.test(c)) return 'not_applicable'; if (/(excl|exclusive|extra|without|plus gst)|^(no|false|0|n)$/.test(c)) return 'excl_gst'; if (/(incl|inclusive|with)|^(yes|true|1|y)$/.test(c)) return 'incl_gst'; return null; };
const NO = /^(n|no|false|0|-|—|–|✗|✘|×|✕|❌|none|n\/a|na|not included|not available)$/i;
/** true = included, false = said not included, null = blank. */
const tick = (v: unknown): boolean | null => { const s = str(v); if (!s) return null; if (NO.test(s)) return false; return true; };

const splitFeatures = (s: string): string[] => s.split(/\s*(?:[;\n|•]|,(?![^()]*\)))\s*/).map((x) => x.replace(/^[\s\-–✓✔*•]+/, '').trim()).filter((x) => x && x.length <= 200);

/** A term written into the plan's name: "Silver - 3 Month", "Gold - Lifetime". Returns the plan name without it. */
const TERM_SUFFIX = /\s*[-–—:|/]\s*(?:1\s*months?|one\s*months?|monthly|3\s*months?|three\s*months?|quarterly|12\s*months?|twelve\s*months?|1\s*years?|yearly|annual|annually|lifetime|perpetual|one[- ]?time)\s*$/i;
export function splitTerm(plan: string): { name: string; period: string | null } {
  const m = TERM_SUFFIX.exec(plan);
  if (!m || m.index === 0) return { name: plan, period: null };
  const period = periodOf(canon(m[0])); const name = plan.slice(0, m.index).trim();
  return period && name ? { name, period } : { name: plan, period: null };
}
/** "TallyPrime - Rental" and "TallyPrime - Perpetual" are one product sold two ways, not two products. */
const cleanProduct = (p: string) => p.replace(/\s*[-–—:]\s*(rental|perpetual|subscription|licen[cs]e|monthly|annual|yearly)\s*$/i, '').trim() || p;

const KNOWN_WORDS = /^(pricing|price|prices|pricelist|features?|analysis|plans?|list|listing|competitor|competitors|comparison|and|sheet|data|raw|of|for|the|competitive|report|summary)$/i;
/** A competitor's name from the title line above the table ("Tally Pricing & Features Analysis" gives "Tally"). */
function titleName(pre: string[][]): string {
  for (const r of pre) {
    const t = r.map(str).find(Boolean); if (!t) continue;
    const w = t.replace(/[&|:()\-–—,]/g, ' ').split(/\s+/).filter((x) => x && !KNOWN_WORDS.test(x));
    return w.length >= 1 && w.length <= 3 ? w.join(' ') : '';
  }
  return '';
}

// ------------------------------------------------------------------ the model
interface Term { period: string; amount: number | null; currency: string; tax: string; quote: boolean }
interface PlanM { product: string; plan: string; level: string | null; level_guessed: boolean; seat_model: string | null; max_users: number | null; terms: Map<string, Term>; features: Map<string, string>; rows: number[] }
interface FeatM { name: string; their: string; category: string; included: boolean }
interface CompM { name: string; tier?: string; kind?: string; website?: string; positioning?: string; scopes: string[]; plans: Map<string, PlanM>; feats: Map<string, FeatM>; rows: number[] }
interface Hints { competitor?: string; tier?: string | null; scope?: string }
interface Model { hints: Hints; comps: Map<string, CompM>; sheets: any[]; errors: { sheet: string; row: number; message: string }[]; warnings: string[]; assumptions: Map<string, number> }

function newModel(hints: Hints = {}): Model { return { hints, comps: new Map(), sheets: [], errors: [], warnings: [], assumptions: new Map() }; }
const assume = (m: Model, text: string, n = 1) => m.assumptions.set(text, (m.assumptions.get(text) || 0) + n);
function compOf(m: Model, name: string, row: number): CompM {
  const k = nkey(name);
  let c = m.comps.get(k);
  if (!c) { c = { name: name.replace(/\s+/g, ' ').trim(), scopes: [], plans: new Map(), feats: new Map(), rows: [] }; m.comps.set(k, c); }
  c.rows.push(row);
  return c;
}
function planOf(c: CompM, product: string, plan: string, seat: string | null, row: number): PlanM {
  const k = [nkey(product), nkey(plan), seat || ''].join('|');
  let p = c.plans.get(k);
  if (!p) { p = { product: product.trim(), plan: plan.trim(), level: null, level_guessed: false, seat_model: seat, max_users: null, terms: new Map(), features: new Map(), rows: [] }; c.plans.set(k, p); }
  p.rows.push(row);
  return p;
}
const addScopes = (c: CompM, v: string) => { for (const s of v.split(/[;,|]/).map((x) => x.trim()).filter(Boolean)) if (!c.scopes.some((x) => scopeKey(x) === scopeKey(s))) c.scopes.push(s); };
function addFeature(c: CompM, p: PlanM | null, name: string, o: { included?: boolean; their?: string; category?: string } = {}) {
  const k = nkey(name); if (!k) return;
  const included = o.included !== false;
  const cur = c.feats.get(k);
  if (!cur || (included && !cur.included)) c.feats.set(k, { name: name.trim(), their: o.their || (cur ? cur.their : '') || '', category: o.category || (cur ? cur.category : '') || '', included });
  if (p && included) p.features.set(k, name.trim());
}

function readCompetitorFields(m: Model, c: CompM, get: (k: string) => string, sheet: string, row: number) {
  const tierRaw = get('tier');
  if (tierRaw) { const t = parseTier(tierRaw); if (t) c.tier = c.tier || t; else if (!parseLevel(tierRaw)) m.warnings.push(`${sheet} row ${row}: "${tierRaw}" is not a tier (use Tier 1, 2, 3 or Substitute).`); }
  const kind = parseKind(get('kind')); if (kind) c.kind = c.kind || kind;
  if (get('website')) c.website = c.website || get('website');
  if (get('positioning')) c.positioning = c.positioning || get('positioning');
  if (get('scopes')) addScopes(c, get('scopes'));
}

/** Files often start with a title and blank lines. The header is the first row (within the top 12) that has the most recognisable column names. */
function findHeader(rows: string[][]): number {
  const score = (r: string[]) => { const h = mapHeaders(r.map(str)); return Object.keys(h.col).length + h.prices.length + h.tierCols.length; };
  let best = 0; let bestScore = score(rows[0] || []);
  for (let i = 1; i < Math.min(rows.length, 12); i++) { const sc = score(rows[i]); if (sc > bestScore) { best = i; bestScore = sc; } }
  return best;
}

/** Read one table into the model. Returns what it was taken to be. */
function readTable(m: Model, t: Table): string {
  const skip = findHeader(t.rows);
  const preamble = t.rows.slice(0, skip);
  if (skip > 0) { t = { ...t, rows: t.rows.slice(skip), rowNumbers: t.rowNumbers.slice(skip) }; assume(m, `The column names were found on row ${t.rowNumbers[0]}; the lines above them were taken as a title.`); }
  const info: any = { name: t.name, rows: Math.max(0, t.rows.length - 1), used: 0, kind: 'unknown' };
  m.sheets.push(info);
  if (t.rows.length < 2) { info.kind = 'empty'; return 'empty'; }
  if (t.rows.length - 1 > MAX_ROWS) throw httpErr(422, `"${t.name}" has more than ${MAX_ROWS} rows. Split it into smaller files.`);
  const headers = t.rows[0].map(str);
  const hm = mapHeaders(headers);
  const body = t.rows.slice(1); const nums = t.rowNumbers.slice(1);
  const cell = (r: string[], i: number | undefined) => (i === undefined ? '' : str(r[i]));
  const sheetHint = canon(t.name);
  const hasPlan = hm.col.plan !== undefined || hm.prices.length > 0;

  // ---- tiers side by side (a tier's heading may sit over several columns, the rest left blank), optionally one module per row
  if (hm.col.competitor === undefined && hm.tierCols.length > 0) {
    info.kind = hm.col.scopes !== undefined ? 'modules and tiers' : 'tiers';
    const cols: { i: number; tier: string }[] = []; let cur: string | null = null;
    headers.forEach((h, i) => {
      const own = hm.tierCols.find((x) => x.i === i);
      if (own) { cur = own.tier; cols.push(own); } else if (!str(h) && cur) cols.push({ i, tier: cur }); else cur = null;
    });
    body.forEach((r, ri) => {
      const scope = cell(r, hm.col.scopes); let any = false;
      for (const tc of cols) {
        const name = cell(r, tc.i); if (!name) continue;
        const c = compOf(m, name, nums[ri]); c.tier = c.tier || tc.tier; if (scope) addScopes(c, scope); info.used++; any = true;
      }
      if (scope && !any) m.warnings.push(`${t.name} row ${nums[ri]}: the module "${scope}" has no competitors listed.`);
    });
    return info.kind;
  }

  // ---- features, as a long list (Competitor, Plan, Feature, Included) or a ticked grid (Feature, Plan 1, Plan 2 ...)
  if (hm.col.feature !== undefined && hm.prices.length === 0 && hm.col.features === undefined) {
    const gridCols = hm.unknown;
    const genericName = /^(features?|feature matrix|matrix|sheet ?\d*|plans?|comparison|data)$/.test(sheetHint);
    if (hm.col.competitor === undefined && !gridCols.length && hm.col.plan === undefined) { info.kind = 'features'; m.errors.push({ sheet: t.name, row: 1, message: 'This feature list has no Competitor column and no plan columns, so nobody can be credited with the features.' }); return 'features'; }
    const grid = gridCols.length > 0 && hm.col.plan === undefined && hm.col.included === undefined;
    info.kind = grid ? 'feature grid' : 'features';
    let lastComp = '';
    body.forEach((r, ri) => {
      const row = nums[ri];
      const feature = cell(r, hm.col.feature); if (!feature) return;
      let comp = cell(r, hm.col.competitor);
      if (!comp) comp = hm.col.competitor === undefined && !genericName ? t.name : lastComp;
      if (!comp) { m.errors.push({ sheet: t.name, row, message: `"${feature}" has no competitor. Add a Competitor column, or name the sheet after the competitor.` }); return; }
      lastComp = comp;
      const c = compOf(m, comp, row);
      const category = cell(r, hm.col.category); const their = cell(r, hm.col.their_name);
      if (grid) {
        for (const gi of gridCols) {
          const tk = tick(r[gi]); if (tk === null) continue;
          addFeature(c, planOf(c, '', headers[gi], null, row), feature, { included: tk, their, category });
        }
        info.used++;
        return;
      }
      const incl = hm.col.included !== undefined ? tick(r[hm.col.included]) : true;
      const planName = cell(r, hm.col.plan);
      const p = planName ? planOf(c, cell(r, hm.col.product), planName, parseSeat(cell(r, hm.col.seat_model)).model, row) : null;
      addFeature(c, p, feature, { included: incl !== false, their, category });
      if (!p && incl !== false) assume(m, 'Features listed without a plan are recorded for the competitor as "same as ours", not tied to any plan.');
      info.used++;
    });
    return info.kind;
  }

  // ---- plans (and competitor details on the same rows)
  if (hasPlan || (sheetHint.includes('plan') && hm.col.competitor !== undefined)) {
    info.kind = 'plans';
    let lastComp = ''; let lastProduct = ''; let filled = 0;
    // a file about one competitor has no Competitor column: the name comes from the box, else from the title line
    let fileComp = '';
    if (hm.col.competitor === undefined) {
      fileComp = m.hints.competitor || titleName(preamble);
      if (fileComp && !m.hints.competitor) assume(m, `The file has no Competitor column, so the competitor was taken to be "${fileComp}" from its title line. Type a name in the Competitor box to change it.`);
    }
    body.forEach((r, ri) => {
      const row = nums[ri];
      if (!r.some((x) => str(x) !== '')) return;
      let compName = cell(r, hm.col.competitor);
      if (!compName && hm.col.competitor === undefined && fileComp) compName = fileComp;
      else if (!compName) {
        if (!lastComp) { m.errors.push({ sheet: t.name, row, message: 'No competitor on this row, and none above it. If the whole file is about one competitor, type its name in the Competitor box.' }); return; }
        compName = lastComp; filled++;
      } else if (nkey(compName) !== nkey(lastComp)) lastProduct = '';
      lastComp = compName;
      const get = (k: string) => cell(r, hm.col[k]);
      const c = compOf(m, compName, row);
      readCompetitorFields(m, c, get, t.name, row);
      if (!c.tier && m.hints.tier) c.tier = m.hints.tier;
      if (m.hints.scope) addScopes(c, m.hints.scope);
      const rawProduct = get('product'); const product = rawProduct ? cleanProduct(rawProduct) : lastProduct; if (rawProduct) lastProduct = product;

      const terms: { period: string; mo: Money; tax: string | null }[] = [];
      const billing = get('period');
      const rowPeriod = billing ? periodOf(canon(billing)) : null;
      const billingUnknown = /^(not specified|unspecified|unknown|not stated|n\/?a|tbd|-|—|–)$/i.test(billing);
      const named = splitTerm(get('plan'));
      for (const pc of hm.prices) {
        const rawPrice = str(r[pc.i]);
        const mo = parseMoney(r[pc.i]);
        if (!mo) { if (rawPrice) m.warnings.push(`${t.name} row ${row}: "${rawPrice}" is not a price, so it was left out.`); continue; }
        let period = pc.period || mo.period || named.period || rowPeriod;
        if (!period) {
          if (billingUnknown && mo.amount !== null) { m.warnings.push(`${t.name} row ${row}: ${named.name || 'this plan'} is priced ${rawPrice}, but the billing is not stated, so the price was not saved. Write Monthly, Yearly or One time in the billing column and import again.`); continue; }
          assume(m, 'A price with no billing period given was taken as per month.'); period = 'month';
        }
        terms.push({ period, mo, tax: pc.tax });
      }
      const planName = named.name || (terms.length ? 'Default plan' : '');
      if (!planName) { info.used++; return; }
      let seat = parseSeat(get('seat_model'));
      const mu = get('max_users');
      if (mu) {
        if (/unlimited/i.test(mu)) seat = { model: !seat.model || seat.model === 'multi_user' ? 'unlimited_users' : seat.model, max: null };
        else if (/^\d+$/.test(mu)) { const nn = Number(mu); seat = { model: seat.model || (nn === 1 ? 'single_user' : 'multi_user'), max: nn > 1 ? nn : seat.max }; }
        else { const x = parseSeat(`${mu} users`); if (x.model && !seat.model) seat = x; }
      }
      if (terms.some((x) => x.mo.per_user) && !seat.model) seat = { model: 'per_user', max: null };
      const p = planOf(c, product, planName, seat.model, row);
      if (seat.max && !p.max_users) p.max_users = seat.max;

      const lvlRaw = get('plan_level') || (parseTier(get('tier')) ? '' : get('tier'));
      const level = parseLevel(lvlRaw);
      if (lvlRaw && !level) m.warnings.push(`${t.name} row ${row}: "${lvlRaw}" is not a plan level (Free, Entry, Mid, Top or Enterprise). It was worked out from the plan name instead.`);
      if (level) p.level = p.level || level;

      for (const tm of terms) {
        let cur = tm.mo.currency || parseCurrency(get('currency'));
        if (!cur) { assume(m, 'A price with no currency given was taken as rupees (INR).'); cur = 'INR'; }
        const taxGiven = parseTax(get('tax')) || tm.tax;
        const tax = taxGiven || (cur === 'INR' ? 'incl_gst' : 'excl_gst');
        if (!taxGiven && tm.mo.amount) assume(m, 'Prices with no GST column: rupee prices were taken as including GST, other currencies as excluding it.');
        const old = p.terms.get(tm.period);
        if (old) { if (old.amount !== tm.mo.amount) m.warnings.push(`${t.name} row ${row}: ${planName} has two different ${tm.period} prices. The first one was kept.`); continue; }
        p.terms.set(tm.period, { period: tm.period, amount: tm.mo.amount, currency: cur, tax, quote: tm.mo.quote });
      }
      if (!p.level) {
        const firstAmt = [...p.terms.values()].find((x) => x.amount !== null);
        const g = guessLevel(planName, [...p.terms.values()].some((x) => x.quote), firstAmt ? firstAmt.amount : null);
        if (g) { p.level = g; p.level_guessed = true; }
      }
      if (get('features')) for (const f of splitFeatures(get('features'))) addFeature(c, p, f, { included: true });
      info.used++;
    });
    if (filled) assume(m, 'A blank Competitor cell was filled from the row above (merged cells).', filled);
    return 'plans';
  }

  // ---- just a list of competitors
  if (hm.col.competitor !== undefined) {
    info.kind = 'competitors';
    body.forEach((r, ri) => {
      const name = cell(r, hm.col.competitor); if (!name) return;
      const c = compOf(m, name, nums[ri]);
      readCompetitorFields(m, c, (k) => cell(r, hm.col[k]), t.name, nums[ri]); info.used++;
    });
    return 'competitors';
  }
  info.kind = 'unknown';
  m.warnings.push(`Sheet "${t.name}" was skipped: it has no column named Competitor (or Company) and no plan or price columns.`);
  return 'unknown';
}

/**
 * A features sheet does not know how many users a plan covers, so its plan has no licence and no price. When the same competitor
 * has a priced plan of that name elsewhere in the file, the features belong to that plan (to every licence variant of it).
 */
function mergeSeatless(m: Model) {
  for (const c of m.comps.values()) {
    for (const [k, p] of [...c.plans]) {
      if (p.seat_model || p.terms.size) continue;
      const targets = [...c.plans.values()].filter((x) => x !== p && x.terms.size && nkey(x.plan) === nkey(p.plan) && (!p.product || nkey(x.product) === nkey(p.product)));
      if (!targets.length) continue;
      for (const t of targets) { for (const [fk, fn] of p.features) t.features.set(fk, fn); t.rows.push(...p.rows); }
      c.plans.delete(k);
    }
  }
}

export function modelFromTables(tables: Table[], hints: Hints = {}): Model {
  const m = newModel(hints);
  for (const t of tables) readTable(m, t);
  mergeSeatless(m);
  return m;
}

/** Rows typed in the browser (objects whose keys are column names) take the same road as a file. */
export function modelFromRows(rows: Record<string, any>[]): Model {
  if (!Array.isArray(rows) || !rows.length) throw httpErr(422, 'Give at least one row.');
  if (rows.length > MAX_ROWS) throw httpErr(422, `At most ${MAX_ROWS} rows at a time.`);
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r || {})))];
  return modelFromTables([{ name: 'Typed in', rows: [headers, ...rows.map((r) => headers.map((h) => str(r && r[h])))], rowNumbers: [1, ...rows.map((_, i) => i + 2)] }]);
}

// ------------------------------------------------------------------ applying (or just checking) the model
const PERIOD_LABEL: Record<string, string> = { month: 'monthly', quarter: 'quarterly', year: 'yearly', one_time: 'one time' };

function apply(store, model: Model, o: { commit: boolean; overwrite: boolean; actor?: string; createFeatures: boolean }) {
  const today = store.today();
  let virt = 0;
  const create = (type: string, fields: any) => (o.commit ? store.create(type, fields, { actor: o.actor }) : { id: `new-${++virt}`, type, ...fields });
  const link = (type: string, a: string, b: string) => { if (o.commit) store.link(type, a, b, {}, { actor: o.actor }); };
  const patch = (id: string, fields: any) => { if (o.commit) store.update(id, fields, { actor: o.actor }); };
  const res: any = { competitors: { created: 0, existing: 0, updated: 0 }, product_lines: { created: 0, existing: 0 }, plans: { created: 0, existing: 0 }, prices: { created: 0, existing: 0 }, features: { catalog_created: 0, catalog_existing: 0, ratings_created: 0, plan_links: 0 }, plan_rows: [] as any[], new_catalog_features: [] as string[] };

  // our feature list, matched ignoring case, spaces and punctuation, and by every alias
  const capIdx = new Map<string, any>();
  for (const cap of store.list('Capability', (c) => c.status !== 'Retired')) for (const n of [cap.title, ...(Array.isArray(cap.aliases) ? cap.aliases : [])]) { const k = nkey(n); if (k && !capIdx.has(k)) capIdx.set(k, cap); }
  const seenCaps = new Set<string>();
  const capFor = (name: string, category: string) => {
    const k = nkey(name);
    let cap = capIdx.get(k);
    if (cap) { if (!seenCaps.has(k)) { seenCaps.add(k); res.features.catalog_existing++; } return cap; }
    if (!o.createFeatures) return null;
    cap = create('Capability', { title: name, status: 'Active', ...(category ? { category } : {}) });
    capIdx.set(k, cap); seenCaps.add(k); res.features.catalog_created++; res.new_catalog_features.push(name);
    return cap;
  };

  const existing = new Map<string, any>(liveCompetitors(store).map((c) => [nkey(c.title), c]));
  const featIdx = catalogIndex(store);
  for (const [ck, cm] of model.comps) {
    let comp = existing.get(ck);
    if (comp) {
      res.competitors.existing++;
      const fix: any = {};
      for (const k of ['tier', 'kind', 'website', 'positioning']) { const v = (cm as any)[k]; if (v && v !== comp[k] && (o.overwrite || !comp[k])) fix[k] = v; }
      const have: string[] = Array.isArray(comp.scopes) ? comp.scopes : [];
      const merged = [...have]; for (const s of cm.scopes) if (!merged.some((x) => scopeKey(x) === scopeKey(s))) merged.push(s);
      if (merged.length !== have.length) fix.scopes = merged;
      if (Object.keys(fix).length) { patch(comp.id, fix); res.competitors.updated++; }
    } else {
      const fields: any = { title: cm.name, kind: cm.kind || 'direct' };
      for (const k of ['tier', 'website', 'positioning']) if ((cm as any)[k]) fields[k] = (cm as any)[k];
      if (cm.scopes.length) fields.scopes = cm.scopes;
      comp = create('Competitor', fields); res.competitors.created++; existing.set(ck, comp);
    }
    const own = store.get(comp.id) ? cellsOf(store, comp) : [];
    const lines = new Map<string, any>(own.filter((x) => x.type === 'CompetitorProductLine' && x.status !== 'Retired').map((x) => [nkey(x.product_name), x]));
    const lineFor = (product: string) => {
      if (!product.trim()) return null;
      const k = nkey(product);
      let l = lines.get(k);
      if (l) { res.product_lines.existing++; return l; }
      l = create('CompetitorProductLine', { title: `${comp.title} ${product.trim()}`, product_name: product.trim(), product_type: 'saas' });
      link('contains', comp.id, l.id); lines.set(k, l); res.product_lines.created++;
      return l;
    };
    // the competitor's current ratings, by the feature they stand for
    const ratings = new Map<string, any>();
    for (const r of own.filter((x) => x.type === 'CompetitorCapability' && x.status !== 'Retired')) ratings.set(featureKey(store, r, featIdx).key, r);
    const ratingFor = (name: string, their: string, category: string, parent: any, level: string) => {
      const cap = capFor(name, category);
      const key = cap ? cap.id : `r:${name.trim().toLowerCase()}`;
      let r = ratings.get(key);
      if (!r) {
        r = create('CompetitorCapability', { title: `${comp.title}: ${name}`, capability_tag: their || name, level, importance: 3, captured_on: today });
        link('contains', (parent || comp).id, r.id);
        if (cap) link('maps_to', r.id, cap.id);
        ratings.set(key, r); res.features.ratings_created++;
      }
      return r;
    };

    const linked = new Set<string>();
    for (const pm of cm.plans.values()) {
      const line = lineFor(pm.product);
      const parent = line || comp;
      const prices = own.filter((x) => x.type === 'PricePoint' && x.status !== 'Retired' && nkey(x.plan) === nkey(pm.plan) && (!pm.seat_model || (x.seat_model || '') === pm.seat_model) && (!pm.product || ((lineOf(store, x) || { id: '' }).id) === (line && store.get(line.id) ? line.id : '')));
      const priceIds: string[] = prices.map((x) => x.id);
      let madeAny = false;
      for (const tm of pm.terms.values()) {
        const dup = prices.find((x) => (x.billing_model === 'one_time' ? 'one_time' : (x.billing_period || 'month')) === tm.period);
        if (dup) { res.prices.existing++; if (!dup.tier_tag && pm.level) patch(dup.id, { tier_tag: pm.level }); continue; }
        const perUser = pm.seat_model === 'per_user';
        const fields: any = {
          title: `${comp.title} ${pm.plan}${pm.product ? ` (${pm.product})` : ''} ${PERIOD_LABEL[tm.period] || tm.period}`,
          plan: pm.plan, amount: tm.amount === null ? 0 : tm.amount, currency: tm.currency, price_type: tm.quote ? 'quote' : 'list', tax_basis: tm.tax,
          billing_model: tm.period === 'one_time' ? 'one_time' : 'subscription', billing_period: tm.period,
          value_metric: perUser ? 'user' : 'plan', unit: tm.period === 'one_time' ? (perUser ? 'user' : 'once') : `${perUser ? 'user' : 'plan'}/${tm.period}`,
          captured_on: today, observed_basis: 'published',
        };
        if (pm.level) fields.tier_tag = pm.level;
        if (pm.seat_model) fields.seat_model = pm.seat_model;
        if (pm.max_users) fields.max_users = pm.max_users;
        const pp = create('PricePoint', fields);
        link('contains', parent.id, pp.id); priceIds.push(pp.id); res.prices.created++; madeAny = true;
      }
      if (prices.length) res.plans.existing++; else if (madeAny) res.plans.created++;
      // features of a plan that exists (or was just made): an unrated row mapped to our list, ticked on every term of the plan
      if (priceIds.length) {
        for (const [fk, fname] of pm.features) {
          const f = cm.feats.get(fk);
          const r = ratingFor(fname, f ? f.their : '', f ? f.category : '', parent, 'unknown');
          for (const pid of priceIds) {
            const have = store.get(pid) ? store.out(pid, 'includes_capability').some((l) => l.target === r.id) : false;
            if (!have) { link('includes_capability', pid, r.id); res.features.plan_links++; }
          }
          linked.add(fk);
        }
      }
      res.plan_rows.push({
        competitor: cm.name, product: pm.product || null, plan: pm.plan, level: pm.level, level_guessed: pm.level_guessed, seat_model: pm.seat_model, max_users: pm.max_users,
        terms: [...pm.terms.values()].map((x) => ({ period: x.period, amount: x.amount, currency: x.currency, quote: x.quote })), features: pm.features.size,
        state: prices.length && !madeAny ? 'already there' : prices.length ? 'prices added' : madeAny ? 'new' : 'no price',
      });
    }
    // features given for the competitor as a whole (not tied to a plan that could be saved), or said to be absent
    for (const [fk, f] of cm.feats) {
      if (f.included && linked.has(fk)) continue;
      const cap = capIdx.get(nkey(f.name));
      if (ratings.has(cap ? cap.id : `r:${f.name.toLowerCase()}`)) continue;
      ratingFor(f.name, f.their, f.category, null, f.included ? 'parity' : 'absent');
    }
  }
  return res;
}

function summarise(model: Model, res: any, filename: string) {
  const noPrice = res.plan_rows.filter((p) => p.state === 'no price');
  const fresh = res.plan_rows.filter((p) => p.state !== 'already there');
  const unlevelled = fresh.filter((p) => !p.level);
  const guessed = fresh.filter((p) => p.level_guessed);
  const warnings = [...model.warnings];
  const s = (n: number, one: string, many: string) => (n === 1 ? one : many);
  if (noPrice.length) warnings.push(`${noPrice.length} ${s(noPrice.length, 'plan has', 'plans have')} no price at all, so ${s(noPrice.length, 'it is', 'they are')} not saved (${noPrice.slice(0, 6).map((p) => p.plan).join(', ')}${noPrice.length > 6 ? ', …' : ''}). A plan is saved together with its price; write "Contact sales" for a plan that has no public price.`);
  if (unlevelled.length) warnings.push(`${unlevelled.length} ${s(unlevelled.length, 'plan has', 'plans have')} no level and none could be worked out from the name. Give ${s(unlevelled.length, 'it', 'them')} a level (Free, Entry, Mid, Top, Enterprise) on the competitor page, so ${s(unlevelled.length, 'it takes', 'they take')} part in level comparisons.`);
  if (guessed.length) warnings.push(`${guessed.length} plan ${s(guessed.length, 'level was', 'levels were')} guessed from the plan name. Please check the Level column below.`);
  return {
    file: filename, sheets: model.sheets, ...res, plan_rows: res.plan_rows.slice(0, 300), plan_rows_total: res.plan_rows.length,
    assumptions: [...model.assumptions.entries()].map(([text, n]) => (n > 1 ? `${text} (${n} times)` : text)),
    warnings, errors: model.errors.slice(0, 100), error_count: model.errors.length,
    competitor_names: [...model.comps.values()].map((c) => ({ name: c.name, tier: c.tier || null, plans: c.plans.size, scopes: c.scopes })).slice(0, 300),
  };
}

/** Check (commit false) or save (commit true) what a file or a set of typed rows holds. */
export function importCompetitors(store, source: { filename?: string; buffer?: Buffer; rows?: Record<string, any>[] }, opts: { commit: boolean; overwrite?: boolean; createFeatures?: boolean; actor?: string; competitor?: string; tier?: string; scope?: string }) {
  const hints: Hints = { competitor: str(opts.competitor).replace(/\s+/g, ' ') || undefined, tier: opts.tier ? parseTier(opts.tier) : null, scope: str(opts.scope).replace(/\s+/g, ' ') || undefined };
  if (opts.tier && !hints.tier) throw httpErr(422, `"${opts.tier}" is not a tier. Use Tier 1, Tier 2, Tier 3 or Substitute.`);
  const model = source.rows ? modelFromRows(source.rows) : modelFromTables(readTables(source.filename || 'file.csv', source.buffer as Buffer), hints);
  if (!model.comps.size) throw httpErr(422, model.errors.length ? model.errors[0].message : 'Nothing to import: no competitor names were found. The first row must hold the column names, and one column must be called Competitor (or Company), or the columns must be called Tier 1, Tier 2, Tier 3.');
  const res = apply(store, model, { commit: !!opts.commit, overwrite: !!opts.overwrite, actor: opts.actor, createFeatures: opts.createFeatures !== false });
  const out: any = { committed: !!opts.commit, ...summarise(model, res, source.filename || 'typed rows') };
  if (opts.commit) store.audit('competitors.import', null, `${opts.actor || 'someone'} imported ${source.filename || 'typed rows'}: ${res.competitors.created} new competitors, ${res.prices.created} prices, ${res.features.plan_links} plan features`, { actor: opts.actor });
  return out;
}

// ------------------------------------------------------------------ files to start from
const q = (s: string) => (/[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const csv = (rows: string[][]) => rows.map((r) => r.map(q).join(',')).join('\r\n') + '\r\n';
export function template(kind: string): { filename: string; body: string } {
  if (kind === 'tiers') return { filename: 'competitor-tiers-template.csv', body: csv([['Tier 1', 'Tier 2', 'Tier 3', 'Substitute'], ['Zoho Books', 'Marg ERP', 'Khatabook', 'Excel sheets'], ['Tally Prime', 'Busy', 'Vyapar', 'Pen and paper'], ['', 'Gofrugal', '', '']]) };
  if (kind === 'features') return { filename: 'plan-features-template.csv', body: csv([['Competitor', 'Feature', 'Free', 'Standard', 'Premium'], ['Zoho Books', 'GST invoicing', 'yes', 'yes', 'yes'], ['Zoho Books', 'E-way bill', '', 'yes', 'yes'], ['Zoho Books', 'Multi-branch', '', '', 'yes'], ['Zoho Books', 'Email support', 'yes', 'yes', 'yes']]) };
  return {
    filename: 'competitor-plans-template.csv',
    body: csv([
      ['Competitor', 'Tier', 'Website', 'Module', 'Product', 'Plan', 'Level', 'Licence', 'Max users', 'Monthly price', 'Yearly price', 'Lifetime price', 'Currency', 'GST included', 'Features'],
      ['Zoho Books', 'Tier 1', 'zoho.com/books', 'Accounting', '', 'Free', 'free', 'multi user', '1', '0', '0', '', 'INR', '', 'Invoicing; Expense tracking'],
      ['Zoho Books', '', '', '', '', 'Standard', 'entry', 'multi user', '3', '749', '7188', '', 'INR', 'no', 'Invoicing; Expense tracking; GST filing; Email support'],
      ['Zoho Books', '', '', '', '', 'Professional', 'mid', 'multi user', '5', '1999', '19188', '', 'INR', 'no', 'Invoicing; GST filing; Inventory; Purchase orders'],
      ['Zoho Books', '', '', '', '', 'Enterprise', 'enterprise', '', '', 'Contact sales', '', '', 'INR', '', 'Everything in Professional; Custom roles'],
      ['Tally Prime', 'Tier 1', 'tallysolutions.com', 'Accounting', '', 'Silver', 'entry', 'single user', '1', '', '', '22500', 'INR', 'no', 'Accounting; GST returns; Inventory'],
      ['Tally Prime', '', '', '', '', 'Gold', 'mid', 'multi user', '', '', '', '67500', 'INR', 'no', 'Accounting; GST returns; Inventory; Unlimited users'],
    ]),
  };
}

// ------------------------------------------------------------------ plans out, in the same layout the importer reads
const SEAT_WORD: Record<string, string> = { single_user: 'single user', multi_user: 'multi user', per_user: 'per user', unlimited_users: 'unlimited' };
const TIER_WORD: Record<string, string> = { T1: 'Tier 1', T2: 'Tier 2', T3: 'Tier 3', S: 'Substitute' };
export const EXPORT_HEADERS = ['Competitor', 'Tier', 'Module', 'Product', 'Plan', 'Level', 'Licence', 'Max users', 'Monthly price', 'Quarterly price', 'Yearly price', 'Lifetime price', 'Currency', 'GST included', 'Features'];

/**
 * The plans of one competitor (or of everyone in scope) as a CSV that can be imported again unchanged:
 * one row per plan, one price column per billing period, the features of the plan in the last column.
 */
export function exportPlans(store, o: { id?: string; scope?: string } = {}): { filename: string; body: string } {
  const idx = catalogIndex(store);
  const comps = o.id ? liveCompetitors(store).filter((c) => c.id === o.id) : liveCompetitors(store, o.scope);
  if (o.id && !comps.length) throw httpErr(404, `No competitor ${o.id}`);
  const rows: string[][] = [EXPORT_HEADERS];
  for (const c of comps) {
    const own = cellsOf(store, c);
    const base = [c.title, TIER_WORD[c.tier] || '', (Array.isArray(c.scopes) ? c.scopes : []).join(', ')];
    const plans = new Map<string, { product: string; plan: string; level: string; seat: string; max: string; terms: Map<string, any>; feats: Set<string> }>();
    for (const p of own.filter((x) => x.type === 'PricePoint' && x.status !== 'Retired')) {
      const product = (lineOf(store, p) || ({} as any)).product_name || '';
      const plan = String(p.plan || p.title || '');
      const key = [nkey(product), nkey(plan), p.seat_model || ''].join('|');
      let g = plans.get(key);
      if (!g) { g = { product, plan, level: p.tier_tag || '', seat: SEAT_WORD[p.seat_model] || '', max: p.max_users ? String(p.max_users) : '', terms: new Map(), feats: new Set() }; plans.set(key, g); }
      const period = p.billing_model === 'one_time' ? 'one_time' : p.billing_period || 'month';
      if (!g.terms.has(period)) g.terms.set(period, p);
      for (const l of store.out(p.id, 'includes_capability')) { const r = store.get(l.target); if (r && r.status !== 'Retired') g.feats.add(featureKey(store, r, idx).name); }
    }
    if (!plans.size) { rows.push([...base, '', '', '', '', '', '', '', '', '', '', '', '', '', '']); continue; }
    for (const g of plans.values()) {
      const price = (period: string) => { const t = g.terms.get(period); return !t ? '' : t.price_type === 'quote' ? 'Contact sales' : String(t.amount); };
      const first = [...g.terms.values()][0];
      rows.push([...base, g.product, g.plan, g.level, g.seat, g.max, price('month'), price('quarter'), price('year'), price('one_time'), first ? first.currency || '' : '', first ? (first.tax_basis === 'incl_gst' ? 'yes' : first.tax_basis === 'excl_gst' ? 'no' : '') : '', [...g.feats].join('; ')]);
    }
  }
  const name = o.id && comps[0] ? String(comps[0].title).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') : 'competitor';
  return { filename: `${name || 'competitor'}-plans.csv`, body: '﻿' + csv(rows) };
}
