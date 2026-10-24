/*
 * Loading ONE product must return that product and nothing else. A failed save reloads the product from PostgreSQL;
 * when "one product" used to mean "all of them", the first product in the list replaced the one that was asked for.
 * No database needed: a small fake pool answers the repository's SELECTs from rows made by the real mapper.
 */
import * as os from 'node:os'; import * as fs from 'node:fs'; import * as path from 'node:path';
import * as assert from 'node:assert/strict';
import { seedPortfolio } from '../legacy/scripts/seed_portfolio';
import { productToRows, rowsOf } from '../db/mapper';
import { Repository, missingColumns } from '../db/repository';
import { ALL_TABLES } from '../db/tables';

const src: any = seedPortfolio(fs.mkdtempSync(path.join(os.tmpdir(), 'pf-')));
src.ensureSlugs();
const tables = new Map<string, any[]>();
src.reg.products.forEach((entry: any, pos: number) => {
  const { rows } = productToRows(pos, { entry, data: src.store(entry.id).data });
  for (const t of rows.keys()) for (const r of rowsOf(rows, t)) (tables.get(t) || tables.set(t, []).get(t)!).push(r);
});

const sql: string[] = [];
const pool: any = {
  async query(text: string, params: any[] = []) {
    sql.push(text);
    const m = /FROM "(\w+)"(?: WHERE "(\w+)" = \$1)?/.exec(text);
    if (!m) return { rows: [] }; // audit queries: no audit rows needed here
    const [, table, col] = m;
    const all = tables.get(table) || [];
    return { rows: col ? all.filter((r) => r[col] === params[0]) : all };
  },
};
const repo = new Repository(pool);

(async () => {
  const ids: string[] = src.reg.products.map((p: any) => p.id);
  assert.ok(ids.length >= 3, 'the seed has several products');
  const everyone = await repo.loadProducts();
  assert.equal(everyone.length, ids.length, 'loading all returns every product');

  for (const id of [ids[ids.length - 1], ids[1]]) {
    const one = await repo.loadProducts(id);
    assert.equal(one.length, 1, `loading ${id} returns exactly one product, not ${one.length}`);
    assert.equal(one[0].bundle.entry.id, id, `and it is ${id}`);
  }
  assert.deepEqual(await repo.loadProducts('PRD-NOPE'), [], 'an unknown id returns nothing');
  console.log('✓ loading one product returns that product only');

  // the code and the database must agree on every column
  const have = new Map(ALL_TABLES.map((t) => [t.table, new Set(t.cols.map((c) => c.name))]));
  assert.deepEqual(missingColumns(ALL_TABLES, have), { add: [], blocked: [] }, 'a database that matches needs nothing');
  have.get('item_competitor')!.delete('todo_items');
  const fix = missingColumns(ALL_TABLES, have);
  assert.deepEqual(fix.add.map((a) => `${a.table}.${a.col.name}`), ['item_competitor.todo_items'], 'a missing optional column is added');
  assert.deepEqual(fix.blocked, []);
  have.get('products')!.delete('id');
  assert.deepEqual(missingColumns(ALL_TABLES, have).blocked, ['products.id'], 'a missing required column stops start-up instead of being guessed');
  have.delete('members');
  assert.ok(missingColumns(ALL_TABLES, have).blocked.includes('table members'), 'a missing table is reported');
  console.log('✓ missing database columns are found: optional ones added, required ones reported');
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
