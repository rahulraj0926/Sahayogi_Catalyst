import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ActivityEntry, ActivitySource, PortfolioSource } from '../engine-port/ports';
import type { PortfolioLike, StoreLike } from '../types/legacy';

import { seedPortfolio } from '../legacy/scripts/seed_portfolio';
import { Store } from '../legacy/engine/store';

/** Seeded demo portfolio (6 products, 4 ideas) held in memory; no database needed. */
export class MemoryPortfolioSource extends PortfolioSource {
  readonly pf: PortfolioLike;
  flushes = 0;
  constructor() {
    super();
    this.pf = seedPortfolio(fs.mkdtempSync(path.join(os.tmpdir(), 'sd-home-'))) as unknown as PortfolioLike;
    (this.pf as unknown as { ensureSlugs(): string[] }).ensureSlugs();
  }
  get() { return this.pf; }
  async flush() { this.flushes++; }

  /** Make the portfolio bigger by cloning seeded products (for load tests). */
  grow(total: number) {
    const base = this.pf.list();
    let n = 100;
    while (this.pf.list().length < total) {
      const src = base[n % base.length];
      const id = `PRD-${n++}`;
      const data = JSON.parse(JSON.stringify(this.pf.store(src.id).data));
      this.pf.reg.products.push({ ...src, id, slug: `${src.slug}-${id.toLowerCase()}`, name: `${src.name} ${id}`, owner: `Owner ${n % 17}` });
      this.pf.cache.set(id, new Store(data, null) as unknown as StoreLike);
    }
  }
}

export class MemoryActivitySource extends ActivitySource {
  constructor(private readonly src: MemoryPortfolioSource) { super(); }
  async recent(limit: number, before?: string) {
    const all: ActivityEntry[] = [];
    let seq = 0;
    for (const e of this.src.get().list({ includeArchived: true })) for (const a of this.src.get().store(e.id).data.audit) all.push({ ...a, seq: String(++seq), productId: e.id });
    all.sort((a, b) => Number(b.seq) - Number(a.seq));
    const from = before ? all.findIndex((x) => x.seq === before) + 1 : 0;
    const page = all.slice(from, from + limit);
    const more = from + limit < all.length;
    return { entries: page, next: more ? page[page.length - 1].seq : null };
  }
}

let passed = 0;
export const ok = async (name: string, fn: () => void | Promise<void>) => { await fn(); passed++; console.log('  ok  ' + name); };
export const done = () => console.log(`\n${passed} checks passed`);
