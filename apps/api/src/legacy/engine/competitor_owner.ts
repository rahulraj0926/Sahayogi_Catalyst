/**
 * engine/competitor_owner.ts - who owns a competitor's price or rating, with or without product lines.
 * A price or rating sits either directly under a Competitor or under one of its CompetitorProductLines (Competitor -> contains -> ProductLine -> contains -> item).
 */
type StoreLike = any;

/** The Competitor that owns this item (directly or through a product line), or null. */
export function ownerOf(store: StoreLike, item: any): any {
  let cur = item;
  for (let hops = 0; cur && hops < 3; hops++) {
    const parent = store.inn(cur.id, 'contains').map((l) => store.get(l.source)).find((x) => x && (x.type === 'Competitor' || x.type === 'CompetitorProductLine'));
    if (!parent) return null;
    if (parent.type === 'Competitor') return parent;
    cur = parent;
  }
  return null;
}

/** The product line this item sits under, or null when it sits directly under the competitor. */
export function lineOf(store: StoreLike, item: any): any {
  return store.inn(item.id, 'contains').map((l) => store.get(l.source)).find((x) => x && x.type === 'CompetitorProductLine') || null;
}

/** Everything a competitor owns: direct children plus anything inside its product lines. */
export function cellsOf(store: StoreLike, c: any): any[] {
  const direct = store.out(c.id, 'contains').map((l) => store.get(l.target)).filter(Boolean);
  const nested = direct.filter((x) => x.type === 'CompetitorProductLine').flatMap((pl) => store.out(pl.id, 'contains').map((l) => store.get(l.target)).filter(Boolean));
  const seen = new Set<string>();
  return [...direct, ...nested].filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
}

/** Our common name for a competitor rating: the Capability it is mapped to, else the name typed on the rating. */
export function capabilityTag(store: StoreLike, cell: any): string {
  const m = store.out(cell.id, 'maps_to').map((l) => store.get(l.target)).find((x) => x && x.type === 'Capability' && x.status !== 'Retired');
  return m ? (m.title as string) : (cell.capability_tag as string);
}

/** "People & Payroll", "people and payroll" and "People  and  payroll" are one module. */
export const scopeKey = (s: unknown) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '');

/**
 * Does this competitor count when looking at one part of our product (a module or any area name)?
 * No scope asked for: everyone counts. A competitor with no scopes competes with the whole product, so it counts everywhere.
 */
export function inScope(c: any, scope?: string): boolean {
  const k = scopeKey(scope);
  if (!k) return true;
  const own: string[] = Array.isArray(c.scopes) ? c.scopes : [];
  return own.length === 0 || own.some((x) => scopeKey(x) === k);
}

/** Competitors that are not retired, optionally only those that matter for one scope. */
export function liveCompetitors(store: StoreLike, scope?: string): any[] {
  return store.list('Competitor', (c) => c.status !== 'Retired' && inScope(c, scope));
}

/**
 * Does this product have modules whose competitors differ? The product says so when it is created ("single" or "modules").
 * Older products were never asked: they count as having modules when any competitor is tied to one.
 */
export function hasModules(store: StoreLike): boolean {
  const prod: any = (store as any).product && (store as any).product();
  if (prod && prod.structure === 'single') return false;
  if (prod && prod.structure === 'modules') return true;
  return store.list('Competitor', (x) => x.status !== 'Retired' && Array.isArray(x.scopes) && x.scopes.length > 0).length > 0;
}

/** Every scope name in use: the ones typed on competitors, plus the product's own modules. Empty for a product that is not a suite of modules. */
export function scopeNames(store: StoreLike): { name: string; competitors: number; module: boolean }[] {
  if (!hasModules(store)) return [];
  const out = new Map<string, { name: string; competitors: number; module: boolean }>();
  const bump = (name: string, comp: number, module: boolean) => {
    const k = scopeKey(name); if (!k) return;
    const cur = out.get(k) || { name: String(name).trim(), competitors: 0, module: false };
    cur.competitors += comp; cur.module = cur.module || module; out.set(k, cur);
  };
  for (const m of store.list('Module', (x) => !['Rejected', 'Deprecated', 'Retired'].includes(x.status))) bump(m.title, 0, true);
  for (const c of store.list('Competitor', (x) => x.status !== 'Retired')) for (const sc of Array.isArray(c.scopes) ? c.scopes : []) bump(sc, 1, false);
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}
