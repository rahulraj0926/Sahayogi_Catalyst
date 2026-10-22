/**
 * engine/competitor_plans.ts - plans and the features each plan includes.
 *
 * A competitor plan is one or more PricePoints with the same plan name (one per term: monthly, yearly, lifetime...), under the same
 * product line and licence type. A plan includes a feature when its price point(s) link `includes_capability` to the competitor's
 * rating of that feature; the rating is mapped (`maps_to`) to one of OUR common features (Capability), so plans of different
 * competitors line up. Our own plans (PricingPlan) link `offers` to the same Capability list.
 */
import { lineOf, cellsOf, liveCompetitors } from './competitor_owner';
import { normalizedPricing } from './competitors';

const LEVELS = ['free', 'entry', 'mid', 'top', 'enterprise'];
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
function groupsOf(store, comp, idx = null) {
  idx = idx || catalogIndex(store);
  const prices = cellsOf(store, comp).filter((x) => x.type === 'PricePoint' && live(x));
  const groups = new Map<string, any>();
  for (const p of prices) {
    const line = lineOf(store, p);
    const key = [line ? line.id : '', String(p.plan || p.title).trim().toLowerCase(), p.seat_model || ''].join('|');
    let g = groups.get(key);
    if (!g) { g = { key, plan: p.plan || p.title, product: line ? line.product_name : null, product_id: line ? line.id : null, tier_tag: null, seat_model: p.seat_model || null, max_users: p.max_users || null, terms: [], price_ids: [], feature_keys: new Set<string>() }; groups.set(key, g); }
    if (!g.tier_tag && p.tier_tag) g.tier_tag = p.tier_tag;
    g.price_ids.push(p.id);
    g.terms.push({ id: p.id, period: p.billing_model === 'one_time' ? 'one_time' : (p.billing_period || 'month'), billing_model: p.billing_model, amount: p.amount, currency: p.currency, unit: p.unit, price_type: p.price_type });
    for (const l of store.out(p.id, 'includes_capability')) {
      const r = store.get(l.target);
      if (r && r.type === 'CompetitorCapability' && live(r)) g.feature_keys.add(featureKey(store, r, idx).key);
    }
  }
  return [...groups.values()];
}

const periodOrder = { month: 1, quarter: 2, year: 3, one_time: 4 };

/** No competitor given: the list to choose from. With one: its plans, the features, and which plan includes what. */
function plans(store, query: any = {}) {
  const comps = liveCompetitors(store, query.scope);
  const idx = catalogIndex(store);
  const list = comps.map((c) => { const g = groupsOf(store, c, idx); return { id: c.id, title: c.title, tier: c.tier || null, plan_count: g.length, plans_with_features: g.filter((x) => x.feature_keys.size > 0).length }; });
  list.sort((a, b) => String(a.tier || 'Z').localeCompare(String(b.tier || 'Z')) || a.title.localeCompare(b.title));
  if (!query.competitor) return { competitors: list };
  const comp = comps.find((c) => c.id === query.competitor);
  if (!comp) throw httpErr(404, `competitor ${query.competitor} not found (or retired)`);
  const groups = groupsOf(store, comp, idx).sort((a, b) => (LEVELS.indexOf(a.tier_tag || '') + 1 || 9) - (LEVELS.indexOf(b.tier_tag || '') + 1 || 9) || String(a.plan).localeCompare(String(b.plan)));
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

/** Across all competitors: for each plan level, how many of the plans that list features include each feature. */
function planLevelFeatures(store, scope = '') {
  const comps = liveCompetitors(store, scope);
  const idx = catalogIndex(store);
  const levelPlans: Record<string, any[]> = Object.fromEntries(LEVELS.map((l) => [l, []]));
  const names = new Map<string, any>();
  for (const c of comps) {
    for (const g of groupsOf(store, c, idx)) {
      if (!g.tier_tag) continue;
      levelPlans[g.tier_tag].push(g);
    }
    for (const r of cellsOf(store, c).filter((x) => x.type === 'CompetitorCapability' && live(x))) { const f = featureKey(store, r, idx); if (!names.has(f.key)) names.set(f.key, f); }
  }
  const levels = LEVELS.map((l) => {
    const ps = levelPlans[l]; const withF = ps.filter((g) => g.feature_keys.size > 0);
    return { tier_tag: l, plans: ps.length, plans_with_features: withF.length, avg_features: withF.length ? Math.round((10 * withF.reduce((n, g) => n + g.feature_keys.size, 0)) / withF.length) / 10 : null };
  }).filter((l) => l.plans > 0);
  const features: any[] = [];
  for (const [key, f] of names) {
    const by_level: Record<string, any> = {}; let used = 0; let of = 0;
    for (const l of levels) {
      const withF = levelPlans[l.tier_tag].filter((g) => g.feature_keys.size > 0);
      const count = withF.filter((g) => g.feature_keys.has(key)).length;
      by_level[l.tier_tag] = { count, of: withF.length, pct: withF.length ? Math.round((100 * count) / withF.length) : null };
      used += count; of += withF.length;
    }
    if (used === 0) continue;
    features.push({ key, name: f.name, capability_id: f.capability_id, category: f.category, by_level, plans_with: used, plans_of: of, overall_pct: of ? Math.round((100 * used) / of) : 0 });
  }
  features.sort((a, b) => b.overall_pct - a.overall_pct || b.plans_with - a.plans_with || a.name.localeCompare(b.name));
  return { levels, features, note: levels.every((l) => l.plans_with_features === 0) ? 'No plan lists its features yet. Open "Plans and features", pick a competitor and tick what each plan includes.' : null };
}

const MARKET_SHARE = 50;
/** Our plans, which of our common features each includes, and what competitors give at the same level. */
function ourPlans(store) {
  const plans = store.list('PricingPlan', (p) => !['Deprecated', 'Rejected'].includes(p.status)).sort((a, b) => (LEVELS.indexOf(a.tier_tag || '') + 1 || 9) - (LEVELS.indexOf(b.tier_tag || '') + 1 || 9) || (a.amount ?? 0) - (b.amount ?? 0));
  const market = planLevelFeatures(store);
  const mk = new Map(market.features.map((f) => [f.key, f]));
  const caps = store.list('Capability', (c) => c.status !== 'Retired');
  const features = caps.map((cap) => {
    const m = mk.get(cap.id);
    return { capability_id: cap.id, name: cap.title, category: cap.category || null, market: m ? { by_level: m.by_level, overall_pct: m.overall_pct } : null, in_plans: plans.filter((p) => store.out(p.id, 'offers').some((l) => l.target === cap.id)).map((p) => p.id) };
  }).sort((a, b) => ((b.market ? b.market.overall_pct : -1) - (a.market ? a.market.overall_pct : -1)) || a.name.localeCompare(b.name));
  const outPlans = plans.map((p) => {
    const have = new Set(features.filter((f) => f.in_plans.includes(p.id)).map((f) => f.capability_id));
    const below = p.tier_tag ? features.filter((f) => !have.has(f.capability_id) && f.market && f.market.by_level[p.tier_tag] && f.market.by_level[p.tier_tag].pct !== null && f.market.by_level[p.tier_tag].pct >= MARKET_SHARE).map((f) => f.name) : [];
    return { id: p.id, title: p.title, status: p.status, amount: p.amount ?? null, currency: p.currency || null, billing_period: p.billing_period || null, unit: p.unit || null, is_free: !!p.is_free, tier_tag: p.tier_tag || null, feature_count: have.size, below_market: below };
  });
  return { plans: outPlans, features, market_share_threshold: MARKET_SHARE, levels: market.levels };
}

function setOurPlanFeature(store, body: any, actor) {
  const plan = store.get(body.plan_id); const cap = store.get(body.capability_id);
  if (!plan || plan.type !== 'PricingPlan') throw httpErr(404, 'plan not found');
  if (!cap || cap.type !== 'Capability') throw httpErr(422, 'capability_id must be a feature on our list');
  const existing = store.out(plan.id, 'offers').find((l) => l.target === cap.id);
  if (body.included && !existing) store.link('offers', plan.id, cap.id, {}, { actor });
  if (!body.included && existing) store.unlink(existing.id, { actor });
  return { ok: true };
}

const LEVEL_NAME = { free: 'Free', entry: 'Entry', mid: 'Mid', top: 'Top', enterprise: 'Enterprise' };
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const avg = (v: number[]) => (v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null);
const usersOf = (q: any) => { const u = q && q.users !== undefined && q.users !== '' ? Number(q.users) : 1; if (!Number.isFinite(u) || u < 1) throw httpErr(422, 'users must be 1 or more'); return Math.floor(u); };

/**
 * What our own plan at each level should look like, from the competitors' plans at that level: the average price (yearly, for ONE
 * user count) and the features that at least `threshold`% of those plans include. "new_features" is what a level adds over the level
 * below it, so a ladder of plans reads as: Free has these, Entry adds these, Mid adds these.
 */
function recommended(store, query: any = {}) {
  const threshold = clamp(Number(query.threshold) || 60, 1, 100);
  const users = usersOf(query);
  const scope = String(query.scope || '');
  const market = planLevelFeatures(store, scope);
  const priced = normalizedPricing(store, { users: String(users), scope });
  let prev: Set<string> | null = null; let prevName: string | null = null;
  const levels = market.levels.map((l) => {
    const rows = (priced.tiers.find((t) => t.tier_tag === l.tier_tag)?.rows || []) as any[];
    const yearly = rows.map((r) => r.yearly_inr).filter((v) => v !== null && v !== undefined) as number[];
    const once = rows.map((r) => r.once_inr).filter((v) => v !== null && v !== undefined) as number[];
    const features = market.features
      .filter((f) => f.by_level[l.tier_tag] && f.by_level[l.tier_tag].pct !== null && f.by_level[l.tier_tag].pct >= threshold)
      .map((f) => ({ key: f.key, name: f.name, capability_id: f.capability_id, count: f.by_level[l.tier_tag].count, of: f.by_level[l.tier_tag].of, pct: f.by_level[l.tier_tag].pct }))
      .sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name));
    const keys = new Set(features.map((f) => f.key));
    const out = {
      tier_tag: l.tier_tag, label: LEVEL_NAME[l.tier_tag], plans: l.plans, plans_with_features: l.plans_with_features, competitors: new Set(rows.map((r) => r.competitor.id)).size,
      plan_names: rows.map((r) => `${r.competitor.title} ${r.plan}`),
      price: { count: yearly.length, avg_yearly_inr: avg(yearly), avg_monthly_inr: yearly.length ? Math.round(yearly.reduce((a, b) => a + b, 0) / yearly.length / 12) : null, min_yearly_inr: yearly.length ? Math.min(...yearly) : null, max_yearly_inr: yearly.length ? Math.max(...yearly) : null, once_count: once.length, avg_once_inr: avg(once) },
      features, new_features: features.filter((f) => !prev || !prev.has(f.key)).map((f) => f.name), builds_on: prevName,
    };
    prev = keys; prevName = LEVEL_NAME[l.tier_tag];
    return out;
  });
  return { threshold, users, scope: scope || null, levels, note: market.note };
}

/** Make one of OUR plans from the recommendation for a level: priced at the average yearly price, with the recommended features switched on. */
function createFromRecommendation(store, body: any, actor) {
  const tier = String(body && body.tier_tag || '');
  if (!LEVELS.includes(tier)) throw httpErr(422, 'tier_tag must be one of free, entry, mid, top, enterprise');
  const rec = recommended(store, { threshold: body.threshold, users: body.users, scope: body.scope });
  const lvl = rec.levels.find((l) => l.tier_tag === tier);
  if (!lvl) throw httpErr(422, `No competitor plan is tagged ${LEVEL_NAME[tier]} yet, so there is nothing to recommend.`);
  const title = String(body.title || '').trim() || `${LEVEL_NAME[tier]} (recommended)`;
  const fields: any = { title, currency: 'INR', tier_tag: tier, billing_period: 'yearly', is_free: tier === 'free' };
  if (tier === 'free') fields.amount = 0; else if (lvl.price.avg_yearly_inr !== null) fields.amount = lvl.price.avg_yearly_inr;
  const plan = store.create('PricingPlan', fields, { actor });
  let linked = 0; const notMatched: string[] = [];
  for (const f of lvl.features) {
    if (f.capability_id) { store.link('offers', plan.id, f.capability_id, {}, { actor }); linked++; } else notMatched.push(f.name);
  }
  return { plan_id: plan.id, title, amount: fields.amount ?? null, features_linked: linked, features_not_matched: notMatched };
}

/**
 * Plans of different competitors side by side at ONE level (e.g. everyone's Entry plan): one column per plan with its price and
 * the features it includes. A competitor with several plans at the level gets several columns.
 */
function comparePlans(store, query: any = {}) {
  const level = String(query.level || '');
  if (!LEVELS.includes(level)) throw httpErr(422, 'level must be one of free, entry, mid, top, enterprise');
  const users = usersOf(query);
  const scope = String(query.scope || '');
  const comps = liveCompetitors(store, scope);
  const idx = catalogIndex(store);
  const priced = normalizedPricing(store, { users: String(users), scope });
  const priceBy = new Map<string, any>();
  for (const t of priced.tiers) for (const r of t.rows) priceBy.set([r.competitor.id, String(r.plan).toLowerCase(), r.seat_model || '', r.product || ''].join('|'), r);
  // A competitor with no plan at this level can be shown by another level instead (?fallback=entry), e.g. a company with no free plan by its entry plan.
  const fallback = LEVELS.includes(String(query.fallback || '')) && String(query.fallback) !== level ? String(query.fallback) : '';
  const columns: any[] = []; const without: any[] = []; let fallbackUsed = 0;
  for (const c of comps) {
    const all = groupsOf(store, c, idx);
    let gs = all.filter((g) => g.tier_tag === level);
    let shownAs = '';
    if (!gs.length && fallback) { gs = all.filter((g) => g.tier_tag === fallback); if (gs.length) { shownAs = fallback; fallbackUsed += 1; } }
    if (!gs.length) { without.push({ id: c.id, title: c.title }); continue; }
    for (const g of gs) {
      const pr = priceBy.get([c.id, String(g.plan).toLowerCase(), g.seat_model || '', g.product || ''].join('|'));
      columns.push({ key: `${c.id}|${g.key}`, shown_as: shownAs || null, shown_as_label: shownAs ? LEVEL_NAME[shownAs] : null, competitor: { id: c.id, title: c.title, tier: c.tier || null }, plan: g.plan, product: g.product, seat_model: g.seat_model, max_users: g.max_users, yearly_inr: pr ? pr.yearly_inr : null, once_inr: pr ? pr.once_inr : null, feature_keys: [...g.feature_keys], feature_count: g.feature_keys.size });
    }
  }
  const names = new Map<string, any>();
  for (const c of comps) for (const r of cellsOf(store, c).filter((x) => x.type === 'CompetitorCapability' && live(x))) { const f = featureKey(store, r, idx); if (!names.has(f.key)) names.set(f.key, f); }
  const counted = columns.filter((c) => c.feature_count > 0).length;
  const features = [...names.values()].map((f) => ({ key: f.key, name: f.name, category: f.category, count: columns.filter((c) => c.feature_keys.includes(f.key)).length }))
    .filter((f) => f.count > 0).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return { level, label: LEVEL_NAME[level], fallback: fallback || null, fallback_label: fallback ? LEVEL_NAME[fallback] : null, fallback_used: fallbackUsed, users, columns, features, without_plan: without, columns_with_features: counted };
}

export { plans, setPlanFeature, planLevelFeatures, ourPlans, setOurPlanFeature, recommended, createFromRecommendation, comparePlans, groupsOf, featureKey, catalogIndex, LEVELS, LEVEL_NAME };
