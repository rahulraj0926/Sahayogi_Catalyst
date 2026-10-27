/**
 * engine/competitor_plans.ts - plans and the features each plan includes.
 *
 * A competitor plan is one or more PricePoints with the same plan name (one per term: monthly, yearly, lifetime...), under the same
 * product line and licence type. A plan includes a feature when its price point(s) link `includes_capability` to the competitor's
 * rating of that feature; the rating is mapped (`maps_to`) to one of OUR common features (Capability), so plans of different
 * competitors line up. Our own plans (PricingPlan) link `offers` to the same Capability list.
 */
import { lineOf, cellsOf, liveCompetitors } from './competitor_owner';
import { normalizedPricing, POSITIONS, POSITION_NAME } from './competitors';
const LEVEL_SCORE = { strong: 3, parity: 2, partial: 1, absent: 0 };
const httpErr = (status, message) => Object.assign(new Error(message), { status });
const live = (x) => x && x.status !== 'Retired';

/** Our features by lowercase name and by every alias, so a rating that was never mapped by hand still lines up when its name matches. */
function catalogIndex(store) {
  const idx = new Map<string, any>();
  for (const cap of store.list('Capability', (c) => c.status !== 'Retired')) {
    for (const n of [cap.title, ...(Array.isArray(cap.aliases) ? cap.aliases : [])]) { const k = String(n || '').trim().toLowerCase(); if (k && !idx.has(k)) idx.set(k, cap); }
  }
  return idx;
}

/** The feature a rating stands for: our Capability id when mapped (or when its name or an alias matches one), else its own lowercase name. */
function featureKey(store, rating, idx = null) {
  let m = store.out(rating.id, 'maps_to').map((l) => store.get(l.target)).find((x) => x && x.type === 'Capability' && x.status !== 'Retired');
  if (!m) m = (idx || catalogIndex(store)).get(String(rating.capability_tag || '').trim().toLowerCase());
  return m ? { key: m.id, name: m.title, capability_id: m.id, category: m.category || null } : { key: `r:${String(rating.capability_tag || '').trim().toLowerCase()}`, name: rating.capability_tag, capability_id: null, category: null };
}

/** A competitor's plans, each with the feature keys it includes. */
function groupsOf(store, comp, idx = null, positions: Map<string, string> | null = null) {
  idx = idx || catalogIndex(store);
  const prices = cellsOf(store, comp).filter((x) => x.type === 'PricePoint' && live(x));
  const groups = new Map<string, any>();
  for (const p of prices) {
    const line = lineOf(store, p);
    const key = [line ? line.id : '', String(p.plan || p.title).trim().toLowerCase(), p.seat_model || ''].join('|');
    let g = groups.get(key);
    if (!g) { g = { key, plan: p.plan || p.title, product: line ? line.product_name : null, product_id: line ? line.id : null, position: positions ? positions.get(`${comp.id}|${key}`) || null : null, seat_model: p.seat_model || null, max_users: p.max_users || null, terms: [], price_ids: [], feature_keys: new Set<string>() }; groups.set(key, g); }
    g.price_ids.push(p.id);
    g.terms.push({ id: p.id, period: p.billing_model === 'one_time' ? 'one_time' : (p.billing_period || 'month'), billing_model: p.billing_model, amount: p.amount, currency: p.currency, unit: p.unit, price_type: p.price_type });
    for (const l of store.out(p.id, 'includes_capability')) {
      const r = store.get(l.target);
      if (r && r.type === 'CompetitorCapability' && live(r)) g.feature_keys.add(featureKey(store, r, idx).key);
    }
  }
  return [...groups.values()];
}

/** Where each plan sits among its own company's plans (free, cheapest paid, most expensive), by `<competitor>|<product line>|<plan>|<licence>`. Worked out from the prices, never typed in. */
function positionMap(store, scope = '') {
  const m = new Map<string, string>();
  for (const r of normalizedPricing(store, { users: '1', scope }).rows) if (r.position) m.set(r.key, r.position);
  return m;
}

const periodOrder = { month: 1, quarter: 2, year: 3, one_time: 4 };

/** No competitor given: the list to choose from. With one: its plans, the features, and which plan includes what. */
function plans(store, query: any = {}) {
  const comps = liveCompetitors(store, query.scope);
  const idx = catalogIndex(store);
  const pos = positionMap(store, query.scope);
  const list = comps.map((c) => { const g = groupsOf(store, c, idx, pos); return { id: c.id, title: c.title, tier: c.tier || null, plan_count: g.length, plans_with_features: g.filter((x) => x.feature_keys.size > 0).length }; });
  list.sort((a, b) => String(a.tier || 'Z').localeCompare(String(b.tier || 'Z')) || a.title.localeCompare(b.title));
  if (!query.competitor) return { competitors: list };
  const comp = comps.find((c) => c.id === query.competitor);
  if (!comp) throw httpErr(404, `competitor ${query.competitor} not found (or retired)`);
  const groups = groupsOf(store, comp, idx, pos).sort((a, b) => (POSITIONS.indexOf(a.position) + 1 || 9) - (POSITIONS.indexOf(b.position) + 1 || 9) || String(a.plan).localeCompare(String(b.plan)));
  const ratings = cellsOf(store, comp).filter((x) => x.type === 'CompetitorCapability' && live(x));
  const rows = new Map<string, any>();
  for (const cap of store.list('Capability', (c) => c.status !== 'Retired')) rows.set(cap.id, { key: cap.id, name: cap.title, capability_id: cap.id, category: cap.category || null, rating_id: null, level: null, their_name: null });
  for (const r of ratings) {
    const f = featureKey(store, r, idx);
    const row = rows.get(f.key) || { key: f.key, name: f.name, capability_id: f.capability_id, category: f.category, rating_id: null, level: null, their_name: null };
    if (!row.rating_id || (LEVEL_SCORE[r.level] ?? -1) > (LEVEL_SCORE[row.level] ?? -1)) { row.rating_id = r.id; row.level = r.level; row.their_name = r.capability_tag; }
    rows.set(f.key, row);
  }
  const features = [...rows.values()].map((r) => ({ ...r, in_plans: groups.filter((g) => g.feature_keys.has(r.key)).map((g) => g.key) }))
    .sort((a, b) => (b.in_plans.length - a.in_plans.length) || (a.category || '~').localeCompare(b.category || '~') || a.name.localeCompare(b.name));
  const out = groups.map((g) => ({ ...g, terms: g.terms.sort((a, b) => (periodOrder[a.period] || 9) - (periodOrder[b.period] || 9)), feature_keys: [...g.feature_keys], feature_count: g.feature_keys.size }));
  return { competitors: list, competitor: { id: comp.id, title: comp.title, tier: comp.tier || null, website: comp.website || null }, plans: out, features, summary: { plans: out.length, features_listed: features.length, features_in_some_plan: features.filter((f) => f.in_plans.length > 0).length, plans_without_features: out.filter((g) => g.feature_count === 0).length } };
}

/** Say that a plan (all of its terms) includes, or no longer includes, a feature. Creates the competitor's unrated row for the feature if it has none. */
function setPlanFeature(store, body: any, actor) {
  if (Array.isArray(body.features)) return setPlanFeatures(store, body, actor);
  const comp = store.get(body.competitor);
  if (!comp || comp.type !== 'Competitor') throw httpErr(404, 'competitor not found');
  const priceIds: string[] = Array.isArray(body.price_ids) ? body.price_ids : [];
  if (!priceIds.length) throw httpErr(422, 'price_ids is required');
  const owned = new Set(cellsOf(store, comp).filter((x) => x.type === 'PricePoint').map((x) => x.id));
  for (const id of priceIds) if (!owned.has(id)) throw httpErr(422, `${id} is not a price of ${comp.title}`);
  let rating = body.rating_id ? store.get(body.rating_id) : null;
  if (rating && (rating.type !== 'CompetitorCapability' || !cellsOf(store, comp).some((x) => x.id === rating.id))) throw httpErr(422, 'that rating does not belong to this competitor');
  if (!rating) {
    const cap = store.get(body.capability_id);
    if (!cap || cap.type !== 'Capability') throw httpErr(422, 'capability_id must be a feature on our list');
    rating = cellsOf(store, comp).filter((x) => x.type === 'CompetitorCapability' && live(x)).find((r) => featureKey(store, r).key === cap.id) || null;
    if (!rating && body.included) {
      rating = store.create('CompetitorCapability', { title: `${comp.title}: ${cap.title}`, capability_tag: cap.title, level: 'unknown', importance: 3, captured_on: store.today() }, { actor });
      store.link('contains', comp.id, rating.id, {}, { actor });
      store.link('maps_to', rating.id, cap.id, {}, { actor });
    }
  }
  if (!rating) return { ok: true, rating_id: null };
  for (const pid of priceIds) {
    const existing = store.out(pid, 'includes_capability').find((l) => l.target === rating.id);
    if (body.included && !existing) store.link('includes_capability', pid, rating.id, {}, { actor });
    if (!body.included && existing) store.unlink(existing.id, { actor });
  }
  return { ok: true, rating_id: rating.id };
}

/** Many features at once for one plan: `features` is a list of { capability_id } or { rating_id }; `included` applies to all of them. */
function setPlanFeatures(store, body: any, actor) {
  const list: any[] = body.features;
  if (list.length > 500) throw httpErr(422, 'Change at most 500 features at a time.');
  for (const f of list) if (!f || (!f.capability_id && !f.rating_id)) throw httpErr(422, 'every feature needs a capability_id or a rating_id');
  for (const f of list) setPlanFeature(store, { competitor: body.competitor, price_ids: body.price_ids, included: body.included, capability_id: f.capability_id, rating_id: f.rating_id }, actor);
  return { ok: true, count: list.length };
}

/**
 * Across all competitors: for each plan position (free, cheapest paid, most expensive), how many of the plans in that position that
 * list features include each feature. A position is worked out from the prices (see competitors.ts), never typed in.
 * `any` is the share of COMPANIES (not plans) that offer the feature in at least one plan, which is the fairest "common feature" number.
 */
function planPositionFeatures(store, scope = '') {
  const comps = liveCompetitors(store, scope);
  const idx = catalogIndex(store);
  const pos = positionMap(store, scope);
  const inPosition: Record<string, any[]> = Object.fromEntries(POSITIONS.map((l) => [l, []]));
  const names = new Map<string, any>();
  const offeredBy = new Map<string, Set<string>>();
  const featured = new Set<string>();
  for (const c of comps) {
    for (const g of groupsOf(store, c, idx, pos)) {
      if (g.position) inPosition[g.position].push(g);
      if (g.feature_keys.size) featured.add(c.id);
      for (const k of g.feature_keys) (offeredBy.get(k) || offeredBy.set(k, new Set()).get(k)!).add(c.id);
    }
    for (const r of cellsOf(store, c).filter((x) => x.type === 'CompetitorCapability' && live(x))) { const f = featureKey(store, r, idx); if (!names.has(f.key)) names.set(f.key, f); }
  }
  const positions = POSITIONS.map((l) => {
    const ps = inPosition[l]; const withF = ps.filter((g) => g.feature_keys.size > 0);
    return { position: l, label: POSITION_NAME[l], plans: ps.length, plans_with_features: withF.length, avg_features: withF.length ? Math.round((10 * withF.reduce((n, g) => n + g.feature_keys.size, 0)) / withF.length) / 10 : null };
  }).filter((l) => l.plans > 0);
  const features: any[] = [];
  for (const [key, f] of names) {
    const by_position: Record<string, any> = {}; let used = 0; let of = 0;
    for (const l of positions) {
      const withF = inPosition[l.position].filter((g) => g.feature_keys.size > 0);
      const count = withF.filter((g) => g.feature_keys.has(key)).length;
      by_position[l.position] = { count, of: withF.length, pct: withF.length ? Math.round((100 * count) / withF.length) : null };
      used += count; of += withF.length;
    }
    const companies = (offeredBy.get(key) || new Set()).size;
    if (used === 0 && companies === 0) continue;
    features.push({ key, name: f.name, capability_id: f.capability_id, category: f.category, by_position, any: { count: companies, of: featured.size, pct: featured.size ? Math.round((100 * companies) / featured.size) : null }, plans_with: used, plans_of: of, overall_pct: of ? Math.round((100 * used) / of) : 0 });
  }
  features.sort((a, b) => (b.any.pct ?? 0) - (a.any.pct ?? 0) || b.overall_pct - a.overall_pct || a.name.localeCompare(b.name));
  return { positions, features, note: positions.every((l) => l.plans_with_features === 0) ? 'No plan lists its features yet. Open "Plans and features", pick a competitor and tick what each plan includes.' : null };
}

/** Our plans and which of our features each includes. */
function ourPlans(store) {
  const monthly = (p) => (p.is_free ? 0 : p.price_monthly ?? (p.price_yearly != null ? p.price_yearly / 12 : p.amount ?? 0));
  const plans = store.list('PricingPlan', (p) => !['Deprecated', 'Rejected'].includes(p.status)).sort((a, b) => monthly(a) - monthly(b) || String(a.title).localeCompare(String(b.title)));
  const caps = store.list('Capability', (c) => c.status !== 'Retired');
  const features = caps.map((cap) => ({ capability_id: cap.id, name: cap.title, category: cap.category || null, in_plans: plans.filter((p) => store.out(p.id, 'offers').some((l) => l.target === cap.id)).map((p) => p.id) }))
    .sort((a, b) => (a.category || '~').localeCompare(b.category || '~') || a.name.localeCompare(b.name));
  // plans saved before there were separate monthly and yearly prices keep their one price under the period they had
  const outPlans = plans.map((p) => ({
    id: p.id, title: p.title, status: p.status, amount: p.amount ?? null, currency: p.currency || null, billing_period: p.billing_period || null, unit: p.unit || null, is_free: !!p.is_free,
    price_monthly: p.price_monthly ?? (p.billing_period === 'monthly' ? p.amount ?? null : null),
    price_yearly: p.price_yearly ?? (p.billing_period === 'yearly' ? p.amount ?? null : null),
    seat_model: p.seat_model || null, max_users: p.max_users ?? null,
    feature_count: features.filter((f) => f.in_plans.includes(p.id)).length,
  }));
  return { plans: outPlans, features };
}

const nameKey = (n: unknown) => String(n || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '');

/**
 * Features competitors have that are not on our list yet, to pick from when building our own plans. Nothing is added or suggested:
 * the same feature under slightly different spellings is one row, with how many competitors have it.
 * query: position (free, cheapest or top: only plans in that position), competitor (one competitor), q (search), offset, limit (default 30, at most 500),
 * names_only (every matching name, at most 5000, for "pick all").
 */
function pickFeatures(store, query: any = {}) {
  const tier = String(query.position || '');
  if (tier && !(POSITIONS as readonly string[]).includes(tier)) throw httpErr(422, `position must be one of ${POSITIONS.join(', ')}`);
  const q = String(query.q || '').trim().toLowerCase();
  const idx = catalogIndex(store);
  const comps = liveCompetitors(store, query.scope);
  const pos = tier ? positionMap(store, query.scope) : null;
  const one = String(query.competitor || '');
  const rows = new Map<string, { name: string; competitors: Map<string, string> }>();
  const counts = new Map<string, number>();
  for (const c of comps) {
    const names = new Set<string>();
    if (tier) {
      for (const g of groupsOf(store, c, idx, pos)) {
        if (g.position !== tier) continue;
        for (const k of g.feature_keys) if (String(k).startsWith('r:')) names.add(String(k).slice(2));
      }
    }
    // the name as the competitor wrote it
    for (const r of cellsOf(store, c).filter((x) => x.type === 'CompetitorCapability' && live(x))) {
      const f = featureKey(store, r, idx);
      if (f.capability_id) continue; // already one of ours
      if (tier && !names.has(String(f.key).slice(2))) continue;
      const nk = nameKey(r.capability_tag); if (!nk) continue;
      counts.set(c.id, (counts.get(c.id) || 0) + 1);
      if (one && c.id !== one) continue;
      const row = rows.get(nk) || { name: String(r.capability_tag).trim(), competitors: new Map<string, string>() };
      row.competitors.set(c.id, c.title); rows.set(nk, row);
    }
  }
  let list = [...rows.values()];
  if (q) list = list.filter((r) => r.name.toLowerCase().includes(q));
  list.sort((a, b) => b.competitors.size - a.competitors.size || a.name.localeCompare(b.name));
  const total = list.length;
  if (query.names_only) return { total, names: list.slice(0, 5000).map((r) => r.name) };
  const limit = Math.max(1, Math.min(500, Number(query.limit) || 30));
  const offset = Math.max(0, Number(query.offset) || 0);
  return {
    total, offset, limit,
    competitors: comps.map((c) => ({ id: c.id, title: c.title, features: counts.get(c.id) || 0 })).filter((c) => c.features > 0).sort((a, b) => a.title.localeCompare(b.title)),
    features: list.slice(offset, offset + limit).map((r) => ({ name: r.name, count: r.competitors.size, competitors: [...r.competitors.values()].slice(0, 4) })),
  };
}

function setOurPlanFeature(store, body: any, actor) {
  if (Array.isArray(body.capability_ids)) {
    if (body.capability_ids.length > 500) throw httpErr(422, 'Change at most 500 features at a time.');
    for (const capability_id of body.capability_ids) setOurPlanFeature(store, { plan_id: body.plan_id, capability_id, included: body.included }, actor);
    return { ok: true, count: body.capability_ids.length };
  }
  const plan = store.get(body.plan_id); const cap = store.get(body.capability_id);
  if (!plan || plan.type !== 'PricingPlan') throw httpErr(404, 'plan not found');
  if (!cap || cap.type !== 'Capability') throw httpErr(422, 'capability_id must be a feature on our list');
  const existing = store.out(plan.id, 'offers').find((l) => l.target === cap.id);
  if (body.included && !existing) store.link('offers', plan.id, cap.id, {}, { actor });
  if (!body.included && existing) store.unlink(existing.id, { actor });
  return { ok: true };
}

/**
 * Add many features to OUR list in one go, optionally switching them on in some of our plans. A name that is already on the list
 * is not added twice (the existing feature is used, so it can still be put into the plans).
 */
function addOurFeatures(store, body: any, actor) {
  const raw: any[] = Array.isArray(body && body.features) ? body.features : [];
  const clean = raw.map((f) => ({ name: String(f && f.name || '').trim(), category: String(f && f.category || '').trim() })).filter((f) => f.name);
  if (!clean.length) throw httpErr(422, 'Give at least one feature name.');
  if (clean.length > 300) throw httpErr(422, 'Add at most 300 features at a time.');
  const planIds: string[] = Array.isArray(body.plan_ids) ? body.plan_ids : [];
  const plans = planIds.map((id) => { const p = store.get(id); if (!p || p.type !== 'PricingPlan') throw httpErr(422, `${id} is not one of our plans`); return p; });
  const byName = new Map<string, any>();
  for (const c of store.list('Capability', (x) => x.status !== 'Retired')) byName.set(String(c.title).trim().toLowerCase(), c);
  const out = { added: 0, existing: 0, linked: 0, ids: [] as string[] };
  for (const f of clean) {
    let cap = byName.get(f.name.toLowerCase());
    if (cap) out.existing++;
    else { cap = store.create('Capability', { title: f.name, ...(f.category ? { category: f.category } : {}), status: 'Active' }, { actor }); byName.set(f.name.toLowerCase(), cap); out.added++; }
    out.ids.push(cap.id);
    for (const p of plans) if (!store.out(p.id, 'offers').some((l) => l.target === cap.id)) { store.link('offers', p.id, cap.id, {}, { actor }); out.linked++; }
  }
  return out;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const avg = (v: number[]) => (v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null);
const usersOf = (q: any) => { const u = q && q.users !== undefined && q.users !== '' ? Number(q.users) : 1; if (!Number.isFinite(u) || u < 1) throw httpErr(422, 'users must be 1 or more'); return Math.floor(u); };

/**
 * What our own plan at each position should look like, from the competitors' plans in that position (free, cheapest paid, most
 * expensive; worked out from prices): the average price (yearly, for ONE user count) and the features that at least `threshold`% of those
 * plans include. "new_features" is what a position adds over the one before it, so a ladder reads as: Free has these, the cheapest paid
 * plan adds these, the top plan adds these.
 */
function recommended(store, query: any = {}) {
  const threshold = clamp(Number(query.threshold) || 60, 1, 100);
  const users = usersOf(query);
  const scope = String(query.scope || '');
  const market = planPositionFeatures(store, scope);
  const priced = normalizedPricing(store, { users: String(users), scope });
  let prev: Set<string> | null = null; let prevName: string | null = null;
  const positions = market.positions.map((l) => {
    const rows = (priced.positions.find((t) => t.position === l.position)?.rows || []) as any[];
    const yearly = rows.map((r) => r.yearly_inr).filter((v) => v !== null && v !== undefined) as number[];
    const once = rows.map((r) => r.once_inr).filter((v) => v !== null && v !== undefined) as number[];
    const features = market.features
      .filter((f) => f.by_position[l.position] && f.by_position[l.position].pct !== null && f.by_position[l.position].pct >= threshold)
      .map((f) => ({ key: f.key, name: f.name, capability_id: f.capability_id, count: f.by_position[l.position].count, of: f.by_position[l.position].of, pct: f.by_position[l.position].pct }))
      .sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name));
    const keys = new Set(features.map((f) => f.key));
    const out = {
      position: l.position, label: l.label, plans: l.plans, plans_with_features: l.plans_with_features, competitors: new Set(rows.map((r) => r.competitor.id)).size,
      plan_names: rows.map((r) => `${r.competitor.title} ${r.plan}`),
      price: { count: yearly.length, avg_yearly_inr: avg(yearly), avg_monthly_inr: yearly.length ? Math.round(yearly.reduce((a, b) => a + b, 0) / yearly.length / 12) : null, min_yearly_inr: yearly.length ? Math.min(...yearly) : null, max_yearly_inr: yearly.length ? Math.max(...yearly) : null, once_count: once.length, avg_once_inr: avg(once) },
      features, new_features: features.filter((f) => !prev || !prev.has(f.key)).map((f) => f.name), builds_on: prevName,
    };
    prev = keys; prevName = l.label;
    return out;
  });
  return { threshold, users, scope: scope || null, positions, note: market.note };
}

/**
 * Plans of different competitors side by side at ONE position (e.g. everyone's free plan, or everyone's cheapest paid plan): one column
 * per plan with its price and the features it includes. A competitor with several plans in the position gets several columns.
 */
function comparePlans(store, query: any = {}) {
  const level = String(query.position || '');
  if (!(POSITIONS as readonly string[]).includes(level)) throw httpErr(422, `position must be one of ${POSITIONS.join(', ')}`);
  const users = usersOf(query);
  const scope = String(query.scope || '');
  const comps = liveCompetitors(store, scope);
  const idx = catalogIndex(store);
  const priced = normalizedPricing(store, { users: String(users), scope });
  const priceBy = new Map<string, any>();
  for (const r of priced.rows) priceBy.set([r.competitor.id, String(r.plan).toLowerCase(), r.seat_model || '', r.product || ''].join('|'), r);
  // A competitor with no plan in this position can be shown by another position instead (?fallback=cheapest), e.g. a company with no free plan by its cheapest paid plan.
  const fallback = (POSITIONS as readonly string[]).includes(String(query.fallback || '')) && String(query.fallback) !== level ? String(query.fallback) : '';
  const pos = new Map<string, string>(priced.rows.filter((r) => r.position).map((r) => [r.key, r.position]));
  const columns: any[] = []; const without: any[] = []; let fallbackUsed = 0;
  for (const c of comps) {
    const all = groupsOf(store, c, idx, pos);
    let gs = all.filter((g) => g.position === level);
    let shownAs = '';
    if (!gs.length && fallback) { gs = all.filter((g) => g.position === fallback); if (gs.length) { shownAs = fallback; fallbackUsed += 1; } }
    if (!gs.length) { without.push({ id: c.id, title: c.title }); continue; }
    for (const g of gs) {
      const pr = priceBy.get([c.id, String(g.plan).toLowerCase(), g.seat_model || '', g.product || ''].join('|'));
      columns.push({ key: `${c.id}|${g.key}`, shown_as: shownAs || null, shown_as_label: shownAs ? POSITION_NAME[shownAs] : null, competitor: { id: c.id, title: c.title, tier: c.tier || null }, plan: g.plan, product: g.product, seat_model: g.seat_model, max_users: g.max_users, yearly_inr: pr ? pr.yearly_inr : null, once_inr: pr ? pr.once_inr : null, feature_keys: [...g.feature_keys], feature_count: g.feature_keys.size });
    }
  }
  const names = new Map<string, any>();
  for (const c of comps) for (const r of cellsOf(store, c).filter((x) => x.type === 'CompetitorCapability' && live(x))) { const f = featureKey(store, r, idx); if (!names.has(f.key)) names.set(f.key, f); }
  const counted = columns.filter((c) => c.feature_count > 0).length;
  const features = [...names.values()].map((f) => ({ key: f.key, name: f.name, category: f.category, count: columns.filter((c) => c.feature_keys.includes(f.key)).length }))
    .filter((f) => f.count > 0).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return { position: level, label: POSITION_NAME[level], fallback: fallback || null, fallback_label: fallback ? POSITION_NAME[fallback] : null, fallback_used: fallbackUsed, users, columns, features, without_plan: without, columns_with_features: counted };
}

export { plans, setPlanFeature, planPositionFeatures, ourPlans, setOurPlanFeature, addOurFeatures, pickFeatures, recommended, comparePlans, groupsOf, featureKey, catalogIndex, positionMap };
