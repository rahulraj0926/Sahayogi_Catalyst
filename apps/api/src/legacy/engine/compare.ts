/**
 * engine/compare.ts - side-by-side competitor comparison (GET /api/competitors/compare).
 *
 * Profile rows (every field shown with its freshness), price rows normalised to INR excluding GST with the 12-month and
 * 36-month cost for ONE usage scenario (users, units, gb per month), and capability rows with evidence grade and freshness
 * per cell plus our own Feature coverage. Rules from the design report: prices are only ranked inside identical labels
 * (price type, channel level, billing family), MRP / street / dealer prices stay separate rows, stale values are shown but
 * excluded from the ranking (same rule the gates use), and unknown is never converted to zero.
 */
import * as Q from './query';
import * as freshness from './freshness';
import { GB_FACTORS } from './units';
import * as competitors from './competitors';
import { ownerOf, cellsOf, capabilityTag } from './competitor_owner';
import { toCsv } from './reports';

const httpErr = (status, message) => Object.assign(new Error(message), { status });
const DEFAULT_USAGE = { users: 10, units: 100, gb: 1000 };
const DEFAULT_GST = 18;
const LEVEL_SCORE = { strong: 3, parity: 2, partial: 1, absent: 0 };

const PROFILE_FIELDS = [
  ['tier', 'Tier'], ['tier_class', 'Tier class'], ['kind', 'Kind'], ['website', 'Website'], ['founded_year', 'Founded'], ['hq_country', 'Headquarters'], ['size_band', 'Size band'], ['headcount_note', 'Headcount note'], ['ownership', 'Ownership'],
  ['funding_summary', 'Funding'], ['positioning', 'Positioning'], ['target_customers', 'Target customers'], ['strengths', 'Strengths'], ['weaknesses', 'Weaknesses'], ['gtm_channels', 'Go-to-market channels'],
  ['technology_notes', 'Technology'], ['certifications', 'Certifications'], ['key_customers', 'Key customers'], ['segment_overlap', 'Segment overlap'], ['last_reviewed_on', 'Last reviewed'], ['review_by', 'Review due by'],
];

function parseUsage(query) {
  const u = { ...DEFAULT_USAGE }; const given = [];
  for (const k of ['users', 'units', 'gb']) {
    if (query[k] === undefined || query[k] === '') continue;
    const n = Number(query[k]);
    if (!Number.isFinite(n) || n < 0) throw httpErr(422, `${k} must be a non-negative number`);
    u[k] = n; given.push(k);
  }
  return { usage: u, defaults_used: ['users', 'units', 'gb'].filter((k) => !given.includes(k)) };
}

const periodMonths = (p) => ({ month: 1, quarter: 3, year: 12 }[p] || 1);

/** "item:amount:period" or "item" -> {item, amount, period}. */
function parseExtra(s) {
  const [item, amount, period] = String(s).split(':').map((x) => x.trim());
  return { item, amount: amount !== undefined && amount !== '' && Number.isFinite(Number(amount)) ? Number(amount) : null, period: period || 'one_time' };
}

/** Which quantity of usage a price scales with: gb, users, units or flat. */
function quantityKind(p) {
  const unit = String(p.unit || '').toLowerCase();
  if (/^(mb|gb|tb|pb)(\/|$)/.test(unit)) return 'gb';
  if (p.seat_model === 'single_user' || p.seat_model === 'per_user') return 'users';
  if (p.seat_model === 'multi_user' || p.seat_model === 'unlimited_users') return 'flat';
  if (p.value_metric === 'user' || p.value_metric === 'seat' || /user|seat/.test(unit)) return 'users';
  if (['device', 'unit', 'dealer', 'site'].includes(p.value_metric) || /device|unit|meter|gateway|piece|each|sku|dealer|site|branch|outlet/.test(unit)) return 'units';
  if (p.value_metric === 'storage' || p.value_metric === 'egress') return 'gb';
  return 'flat';
}

/**
 * Cost of one price point over `months` for a usage scenario, in INR excluding GST. Returns {cost, reason?, qty_kind, qty, notes[]}.
 * cost is null (never zero) when it cannot be computed; the reason says why.
 */
function costFor(p, usage, months, fx) {
  const notes = [];
  if (p.price_type === 'quote') return { cost: null, reason: 'price on request', notes };
  const rate = fx[p.currency];
  if (!rate) return { cost: null, reason: `no exchange rate for ${p.currency}`, notes };
  let amount = p.amount * rate;
  if (p.tax_basis === 'incl_gst') { const g = p.gst_rate_pct === undefined ? DEFAULT_GST : p.gst_rate_pct; amount /= 1 + g / 100; notes.push(`GST ${g}% removed to compare excluding tax`); }
  if (p.tax_basis === 'not_applicable') notes.push('tax basis not applicable');
  const kind = quantityKind(p);
  if (p.seat_model === 'multi_user' && p.max_users && usage.users > p.max_users) return { cost: null, reason: `one licence covers up to ${p.max_users} users, the scenario has ${usage.users}`, notes };
  if (p.seat_model === 'single_user') notes.push('single-user licence: one is bought for each user');
  else if (p.seat_model === 'multi_user' || p.seat_model === 'unlimited_users') notes.push('one licence covers all users');
  let qty = 1; let unitFactor = 1;
  if (kind === 'gb') {
    const m = /^(MB|GB|TB|PB)/i.exec(String(p.unit || '').trim());
    unitFactor = m ? GB_FACTORS[m[1].toUpperCase()] : 1;
    qty = usage.gb / unitFactor;
  } else if (kind === 'users') qty = usage.users; else if (kind === 'units') qty = usage.units;
  if (p.min_quantity !== undefined && qty < p.min_quantity) { qty = p.min_quantity; notes.push(`minimum quantity ${p.min_quantity} applied`); }
  if (p.included_quantity && ['subscription', 'hybrid', 'usage', 'lease'].includes(p.billing_model)) { qty = Math.max(0, qty - p.included_quantity); notes.push(`${p.included_quantity} included free`); }
  let total;
  const per = periodMonths(p.billing_period || (/year|annum/i.test(String(p.unit)) ? 'year' : 'month'));
  switch (p.billing_model) {
    case 'one_time': total = amount * qty; break;
    case 'usage': total = amount * qty * months; break; // qty is per month for usage prices
    case 'subscription': case 'lease': case 'hybrid': total = amount * (kind === 'flat' ? 1 : qty) * Math.ceil(months / per); if (p.billing_model === 'hybrid') notes.push('hybrid: only the base component is priced'); break;
    default: return { cost: null, reason: `unsupported billing model ${p.billing_model}`, notes };
  }
  if (p.setup_fee) total += p.setup_fee * rate;
  for (const raw of p.mandatory_extras || []) {
    const e = parseExtra(raw);
    if (e.amount === null) { notes.push(`extra "${e.item}" has no amount and is not included`); continue; }
    const inr = e.amount * rate;
    total += e.period === 'one_time' ? inr : e.period === 'year' ? inr * Math.ceil(months / 12) : inr * months;
  }
  return { cost: Math.round(total * 100) / 100, qty_kind: kind, qty: Math.round(qty * 1000) / 1000, notes };
}

const billingFamily = (p) => (['one_time'].includes(p.billing_model) ? 'one_time' : ['usage'].includes(p.billing_model) ? 'usage' : 'recurring');
const groupKey = (p) => [p.price_type, p.channel_level || 'unspecified', billingFamily(p), quantityKind(p)].join(' | ');

function ourFeatureFor(store, tag, cells) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
  for (const cell of cells) {
    for (const l of store.inn(cell.id, 'differentiates')) { const f = store.get(l.source); if (f && f.type === 'Feature') return { feature_id: f.id, title: f.title, priority: f.priority || null, scope_status: f.scope_status || 'in', rating: (l.attrs && l.attrs.rating) || null, basis: 'linked (differentiates)' }; }
  }
  const tw = new Set(norm(tag));
  let best = null;
  for (const f of store.list('Feature')) {
    const fw = norm(f.title); const common = fw.filter((w) => tw.has(w)).length;
    if (common >= 2 || (common >= 1 && tw.size <= 2 && fw.length <= 4)) if (!best || common > best.common) best = { common, f };
  }
  return best ? { feature_id: best.f.id, title: best.f.title, priority: best.f.priority || null, scope_status: best.f.scope_status || 'in', rating: null, basis: 'title match' } : null;
}

function compare(store, query: any = {}) {
  const today = store.today();
  const { usage, defaults_used } = parseUsage(query);
  const includeOurs = ['true', '1', 'yes'].includes(String(query.include_ours));
  const all = store.list('Competitor', (c) => c.status !== 'Retired');
  const ids = query.ids ? String(query.ids).split(',').map((x) => x.trim()).filter(Boolean) : all.map((c) => c.id);
  for (const id of ids) if (!all.find((c) => c.id === id)) throw httpErr(404, `competitor ${id} not found (or retired)`);
  const comps = ids.map((id) => all.find((c) => c.id === id));
  const columns = comps.map((c) => ({ id: c.id, title: c.title, tier: c.tier || null, tier_class: c.tier_class || null, status: c.status, ours: false }));
  const prod = store.product();
  if (includeOurs) columns.push({ id: 'OURS', title: prod ? prod.name : 'Our product', tier: null, tier_class: null, status: prod ? prod.status : null, ours: true });

  // ---- profile rows
  const profile_rows = PROFILE_FIELDS.map(([field, label]) => {
    const values: any = {};
    for (const c of comps) {
      const v = c[field];
      let fresh = null;
      if (field === 'review_by' && c.review_by) fresh = c.review_by < today ? 'overdue' : 'on_time';
      values[c.id] = v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length) ? null : { value: Array.isArray(v) ? v.join('; ') : v, freshness: fresh };
    }
    if (includeOurs) values.OURS = null;
    return { field, label, values };
  }).filter((r) => Object.values(r.values).some((v) => v !== null));
  const profile_freshness = Object.fromEntries(comps.map((c) => [c.id, { last_reviewed_on: c.last_reviewed_on || null, review_by: c.review_by || null, review_overdue: !!(c.review_by && c.review_by < today), status: c.status }]));

  // ---- price rows
  const fx = store.data.settings.fx;
  const ctxLike = { store, today };
  const priceItems = store.list('PricePoint', (p) => p.status !== 'Retired');
  const parentOf = (p) => ownerOf(store, p);
  const price_rows = [];
  for (const p of priceItems) {
    const parent = parentOf(p);
    const colId = parent ? parent.id : 'OURS';
    if (parent && !ids.includes(parent.id)) continue;
    if (!parent && !includeOurs) continue;
    const fr = freshness.valueState(store, p, today);
    const c12 = costFor(p, usage, 12, fx); const c36 = costFor(p, usage, 36, fx);
    const counted = Q.isCounted(p, ctxLike);
    const dealerPrice = p.mrp !== undefined && p.dealer_margin_pct !== undefined ? Math.round(p.mrp * (1 - p.dealer_margin_pct / 100) * (fx[p.currency] || 1) * 100) / 100 : null;
    price_rows.push({
      id: p.id, column: colId, competitor: parent ? parent.title : (prod ? prod.name : 'Our product'), plan: p.plan || null, amount: p.amount, currency: p.currency, unit: p.unit, value_metric: p.value_metric,
      price_type: p.price_type, billing_model: p.billing_model, billing_period: p.billing_period || null, tax_basis: p.tax_basis, channel_level: p.channel_level || null, region: p.region || null, valid_from: p.valid_from || null, valid_to: p.valid_to || null,
      mrp: p.mrp === undefined ? null : p.mrp, street_price: p.street_price === undefined ? null : p.street_price, dealer_margin_pct: p.dealer_margin_pct === undefined ? null : p.dealer_margin_pct, dealer_price_inr: dealerPrice,
      group: groupKey(p), cost_12m_inr: c12.cost, cost_36m_inr: c36.cost, cost_note: c12.reason || c36.reason || null, quantity_kind: c12.qty_kind || quantityKind(p), quantity_used: c12.qty === undefined ? null : c12.qty, notes: c12.notes,
      captured_on: p.captured_on || null, grade: p.source_grade || null, freshness: fr.state, age_days: fr.ageDays, counted, excluded: fr.state === 'stale', excluded_reason: fr.state === 'stale' ? fr.reason : (!counted ? 'not counted: unverified or not reviewed' : null),
      status: p.status, origin: p.origin, verification: p.verification || null,
    });
  }
  // rank inside identical groups, counted and non-stale values only
  const groups = {};
  for (const r of price_rows) (groups[r.group] = groups[r.group] || []).push(r);
  const price_groups = Object.entries(groups).map(([key, rows]) => {
    const rankable = (rows as any).filter((r) => !r.excluded && r.counted && r.cost_36m_inr !== null).sort((a, b) => a.cost_36m_inr - b.cost_36m_inr);
    rankable.forEach((r, i) => { r.rank_36m = i + 1; });
    const cheapest = rankable[0] || null;
    return { group: key, comparable: rankable.length >= 2, rows: (rows as any).map((r) => r.id), cheapest_36m: cheapest ? { id: cheapest.id, column: cheapest.column, cost_36m_inr: cheapest.cost_36m_inr } : null, excluded: (rows as any).filter((r) => r.excluded || !r.counted).map((r) => r.id) };
  });

  // ---- capability rows
  const tags = new Map();
  const cellsBy = {};
  for (const c of comps) {
    for (const cell of cellsOf(store, c).filter((x) => x.type === 'CompetitorCapability' && x.status !== 'Retired')) {
      const tag = capabilityTag(store, cell);
      tags.set(tag, Math.max(tags.get(tag) || 0, cell.importance || 3));
      const prev = cellsBy[`${c.id}|${tag}`];
      if (!prev || (LEVEL_SCORE[cell.level] ?? -1) > (LEVEL_SCORE[prev.level] ?? -1)) cellsBy[`${c.id}|${tag}`] = cell;
    }
  }
  const capability_rows = [...tags.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag, importance]) => {
    const cells = {}; const raw = [];
    for (const c of comps) {
      const cell = cellsBy[`${c.id}|${tag}`];
      if (!cell) { cells[c.id] = null; continue; }
      raw.push(cell);
      const fr = freshness.valueState(store, cell, today);
      const ev = store.out(cell.id, 'supported_by').map((l) => store.get(l.target)).filter((e) => e && e.type === 'Evidence' && e.reliability).map((e) => e.reliability).sort()[0] || cell.source_grade || null;
      cells[c.id] = { id: cell.id, level: cell.level, grade: ev, freshness: fr.state, age_days: fr.ageDays, counted: Q.isCounted(cell, ctxLike), excluded: fr.state === 'stale', evidence_basis: cell.evidence_basis || null, note: cell.note || '', captured_on: cell.captured_on || null };
    }
    const row = { tag, importance, cells };
    if (includeOurs) (row.cells as any).OURS = ourFeatureFor(store, tag, raw);
    return row;
  });

  return {
    as_of: today, ids, usage: { ...usage, defaults_used, note: 'users, units and gb (GB per month) drive the cost; costs are INR excluding GST at the stored exchange rates' }, include_ours: includeOurs,
    columns, profile_rows, profile_freshness, price_rows, price_groups, capability_rows,
    rules: ['Prices are only ranked inside identical groups (price type, channel level, billing family, quantity basis).', 'Stale values are shown but excluded from ranking and counts (same rule as the gates).', 'A cost that cannot be computed is null with a reason, never zero.', 'Our own price rows are PricePoints that belong to no competitor.'],
  };
}

function compareCsv(res) {
  const cols = res.columns;
  const rows = [];
  for (const r of res.profile_rows) rows.push(['profile', r.label, ...cols.map((c) => (r.values[c.id] ? r.values[c.id].value : ''))]);
  for (const r of res.capability_rows) rows.push(['capability', r.tag, ...cols.map((c) => { const x = r.cells[c.id]; return x ? (c.ours ? `${x.title} (${x.rating || x.basis})` : `${x.level}${x.grade ? ' ' + x.grade : ''}${x.excluded ? ' [stale]' : x.freshness !== 'fresh' ? ' [' + x.freshness + ']' : ''}`) : ''; })]);
  const byCol = (id) => res.price_rows.filter((r) => r.column === id);
  const maxPrices = Math.max(0, ...cols.map((c) => byCol(c.id).length));
  for (let i = 0; i < maxPrices; i++) {
    rows.push(['price', `price ${i + 1}: description`, ...cols.map((c) => { const r = byCol(c.id)[i]; return r ? `${r.plan || ''} ${r.amount} ${r.currency}/${r.unit} ${r.price_type} ${r.billing_model} ${r.tax_basis}`.trim() : ''; })]);
    rows.push(['price', `price ${i + 1}: 12-month cost INR`, ...cols.map((c) => { const r = byCol(c.id)[i]; return r && r.cost_12m_inr !== null ? (r.excluded ? `${r.cost_12m_inr} [excluded: stale]` : r.cost_12m_inr) : ''; })]);
    rows.push(['price', `price ${i + 1}: 36-month cost INR`, ...cols.map((c) => { const r = byCol(c.id)[i]; return r && r.cost_36m_inr !== null ? (r.excluded ? `${r.cost_36m_inr} [excluded: stale]` : r.cost_36m_inr) : ''; })]);
  }
  return toCsv(['section', 'row', ...cols.map((c) => c.title)], rows);
}

export { compare, compareCsv, costFor, parseUsage, quantityKind, DEFAULT_USAGE };
