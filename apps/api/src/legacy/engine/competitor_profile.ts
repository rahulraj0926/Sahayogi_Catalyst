/**
 * engine/competitor_profile.ts - everything the page of ONE competitor needs, in one answer.
 *
 * The page used to read the whole product (every price, rating, note and file, plus the list of every competitor) and pick out its own
 * competitor in the browser. It now asks for this instead, so the work is done once, on the server, for one competitor, and the
 * size of the answer follows the competitor and not the size of the product.
 */
import * as attachments from './attachments';
import { itemDetail } from './dashboard';
import { completenessOf, productLinesOf } from './competitors';

const live = (x: any) => !!x && x.status !== 'Retired';

export function profile(store: any, id: string) {
  const c = store.get(id);
  if (!c || c.type !== 'Competitor') throw Object.assign(new Error(`competitor ${id} not found`), { status: 404 });
  const outOf = (type: string) => store.linksOf(id).filter((l: any) => l.source === id).map((l: any) => store.get(l.target)).filter((x: any) => x && x.type === type);
  const lines = productLinesOf(store, c);
  const planIds = new Set<string>(lines.product_lines.flatMap((l: any) => l.plans.map((p: any) => p.id)));
  const prices = [...outOf('PricePoint'), ...[...planIds].map((p) => store.get(p))].filter(live);
  const notes = store.linksOf(id).filter((l: any) => l.target === id && l.type === 'note_on').map((l: any) => store.get(l.source)).filter((x: any) => live(x) && x.type === 'CompetitorNote');
  const tags = Array.from(new Set(store.list('CompetitorCapability', live).map((x: any) => x.capability_tag).filter(Boolean)));
  return {
    ...itemDetail(store, id),
    prices: dedupe(prices),
    capabilities: outOf('CompetitorCapability').filter(live),
    notes,
    files: attachments.list(store, id).attachments,
    product_lines: lines.product_lines,
    orphan_prices: lines.orphan_prices,
    completeness: completenessOf(store, c),
    capability_tags: tags,
  };
}

const dedupe = (xs: any[]) => { const seen = new Set<string>(); return xs.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true))); };
