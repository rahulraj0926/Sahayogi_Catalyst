/**
 * engine/competitors.ts - the competitor-analysis slice (competitor design report sections 1-6):
 * tier view with caps, capability grid with evidence grade and freshness, normalised price view,
 * source register, and the effort/cost model.
 */
import * as Q from './query';
import * as freshness from './freshness';
import * as freshnessMod from './freshness';
import { ownerOf, lineOf, cellsOf, capabilityTag, liveCompetitors, inScope } from './competitor_owner';

const LEVEL_SCORE = { strong: 3, parity: 2, partial: 1, absent: 0 };
const CAPS = { total: 20, T1: 4, T2: 8 };

function bestGrade(store, item) {
  const grades = store.out(item.id, 'supported_by').map((l) => store.get(l.target)).filter((e) => e && e.type === 'Evidence' && e.reliability).map((e) => e.reliability).sort();
  return grades[0] || null;
}

function cellInfo(store, cell, today) {
  const fr = freshness.valueState(store, cell, today);
  return {
    id: cell.id, level: cell.level, status: cell.status, grade: bestGrade(store, cell), freshness: fr.state, ageDays: fr.ageDays, maxDays: fr.maxDays, captured_on: cell.captured_on || null,
    counted: Q.isCounted(cell, { store, today }), origin: cell.origin, verification: cell.verification, verified_by: cell.verified_by || null, verified_note: cell.verified_note || null, verified_on: cell.verified_on || null, evidence_basis: cell.evidence_basis || null, note: cell.note || '',
  };
}

/** Everything a competitor owns: direct children plus anything inside its product lines, so plans work with or without product lines. */
const competitorCells = cellsOf;

function tierView(store, scope = '') {
  const today = store.today();
  const comps = liveCompetitors(store, scope);
  const rows = comps.map((c) => {
    const cells = competitorCells(store, c).filter((x) => x.type === 'CompetitorCapability' && x.status !== 'Retired');
    const prices = competitorCells(store, c).filter((x) => x.type === 'PricePoint' && x.status !== 'Retired');
    const states = [...cells, ...prices].map((x) => freshness.valueState(store, x, today).state);
    const worst = states.includes('stale') ? 'stale' : states.includes('due') ? 'due' : states.length ? 'fresh' : 'unknown';
    const unknown = cells.filter((x) => x.level === 'unknown').length;
    return {
      id: c.id, title: c.title, last_update: [c, ...competitorCells(store, c)].map((x) => String(x.updated_at || x.created_at || '')).sort().pop()?.slice(0, 10) || null, kind: c.kind, tier: c.tier || null, tier_basis: c.tier_basis || null, status: c.status, origin: c.origin, verification: c.verification,
      cells: cells.length, rated: cells.length - unknown, reviewed: cells.filter((x) => Q.isCounted(x, { store, today })).length, unverified: [...cells, ...prices].filter((x) => x.origin === 'agent' && x.verification === 'unverified').length,
      prices: prices.length, stale: states.filter((s) => s === 'stale').length, due: states.filter((s) => s === 'due').length, freshness: worst, positioning: c.positioning || '', scopes: Array.isArray(c.scopes) ? c.scopes : [], pricing_na_reason: c.pricing_na_reason || null,
    };
  });
  const tiers = { T1: [], T2: [], T3: [], S: [], unassigned: [] };
  for (const r of rows) (tiers[r.tier || 'unassigned'] || tiers.unassigned).push(r);
  const counts = { total: rows.length, T1: tiers.T1.length, T2: tiers.T2.length };
  const warnings = [];
  if (counts.total > CAPS.total) warnings.push(`${counts.total} named competitors is more than the ${CAPS.total} the tool plans for`);
  if (counts.T1 > CAPS.T1) warnings.push(`${counts.T1} main competitors is more than the ${CAPS.T1} the tool plans for`);
  if (counts.T2 > CAPS.T2) warnings.push(`${counts.T2} smaller competitors is more than the ${CAPS.T2} the tool plans for`);
  if (!tiers.S.length && !rows.some((r) => ['alternative', 'in_house'].includes(r.kind))) warnings.push('no customer alternative (including "do nothing") is recorded');
  return { tiers, caps: CAPS, counts, warnings };
}

function grid(store) {
  const today = store.today();
  const comps = store.list('Competitor', (c) => c.status !== 'Retired' && ['T1', 'T2', 'S'].includes(c.tier));
  const tagInfo = new Map();
  const cellsBy = new Map();
  for (const c of comps) {
    for (const cell of competitorCells(store, c).filter((x) => x.type === 'CompetitorCapability' && x.status !== 'Retired')) {
      const tag = capabilityTag(store, cell);
      const imp = cell.importance || 3;
      if (!tagInfo.has(tag) || tagInfo.get(tag) < imp) tagInfo.set(tag, imp);
      const prev = cellsBy.get(`${c.id}|${tag}`);
      if (!prev || (LEVEL_SCORE[cell.level] ?? -1) > (LEVEL_SCORE[prev.level] ?? -1)) cellsBy.set(`${c.id}|${tag}`, cell);
    }
  }
  const rows = [...tagInfo.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag, importance]) => ({
    tag, importance, cells: Object.fromEntries(comps.map((c) => [c.id, cellsBy.has(`${c.id}|${tag}`) ? cellInfo(store, cellsBy.get(`${c.id}|${tag}`), today) : null])),
  }));
  const scores = comps.map((c) => {
    let num = 0; let den = 0; let unweighted = 0; let n = 0; let unknown = 0; let missing = 0;
    for (const r of rows) {
      const cell = r.cells[c.id];
      if (!cell) { missing++; continue; }
      const raw = cellsBy.get(`${c.id}|${r.tag}`);
      if (raw.level === 'unknown') { unknown++; continue; }
      num += r.importance * LEVEL_SCORE[raw.level]; den += r.importance * 3; unweighted += LEVEL_SCORE[raw.level]; n++;
    }
    const share = rows.length ? Math.round((100 * (unknown + missing)) / rows.length) : 0;
    return { id: c.id, title: c.title, tier: c.tier, weighted: den ? Math.round((1000 * num) / den) / 10 : null, unweighted: n ? Math.round((100 * unweighted) / (3 * n)) : null, rated: n, unknownShare: share, alert: c.tier === 'T1' && share > 40 ? `unknown share ${share}% exceeds 40%` : null };
  });
  return { competitors: comps.map((c) => ({ id: c.id, title: c.title, tier: c.tier, status: c.status })), rows, scores, levels: ['strong', 'parity', 'partial', 'absent', 'unknown'], note: 'The score that weighs each capability by importance is always shown beside the plain score. A capability nobody has checked is shown as not known, never as zero.' };
}

const VOLUME_METRICS = ['egress', 'storage', 'requests'];
function prices(store) {
  const today = store.today();
  const fx = store.data.settings.fx;
  const all = store.list('PricePoint', (p) => p.status !== 'Retired');
  const rows = all.map((p) => {
    const comp = ownerOf(store, p);
    const fr = freshness.valueState(store, p, today);
    return {
      id: p.id, competitor: comp ? { id: comp.id, title: comp.title, tier: comp.tier } : null, plan: p.plan, value_metric: p.value_metric, unit: p.unit, amount: p.amount, currency: p.currency,
      price_type: p.price_type, billing_model: p.billing_model, tax_basis: p.tax_basis, channel_level: p.channel_level, region: p.region, captured_on: p.captured_on, grade: p.source_grade || bestGrade(store, p),
      normalised_inr_per_gb: p.normalised_amount === undefined ? null : p.normalised_amount, amount_inr: typeof p.amount === 'number' && fx[p.currency] ? Math.round(p.amount * fx[p.currency] * 100) / 100 : null, by_volume: VOLUME_METRICS.includes(p.value_metric), freshness: fr.state, ageDays: fr.ageDays, status: p.status, counted: Q.isCounted(p, { store, today }), origin: p.origin, verification: p.verification, verified_by: p.verified_by || null, verified_on: p.verified_on || null, verified_note: p.verified_note || null, created_by: p.created_by || null, proposed_by: p.proposed_by || null,
    };
  });
  const groups = {};
  for (const r of rows) {
    const key = [r.value_metric, r.by_volume ? '' : r.unit, r.price_type, r.billing_model, r.tax_basis].join(' | ');
    (groups[key] || (groups[key] = { key, value_metric: r.value_metric, by_volume: r.by_volume, unit: r.by_volume ? null : r.unit, price_type: r.price_type, billing_model: r.billing_model, tax_basis: r.tax_basis, rows: [] })).rows.push(r);
  }
  for (const g of Object.values(groups)) {
    const rk = (g as any).by_volume ? 'normalised_inr_per_gb' : 'amount_inr';
    (g as any).rows.sort((a, b) => ((a[rk] === null) as any) - ((b[rk] === null) as any) || a[rk] - b[rk]);
    const vals = (g as any).rows.filter((r) => r.counted && r[rk] !== null).map((r) => r[rk]);
    (g as any).comparable = vals.length >= 2;
    (g as any).min = vals.length ? Math.min(...vals) : null; (g as any).max = vals.length ? Math.max(...vals) : null;
  }
  // indicative monthly bill for three reference customers, only for the like-for-like egress/list/usage/excl-tax group
  const scenarios = [{ name: 'small', tb: 10 }, { name: 'typical', tb: 100 }, { name: 'large', tb: 500 }];
  const base: any = Object.values(groups).find((g: any) => g.value_metric === 'egress' && g.price_type === 'list' && g.billing_model === 'usage');
  const tco = base ? base.rows.filter((r) => r.normalised_inr_per_gb !== null).map((r) => ({ competitor: r.competitor && r.competitor.title, counted: r.counted, ...Object.fromEntries(scenarios.map((s) => [s.name, Math.round(r.normalised_inr_per_gb * s.tb * 1000)])) })) : [];
  return { fx, rows, groups: Object.values(groups), scenarios, tco, rule: 'Prices are only ranked against prices of the same kind (the same thing priced, the same kind of price, the same way of paying and the same tax treatment). Amounts in other money are converted to rupees at the saved exchange rate. Prices billed by data used are shown per GB (1 GB = one billion bytes).' };
}

function sources(store) {
  const today = store.today();
  const tracked = store.list('TrackedSource').map((t) => ({ id: t.id, title: t.title, url_pattern: t.url_pattern, source_type: t.source_type, default_grade: t.default_grade, access_method: t.access_method, login_required: !!t.login_required, tos_verdict: t.tos_verdict || 'unknown', tos_checked_on: t.tos_checked_on || null, status: t.status,
    evidence: store.inn(t.id, 'observed_via').length }));
  const evidence = store.list('Evidence', (e) => ['web_page', 'price_list', 'datasheet', 'screenshot'].includes(e.kind)).map((e) => {
    const fr = freshness.evidenceState(e, today);
    const src = store.out(e.id, 'observed_via').map((l) => store.get(l.target))[0];
    return { id: e.id, title: e.title, kind: e.kind, url: e.url_or_file || null, grade: e.reliability || null, credibility: e.credibility || null, retrieved_on: e.retrieved_on || null, freshness: fr.state, ageDays: fr.ageDays, origin: e.origin, verification: e.verification, source: src ? { id: src.id, title: src.title, status: src.status } : null, citedBy: store.inn(e.id, 'supported_by').length };
  });
  return { tracked, evidence };
}

function effort(store) {
  const m = (freshnessMod.dims() as any).effortModel;
  const comps = store.list('Competitor', (c) => c.status !== 'Retired');
  const counts = { T1: 0, T2: 0, T3: 0, S: 0 };
  for (const c of comps) counts[c.tier || (['alternative', 'in_house'].includes(c.kind) ? 'S' : 'T3')]++;
  const calc = (cn) => {
    const lines = [{ item: 'Set-up (policy, templates, source register, monitors)', low: m.setup.low, likely: m.setup.likely, high: m.setup.high }];
    for (const t of ['T1', 'T2', 'T3', 'S']) lines.push({ item: `${t === 'S' ? 'Alternatives' : 'Tier ' + t.slice(1)} x ${cn[t]}`, low: cn[t] * m.perTier[t].low, likely: cn[t] * m.perTier[t].likely, high: cn[t] * m.perTier[t].high });
    lines.push({ item: 'Second-person verification pass and quality check', low: m.verificationPass.low, likely: m.verificationPass.likely, high: m.verificationPass.high });
    const tot = (k) => lines.reduce((s, l) => s + l[k], 0);
    const build = { low: tot('low'), likely: tot('likely'), high: tot('high') };
    const mLow = cn.T1 * m.perTier.T1.monthlyLow + cn.T2 * m.perTier.T2.monthlyLow + cn.T3 * m.perTier.T3.monthlyLow + m.monthlyFixed.low;
    const mHigh = cn.T1 * m.perTier.T1.monthlyHigh + cn.T2 * m.perTier.T2.monthlyHigh + cn.T3 * m.perTier.T3.monthlyHigh + m.monthlyFixed.high;
    const r = m.rupeesPerHour;
    return {
      counts: cn, lines, build,
      buildCostInr: { low: Math.round(build.low * r.low), high: Math.round(build.high * r.high) },
      monthlyHours: { low: Math.round(mLow * 10) / 10, high: Math.round(mHigh * 10) / 10 },
      monthlyCostInr: { low: Math.round(mLow * r.low + m.toolsPerMonth.low), high: Math.round(mHigh * r.high + m.toolsPerMonth.high) },
      monthlyFixedItems: m.monthlyFixed.items,
    };
  };
  const done = store.all().filter((i) => i.origin === 'agent' && ['CompetitorCapability', 'PricePoint', 'Competitor'].includes(i.type)).length;
  return { assumptions: { rupeesPerHour: m.rupeesPerHour, toolsPerMonth: m.toolsPerMonth, note: 'Hours are the report authors\' calibration (not measured); recalibrate in the three-competitor pilot.' }, current: calc(counts), standardSet: calc({ T1: 3, T2: 6, T3: 10, S: 3 }), agentProposedValues: done };
}



// ---- Product lines per competitor (Competitor → contains → CompetitorProductLine → contains → PricePoint)
/** One competitor with its product lines and the plans in each. productLines() below is this for every live competitor. */
function productLinesOf(store, c) {
  const pls = competitorCells(store, c).filter((x) => x.type === 'CompetitorProductLine' && x.status !== 'Retired');
  const directPrices = competitorCells(store, c).filter((x) => x.type === 'PricePoint' && x.status !== 'Retired');
  // product line detail: each PL has its own prices linked via contains
  const lines = pls.map((pl) => {
    const plPrices = store.out(pl.id, 'contains').map((l) => store.get(l.target)).filter((x) => x && x.type === 'PricePoint' && x.status !== 'Retired');
    const plCaps = store.out(pl.id, 'includes_capability').map((l) => store.get(l.target)).filter((x) => x && x.type === 'CompetitorCapability' && x.status !== 'Retired');
    return {
      id: pl.id, product_name: pl.product_name, description: pl.description || null, url: pl.url || null,
      product_type: pl.product_type || null, target_segments: pl.target_segments || [], is_primary: !!pl.is_primary,
      status: pl.status, prices: plPrices.length, capabilities: plCaps.length,
      plans: plPrices.map((p) => ({
        id: p.id, plan: p.plan, amount: p.amount, currency: p.currency, unit: p.unit,
        value_metric: p.value_metric, billing_model: p.billing_model, billing_period: p.billing_period || null,
        tax_basis: p.tax_basis,
      })),
    };
  });
  // prices attached directly to competitor (no product line)
  const unlinkedPriceIds = new Set(directPrices.map((p) => p.id));
  for (const pl of lines) for (const p of pl.plans) unlinkedPriceIds.delete(p.id);
  const orphanPrices = directPrices.filter((p) => unlinkedPriceIds.has(p.id));
  return {
    id: c.id, title: c.title, tier: c.tier || null,
    product_lines: lines, orphan_prices: orphanPrices.length,
    has_product_lines: lines.length > 0,
  };
}
function productLines(store) {
  return store.list('Competitor', (c) => c.status !== 'Retired').map((c) => productLinesOf(store, c));
}

// ---- Completeness scoring: how much data we have per competitor
/** Each check is done by itself when the data exists, or when a person ticked it off by hand (todo_done on the competitor). */
function completenessChecks(c, myPrices, planFeatureCount, myFiles) {
  const manual = new Set<string>(Array.isArray(c.todo_done) ? c.todo_done : []);
  const items = [
    { key: 'website', auto: !!c.website, label: 'Add their website', weight: 1 },
    { key: 'positioning', auto: !!c.positioning, label: 'Say in a line how they compete', weight: 2 },
    { key: 'target_customers', auto: !!c.target_customers, label: 'Say who they sell to', weight: 2 },
    { key: 'strengths', auto: !!c.strengths, label: 'Note their strengths', weight: 1 },
    { key: 'weaknesses', auto: !!c.weaknesses, label: 'Note their weaknesses', weight: 1 },
    { key: 'company_facts', auto: !!(c.founded_year || c.hq_country || c.size_band), label: 'Add company facts (founded, head office or size)', weight: 1 },
    { key: 'pricing', auto: myPrices.length > 0 || !!c.pricing_na_reason, label: 'Add their prices, or say why there are none', weight: 3 },
    { key: 'plan_features', auto: planFeatureCount > 0, label: 'Tick the features each plan includes', weight: 3 },
    { key: 'files', auto: myFiles > 0, label: 'Upload a source file (price list, deck, PDF)', weight: 1 },
    { key: 'looks_right', auto: false, label: 'Check that everything here looks right', weight: 2 },
  ].map((i) => ({ ...i, manual: manual.has(i.key), done: i.auto || manual.has(i.key) }));
  const total = items.reduce((s, i) => s + i.weight, 0);
  const done = items.filter((i) => i.done).reduce((s, i) => s + i.weight, 0);
  return { items, score: total > 0 ? Math.round((done / total) * 100) : 0, done_count: items.filter((i) => i.done).length, total_count: items.length };
}

/** How complete one competitor's record is. completeness() below is this for every live competitor. */
function completenessOf(store, c) {
  const cells = competitorCells(store, c);
  const myPrices = cells.filter((x) => x.type === 'PricePoint' && x.status !== 'Retired');
  const planFeatureCount = myPrices.reduce((n, p) => n + store.out(p.id, 'includes_capability').length, 0);
  const myFiles = (store.out(c.id, 'attached_to') || []).length + (store.inn(c.id, 'attached_to') || []).length;
  return { id: c.id, title: c.title, tier: c.tier || null, status: c.status, ...completenessChecks(c, myPrices, planFeatureCount, myFiles) };
}
function completeness(store) {
  return store.list('Competitor', (c) => c.status !== 'Retired').map((c) => completenessOf(store, c));
}

// ---- Normalized pricing: plans of every competitor on one scale
const median = (v: number[]) => { if (!v.length) return null; const s = [...v].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
const spread = (v: number[]) => (v.length ? { min: Math.min(...v), median: median(v), max: Math.max(...v), count: v.length } : null);

/**
 * Where a plan sits among ITS OWN company's plans, worked out from the prices (nothing is typed in or stored):
 *   free      costs nothing,
 *   cheapest  the lowest-priced paid plan of the company,
 *   top       the highest-priced paid plan of the company (only when the company has at least two paid plans),
 * and any plan in between has no position. Plans with no public price have none either.
 */
export const POSITIONS = ['free', 'cheapest', 'top'] as const;
export const POSITION_NAME: Record<string, string> = { free: 'Free plans', cheapest: 'Cheapest paid plan', top: 'Most expensive plan' };
function assignPositions(rows: any[]) {
  const byCompany = new Map<string, any[]>();
  for (const r of rows) { r.position = null; (byCompany.get(r.competitor.id) || byCompany.set(r.competitor.id, []).get(r.competitor.id)!).push(r); }
  for (const list of byCompany.values()) {
    const cost = (r: any) => (r.yearly_inr !== null ? r.yearly_inr : r.once_inr);
    for (const r of list) if (cost(r) === 0) r.position = 'free';
    const paid = list.filter((r) => cost(r) !== null && cost(r) > 0).sort((a, b) => cost(a) - cost(b));
    if (paid.length) paid[0].position = 'cheapest';
    if (paid.length > 1) paid[paid.length - 1].position = 'top';
  }
}

/**
 * Every plan, costed with the same rules as the side-by-side compare (compare.costFor): INR excluding GST, over 12 months,
 * for ONE usage scenario (?users=, ?units=, ?gb=). A plan sold for several terms (1, 3, 12 months, lifetime) is ONE row:
 * yearly_inr is its cheapest recurring term over 12 months, once_inr is the lifetime / one-time price. Single-user licences are
 * bought once per user; multi-user licences are one price that covers up to max_users. Rows carry their `position` (see above)
 * and `key`, which is `<competitor>|<product line>|<plan name>|<licence>`; `positions` groups the rows by position.
 */
function normalizedPricing(store, query: any = {}) {
  // compare.ts imports this file, so it is loaded when first needed rather than at start-up
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { costFor, parseUsage } = require('./compare');
  const fx = store.data.settings.fx;
  const { usage, defaults_used } = parseUsage(query);
  const allPrices = store.list('PricePoint', (p) => p.status !== 'Retired');
  const plans = new Map<string, any>();
  const skipped: any[] = [];
  for (const p of allPrices) {
    const comp = ownerOf(store, p);
    if (!comp || !inScope(comp, query.scope)) continue;
    const line = lineOf(store, p);
    const key = [comp.id, line ? line.id : '', String(p.plan || p.title).toLowerCase(), p.seat_model || ''].join('|');
    const r = costFor(p, usage, 12, fx);
    const oneTime = p.billing_model === 'one_time';
    if (r.cost === null || r.cost === undefined) { skipped.push({ id: p.id, plan: p.plan || p.title, competitor: comp.title, reason: r.reason }); }
    let row = plans.get(key);
    if (!row) {
      row = { key, id: p.id, plan: p.plan || p.title, competitor: { id: comp.id, title: comp.title, tier: comp.tier }, product: line ? line.product_name : null, position: null, seat_model: p.seat_model || null, max_users: p.max_users || null, yearly_inr: null, once_inr: null, terms: [] };
      plans.set(key, row);
    }
    const period = oneTime ? 'one_time' : (p.billing_period || 'month');
    row.terms.push({ id: p.id, period, billing_model: p.billing_model, amount: p.amount, currency: p.currency, cost_12m_inr: r.cost ?? null, notes: r.notes || [], reason: r.reason || null });
    if (r.cost !== null && r.cost !== undefined) {
      if (oneTime) row.once_inr = row.once_inr === null ? r.cost : Math.min(row.once_inr, r.cost);
      else row.yearly_inr = row.yearly_inr === null ? r.cost : Math.min(row.yearly_inr, r.cost);
    }
  }
  const rows = [...plans.values()];
  assignPositions(rows);
  const cheapFirst = (a: any, b: any) => (a.yearly_inr ?? a.once_inr ?? Infinity) - (b.yearly_inr ?? b.once_inr ?? Infinity);
  const positions = POSITIONS.map((position) => {
    const list = rows.filter((r) => r.position === position).sort(cheapFirst);
    return { position, label: POSITION_NAME[position], count: list.length, rows: list, yearly: spread(list.filter((r) => r.yearly_inr !== null).map((r) => r.yearly_inr)), once: spread(list.filter((r) => r.once_inr !== null).map((r) => r.once_inr)) };
  }).filter((t) => t.count > 0);
  return { positions, rows: rows.sort(cheapFirst), usage: { ...usage, defaults_used }, summary: { total: allPrices.length, plans: rows.length, with_position: rows.filter((r) => r.position).length }, skipped, fx };
}

// ---- Plan-capability mapping: which capabilities are included in which plan
function planCapabilities(store) {
  const today = store.today();
  const comps = store.list('Competitor', (c) => c.status !== 'Retired');
  const result = comps.map((c) => {
    const prices = competitorCells(store, c).filter((x) => x.type === 'PricePoint' && x.status !== 'Retired');
    const caps = competitorCells(store, c).filter((x) => x.type === 'CompetitorCapability' && x.status !== 'Retired');
    const plans = prices.map((p) => {
      // capabilities linked to this plan via includes_capability
      const planCaps = store.out(p.id, 'includes_capability').map((l) => store.get(l.target)).filter((x) => x && x.type === 'CompetitorCapability' && x.status !== 'Retired');
      return {
        id: p.id, plan: p.plan, amount: p.amount, currency: p.currency,
        billing_model: p.billing_model, billing_period: p.billing_period || null,
        capabilities: planCaps.map((cap) => ({ id: cap.id, tag: capabilityTag(store, cap), their_name: cap.capability_tag, level: cap.level })),
      };
    });
    return {
      id: c.id, title: c.title, tier: c.tier || null,
      plans, total_capabilities: caps.length,
      mapped_plans: plans.filter((p) => p.capabilities.length > 0).length,
      unmapped_plans: plans.filter((p) => p.capabilities.length === 0).length,
    };
  });
  return result;
}

/** A competitor provides a feature when it is rated strong, parity or partial, or when one of its plans includes it (unless rated absent). */
export const provides = (store, cell) => ['strong', 'parity', 'partial'].includes(cell.level) || (cell.level !== 'absent' && store.inn(cell.id, 'includes_capability').length > 0);

// ---- Common features: our features ordered by how many competitors offer them, with who lacks each
function mustHaveCapabilities(store, thresholdPct = 80, scope = '') {
  const comps = liveCompetitors(store, scope);
  if (comps.length < 2) return { threshold_pct: thresholdPct, competitor_count: comps.length, capabilities: [], note: 'Need at least 2 competitors to see which features are common.' };
  const offered = new Map<string, Set<string>>();
  for (const c of comps) {
    for (const cell of competitorCells(store, c).filter((x) => x.type === 'CompetitorCapability' && x.status !== 'Retired')) {
      if (!provides(store, cell)) continue;
      const tag = capabilityTag(store, cell);
      offered.set(tag, new Set([...(offered.get(tag) || []), c.id]));
    }
  }
  const threshold = Math.max(1, Math.ceil(comps.length * thresholdPct / 100));
  const catByName = new Map<string, any>(store.list('Capability', (c) => c.status !== 'Retired').map((c) => [String(c.title).trim().toLowerCase(), c]));
  const capabilities = [...offered.entries()]
    .map(([tag, ids]) => ({ tag, category: (catByName.get(tag.trim().toLowerCase()) || {}).category || null, offered_by: ids.size, of_total: comps.length, pct: Math.round((ids.size / comps.length) * 100), missing: comps.filter((c) => !ids.has(c.id)).map((c) => ({ id: c.id, title: c.title })) }))
    .filter((x) => x.offered_by >= threshold)
    .sort((a, b) => b.offered_by - a.offered_by || a.tag.localeCompare(b.tag));
  return { threshold_pct: thresholdPct, threshold_count: threshold, competitor_count: comps.length, capabilities };
}

// ---- Feature catalog: our common names for features, and the competitor ratings still using only their own name
const words = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2);

function catalog(store) {
  const entries = store.list('Capability', (c) => c.status !== 'Retired');
  const ratings = store.list('CompetitorCapability', (r) => r.status !== 'Retired');
  const mapped = new Map<string, any[]>();
  const unmapped: any[] = [];
  const mapping: Record<string, { capability_id: string; link_id: string }> = {};
  for (const r of ratings) {
    const lnk = store.out(r.id, 'maps_to').find((l) => { const t = store.get(l.target); return t && t.type === 'Capability'; });
    const m = lnk ? store.get(lnk.target) : null;
    if (m) { mapped.set(m.id, [...(mapped.get(m.id) || []), r]); mapping[r.id] = { capability_id: m.id, link_id: lnk.id }; } else unmapped.push(r);
  }
  const list = entries.map((cap) => {
    const rs = mapped.get(cap.id) || [];
    const comps = new Map<string, any>();
    for (const r of rs) {
      const owner = ownerOf(store, r);
      if (!owner) continue;
      const cur = comps.get(owner.id) || { id: owner.id, title: owner.title, level: 'unknown', provides: false, their_names: [] as string[] };
      if (provides(store, r)) cur.provides = true;
      if ((LEVEL_SCORE[r.level] ?? -1) > (LEVEL_SCORE[cur.level] ?? -1)) cur.level = r.level;
      const nm = r.capability_tag; if (nm && !cur.their_names.includes(nm)) cur.their_names.push(nm);
      comps.set(owner.id, cur);
    }
    return { id: cap.id, name: cap.title, category: cap.category || null, description: cap.description || null, aliases: cap.aliases || [], competitors: [...comps.values()], offered_by: [...comps.values()].filter((x) => x.provides).length, ratings: rs.length };
  }).sort((a, b) => (a.category || '~').localeCompare(b.category || '~') || a.name.localeCompare(b.name));
  // ratings that only carry a name: group by the name, and suggest the closest catalog entry
  const groups = new Map<string, any>();
  for (const r of unmapped) {
    const key = String(r.capability_tag || '').trim().toLowerCase();
    if (!key) continue;
    const owner = ownerOf(store, r);
    const g = groups.get(key) || { name: r.capability_tag, rating_ids: [] as string[], competitors: [] as any[] };
    g.rating_ids.push(r.id);
    if (owner && !g.competitors.find((x) => x.id === owner.id)) g.competitors.push({ id: owner.id, title: owner.title });
    groups.set(key, g);
  }
  const suggest = (name) => {
    const n = String(name).toLowerCase().trim(); const nw = new Set(words(name));
    let best: any = null;
    for (const e of entries) {
      const names = [e.title, ...(e.aliases || [])];
      if (names.some((x) => String(x).toLowerCase().trim() === n)) return { id: e.id, name: e.title, basis: 'same name' };
      for (const x of names) {
        const w = words(x); if (!w.length || !nw.size) continue;
        const common = w.filter((t) => nw.has(t)).length; const score = common / Math.max(w.length, nw.size);
        if (common >= 1 && score >= 0.5 && (!best || score > best.score)) best = { id: e.id, name: e.title, basis: 'similar words', score };
      }
    }
    return best ? { id: best.id, name: best.name, basis: best.basis } : null;
  };
  const names = [...groups.values()].map((g) => ({ ...g, suggestion: suggest(g.name) })).sort((a, b) => b.rating_ids.length - a.rating_ids.length || a.name.localeCompare(b.name));
  return { capabilities: list, unmapped: names, mapping, counts: { capabilities: list.length, mapped_ratings: ratings.length - unmapped.length, unmapped_ratings: unmapped.length, unmapped_names: names.length } };
}

/**
 * Put features on our list and give EVERY competitor an unrated row for each, so the grid has the same rows for all of them.
 * Nothing is rated here: each new row is level "unknown" until someone checks the competitor. Features already on the list, and
 * competitors that already have a row for a feature, are left alone. Retired competitors are skipped.
 */
function addCommonFeatures(store, features: { name: string; category?: string; description?: string }[], actor) {
  const clean = (features || []).map((f) => ({ name: String(f && f.name || '').trim(), category: String(f && f.category || '').trim(), description: String(f && f.description || '').trim() })).filter((f) => f.name);
  if (!clean.length) throw Object.assign(new Error('Give at least one feature name.'), { status: 422 });
  if (clean.length > 60) throw Object.assign(new Error('Add at most 60 features at a time.'), { status: 422 });
  const comps = store.list('Competitor', (c) => c.status !== 'Retired');
  if (!comps.length) throw Object.assign(new Error('There are no competitors yet. Add one first.'), { status: 422 });
  const today = store.today();
  const out = { features_added: 0, features_existing: 0, rows_added: 0, rows_existing: 0, competitors: comps.length };
  for (const f of clean) {
    let cap = store.list('Capability', (c) => c.status !== 'Retired').find((c) => String(c.title).trim().toLowerCase() === f.name.toLowerCase());
    if (cap) out.features_existing++;
    else {
      cap = store.create('Capability', { title: f.name, ...(f.category ? { category: f.category } : {}), ...(f.description ? { description: f.description } : {}), status: 'Active' }, { actor });
      out.features_added++;
    }
    for (const c of comps) {
      const have = cellsOf(store, c).some((r) => r.type === 'CompetitorCapability' && r.status !== 'Retired' && capabilityTag(store, r).toLowerCase() === f.name.toLowerCase());
      if (have) { out.rows_existing++; continue; }
      const row = store.create('CompetitorCapability', { title: `${c.title}: ${f.name}`, capability_tag: f.name, level: 'unknown', importance: 3, captured_on: today }, { actor });
      store.link('contains', c.id, row.id, {}, { actor });
      store.link('maps_to', row.id, cap.id, {}, { actor });
      out.rows_added++;
    }
  }
  return out;
}

export { tierView, grid, prices, sources, effort, productLines, productLinesOf, completeness, completenessOf, normalizedPricing, planCapabilities, mustHaveCapabilities, catalog, addCommonFeatures, CAPS };

