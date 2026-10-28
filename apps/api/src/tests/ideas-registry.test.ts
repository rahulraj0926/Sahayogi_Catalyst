/* The idea records (with the innovation case) <-> table rows, without a database. An older idea must read back exactly as it was written.
   Run: npx ts-node --transpile-only src/tests/ideas-registry.test.ts */
import * as assert from 'node:assert/strict';
import { registryToRows, rowsToRegistry } from '../db/repository';
import { rowsOf } from '../db/mapper';
import { ALL_TABLES, TABLE_BY_NAME } from '../db/tables';
import { done, ok } from './helpers';

const norm = (v: unknown) => JSON.parse(JSON.stringify(v));
const reg = (ideas: unknown[]) => ({ version: 1, asOf: null, counters: { product: 0, idea: ideas.length }, products: [], ideas });

const OLD = { id: 'IDEA-001', one_liner: 'An older idea', text: 'Written before innovation existed', requester: 'Ravi', created_on: '2026-09-01', status: 'new', kind: 'software', product_id: null, origin: 'human' };
const CASE = {
  id: 'IDEA-002', one_liner: 'A newer idea', text: '', requester: 'Asha', created_on: '2026-10-20', status: 'innovation', kind: 'service', product_id: null, origin: 'human',
  problem: 'Small shop owners cannot read tax notices.', who_for: 'Small shop owners', demo_url: 'https://figma.com/proto/abc',
  competitors: [
    { id: 'CMP-1', name: 'Acme Billing', website: 'https://acme.com/', note: 'Invoices for shops', demo_url: 'https://acme.com/demo', check: { status: 'verified', http_status: 200, title: 'Acme Billing', final_url: 'https://www.acme.com/', checked_at: '2026-10-20T09:30:00.000Z' } },
    { id: 'CMP-3', name: 'Blocky', website: 'https://blocky.example.com/', note: null, demo_url: null, check: { status: 'responded', http_status: 403, title: null, final_url: 'https://blocky.example.com/', checked_at: '2026-10-20T09:31:00.000Z' } },
  ],
};
const DECIDED = { id: 'IDEA-003', one_liner: 'A turned-down idea', text: 'x', requester: 'Meera', created_on: '2026-10-01', status: 'rejected', kind: 'hardware', product_id: null, origin: 'human', decided_by: 'Founder', decided_at: '2026-10-02T10:00:00.000Z', reject_reason: 'Not now' };

async function main() {
  await ok('the new table is defined in tables.ts, belongs to its idea, and goes away with it', () => {
    const t = TABLE_BY_NAME.get('idea_competitors');
    assert.ok(t, 'idea_competitors is a table');
    assert.deepEqual(t.pk, ['idea_id', 'id']);
    assert.ok(ALL_TABLES.some((x) => x.table === 'idea_competitors'));
    assert.deepEqual(t.fks.map((k) => [k.cols, k.refTable, k.refCols, k.onDelete]), [[['idea_id'], 'ideas', ['id'], 'CASCADE']]);
    const ideas = TABLE_BY_NAME.get('ideas')!;
    for (const col of ['problem', 'who_for', 'demo_url', 'decided_by', 'decided_at', 'reject_reason']) assert.ok(ideas.cols.some((c) => c.name === col), `ideas.${col}`);
    assert.ok(!ALL_TABLES.some((x) => x.cols.some((c) => /json/i.test(c.type))), 'no JSON columns');
  });

  await ok('an older idea (no case, nothing decided) reads back exactly as it was written', () => {
    const back = rowsToRegistry(registryToRows(reg([OLD])));
    assert.deepEqual(norm(back.ideas), norm([OLD]));
    assert.ok(!('competitors' in back.ideas[0]) && !('problem' in back.ideas[0]));
  });

  await ok('an idea with its innovation case round-trips, competitors in order with every field of the check', () => {
    const rows = registryToRows(reg([OLD, CASE]));
    const comps = rowsOf(rows, 'idea_competitors');
    assert.equal(comps.length, 2);
    assert.deepEqual(comps.map((c) => [c.idea_id, c.id, c.position, c.check_status, c.http_status]), [['IDEA-002', 'CMP-1', 0, 'verified', 200], ['IDEA-002', 'CMP-3', 1, 'responded', 403]]);
    const back = rowsToRegistry(rows);
    assert.deepEqual(norm(back.ideas), norm([OLD, CASE]));
  });

  await ok('who decided, when and why (written by accept and reject) is stored instead of making the save fail', () => {
    const back = rowsToRegistry(registryToRows(reg([DECIDED])));
    assert.deepEqual(norm(back.ideas), norm([DECIDED]));
  });

  await ok('an idea row that has nulls in the new columns (an old database row) loads without them', () => {
    const rows = registryToRows(reg([OLD]));
    const row = rowsOf(rows, 'ideas')[0];
    for (const k of ['problem', 'who_for', 'demo_url', 'decided_by', 'decided_at', 'reject_reason']) assert.equal(row[k], null, k);
    // a database written before the columns existed gives undefined, not null
    for (const k of ['problem', 'who_for', 'demo_url', 'decided_by', 'decided_at', 'reject_reason']) delete row[k];
    assert.deepEqual(norm(rowsToRegistry(rows).ideas), norm([OLD]));
  });

  await ok('a competitor field the table has no column for is refused instead of silently dropped', () => {
    const bad = { ...CASE, competitors: [{ ...CASE.competitors[0], rating: 5 }] };
    assert.throws(() => registryToRows(reg([bad])), /no column for field\(s\) rating/);
    assert.throws(() => registryToRows(reg([{ ...OLD, surprise: 1 }])), /no column for field\(s\) surprise/);
  });

  done();
}
main().catch((e) => { console.error(e); process.exit(1); });
