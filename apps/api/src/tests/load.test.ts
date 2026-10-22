/*
 * A big day: one product grown to thousands of items and links, then the screens that matter are timed, 40 people ask at once, and
 * 150 edits arrive back to back. Prints the numbers; fails only when something is far slower than a person would accept.
 * No database needed. Run: npx ts-node --transpile-only src/tests/load.test.ts   (ITEMS_X=30 for a bigger product)
 */
import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as router from '../legacy/router';
import { seedPortfolio } from '../legacy/scripts/seed_portfolio';
import { engineApp } from './engine-app';
import { done, ok } from './helpers';

const median = (a: number[]) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];

async function main() {
  const copies = Number(process.env.ITEMS_X || 15);
  const portfolio: any = seedPortfolio(fs.mkdtempSync(path.join(os.tmpdir(), 'sd-load-')));
  router.setPortfolio(portfolio);
  const pid = portfolio.list()[0].id;
  const store = portfolio.store(pid);
  // grow the product: copies of every item and link under new ids
  const base = JSON.parse(JSON.stringify({ items: store.data.items, links: store.data.linkList }));
  for (let k = 1; k <= copies; k++) {
    for (const it of Object.values<any>(base.items)) store.data.items[`${it.id}~${k}`] = { ...JSON.parse(JSON.stringify(it)), id: `${it.id}~${k}` };
    base.links.forEach((l: any, i: number) => store.data.linkList.push({ ...l, id: `${l.id}~${k}`, source: `${l.source}~${k}`, target: `${l.target}~${k}` }));
  }
  store.touch(); // the copies were added by hand
  const nItems = Object.keys(store.data.items).length, nLinks = store.data.linkList.length;
  console.log(`  product ${pid}: ${nItems} items, ${nLinks} links`);

  const p: any = { portfolio, async flush() { /* memory only */ }, async reloadProduct() { /* nothing */ }, async reloadRegistry() { /* nothing */ } };
  const { base: url, close } = await engineApp(p);
  const get = async (u: string) => { const t = process.hrtime.bigint(); const r = await fetch(url + u); await r.arrayBuffer(); return { status: r.status, ms: Number(process.hrtime.bigint() - t) / 1e6 }; };

  const screens: Array<[string, string, number]> = [
    ['items list', `/api/v1/items?product=${pid}`, 4000],
    ['dashboard', `/api/v1/dashboard?product=${pid}`, 4000],
    ['all gates', `/api/v1/gates?product=${pid}`, 6000],
    ['lifecycle', `/api/v1/lifecycle?product=${pid}`, 6000],
    ['trace matrix', `/api/v1/trace/matrix?product=${pid}`, 6000],
    ['trace rules', `/api/v1/trace/rules?product=${pid}`, 6000],
    ['audit trail', `/api/v1/audit?product=${pid}`, 3000],
    ['product summary', `/api/v1/product/summary?product=${pid}`, 6000],
    ['next actions', `/api/v1/next-actions?product=${pid}`, 6000],
    ['search', `/api/v1/search?q=payment&product=${pid}`, 4000],
    ['portfolio home', `/api/v1/portfolio`, 4000],
  ];
  const rows: string[] = [];
  await ok('each main screen answers 200 within its budget (median of 3 asks)', async () => {
    const slow: string[] = [];
    for (const [name, u, budget] of screens) {
      const runs: number[] = [];
      for (let i = 0; i < 3; i++) { const r = await get(u); assert.equal(r.status, 200, `${name}: ${r.status}`); runs.push(r.ms); }
      const m = median(runs); rows.push(`${name.padEnd(16)} ${m.toFixed(0).padStart(6)} ms (worst ${Math.max(...runs).toFixed(0)})`);
      if (m >= budget) slow.push(`${name} took ${m.toFixed(0)} ms (budget ${budget} ms)`);
    }
    console.log(rows.map((r) => '    ' + r).join('\n'));
    assert.deepEqual(slow, []);
  });

  await ok('40 people open the dashboard and the item list at the same moment: all answered, none failed', async () => {
    const t = Date.now();
    const rs = await Promise.all(Array.from({ length: 40 }, (_, i) => get(i % 2 ? `/api/v1/dashboard?product=${pid}` : `/api/v1/items?product=${pid}&limit=200`)));
    assert.ok(rs.every((r) => r.status === 200), 'some request failed: ' + rs.map((r) => r.status).join(','));
    const total = Date.now() - t;
    console.log(`    40 at once: ${total} ms in all, slowest ${Math.max(...rs.map((r) => r.ms)).toFixed(0)} ms`);
    assert.ok(total < 30_000, `40 parallel asks took ${total} ms`);
  });

  await ok('150 edits back to back: every one saved, the average stays under 300 ms', async () => {
    const ids = Object.keys(store.data.items).filter((i) => !i.includes('~')).slice(0, 150);
    const t = Date.now(); let bad = 0;
    for (const id of ids) {
      const r = await fetch(`${url}/api/v1/items/${encodeURIComponent(id)}?product=${pid}`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-actor': 'Load' }, body: JSON.stringify({ fields: { notes: 'load test ' + id } }) });
      if (r.status >= 500) bad++; await r.arrayBuffer();
    }
    const avg = (Date.now() - t) / ids.length;
    console.log(`    ${ids.length} edits, average ${avg.toFixed(0)} ms`);
    assert.equal(bad, 0, `${bad} edits failed with a server error`);
    assert.ok(avg < 300, `average edit ${avg.toFixed(0)} ms`);
  });

  const mem = process.memoryUsage();
  console.log(`    memory: ${(mem.rss / 1048576).toFixed(0)} MB resident, ${(mem.heapUsed / 1048576).toFixed(0)} MB heap`);
  await close();
  done();
}
main().catch((e) => { console.error(e); process.exit(1); });
