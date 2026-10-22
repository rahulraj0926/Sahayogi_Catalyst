/* Home + ideas tests. No database: the seeded demo portfolio runs in memory. Run: npm run test:unit -w apps/api */
import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import * as http from 'node:http';
import { Global, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { configureApp } from '../main';
import { ActivitySource, PortfolioSource } from '../engine-port/ports';
import { HomeModule } from '../home/home.module';
import { HomeService } from '../home/home.service';
import { ProductsQueryDto } from '../home/dto/home.dto';
import { IdeasModule } from '../ideas/ideas.module';
import { ProductsModule } from '../products/products.module';
import { IdeasService } from '../ideas/ideas.service';
import { done, MemoryActivitySource, MemoryPortfolioSource, ok } from './helpers';

const src = new MemoryPortfolioSource();
const act = new MemoryActivitySource(src);

@Global()
@Module({ providers: [{ provide: PortfolioSource, useValue: src }, { provide: ActivitySource, useValue: act }], exports: [PortfolioSource, ActivitySource] })
class TestPorts {}
@Module({ imports: [TestPorts, IdeasModule, HomeModule, ProductsModule] })
class TestRoot {}

const query = (o: Partial<ProductsQueryDto> = {}) => Object.assign(new ProductsQueryDto(), o);

async function main() {
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unused';
  process.env.ADMIN_ACTORS = 'Founder';
  const ideas = new IdeasService(src);
  const home = new HomeService(src, act, ideas);

  await ok('KPIs: five primary + four supporting cards, every value a non-negative number', async () => {
    const { kpis, asOf } = (await home.kpis());
    assert.equal(asOf, '2026-10-09');
    assert.equal(kpis.filter((k) => k.group === 'primary').length, 5);
    assert.equal(kpis.filter((k) => k.group === 'secondary').length, 4);
    for (const k of kpis) { assert.ok(Number.isFinite(k.value) && k.value >= 0, k.key); assert.ok(k.note.length > 0); }
    const avg = kpis.find((k) => k.key === 'avg_readiness')!;
    assert.ok(avg.value <= 100);
    assert.equal(kpis.find((k) => k.key === 'ideas_pending')!.value, 4);
  });

  await ok('products: default page lists all 6 with phase, kind, owner, stage, readiness and health', async () => {
    const r = (await home.products(query()));
    assert.equal(r.meta.total, 6);
    assert.equal(r.data.length, 6);
    for (const p of r.data) {
      assert.ok(p.name && p.owner && p.kind && p.stage);
      assert.ok(p.phase.id >= 0 && p.phase.id <= 12 && p.phase.name);
      assert.ok(p.readinessPercent >= 0 && p.readinessPercent <= 100);
      assert.ok(['on_track', 'attention', 'blocked', 'idle'].includes(p.health));
    }
    assert.ok(r.owners.length >= 5);
  });

  await ok('products: phase = first phase not yet signed off (Dealer Order Portal has Stages 0-3 signed, so it is in Phase 4)', async () => {
    const byName = Object.fromEntries((await home.products(query())).data.map((p) => [p.name, p.phase.id]));
    assert.equal(byName['Dealer Order Portal'], 4);
    assert.equal(byName['Sahayogi Developer'], 3);
    assert.equal(byName['Warranty and Service Desk'], 0);
  });

  await ok('products: filter by kind, stage and search; paging clamps', async () => {
    assert.ok((await home.products(query({ kind: ['hardware'] }))).data.every((p) => p.kind === 'hardware'));
    const byStage = (await home.products(query({ stage: ['P0', 'P1'] })));
    assert.ok(byStage.data.every((p) => ['P0', 'P1'].includes(p.stage)));
    assert.equal((await home.products(query({ q: 'zzz-nothing' }))).meta.total, 0);
    const p2 = (await home.products(query({ limit: 4, page: 2 })));
    assert.equal(p2.data.length, 2);
    assert.equal(p2.meta.totalPages, 2);
    assert.equal((await home.products(query({ limit: 4, page: 99 }))).meta.page, 2);
  });

  await ok('products: sort by readiness and by name; health filter agrees with the rows', async () => {
    const asc = (await home.products(query({ sort: 'readiness', order: 'asc' }))).data.map((p) => p.readinessPercent);
    assert.deepEqual(asc, [...asc].sort((a, b) => a - b));
    const names = (await home.products(query({ sort: 'name', order: 'asc' }))).data.map((p) => p.name.toLowerCase());
    assert.deepEqual(names, [...names].sort());
    const blocked = (await home.products(query({ health: ['blocked'] })));
    assert.ok(blocked.data.every((p) => p.health === 'blocked'));
    assert.equal((await home.kpis()).kpis.find((k) => k.key === 'blocked')!.value, blocked.data.filter((p) => !['done', 'parked'].includes(p.stage)).length);
  });

  await ok('rows are cached: a second read recomputes nothing', async () => {
    (await home.products(query()));
    const m = home.rows.misses;
    (await home.products(query())); (await home.kpis());
    assert.equal(home.rows.misses, m);
  });

  await ok('calendar: this month has events; a range over 93 days or reversed is refused', async () => {
    const c = home.calendar();
    assert.equal(c.from, '2026-10-01'); assert.equal(c.to, '2026-10-31');
    assert.ok(c.events.every((e) => e.date >= c.from && e.date <= c.to));
    assert.ok(c.events.length > 0);
    assert.throws(() => home.calendar('2026-01-01', '2026-12-31'), /at most 93 days/);
    assert.throws(() => home.calendar('2026-10-10', '2026-10-01'), /not be before/);
  });

  await ok('activity: newest first, cursor pages without repeats', async () => {
    const a = await home.activity(5);
    assert.equal(a.data.length, 5);
    assert.ok(a.next);
    const b = await home.activity(5, a.next!);
    assert.ok(b.data.every((x) => !a.data.some((y) => y.id === x.id)));
    assert.ok(a.data.every((x) => x.productName && x.text));
  });

  await ok('ideas: submit, shortlist, accept creates a product at Phase 0, reject needs a reason and is final', async () => {
    const before = (await home.products(query())).meta.total;
    const i = await ideas.submit({ one_liner: 'Voice notes for field engineers' }, 'Asha');
    assert.equal(i.requester, 'Asha');
    assert.equal((await ideas.shortlist(i.id, true, 'Founder')).status, 'shortlisted');
    const acc = await ideas.accept(i.id, { name: 'Field Voice Notes', owner: 'Asha' }, 'Founder');
    assert.equal(acc.idea.status, 'promoted');
    assert.equal(acc.idea.decided_by, 'Founder');
    assert.equal((await home.products(query())).meta.total, before + 1);
    await assert.rejects(ideas.accept(i.id, {}, 'Founder'), /already became product/);
    const other = ideas.list().find((x) => x.status === 'new' || x.status === 'shortlisted')!;
    const rej = await ideas.reject(other.id, 'Overlaps with the Dealer Order Portal', 'Founder');
    assert.equal(rej.status, 'rejected'); assert.equal(rej.reject_reason, 'Overlaps with the Dealer Order Portal');
    await assert.rejects(ideas.reject(other.id, 'again', 'Founder'), /already rejected/);
    await assert.rejects(ideas.accept('IDEA-999', {}, 'Founder'), /no idea/);
    assert.ok(src.flushes >= 4, 'every change is flushed to the database');
  });

  await ok('URL names: readable, unique, stable, never a route word or an id; calendar links use them', async () => {
    const pf = src.get() as unknown as { uniqueSlug(n: string): string; get(id: string): { id: string } | null };
    const slugs = (await home.products(query())).data.map((p) => p.slug);
    assert.ok(slugs.includes('sahayogi-cdn') && slugs.includes('dealer-order-portal'), slugs.join());
    assert.equal(new Set(slugs).size, slugs.length);
    assert.equal(pf.uniqueSlug('Sahayogi CDN'), 'sahayogi-cdn-2');
    assert.equal(pf.uniqueSlug('New'), 'new-product');
    assert.equal(pf.uniqueSlug('PRD-9'), 'prd-9-product');
    assert.equal(pf.uniqueSlug('  Café Ünïcode!! '), 'cafe-unicode');
    assert.equal(pf.uniqueSlug('!!!'), 'product');
    assert.equal(pf.get('sahayogi-cdn')!.id, 'PRD-001');
    assert.ok(home.calendar().events.filter((e) => e.href).every((e) => e.href!.startsWith('/products/') && !/PRD-/.test(e.href!)));
  });

  // ---- over HTTP: validation, envelope, roles
  const app = await NestFactory.create<NestExpressApplication>(TestRoot, { bodyParser: false, logger: false });
  configureApp(app);
  await app.listen(0);
  const base = (await app.getUrl()).replace('[::1]', 'localhost');
  const j = async (url: string, init: RequestInit = {}) => { const r = await fetch(base + url, { ...init, headers: { 'content-type': 'application/json', ...(init.headers || {}) } }); return { status: r.status, rid: r.headers.get('x-request-id'), body: (await r.json()) as any }; };

  await ok('HTTP: /api/v1/home answers in one call with all sections', async () => {
    const r = await j('/api/v1/home');
    assert.equal(r.status, 200);
    for (const k of ['asOf', 'kpis', 'products', 'ideas', 'ideasTotal', 'activity', 'calendar']) assert.ok(k in r.body, k);
    assert.ok(r.rid);
  });

  await ok('HTTP: /api/v1/products/:ref turns an id or a URL name into both', async () => {
    const a = await j('/api/v1/products/PRD-001');
    const b = await j('/api/v1/products/sahayogi-cdn');
    assert.deepEqual(a.body, b.body);
    assert.equal(a.body.slug, 'sahayogi-cdn');
    const none = await j('/api/v1/products/nope');
    assert.equal(none.status, 404); assert.equal(none.body.code, 'product_not_found');
  });

  await ok('HTTP: bad query gets the single error envelope with a request id', async () => {
    const r = await j('/api/v1/home/products?limit=1000&sort=bogus&unknown=1');
    assert.equal(r.status, 400);
    assert.equal(r.body.code, 'validation_failed');
    assert.ok(Array.isArray(r.body.details) && r.body.details.length >= 2);
    assert.equal(r.body.requestId, r.rid);
    const bad = await j('/api/v1/ideas', { method: 'POST', body: '{nope' });
    assert.equal(bad.status, 400); assert.equal(bad.body.code, 'invalid_json');
    assert.equal((await j('/api/v1/nothing-here')).body.code, 'not_found');
  });

  await ok('HTTP: changes need a named person; accept/reject need the admin role', async () => {
    const noActor = await j('/api/v1/ideas', { method: 'POST', body: JSON.stringify({ one_liner: 'No name given' }) });
    assert.equal(noActor.status, 401); assert.equal(noActor.body.code, 'actor_required');
    const member = await j('/api/v1/ideas', { method: 'POST', headers: { 'x-actor': 'Intern' }, body: JSON.stringify({ one_liner: 'Dark mode for the portal' }) });
    assert.equal(member.status, 201);
    const denied = await j(`/api/v1/ideas/${member.body.id}/accept`, { method: 'POST', headers: { 'x-actor': 'Intern' }, body: '{}' });
    assert.equal(denied.status, 403); assert.equal(denied.body.code, 'role_required');
    const good = await j(`/api/v1/ideas/${member.body.id}/reject`, { method: 'POST', headers: { 'x-actor': 'Founder' }, body: JSON.stringify({ reason: 'Not now' }) });
    assert.equal(good.status, 200); assert.equal(good.body.status, 'rejected');
    const noReason = await j(`/api/v1/ideas/${member.body.id}/reject`, { method: 'POST', headers: { 'x-actor': 'Founder' }, body: '{}' });
    assert.equal(noReason.status, 400);
  });

  await ok('F16: ideas list pages with a cursor (no repeats, no gaps), keeps the status filter, rejects a bad cursor', async () => {
    const all = await j('/api/v1/ideas?status=new,shortlisted,rejected,promoted&limit=100');
    assert.equal(all.status, 200); assert.ok(all.body.total >= 4); assert.equal(all.body.next, null);
    const seen: string[] = []; let cur = '';
    for (let n = 0; n < 20; n++) {
      const r = await j(`/api/v1/ideas?status=new,shortlisted,rejected,promoted&limit=2${cur ? `&cursor=${cur}` : ''}`);
      assert.equal(r.status, 200); assert.ok(r.body.data.length <= 2);
      seen.push(...r.body.data.map((x: any) => x.id));
      if (!r.body.next) break; cur = r.body.next;
    }
    assert.deepEqual(seen, all.body.data.map((x: any) => x.id));
    assert.equal(new Set(seen).size, seen.length);
    assert.equal((await j('/api/v1/ideas?cursor=%25%25')).status, 400);
    assert.equal((await j('/api/v1/ideas?status=bogus')).status, 400);
  });

  await ok('F16: GET answers carry an ETag; sending it back gets 304 with no body; the answer is marked revalidate', async () => {
    const r1 = await fetch(base + '/api/v1/home/kpis');
    const tag = r1.headers.get('etag');
    assert.ok(tag, 'ETag header'); assert.match(r1.headers.get('cache-control') || '', /no-cache/);
    // node:http, because fetch() adds "Cache-Control: no-cache" itself when If-None-Match is set, which forces a full answer
    const r2 = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const u = new URL(base + '/api/v1/home/kpis');
      http.get({ host: u.hostname, port: u.port, path: u.pathname, headers: { 'if-none-match': tag! } }, (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ status: res.statusCode!, body: b })); }).on('error', reject);
    });
    assert.equal(r2.status, 304); assert.equal(r2.body, '');
  });

  await ok('F17: the same Idempotency-Key replays the first answer and does the change once', async () => {
    const h = { 'x-actor': 'Intern', 'idempotency-key': 'key-test-0001' };
    const before = (await j('/api/v1/ideas?status=new,shortlisted,rejected,promoted&limit=100')).body.total;
    const body = JSON.stringify({ one_liner: 'Idea sent twice by mistake' });
    const a = await fetch(base + '/api/v1/ideas', { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body });
    const first = await a.json() as any;
    const b = await fetch(base + '/api/v1/ideas', { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body });
    assert.equal(a.status, 201); assert.equal(b.status, 201);
    assert.equal(b.headers.get('idempotent-replayed'), 'true'); assert.equal(a.headers.get('idempotent-replayed'), null);
    assert.equal((await b.json() as any).id, first.id);
    assert.equal((await j('/api/v1/ideas?status=new,shortlisted,rejected,promoted&limit=100')).body.total, before + 1);
    const other = await j('/api/v1/ideas', { method: 'POST', headers: h, body: JSON.stringify({ one_liner: 'A different request, same key' }) });
    assert.equal(other.status, 422); assert.equal(other.body.code, 'idempotency_key_reuse');
    const badKey = await j('/api/v1/ideas', { method: 'POST', headers: { 'x-actor': 'Intern', 'idempotency-key': 'x' }, body });
    assert.equal(badKey.status, 400); assert.equal(badKey.body.code, 'invalid_idempotency_key');
    const none = await j('/api/v1/ideas', { method: 'POST', headers: { 'x-actor': 'Intern' }, body });
    assert.equal(none.status, 201); assert.notEqual(none.body.id, first.id); // no key = no protection, as before
  });
  await app.close();

  // ---- scale: 600 products
  await ok('F22: product creation and idea decisions leave audit records (system log and product audit)', async () => {
    const pf: any = src.get(); const seen: string[][] = [];
    const orig = pf.systemEvent; pf.systemEvent = (a: string, subj: string, who: string) => { seen.push([a, subj, who]); };
    try {
      const i1 = await ideas.submit({ one_liner: 'Audit check idea one' } as any, 'Asha');
      const i2 = await ideas.submit({ one_liner: 'Audit check idea two' } as any, 'Asha');
      await ideas.reject(i2.id, 'not now', 'Founder');
      const acc = await ideas.accept(i1.id, {} as any, 'Founder');
      pf.deleteIdea(i2.id, 'Founder');
      const actions = seen.map((x) => x[0]);
      for (const a of ['idea.created', 'idea.rejected', 'idea.promoted', 'product.created', 'idea.deleted']) assert.ok(actions.includes(a), `missing ${a}: ${actions}`);
      assert.ok(seen.some((x) => x[0] === 'idea.rejected' && x[2] === 'Founder'));
      const created = pf.store(acc.productId).data.audit.find((a: any) => a.action === 'product.created');
      assert.ok(created && created.actor === 'Founder', 'the new product has its own creation record');
    } finally { pf.systemEvent = orig; }
  });

  await ok('scale: 600 products — cold build, then warm reads stay fast', async () => {
    src.grow(600);
    const big = new HomeService(src, act, ideas);
    let t = Date.now();
    await big.warm();
    const cold = Date.now() - t;
    t = Date.now(); const k = (await big.kpis()); const kMs = Date.now() - t;
    t = Date.now(); const p = (await big.products(query({ sort: 'readiness', order: 'desc', limit: 25 }))); const pMs = Date.now() - t;
    t = Date.now(); big.calendar(); const cMs = Date.now() - t;
    console.log(`      600 products: cold ${cold} ms, kpis ${kMs} ms, table(sort readiness) ${pMs} ms, calendar ${cMs} ms`);
    assert.equal(p.meta.total, 600 + 0);
    assert.equal(p.data.length, 25);
    assert.ok(k.kpis.length === 9);
    assert.ok(kMs < 300 && pMs < 300 && cMs < 300, 'warm reads under 300 ms');
  });
  done();
}
main().catch((e) => { console.error(e); process.exit(1); });
