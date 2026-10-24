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
  const attached = attachments.list(store, id).attachments;
  const tags = Array.from(new Set(store.list('CompetitorCapability', live).map((x: any) => x.capability_tag).filter(Boolean)));
  return {
    ...itemDetail(store, id),
    prices: dedupe(prices),
    capabilities: outOf('CompetitorCapability').filter(live),
    notes,
    files: attached,
    product_lines: lines.product_lines,
    orphan_prices: lines.orphan_prices,
    completeness: completenessOf(store, c),
    recent: recentChanges(store, c, [...notes, ...prices, ...outOf('CompetitorCapability'), ...lines.product_lines]),
    capability_tags: tags,
  };
}

const NOUN: Record<string, string> = { CompetitorNote: 'note', PricePoint: 'price', CompetitorCapability: 'capability', CompetitorProductLine: 'product' };
/** Fields people do not think of as "details" (bookkeeping), so a change to only these is not worth showing. */
const QUIET = new Set(['todo_done', 'todo_items', 'last_reviewed_on', 'review_by']);
const words = (k: string) => k.replace(/_/g, ' ');

/**
 * The last few things that happened on this competitor, in plain words, each written to follow the person's name ("Dhruv updated hq country"): details edited, a note, price, capability or product added or
 * removed. Worked out from the history the engine already keeps; nothing is stored for it. Repeats on the same day by the same person
 * are folded into one line.
 */
export function recentChanges(store: any, c: any, children: any[], limit = 6) {
  const own = new Map<string, any>([[c.id, c], ...children.map((x: any): [string, any] => [x.id, x])]);
  const lines: { at: string; actor: string | null; text: string }[] = [];
  for (const a of store.data.audit as any[]) {
    const it = own.get(a.subject);
    if (!it) continue;
    const self = it.id === c.id;
    const noun = NOUN[it.type];
    let text: string | null = null;
    if (a.action === 'item.create') text = self ? 'added this competitor' : noun ? `added a ${noun}` : null;
    else if (a.action === 'item.status') text = it.status === 'Retired' ? (self ? 'removed this competitor' : noun ? `removed a ${noun}` : null) : null;
    else if (a.action === 'item.update' && self) {
      const shown = ((a.details && a.details.changed) || []).filter((k: string) => !QUIET.has(k) && k !== 'status');
      if (shown.length) text = `updated ${shown.slice(0, 3).map(words).join(', ')}${shown.length > 3 ? ` and ${shown.length - 3} more` : ''}`;
    }
    if (text) lines.push({ at: a.at, actor: a.actor || null, text });
  }
  const out: { at: string; actor: string | null; text: string; count: number }[] = [];
  for (const l of lines.reverse()) {
    const prev = out.find((o) => o.text === l.text && o.actor === l.actor && String(o.at).slice(0, 10) === String(l.at).slice(0, 10));
    if (prev) prev.count += 1; else out.push({ ...l, count: 1 });
  }
  return out.slice(0, limit).map((o, i) => ({ id: `${c.id}-${i}`, at: o.at, actor: o.actor, text: o.count > 1 ? `${o.text} (${o.count} times)` : o.text }));
}

const dedupe = (xs: any[]) => { const seen = new Set<string>(); return xs.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true))); };
