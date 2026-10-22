/* Parity + smoke test. Needs DATABASE_URL pointing at a seeded database (npm run seed). */
import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../app.module';
import { PersistenceService } from '../persistence.service';
import { mountEngine } from '../main';

import { seedPortfolio } from '../legacy/scripts/seed_portfolio';
import * as gates from '../legacy/engine/gates';

let passed = 0;
const ok = (name: string, fn: () => void | Promise<void>) => Promise.resolve(fn()).then(() => { passed++; console.log('  ok  ' + name); });

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-parity-'));
  const reference = seedPortfolio(tmp);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false, logger: ['error'] });
  const p = app.get(PersistenceService);
  mountEngine(app, p);
  await app.listen(4100);
  const base = 'http://localhost:4100';
  const j = async (url: string, init?: RequestInit) => { const r = await fetch(base + url, { ...init, headers: { 'content-type': 'application/json', 'x-actor': 'Test Runner', ...(init?.headers || {}) } }); return { status: r.status, body: await r.json() }; };

  await ok('6 products and 4 ideas loaded from PostgreSQL', () => {
    assert.equal(p.portfolio.list().length, 6);
    assert.equal(p.portfolio.ideas().length, 4);
  });

  for (const e of reference.list()) {
    await ok(`gate results from Postgres equal the prototype for ${e.id} ${e.name}`, () => {
      const a = gates.evaluateAll(reference.store(e.id)).map((g: any) => [g.state, g.summary.readiness, g.summary.failed, g.summary.mustOk]);
      const b = gates.evaluateAll(p.portfolio.store(e.id)).map((g: any) => [g.state, g.summary.readiness, g.summary.failed, g.summary.mustOk]);
      assert.deepEqual(b, a);
      assert.equal(p.portfolio.store(e.id).all().length, reference.store(e.id).all().length);
      assert.equal(p.portfolio.store(e.id).links().length, reference.store(e.id).links().length);
    });
  }

  await ok('GET /api/portfolio and /api/dashboard answer over HTTP', async () => {
    const a = await j('/api/portfolio');
    assert.equal(a.status, 200);
    const d = await j('/api/dashboard?product=PRD-002');
    assert.equal(d.status, 200);
    assert.equal(d.body.product.name, 'Sahayogi Developer');
    assert.equal(d.body.phases.length, 5); // Phase 0-4 dashboard is unchanged
  });

  await ok('lifecycle overview has 13 phases and Phase 5-12 records for the Dealer Order Portal', async () => {
    const l = await j('/api/lifecycle?product=PRD-004');
    assert.equal(l.status, 200);
    assert.equal(l.body.phases.length, 13);
    for (const ph of l.body.phases.slice(5)) assert.ok(ph.records > 0, `phase ${ph.id} has records`);
    const g9 = await j('/api/gates/9?product=PRD-004');
    assert.equal(g9.status, 200);
    assert.ok(g9.body.results.some((r: any) => r.id === 'G9-10'), 'quality gate 10 present');
    const ids = g9.body.results.filter((r: any) => /^G9-/.test(r.id)).length;
    assert.ok(ids >= 10, 'ten quality gates plus sign-off');
  });

  await ok('an edit over HTTP is written to PostgreSQL and survives a reload', async () => {
    const list = await j('/api/items?product=PRD-002&type=Assumption');
    const id = list.body.items[0].id;
    const patch = await j(`/api/items/${id}?product=PRD-002`, { method: 'PATCH', body: JSON.stringify({ fields: { note: 'edited by test' } }), headers: { 'x-actor': 'Test' } });
    assert.equal(patch.status, 200);
    await p.loadAll();
    assert.equal(p.portfolio.store('PRD-002').get(id).note, 'edited by test');
    const rows = (await p.repo.pool.query("SELECT count(*)::int n FROM audit_log WHERE product_id = 'PRD-002' AND actor = 'Test'")).rows[0].n;
    assert.ok(rows >= 1, 'audit row written');
  });

  await ok('a new product and a link are persisted', async () => {
    const c = await j('/api/portfolio/products', { method: 'POST', body: JSON.stringify({ name: 'Parity Test Product ' + Date.now(), kind: 'software' }) });
    assert.equal(c.status, 200, JSON.stringify(c.body));
    await p.loadAll();
    assert.equal(p.portfolio.list().length, 7);
    const sys = (await p.repo.pool.query("SELECT count(*)::int n FROM system_audit_log WHERE action = 'product.created'")).rows[0].n;
    assert.ok(sys >= 1, 'system audit record written');
    const own = (await p.repo.pool.query("SELECT count(*)::int n FROM audit_log WHERE action = 'product.created'")).rows[0].n;
    assert.ok(own >= 1, 'product audit record written');
  });

  await ok('unknown product gives 404, bad input 422', async () => {
    assert.equal((await j('/api/dashboard?product=PRD-999')).status, 404);
    assert.equal((await j('/api/items?product=PRD-002', { method: 'POST', body: JSON.stringify({ type: 'Nope', fields: {} }) })).status, 422);
  });

  console.log(`\n${passed} checks passed`);
  await app.close();
  await p.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
main().catch((e) => { console.error(e); process.exit(1); });
