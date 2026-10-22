/**
 * engine/suggest.ts - DRAFT candidates from extracted document text. Nothing here writes to the store.
 *
 *   suggest(extraction, {competitors?}) -> { candidates: [ { id, kind, confidence, confidence_level, reasons[], assumptions[], location, snippet, fields, competitor_hint } ], warnings }
 *
 * kinds: "price_point" (fields for a PricePoint: plan, amount, currency, unit, value_metric, price_type, billing_model, billing_period, tax_basis, notes...)
 *        "competitor_field" (one profile field: website, founded_year, headcount_note + size_band, funding_summary, hq_country, certifications, key_customers).
 * Every candidate carries the exact source snippet and a location (slide / sheet cell / page or section). The caller must POST an
 * explicit accept to create anything (see attachments.js). Heuristics only: confidence is a guide, not a probability.
 */
import { colLetters } from './extract_office';

const CUR = [
  [/^(?:rs\.?|inr|₹|rupees?)$/i, 'INR', 'Rs'], [/^(?:usd|us\$|\$)$/i, 'USD', '$'], [/^(?:eur|€|euros?)$/i, 'EUR', 'EUR'], [/^(?:gbp|£)$/i, 'GBP', 'GBP'],
  [/^(?:aud|a\$)$/i, 'AUD', 'AUD'], [/^(?:sgd|s\$)$/i, 'SGD', 'SGD'], [/^(?:aed)$/i, 'AED', 'AED'],
];
const CUR_PAT = '(?:Rs\\.?|INR|₹|USD|US\\$|\\$|EUR|€|GBP|£|AUD|SGD|AED)';
const NUM_PAT = '\\d{1,3}(?:,\\d{2,3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?';
const SCALE = '(?!\\s*(?:million|billion|trillion|bn\\b|mn\\b|crores?|lakhs?|lacs?\\b|thousand|[MBK]\\b))'; // "$12 million" is a funding figure, not a price
const MONEY_BEFORE = new RegExp(`(${CUR_PAT})\\s*(${NUM_PAT})(?!\\d)${SCALE}`, 'gi');
const MONEY_AFTER = new RegExp(`(?<![\\w.,])(${NUM_PAT})\\s*(Rs\\.?|INR|₹|USD|EUR|GBP)(?![A-Za-z])`, 'gi');

const normCurrency = (s) => { const t = String(s).trim(); for (const [re, iso, shown] of CUR) if ((re as any).test(t)) return { iso, shown: t || shown }; return null; };
const num = (s) => Number(String(s).replace(/,/g, ''));
const clip = (s, n = 220) => { s = String(s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 3) + '...' : s; };
const level = (c) => (c >= 0.75 ? 'high' : c >= 0.55 ? 'medium' : 'low');

/** Billing/unit/price-type/tax vocabulary read from a context string. */
function readContext(ctx, header = '') {
  const t = `${ctx} ${header}`.toLowerCase();
  const out: any = { assumptions: [], reasons: [] };
  // price type
  out.price_type = /\bmrp\b|maximum retail/.test(t) ? 'mrp' : /street price|market price|retail price|selling price/.test(t) ? 'street' : /dealer|trade price/.test(t) ? 'dealer' : /distributor/.test(t) ? 'distributor' : /\boem\b/.test(t) ? 'oem' : /\bquote|quotation/.test(t) ? 'quote' : /tender|l1 price|award/.test(t) ? 'tender_award' : /promo|offer|discount|sale price/.test(t) ? 'promo' : 'list';
  if (out.price_type === 'list' && !/list price|price list|pricing|plan|tier/.test(t)) out.assumptions.push('price_type assumed "list": the document does not say MRP, street, dealer or quote');
  // tax
  if (/(incl(?:uding|usive|\.)?\s*(?:of\s*)?(?:gst|tax|vat)|inc\.?\s*gst|with gst|gst included|tax included)/.test(t)) out.tax_basis = 'incl_gst';
  else if (/(excl(?:uding|usive|\.)?\s*(?:of\s*)?(?:gst|tax|vat)|ex-?\s*gst|\+\s*gst|plus gst|gst extra|gst excluded|before tax|\+\s*taxes)/.test(t)) out.tax_basis = 'excl_gst';
  else { out.tax_basis = 'excl_gst'; out.assumptions.push('tax_basis assumed "excl_gst": GST treatment is not stated'); }
  // unit and metric
  let unit = null;
  const per = /(?:per|\/|a|each)\s*(gb|tb|mb|user|seat|device|unit|meter|gateway|piece|licen[cs]e|site|project|hour|transaction|request)s?\b/.exec(t);
  const vol = /\b(\d+(?:\.\d+)?)?\s*(gb|tb|mb)\b/.exec(t);
  if (per) unit = per[1]; else if (/\bgb\b/.test(t) && /storage|egress|bandwidth|transfer|data/.test(t)) unit = 'gb';
  if (unit) out.unit = unit.toUpperCase() === unit ? unit : ['gb', 'tb', 'mb'].includes(unit) ? unit.toUpperCase() : unit;
  if (['gb', 'tb', 'mb'].includes(unit)) out.value_metric = /storage/.test(t) ? 'storage' : /egress|bandwidth|transfer|delivery|traffic/.test(t) ? 'egress' : /request/.test(t) ? 'requests' : 'egress';
  else if (['user', 'seat', 'licence', 'license'].includes(unit)) out.value_metric = 'user';
  else if (['device', 'meter', 'gateway', 'piece'].includes(unit)) out.value_metric = 'device';
  else if (unit === 'unit') out.value_metric = 'unit';
  else if (unit === 'transaction') out.value_metric = 'transaction';
  else if (unit === 'hour') out.value_metric = 'hour';
  else if (unit === 'project' || unit === 'site') out.value_metric = 'project';
  else if (unit === 'request') out.value_metric = 'requests';
  // period / billing model
  if (/per\s*year|\/\s*(?:yr|year)|annual|yearly|per annum|billed annually/.test(t)) out.billing_period = 'year';
  else if (/per\s*month|\/\s*(?:mo|month)|monthly|billed monthly|pm\b/.test(t)) out.billing_period = 'month';
  else if (/per\s*quarter|quarterly/.test(t)) out.billing_period = 'quarter';
  if (/one[- ]?time|upfront|outright|purchase price|\bmrp\b/.test(t) && !out.billing_period) { out.billing_model = 'one_time'; out.billing_period = 'one_time'; } else if (/\blease|rental\b/.test(t)) out.billing_model = 'lease';
  else if (['gb', 'tb', 'mb'].includes(unit) || /pay[- ]as[- ]you[- ]go|usage|metered/.test(t)) out.billing_model = out.billing_period === 'year' && !['gb', 'tb', 'mb'].includes(unit) ? 'subscription' : 'usage';
  else if (out.billing_period) out.billing_model = 'subscription';
  else if (['device', 'unit', 'meter', 'gateway', 'piece'].includes(unit)) { out.billing_model = 'one_time'; out.billing_period = 'one_time'; out.assumptions.push('billing_model assumed "one_time" for a per-unit price with no period'); } else { out.billing_model = 'subscription'; out.assumptions.push('billing_model assumed "subscription": no period or usage unit is stated'); }
  // a one-time purchase price with no per-unit wording (a meter, a gateway, a box) is a price per unit sold, never per "plan"
  if (!out.unit && out.billing_model === 'one_time') { out.unit = 'unit'; if (!out.value_metric) out.value_metric = 'unit'; out.assumptions.push('unit assumed "unit": a one-time purchase price for one item'); }
  if (!out.value_metric) { out.value_metric = 'other'; out.assumptions.push('value_metric is "other": no usage unit (GB, user, device...) was found next to the price'); }
  if (!out.unit) { out.unit = out.billing_period && out.billing_period !== 'one_time' ? out.billing_period : 'plan'; out.assumptions.push(`unit assumed "${out.unit}"`); } else if (out.billing_period === 'month' && !['gb', 'tb', 'mb'].includes(unit)) out.unit = `${out.unit}/month`;
  else if (out.billing_period === 'year' && !['gb', 'tb', 'mb'].includes(unit)) out.unit = `${out.unit}/year`;
  if (vol && vol[1] && /includ|up to|free|first/.test(t)) out.included = `${vol[1]} ${vol[2].toUpperCase()}`;
  return out;
}

/** A plan name as a person would write it: no JSON quotes, field names, trailing commas or colons. */
function cleanPlan(s) {
  let t = String(s || '').trim();
  t = t.replace(/^["']?(?:name|plan|title)["']?\s*:\s*/i, '').replace(/^[\s"'`|]+|[\s"'`|,;:]+$/g, '').replace(/\s+/g, ' ');
  // words that belong to the sentence around a price, not to the plan name ("the Pro plan costs Rs 2,999" -> "Pro plan")
  for (let i = 0; i < 4; i++) { const before = t; t = t.replace(/\s+(?:costs?|now|is|are|was|at|from|only|just|starts?|starting|priced|prices?|for|to|of|and|rs|inr)$/i, '').replace(/^(?:the|our|a|an)\s+/i, ''); if (t === before) break; }
  return t;
}
/** Plan name for comparing two prices of the same thing: lower case, without filler words. */
function planKey(s) {
  const t = String(s || '').toLowerCase().replace(/\b(plan|tier|edition|pack|package|price|meter|gateway|unit|model)\b/g, ' ').replace(/[^a-z0-9]+/g, '');
  return t || String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function priceCandidate(parts) {
  parts = { ...parts, plan: parts.plan ? cleanPlan(parts.plan) : parts.plan };
  const ctx: any = readContext(parts.context, parts.header || '');
  const fields = {
    ...(parts.plan ? { plan: parts.plan } : {}), amount: parts.amount, currency: parts.currency.iso, unit: ctx.unit, value_metric: ctx.value_metric, price_type: ctx.price_type, billing_model: ctx.billing_model,
    ...(ctx.billing_period ? { billing_period: ctx.billing_period } : {}), tax_basis: ctx.tax_basis, ...(ctx.included ? { included: ctx.included } : {}),
  };
  let conf = 0.45;
  const reasons = [];
  if (parts.table) { conf += 0.15; reasons.push('found in a table with a price column'); }
  if (parts.currency.explicit) { conf += 0.1; reasons.push(`currency written as "${parts.currency.shown}"`); }
  if (parts.plan) { conf += 0.1; reasons.push(`plan name "${parts.plan}" found next to the price`); }
  if (ctx.unit && ctx.assumptions.every((a) => !/^unit/.test(a))) { conf += 0.1; reasons.push('a unit was read next to the price'); }
  if (ctx.billing_period) { conf += 0.05; reasons.push(`billing period "${ctx.billing_period}" read`); }
  conf -= 0.06 * ctx.assumptions.length;
  conf = Math.max(0.1, Math.min(0.95, conf));
  return { kind: 'price_point', confidence: Math.round(conf * 100) / 100, confidence_level: level(conf), reasons, assumptions: ctx.assumptions, location: parts.location, locator: parts.locator || null, quote: parts.quote ? clip(parts.quote, 500) : null, snippet: clip(parts.snippet), fields, currency_as_written: parts.currency.shown };
}

// ------------------------------------------------------------------ prices from tables
const PRICE_HDR = /price|cost|fee|rate|mrp|amount|charge|rs\b|inr|₹|\$|usd|eur|per month|monthly|annual|yearly|street|dealer/i;
const PLAN_HDR = /plan|tier|package|name|product|model|sku|edition|offering|item|description|service/i;

function tableCandidates(table, loc, out) {
  const rows = table.rows;
  if (!rows || rows.length < 2) return;
  const header = rows[0].map((h) => String(h || ''));
  const isPriceCol = (j) => PRICE_HDR.test(header[j]) || rows.slice(1).filter((r) => new RegExp(CUR_PAT, 'i').test(String(r[j] || '')) && /\d/.test(String(r[j]))).length >= Math.max(1, Math.ceil((rows.length - 1) * 0.6));
  const priceCols = header.map((_, j) => j).filter(isPriceCol).filter((j) => rows.slice(1).some((r) => /\d/.test(String(r[j] || ''))));
  if (!priceCols.length) return;
  let planCol = header.findIndex((h, j) => PLAN_HDR.test(h) && !priceCols.includes(j));
  if (planCol < 0) planCol = priceCols.includes(0) ? -1 : 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i].map((c) => String(c === undefined || c === null ? '' : c));
    for (const j of priceCols) {
      const cell = r[j];
      if (!cell || !/\d/.test(cell)) continue;
      if (/\d\s*[-–]\s*\d/.test(cell.replace(/,/g, '')) && !/^\s*[A-Za-z$₹€£]/.test(cell)) { out.warnings.push(`${loc.label}: price range "${clip(cell, 40)}" skipped (a single price is needed)`); continue; }
      let cur = null; let amount = null; let explicit = false;
      let m = new RegExp(`(${CUR_PAT})\\s*(${NUM_PAT})`, 'i').exec(cell);
      if (m) { cur = normCurrency(m[1]); amount = num(m[2]); explicit = true; } else if ((m = new RegExp(`(${NUM_PAT})\\s*(${CUR_PAT})`, 'i').exec(cell))) { cur = normCurrency(m[2]); amount = num(m[1]); explicit = true; } else {
        const mh = new RegExp(CUR_PAT, 'i').exec(header[j]); const mn = new RegExp(`^\\s*(${NUM_PAT})\\s*(?:/|\\b|$)`).exec(cell);
        if (mh && mn) { cur = normCurrency(mh[0]); amount = num(mn[1]); explicit = true; }
      }
      if (!cur || amount === null || !Number.isFinite(amount)) continue;
      const plan = planCol >= 0 ? r[planCol].trim() : '';
      // a row that is a total, subtotal, sum or arithmetic check is a spreadsheet control, not something a competitor charges
      if (/^\s*(grand\s+)?(sub-?\s*)?total|^\s*sum|check/i.test(plan) || /^\s*(grand\s+)?(sub-?\s*)?total|^\s*sum/i.test(String(r[0] || ''))) continue;
      const refCell = loc.cellRef ? loc.cellRef(i, j) : null;
      const locator = loc.cellRef ? { kind: 'sheet_cell', sheet: loc.base.sheetName, cell: refCell } : { kind: 'table_cell', index: loc.base.index, table: loc.tableNo, row: i + 1, col: j + 1 };
      out.candidates.push(priceCandidate({ locator, quote: cell, plan: plan || undefined, amount, currency: { ...cur, explicit }, context: r.join(' | '), header: header.join(' | '), table: true, snippet: `${header.join(' | ')}  >>  ${r.join(' | ')}`, location: { ...loc.base, ...(refCell ? { cell: refCell } : {}), row: loc.rowNo ? loc.rowNo(i) : i + 1, label: refCell ? `${loc.base.label}!${refCell}` : `${loc.base.label}, table row ${i + 1}` } }));
    }
  }
}

// ------------------------------------------------------------------ prices from running text
function textCandidates(text, loc, tableRows, out, titleHint) {
  const lines = text.split('\n');
  lines.forEach((line, li) => {
    const ln = line.trim();
    if (!ln || tableRows.has(ln)) return;
    const hits = [];
    for (const re of [MONEY_BEFORE, MONEY_AFTER]) {
      re.lastIndex = 0; let m;
      while ((m = re.exec(ln))) {
        const before = re === MONEY_BEFORE;
        const cur = normCurrency(before ? m[1] : m[2]); const amount = num(before ? m[2] : m[1]);
        if (!cur || !Number.isFinite(amount)) continue;
        hits.push({ idx: m.index, end: m.index + m[0].length, cur, amount, raw: m[0] });
      }
    }
    hits.sort((a, b) => a.idx - b.idx);
    const used = [];
    for (const h of hits) {
      if (used.some((u) => h.idx < u.end && h.end > u.idx)) continue; // overlapping match of the other pattern
      used.push(h);
      if (/\d\s*(?:-|to)\s*$/.test(ln.slice(0, h.idx)) || /^\s*(?:-|to)\s*\d/.test(ln.slice(h.end))) { out.warnings.push(`${loc.label}: price range near "${clip(h.raw, 30)}" skipped`); continue; }
      const prefix = ln.slice(0, h.idx).replace(/[:\-–—|=(]+\s*$/, '').trim();
      let plan = '';
      const pm = /([A-Z][\w+&.\- ]{1,40}?)(?:\s+(?:plan|tier|edition|pack|package))?\s*$/.exec(prefix);
      if (prefix && pm) plan = pm[1].trim().split(/\s+/).slice(-4).join(' ');
      if (!plan && li > 0 && lines[li - 1].trim() && lines[li - 1].trim().length < 50 && !/\d/.test(lines[li - 1])) plan = lines[li - 1].trim();
      if (!plan && titleHint) plan = '';
      // a total, subtotal, sum or arithmetic check line is not something a competitor charges
      if (/^\s*(grand\s+)?(sub-?\s*)?total|^\s*sum|check/i.test(plan) || /^\s*(?:[A-Z]{1,2}\d+:\s*)?(grand\s+)?(sub-?\s*)?total/i.test(ln)) { out.warnings.push(loc.label + ': a total or check line was ignored'); continue; }
      const after = ln.slice(h.end, h.end + 70);
      const ctx = `${after} ${prefix.slice(-40)} ${ln}`;
      out.candidates.push(priceCandidate({ locator: { kind: 'paragraph', index: loc.base.index, paragraph: li + 1 }, quote: ln, plan: plan || undefined, amount: h.amount, currency: { ...h.cur, explicit: true }, context: ctx, header: '', table: false, snippet: ln, location: { ...loc.base, line: li + 1, label: loc.base.label } }));
    }
  });
}

// ------------------------------------------------------------------ competitor profile fields
const COUNTRIES = ['India', 'United States', 'USA', 'United Kingdom', 'UK', 'Singapore', 'Germany', 'France', 'Netherlands', 'China', 'Japan', 'South Korea', 'Taiwan', 'Canada', 'Australia', 'Israel', 'Switzerland', 'Sweden', 'Italy', 'Spain', 'Ireland', 'UAE', 'United Arab Emirates', 'Brazil', 'Mexico', 'Nepal', 'Bangladesh', 'Sri Lanka', 'Indonesia', 'Malaysia', 'Vietnam', 'Thailand', 'Denmark', 'Finland', 'Norway', 'Slovenia'];
const CITY_COUNTRY = { bengaluru: 'India', bangalore: 'India', mumbai: 'India', pune: 'India', delhi: 'India', 'new delhi': 'India', hyderabad: 'India', chennai: 'India', noida: 'India', gurugram: 'India', gurgaon: 'India', kolkata: 'India', ahmedabad: 'India', 'san francisco': 'United States', 'san jose': 'United States', 'new york': 'United States', boston: 'United States', seattle: 'United States', austin: 'United States', london: 'United Kingdom', berlin: 'Germany', munich: 'Germany', paris: 'France', amsterdam: 'Netherlands', shenzhen: 'China', shanghai: 'China', beijing: 'China', tokyo: 'Japan', seoul: 'South Korea', taipei: 'Taiwan', dubai: 'UAE', ljubljana: 'Slovenia' };
const normCountry = (s) => { const t = String(s).trim().replace(/\.$/, ''); if (/^(usa|u\.s\.a?\.?|us)$/i.test(t)) return 'United States'; if (/^(uk|u\.k\.)$/i.test(t)) return 'United Kingdom'; if (/^uae$/i.test(t)) return 'UAE'; const c = COUNTRIES.find((x) => x.toLowerCase() === t.toLowerCase()); if (c) return c; return CITY_COUNTRY[t.toLowerCase()] || null; };
const SIZE_BANDS = [[10, '1-10'], [50, '11-50'], [200, '51-200'], [1000, '201-1000'], [5000, '1001-5000'], [Infinity, '5000+']];
const sizeBand = (n) => SIZE_BANDS.find(([max]) => n <= max)[1];

function profileCandidates(plain, loc, out) {
  let curLine = 0;
  const push = (field, value, snippet, confidence, reasons, extra: any = {}) => out.candidates.push({ kind: 'competitor_field', confidence, confidence_level: level(confidence), reasons, assumptions: extra.assumptions || [], location: loc, locator: curLine ? { kind: 'paragraph', index: loc.index, paragraph: curLine } : null, quote: clip(snippet, 500), snippet: clip(snippet), fields: { [field]: value, ...(extra.also || {}) }, field });
  const sentences = [];
  plain.split('\n').forEach((line, li) => { for (const t of line.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean)) sentences.push({ t, line: li + 1 }); });
  const seen = new Set();
  for (const { t: s, line } of sentences) {
    curLine = line;
    let m;
    // website
    for (const u of s.matchAll(/\b((?:https?:\/\/)?(?:www\.)[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s,;)]*)?|https?:\/\/[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s,;)]*)?)/gi)) {
      const url = u[1].replace(/[.,;:]+$/, ''); const host = url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase();
      if (seen.has('w' + host) || /\.(png|jpg|gif|css|js)$/i.test(host)) continue; seen.add('w' + host);
      const near = /website|site|web|url|visit|homepage/i.test(s);
      push('website', /^https?:\/\//i.test(url) ? url : `https://${url}`, s, near ? 0.8 : 0.55, [near ? 'the sentence mentions a website' : 'a web address appears in the text']);
    }
    if ((m = /\b(?:founded|established|incorporated|started|launched|set up)\s*(?:in|:|on|-)?\s*(?:[A-Z][a-z]+\s+\d{0,2},?\s*)?((?:19|20)\d{2})\b|\b(?:since|est\.?)\s*((?:19|20)\d{2})\b|\bfounded\s*:\s*((?:19|20)\d{2})/i.exec(s))) {
      const y = Number(m[1] || m[2] || m[3]);
      if (y >= 1850 && y <= 2100 && !seen.has('y' + y)) { seen.add('y' + y); push('founded_year', y, s, /founded|established|incorporated/i.test(m[0]) ? 0.8 : 0.55, ['year read after "' + m[0].split(/\s+/)[0] + '"']); }
    }
    const hc = /\b(?:(?:team|staff|workforce|headcount|employees)\s+(?:of|:)?\s*(?:about|around|approximately|over|more than|~)?\s*(\d[\d,]*)\+?|(?:about|around|approximately|over|more than|~)?\s*(\d[\d,]*)\+?\s*(?:-|to)?\s*(\d[\d,]*)?\s*(?:employees|people|staff|engineers|team members|professionals))\b/i.exec(s);
    if (hc && !seen.has('h')) {
      const a = Number((hc[1] || hc[2] || '').replace(/,/g, '')); const b = hc[3] ? Number(hc[3].replace(/,/g, '')) : null;
      if (a > 0 && a < 1e6) { seen.add('h'); const top = b || a; push('headcount_note', clip(hc[0].trim(), 80), s, 0.7, ['headcount phrase read'], { also: { size_band: sizeBand(top) }, assumptions: b ? [] : ['size_band derived from a single headcount figure'] }); }
    }
    if (/\b(?:raised|funding|funded|series [a-f]|seed round|venture|backed by|valuation|ipo|listed on|acquired by|private equity|bootstrapped|investors?)\b/i.test(s) && (/\$|₹|rs\.?|usd|inr|million|billion|crore|lakh|\b(?:series [a-f]|seed|ipo|acquired|bootstrapped)\b/i.test(s)) && !seen.has('f')) {
      seen.add('f'); push('funding_summary', clip(s, 200), s, 0.65, ['sentence mentions funding, investors, acquisition or listing']);
    }
    if ((m = /\b(?:headquartered|head office|headquarters|hq|based)\s*(?:is\s*)?(?:in|at|:)\s*([A-Z][A-Za-z.]+(?:\s[A-Z][A-Za-z]+)?)(?:,\s*([A-Z][A-Za-z ]+))?/.exec(s)) && !seen.has('hq')) {
      const country = normCountry(m[2] || '') || normCountry(m[1]);
      if (country) { seen.add('hq'); push('hq_country', country, s, m[2] && normCountry(m[2]) ? 0.8 : 0.65, ['headquarters phrase read'], { assumptions: normCountry(m[2] || '') ? [] : [`country "${country}" inferred from the place name "${m[1]}"`] }); }
    }
    const certs = [...s.matchAll(/\b(ISO\s?\d{4,5}(?::\d{4})?|SOC\s?[12](?:\s?Type\s?(?:I|II|1|2))?|PCI[- ]?DSS|HIPAA|GDPR|BIS|CRS|CE\b|UL\b|FCC|RoHS|MeitY|STQC|CERT-In|TEC|WPC|IEC\s?\d{4,5}|IS\s?\d{3,5})/g)].map((x) => x[1].replace(/\s+/g, ' '));
    if (certs.length && /certif|compl|accredit|approved|audited|standard|registered/i.test(s) && !seen.has('c' + certs.join())) { seen.add('c' + certs.join()); push('certifications', [...new Set(certs)], s, 0.7, ['certification names found in a sentence about certification or compliance']); }
    if ((m = /\b(?:customers?|clients?|users)\s+(?:include|including|such as|like)\s*:?\s*([^.]+)/i.exec(s)) && !seen.has('k')) {
      const names = m[1].split(/,|\band\b|;/).map((x) => x.trim()).filter((x) => /^[A-Z0-9][\w&.\- ]{1,40}$/.test(x)).slice(0, 12);
      if (names.length) { seen.add('k'); push('key_customers', names, s, 0.65, ['names listed after "customers include"']); }
    }
  }
}

/** Main entry. */
function suggest(extraction, opts = {}) {
  const out = { candidates: [], warnings: [] };
  if (!extraction || ['unsupported', 'failed'].includes(extraction.status)) return { candidates: [], warnings: [`no text to analyse (extraction ${extraction ? extraction.status : 'missing'})`, ...(extraction ? extraction.warnings : [])] };
  const units = [];
  if (extraction.slides) for (const s of extraction.slides) units.push({ type: 'slide', unit: s, label: `Slide ${s.index}${s.title ? ` ("${clip(s.title, 40)}")` : ''}`, text: [s.text, s.notes ? `Notes: ${s.notes}` : ''].filter(Boolean).join('\n') });
  if (extraction.sheets) for (const s of extraction.sheets) units.push({ type: 'sheet', unit: s, label: `Sheet ${s.title}`, text: '' });
  if (extraction.pages) for (const p of extraction.pages) units.push({ type: extraction.kind === 'pdf' ? 'page' : 'section', unit: p, label: extraction.kind === 'pdf' ? `Page ${p.index}` : extraction.pages.length > 1 ? `Section "${clip(p.title, 40)}"` : 'Document', text: p.text });
  for (const u of units) {
    const base = { type: u.type, index: u.unit.index, label: u.label, sheetName: u.type === 'sheet' ? u.unit.title : undefined };
    const tableRows = new Set();
    (u.unit.tables || []).forEach((t, ti) => {
      if (u.type === 'sheet') {
        const rowsNums = t.row_numbers || t.rows.map((_, i) => i + 1);
        tableCandidates({ rows: t.rows }, { base, cellRef: (i, j) => `${colLetters(j)}${rowsNums[i]}`, rowNo: (i) => rowsNums[i], label: u.label }, out);
      } else { for (const r of t.rows) tableRows.add(r.join(' | ').trim()); tableCandidates(t, { base, label: u.label, tableNo: ti + 1 }, out); }
    });
    if (u.text) { textCandidates(u.text, { base, label: u.label }, tableRows, out, u.unit.title); profileCandidates(u.text, { ...base }, out); }
  }
  // number the candidates, drop exact duplicates (same field values and snippet)
  const seen = new Set(); const uniq = [];
  for (const c of out.candidates) { const key = JSON.stringify([c.kind, c.fields, c.snippet]); if (seen.has(key)) continue; seen.add(key); uniq.push(c); }
  uniq.sort((a, b) => b.confidence - a.confidence);
  // the same price read twice from one file (a table cell and the line of text around it) is one finding, not two
  const bySame = new Map(); const merged = [];
  for (const c of uniq) {
    if (c.kind !== 'price_point') { merged.push(c); continue; }
    const f = c.fields;
    const key = JSON.stringify([planKey(f.plan), f.amount, f.currency, f.billing_period || '', f.unit || '']);
    const first = bySame.get(key);
    if (first) { (first.also_found = first.also_found || []).push({ locator: c.locator, quote: c.quote, confidence: c.confidence }); continue; }
    bySame.set(key, c); merged.push(c);
  }
  uniq.length = 0; uniq.push(...merged);
  uniq.forEach((c, i) => { c.id = `c${i + 1}`; });
  return { candidates: uniq, warnings: out.warnings };
}

export { suggest, readContext, normCurrency, sizeBand, planKey, cleanPlan };
