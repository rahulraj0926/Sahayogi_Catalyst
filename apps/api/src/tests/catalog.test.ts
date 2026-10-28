/* Catalogue seed test. No database: the 21 Sahayogi products are built in memory. Run: npm run test:unit -w apps/api */
import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { seedCatalog } from '../legacy/scripts/seed_portfolio';
import { done, ok } from './helpers';

const EXPECTED = [
  'Sahayogi Setu', 'Sahayogi One', 'Boss By Office Sahayogi', 'Chat With Sahayogi', 'Tax Sahayogi', 'Sahayogi Mail', 'Sahayogi Drive',
  'Sahayogi AI', 'My Sahayogi', 'Studio Sahayogi', 'Sahayogi Cloud', 'Office Sahayogi', 'Investor Sahayogi', 'Boss Bridge',
  'Sahayogi Calender', 'Sahayogi Teams', 'Sahayogi CDN', 'Sahayogi DNS', 'Sahayogi Secrets', 'Sahayogi Developer', 'Sahayogi Catalyst',
];

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-catalog-'));
  const pf: any = seedCatalog(tmp);
  pf.ensureSlugs();
  const list = pf.list({ includeArchived: true });

  await ok('the catalogue holds exactly the 21 Sahayogi products, in order, and no other product name', () => {
    assert.deepEqual(list.map((p: any) => p.name), EXPECTED);
  });

  await ok('ids run PRD-001 to PRD-021 and the next new product would be PRD-022', () => {
    assert.deepEqual(list.map((p: any) => p.id), EXPECTED.map((_, i) => `PRD-${String(i + 1).padStart(3, '0')}`));
    assert.equal(pf.nextProductId(), 'PRD-022');
  });

  await ok('every product has its own address and its own saved records', () => {
    assert.equal(new Set(list.map((p: any) => p.slug)).size, 21);
    for (const p of list) assert.ok(p.slug && pf.store(p.id).product().name === p.name, `${p.name}: store matches the entry`);
  });

  await ok('only Sahayogi CDN and Sahayogi Developer carry demo records; the other 19 start at Phase 0 with just their name', () => {
    for (const p of list) {
      const rich = p.name === 'Sahayogi CDN' || p.name === 'Sahayogi Developer';
      const items = pf.store(p.id).all().length;
      if (rich) assert.ok(items > 50, `${p.name} keeps its demo records (${items})`);
      else { assert.equal(items, 1, `${p.name} holds only its Product record`); assert.equal(p.stage, 'P0'); assert.equal(p.owner, ''); }
    }
  });

  await ok('the four ideas are still there', () => {
    assert.equal(pf.ideas().length, 4);
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  done();
}
main().catch((e) => { console.error(e); process.exit(1); });
