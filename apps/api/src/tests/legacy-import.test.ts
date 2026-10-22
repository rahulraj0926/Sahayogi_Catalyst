/* Fills the OLD json tables the way the previous version did, runs the importer, and checks nothing changed. */
import * as os from 'node:os'; import * as fs from 'node:fs'; import * as path from 'node:path'; import { spawnSync } from 'node:child_process';
import { seedPortfolio } from '../legacy/scripts/seed_portfolio';
import { Repository, makePool } from '../db/repository';
const sortKeys = (v: any): any => Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;
const norm = (v: any): any => sortKeys(JSON.parse(JSON.stringify(v))); // the old jsonb columns do not keep key order
if (process.env.NODE_ENV !== 'test') { console.error('This test empties the database tables. Run it only against a disposable database with NODE_ENV=test (CI does this).'); process.exit(2); }
(async () => {
  const repo = new Repository(makePool());
  const src: any = seedPortfolio(fs.mkdtempSync(path.join(os.tmpdir(), 'pf-'))); src.ensureSlugs();
  const { products, ideas, ...rest } = src.reg;
  const q = (s: string, p: any[] = []) => repo.pool.query(s, p);
  await q('TRUNCATE "AuditEntry","Link","Item","Product","Idea","PortfolioMeta" CASCADE');
  await q('INSERT INTO "PortfolioMeta"(id, reg) VALUES (1, $1)', [JSON.stringify(rest)]);
  for (const i of ideas) await q('INSERT INTO "Idea"(id, data) VALUES ($1,$2)', [i.id, JSON.stringify(i)]);
  for (const e of products) {
    const d = src.store(e.id).data;
    await q('INSERT INTO "Product"(id, entry, meta, settings, counters, state, "updatedAt") VALUES ($1,$2,$3,$4,$5,$6, now())', [e.id, JSON.stringify(e), JSON.stringify(d.meta), JSON.stringify(d.settings), JSON.stringify(d.counters),
      JSON.stringify({ gates: d.gates, baselines: d.baselines, attestations: d.attestations, requestState: d.requestState, ingests: d.ingests, demo: d.demo })]);
    for (const it of Object.values<any>(d.items)) await q('INSERT INTO "Item"("productId", id, type, phase, status, title, rev, data) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [e.id, it.id, it.type, String(it.phase), it.status ?? null, it.title ?? null, it.rev || 1, JSON.stringify(it)]);
    for (const l of d.linkList) await q('INSERT INTO "Link"("productId", id, type, source, target, state, data) VALUES ($1,$2,$3,$4,$5,$6,$7)', [e.id, l.id, l.type, l.source, l.target, l.state || 'valid', JSON.stringify(l)]);
    for (const a of d.audit) await q('INSERT INTO "AuditEntry"("productId", at, action, subject, actor, summary, details) VALUES ($1,$2,$3,$4,$5,$6,$7)', [e.id, a.at || '', a.action, a.subject ?? null, a.actor ?? null, a.summary || '', JSON.stringify(a.details || {})]);
  }
  await q('TRUNCATE products RESTART IDENTITY CASCADE');
  const run = () => spawnSync('ts-node', ['--transpile-only', 'src/db/import-legacy.ts'], { encoding: 'utf8', env: process.env });
  const r = run(); console.log((r.stdout || r.stderr || '').trim());
  const refused = /already hold/.test(run().stderr || '');
  const back = await repo.loadProducts();
  let ok = back.length === products.length;
  for (const b of back) {
    const e = products.find((x: any) => x.id === b.bundle.entry.id);
    const want = norm({ entry: e, data: src.store(e.id).data }); for (const rr of Object.values<any>(want.data.requestState)) delete rr.report;
    for (const k of ['documents', 'approvals', 'inbox', 'hallucinations']) delete want.data[k];
    // legacy rows have no creation order, so links are compared by id
    want.data.linkList.sort((a: any, b2: any) => (a.id < b2.id ? -1 : 1)); const got = norm(b.bundle); got.data.linkList.sort((a: any, b2: any) => (a.id < b2.id ? -1 : 1));
    if (JSON.stringify(want) !== JSON.stringify(got)) { ok = false; console.log('✗ differs:', e.id); const A = norm(want), B = norm(b.bundle); const walk = (a: any, b2: any, pth: string, n = { c: 0 }) => { if (n.c > 6 || JSON.stringify(a) === JSON.stringify(b2)) return; if (a && b2 && typeof a === 'object' && typeof b2 === 'object') { for (const k of new Set([...Object.keys(a), ...Object.keys(b2)])) walk(a[k], b2[k], pth + '/' + k, n); } else { n.c++; console.log('   ', pth, JSON.stringify(a)?.slice(0, 60), '!=', JSON.stringify(b2)?.slice(0, 60)); } }; walk(A, B, ''); }
  }
  console.log(`${ok ? '✓' : '✗'} legacy data arrives unchanged (${back.length} products)`);
  console.log(`${refused ? '✓' : '✗'} a second import without --force is refused`);
  await repo.close(); process.exit(ok && refused ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
