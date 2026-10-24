/* One competitor's page in one answer. No database needed. Run: ts-node --transpile-only src/tests/competitor-profile.test.ts */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { seedPortfolio } from '../legacy/scripts/seed_portfolio';
import { importSample } from '../legacy/engine/competitor_sample';
import { profile } from '../legacy/engine/competitor_profile';
import { completeness, completenessOf, productLines, productLinesOf } from '../legacy/engine/competitors';
import { done, ok } from './helpers';

async function main() {
  const pf: any = seedPortfolio(fs.mkdtempSync(path.join(os.tmpdir(), 'sd-cprof-')));
  const store = pf.store(pf.list()[0].id);
  importSample(store, { commit: true, actor: 'Test' });
  const comps = store.list('Competitor', (c: any) => c.status !== 'Retired');

  await ok('the sample has several competitors to tell apart', () => assert.ok(comps.length >= 3));

  await ok('a profile holds the competitor and only its own plans, ratings, notes and files', () => {
    const everyPlan = new Set(store.list('PricePoint', (p: any) => p.status !== 'Retired').map((p: any) => p.id));
    for (const c of comps) {
      const p: any = profile(store, c.id);
      assert.equal(p.item.id, c.id);
      assert.ok(Array.isArray(p.links), 'links come with it, as with GET /items/{id}');
      const mine = new Set(p.prices.map((x: any) => x.id));
      assert.equal(mine.size, p.prices.length, 'a plan is listed once');
      for (const id of mine) assert.ok(everyPlan.has(id as string), `${id} is a live plan`);
      for (const other of comps.filter((o: any) => o.id !== c.id)) {
        const theirs = profile(store, other.id).prices.map((x: any) => x.id);
        assert.ok(!theirs.some((id: string) => mine.has(id)), `${c.id} and ${other.id} do not share a plan`);
      }
      for (const x of p.capabilities) assert.equal(x.type, 'CompetitorCapability');
      assert.ok(Array.isArray(p.notes) && Array.isArray(p.files));
    }
  });

  await ok('every plan of the product belongs to exactly one profile', () => {
    const live = store.list('PricePoint', (x: any) => x.status !== 'Retired').map((x: any) => x.id).sort();
    const got = comps.flatMap((c: any) => profile(store, c.id).prices.map((x: any) => x.id)).sort();
    assert.deepEqual(got, live);
  });

  await ok('product lines and completeness equal what the all-competitor lists say', () => {
    const lines = productLines(store), comp = completeness(store);
    for (const c of comps) {
      const p: any = profile(store, c.id);
      assert.deepEqual(p.product_lines, lines.find((x: any) => x.id === c.id)!.product_lines);
      assert.deepEqual(p.completeness, comp.find((x: any) => x.id === c.id));
      assert.deepEqual(p.completeness, completenessOf(store, c));
      assert.deepEqual(productLinesOf(store, c).product_lines, p.product_lines);
    }
  });

  await ok('a note is shown on the competitor it is about and on no other', () => {
    const a = comps[0], b = comps[1];
    const noteId = store.create('CompetitorNote', { title: 'Heard at a demo', text: 'Free trial is 30 days', date: '2026-10-20' }, { actor: 'Test', origin: 'human' }).id;
    store.link('note_on', noteId, a.id, {}, { actor: 'Test' });
    assert.ok(profile(store, a.id).notes.some((n: any) => n.id === noteId));
    assert.ok(!profile(store, b.id).notes.some((n: any) => n.id === noteId));
  });

  await ok('an id that is not a competitor is a 404, not an empty page', () => {
    const other = store.all().find((i: any) => i.type !== 'Competitor');
    assert.throws(() => profile(store, other.id), (e: any) => e.status === 404);
    assert.throws(() => profile(store, 'CMP-NOPE'), (e: any) => e.status === 404);
  });

  done();
}
main().catch((e) => { console.error(e); process.exit(1); });
