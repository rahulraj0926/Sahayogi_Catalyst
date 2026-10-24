/**
 * engine/competitor_overview.ts - the competitor dashboard in one call (GET /api/competitors/overview).
 *
 * How much has been analysed, who sits in which tier, which features most competitors offer (with the share of competitors), the
 * features we recommend building (offered by at least `threshold`% of competitors), and what that recommendation costs on average:
 * the price ladder per plan position (free, cheapest paid, most expensive), and the typical price of a plan that holds most of the recommended features.
 * Nothing is stored here. Everything can be limited to one scope (a module or area of our product) with ?scope=.
 */
import { cellsOf, hasModules, liveCompetitors, scopeKey, scopeNames } from './competitor_owner';
import { groupsOf, featureKey, catalogIndex, recommended, positionMap } from './competitor_plans';
import { completeness, normalizedPricing, provides, POSITIONS, POSITION_NAME } from './competitors';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round = (n: number) => Math.round(n);
const avg = (v: number[]) => (v.length ? round(v.reduce((a, b) => a + b, 0) / v.length) : null);
const median = (v: number[]) => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : round((s[m - 1] + s[m]) / 2); };

const TIER_DEF: [string, string, string][] = [
  ['T1', 'Tier 1', 'Closest to our customers'],
  ['T2', 'Tier 2', 'Next closest'],
  ['T3', 'Tier 3', 'Further from our customers'],
  ['S', 'Substitutes', 'What customers do instead'],
];
/** Defaults. A feature is a "must-have" when this share of competitors offer it, "common" from the second number. Both can be changed per request (?must= & ?common=). */
const MUST_DEFAULT = 80;
const COMMON_DEFAULT = 50;
const USER_COUNTS_DEFAULT = '1,5,10,25';

export function overview(store, query: any = {}) {
  const scope = String(query.scope || '').trim();
  const threshold = clamp(Number(query.threshold) || 60, 1, 100);
  const users = Math.max(1, Math.floor(Number(query.users) || 1));
  const coverage = clamp(Number(query.coverage) || 70, 10, 100);
  const MUST = clamp(Math.round(Number(query.must) || MUST_DEFAULT), 2, 100);
  const COMMON = clamp(Math.round(Number(query.common) || COMMON_DEFAULT), 1, MUST - 1);
  const userCounts = [...new Set(String(query.compare_users || USER_COUNTS_DEFAULT).split(',').map((x) => Math.floor(Number(x))).filter((x) => x >= 1 && x <= 100000))].slice(0, 8);
  const comps = liveCompetitors(store, scope);
  const n = comps.length;
  const idx = catalogIndex(store);
  const compl = new Map<string, any>((completeness(store) as any[]).map((x) => [x.id, x]));
  const pos = positionMap(store, scope);
  const perComp = comps.map((c) => ({ c, groups: groupsOf(store, c, idx, pos) }));

  // ---- who has been analysed
  const cards = perComp.map(({ c, groups }) => ({
    id: c.id, title: c.title, tier: c.tier || null, kind: c.kind || null, scopes: Array.isArray(c.scopes) ? c.scopes : [],
    plans: groups.length, plans_with_features: groups.filter((g) => g.feature_keys.size > 0).length, completeness: compl.get(c.id) ? compl.get(c.id).score : 0,
  }));
  const tiers = TIER_DEF.map(([key, label, hint]) => ({ key, label, hint, competitors: cards.filter((x) => x.tier === key) }));
  const unassigned = cards.filter((x) => !x.tier);
  const analysed = {
    total: n, with_plans: cards.filter((x) => x.plans > 0).length, with_features: cards.filter((x) => x.plans_with_features > 0).length,
    plans: cards.reduce((s, x) => s + x.plans, 0), avg_completeness: avg(cards.map((x) => x.completeness)),
  };

  // ---- plans by position (free / cheapest paid / most expensive, worked out from prices), across all competitors
  const allGroups = perComp.flatMap((p) => p.groups.map((g) => ({ g, comp: p.c.id })));
  const plan_positions = POSITIONS.map((l) => {
    const gs = allGroups.filter((x) => x.g.position === l);
    return { position: l, label: POSITION_NAME[l], plans: gs.length, competitors: new Set(gs.map((x) => x.comp)).size };
  }).filter((l) => l.plans > 0);

  // ---- features and the share of competitors that offer each
  const offered = new Map<string, any>();
  for (const c of comps) {
    for (const r of cellsOf(store, c)) {
      if (r.type !== 'CompetitorCapability' || r.status === 'Retired' || !provides(store, r)) continue;
      const f = featureKey(store, r, idx);
      const e = offered.get(f.key) || { key: f.key, name: f.name, category: f.category, capability_id: f.capability_id, ids: new Set<string>() };
      e.ids.add(c.id); offered.set(f.key, e);
    }
  }
  // shares are counted among the competitors whose features are known; one with nothing listed is left out instead of counting as "offers nothing"
  const featured = new Set<string>(); for (const e of offered.values()) for (const id of e.ids) featured.add(id);
  const nf = featured.size || n;
  const features = [...offered.values()].map((e) => {
    const pct = nf ? round((100 * e.ids.size) / nf) : 0;
    return {
      key: e.key, name: e.name, category: e.category || null, capability_id: e.capability_id, offered_by: e.ids.size, of_total: nf, pct,
      band: pct >= MUST ? 'must' : pct >= COMMON ? 'common' : 'niche',
      missing: comps.filter((c) => featured.has(c.id) && !e.ids.has(c.id)).slice(0, 12).map((c) => ({ id: c.id, title: c.title })),
    };
  }).sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name));
  const bands = { must: features.filter((f) => f.band === 'must').length, common: features.filter((f) => f.band === 'common').length, niche: features.filter((f) => f.band === 'niche').length };
  const catCount = new Map<string, number>();
  for (const f of features) catCount.set(f.category || 'Other', (catCount.get(f.category || 'Other') || 0) + 1);
  const categories = [...catCount.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => (a.name === 'Other' ? 1 : b.name === 'Other' ? -1 : a.name.localeCompare(b.name)));
  const not_offered = store.list('Capability', (c) => c.status !== 'Retired').filter((c) => !offered.has(c.id)).map((c) => c.title);

  // ---- what we recommend, and what it costs
  const recFeatures = features.filter((f) => f.pct >= threshold);
  const recKeys = new Set(recFeatures.map((f) => f.key));
  const rec: any = n ? recommended(store, { threshold: String(threshold), users: String(users), scope }) : { positions: [] };
  const ladder = rec.positions.map((l) => ({ position: l.position, label: l.label, plans: l.plans, competitors: l.competitors, price: l.price, feature_count: l.features.length, new_features: l.new_features }));

  /** The typical price of a plan holding most of the recommended features, for a given number of users. */
  const bundleAt = (u: number) => {
    const priced: any = n ? normalizedPricing(store, { users: String(u), scope }) : { rows: [] };
    const rowOfPrice = new Map<string, any>();
    for (const row of priced.rows) for (const term of row.terms) rowOfPrice.set(term.id, row);
    const contributors: any[] = [];
    if (recKeys.size) {
      for (const { c, groups } of perComp) {
        let best: any = null;
        for (const g of groups) {
          if (!g.feature_keys.size) continue;
          const have = [...recKeys].filter((k) => g.feature_keys.has(k)).length;
          const cov = round((100 * have) / recKeys.size);
          if (cov < coverage) continue;
          const row = g.price_ids.map((id) => rowOfPrice.get(id)).find(Boolean);
          const yearly = row ? row.yearly_inr : null;
          if (yearly === null || yearly === undefined) continue;
          if (!best || yearly < best.yearly_inr) best = { competitor: { id: c.id, title: c.title }, plan: g.plan, product: g.product, position: g.position, coverage: cov, yearly_inr: yearly };
        }
        if (best) contributors.push(best);
      }
      contributors.sort((a, b) => a.yearly_inr - b.yearly_inr);
    }
    const yearly = contributors.map((x) => x.yearly_inr);
    return contributors.length ? {
      coverage_min: coverage, users: u, count: contributors.length, of: n,
      avg_yearly_inr: avg(yearly), avg_monthly_inr: avg(yearly.map((v) => v / 12)), median_yearly_inr: median(yearly), min_yearly_inr: Math.min(...yearly), max_yearly_inr: Math.max(...yearly), contributors,
    } : null;
  };
  const bundle = bundleAt(users);
  /** The same price for several team sizes side by side, so a reader can see how the price grows with users. */
  const by_users = userCounts.map((u) => { const b = u === users ? bundle : bundleAt(u); return { users: u, count: b ? b.count : 0, avg_yearly_inr: b ? b.avg_yearly_inr : null, min_yearly_inr: b ? b.min_yearly_inr : null, max_yearly_inr: b ? b.max_yearly_inr : null, avg_per_user_month_inr: b ? Math.round(b.avg_yearly_inr / 12 / u) : null }; });

  // ---- what is missing before the numbers can be trusted
  const hints: string[] = [];
  if (n && n < 3) hints.push(`Only ${n} competitor${n === 1 ? ' is' : 's are'} analysed. Shares such as "offered by 50%" need at least 3 to mean much.`);
  if (n && analysed.with_features < n) hints.push(`${n - analysed.with_features} competitor${n - analysed.with_features === 1 ? ' has' : 's have'} no plan with features ticked, so ${n - analysed.with_features === 1 ? 'it is' : 'they are'} left out of the shares below until features are added.`);
  if (unassigned.length) hints.push(`${unassigned.length} competitor${unassigned.length === 1 ? ' has' : 's have'} no tier yet.`);

  // ---- module by module: who competes in each part of our product, and what the cheapest plan of each costs
  const allLive = liveCompetitors(store);
  const cheapest = new Map<string, number>();
  if (allLive.length) {
    const all1: any = normalizedPricing(store, { users: '1' });
    for (const row of all1.rows) if (row.yearly_inr !== null && row.yearly_inr !== undefined && row.competitor) cheapest.set(row.competitor.id, Math.min(cheapest.get(row.competitor.id) ?? Infinity, row.yearly_inr));
  }
  const planCount = new Map<string, number>(allLive.map((c) => [c.id, groupsOf(store, c, idx).length]));
  const moduleRows = scopeNames(store).map((sc) => {
    const k = scopeKey(sc.name);
    const cs = allLive.filter((c) => (Array.isArray(c.scopes) ? c.scopes : []).some((x) => scopeKey(x) === k));
    const prices = cs.map((c) => cheapest.get(c.id)).filter((v): v is number => v !== undefined);
    const tier = (t: string) => cs.filter((c) => c.tier === t).length;
    return { name: sc.name, module: sc.module, competitors: cs.length, T1: tier('T1'), T2: tier('T2'), T3: tier('T3'), S: tier('S'), no_tier: cs.filter((c) => !c.tier).length, with_plans: cs.filter((c) => (planCount.get(c.id) || 0) > 0).length, priced: prices.length, avg_yearly_inr: avg(prices), min_yearly_inr: prices.length ? Math.min(...prices) : null, max_yearly_inr: prices.length ? Math.max(...prices) : null };
  });
  const modules = { rows: moduleRows, whole_product: allLive.filter((c) => !(Array.isArray(c.scopes) && c.scopes.length)).length };

  return {
    scope: scope || null, has_modules: hasModules(store), scopes: scopeNames(store), modules, threshold, users, coverage, analysed, tiers, unassigned, plan_positions,
    common: { competitor_count: nf, competitors_total: n, features, bands, categories, not_offered, cut_offs: { must: MUST, common: COMMON } },
    recommended: { threshold, count: recFeatures.length, ladder, bundle, by_users },
    hints,
  };
}
