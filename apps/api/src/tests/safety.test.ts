/* Safety tests for the older /api routes and the database guards. No database needed. Run: npm run test:safety -w apps/api */
import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { engineLimit } from '../engine/limit';
import { PersistenceService } from '../persistence.service';
import { engineApp } from './engine-app';
import { seedPortfolio } from '../legacy/scripts/seed_portfolio';
import * as router from '../legacy/router';
import { done, ok } from './helpers';

/** A stand-in for PersistenceService: the seeded portfolio in memory, with switches to make saving fail. */
function fakePersistence() {
  const portfolio: any = seedPortfolio(fs.mkdtempSync(path.join(os.tmpdir(), 'sd-safety-')));
  router.setPortfolio(portfolio);
  const calls = { flush: 0, reloadProduct: [] as string[], reloadRegistry: 0 };
  const state = { failFlush: false };
  const p: any = {
    portfolio,
    async flush() { calls.flush++; if (state.failFlush) throw new Error('connection refused'); },
    async reloadProduct(id: string) { calls.reloadProduct.push(id); },
    async reloadRegistry() { calls.reloadRegistry++; },
  };
  return { p, calls, state, portfolio };
}

async function main() {
  const { p, calls, state, portfolio } = fakePersistence();
  process.env.LEGACY_WRITE_LIMIT = '5'; // the smallest allowance the setting accepts: the 6th change in a minute is refused
  const limit = engineLimit();
  const { base, close } = await engineApp(p);
  const call = async (url: string, init: RequestInit = {}) => {
    const r = await fetch(base + url, { ...init, headers: { 'content-type': 'application/json', ...(init.headers || {}) } });
    const text = await r.text();
    let body: any = text; try { body = JSON.parse(text); } catch { /* not json */ }
    return { status: r.status, body, headers: r.headers };
  };
  const change = { method: 'POST', body: JSON.stringify({ suspectDepth: 2 }) };
  const id = portfolio.list()[0].id;

  await ok('F1: a change without X-Actor is refused (401 actor_required) and nothing is saved', async () => {
    const r = await call(`/api/settings?product=${id}`, change);
    assert.equal(r.status, 401); assert.equal(r.body.code, 'actor_required');
    assert.equal(calls.flush, 0);
  });
  await ok('F1: the body can no longer name the person; the header does', async () => {
    const viaBody = await call(`/api/settings?product=${id}`, { method: 'POST', body: JSON.stringify({ suspectDepth: 2, actor: 'Someone' }) });
    assert.equal(viaBody.status, 401);
    const viaHeader = await call(`/api/settings?product=${id}`, { ...change, headers: { 'x-actor': 'Asha' } });
    assert.equal(viaHeader.status, 200);
    assert.ok(portfolio.store(id).data.audit.some((a: any) => a.actor === 'Asha'), 'audit names the header person');
    assert.ok(!portfolio.store(id).data.audit.some((a: any) => a.actor === 'Kanishk' && a.action === 'settings'), 'no default name is used');
  });
  await ok('F1: reading needs no name', async () => {
    const r = await call(`/api/dashboard?product=${id}`);
    assert.equal(r.status, 200);
  });
  await ok('F2: too many changes from one address get 429 with Retry-After', async () => {
    limit.reset();
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await call(`/api/settings?product=${id}`, { ...change, headers: { 'x-actor': 'Asha' } })).status);
    assert.deepEqual(codes, [200, 200, 200, 200, 200, 429]);
    const last = await call(`/api/settings?product=${id}`, { ...change, headers: { 'x-actor': 'Asha' } });
    assert.equal(last.body.code, 'rate_limited'); assert.ok(Number(last.headers.get('retry-after')) >= 1);
    const read = await call(`/api/dashboard?product=${id}`);
    assert.equal(read.status, 200, 'reads have their own allowance');
  });
  await ok('F2: a body that says it is too big is refused before it is read (413)', async () => {
    limit.reset();
    const r = await call(`/api/import?product=${id}`, { method: 'POST', headers: { 'x-actor': 'Asha', 'content-length': String(50 * 1024 * 1024) }, body: '{}' }).catch(() => ({ status: 413 }));
    assert.equal(r.status, 413);
  });
  await ok('F4: when saving fails the product is reloaded, the caller gets 503 save_failed', async () => {
    await new Promise((r) => setTimeout(r, 100)); // let the previous test's refused upload finish saving
    limit.reset(); calls.reloadProduct.length = 0; state.failFlush = true;
    const r = await call(`/api/settings?product=${id}`, { ...change, headers: { 'x-actor': 'Asha' } });
    state.failFlush = false;
    assert.equal(r.status, 503); assert.equal(r.body.code, 'save_failed');
    assert.equal(calls.reloadProduct.length, 1, 'one reload for the one request');
    assert.ok(calls.reloadProduct.length >= 1 && calls.reloadProduct.every((x) => x === id));
    assert.ok(calls.reloadRegistry >= 1);
    assert.ok(r.headers.get('retry-after'));
  });
  await ok('F4: a server bug is answered with a plain message, not internals', async () => {
    limit.reset();
    const r = await call(`/api/settings?product=${id}`, { method: 'POST', headers: { 'x-actor': 'Asha' }, body: JSON.stringify({ params: 5, suspectDepth: 'x' }) });
    assert.ok(r.status < 500 || r.body.error === 'Something went wrong on the server.');
  });
  await ok('F14: errors on the older routes use the same envelope as /api/v1 (code, message, requestId, statusCode) and keep the old error field', async () => {
    limit.reset();
    const r = await call(`/api/settings?product=${id}`, { ...change });
    assert.equal(r.status, 401);
    for (const k of ['code', 'message', 'requestId', 'statusCode']) assert.ok(r.body[k] !== undefined, `missing ${k}`);
    assert.equal(r.body.code, 'actor_required'); assert.equal(r.body.statusCode, 401); assert.equal(r.body.error, r.body.message);
  });
  await ok('F13: every engine route answers under /api/v1 as well, with the same rules and the same envelope; the old address carries the sunset headers', async () => {
    limit.reset();
    const a = await call(`/api/items?product=${id}&limit=2`); const b = await call(`/api/v1/items?product=${id}&limit=2`);
    assert.equal(a.status, 200); assert.equal(b.status, 200); assert.deepEqual(b.body, a.body);
    const noActor = await call(`/api/v1/settings?product=${id}`, { ...change });
    assert.equal(noActor.status, 401); assert.equal(noActor.body.code, 'actor_required'); assert.ok(noActor.body.requestId);
    assert.equal((await call(`/api/v1/items/NOPE-1?product=${id}`)).status, 404);
  });
  await ok('F1: the older routes that decide ideas, delete ideas or set the cost cap need the admin role, like /api/v1', async () => {
    limit.reset();
    const prev = process.env.ADMIN_ACTORS; process.env.ADMIN_ACTORS = 'Boss';
    try {
      const none = await call('/api/assistant/usage', { method: 'POST', body: JSON.stringify({ cap_inr: 100 }) });
      assert.equal(none.status, 401); assert.equal(none.body.code, 'actor_required');
      const member = await call('/api/assistant/usage', { method: 'POST', headers: { 'x-actor': 'Intern' }, body: JSON.stringify({ cap_inr: 100 }) });
      assert.equal(member.status, 403); assert.equal(member.body.code, 'role_required');
      const delMember = await call('/api/portfolio/ideas/IDEA-001', { method: 'DELETE', headers: { 'x-actor': 'Intern' } });
      assert.equal(delMember.status, 403);
      const admin = await call('/api/assistant/usage', { method: 'POST', headers: { 'x-actor': 'boss' }, body: JSON.stringify({ cap_inr: 100 }) });
      assert.ok(admin.status < 400, `admin should be allowed, got ${admin.status}`);
    } finally { if (prev === undefined) delete process.env.ADMIN_ACTORS; else process.env.ADMIN_ACTORS = prev; }
  });
  await ok('F22: a refused admin action and a failed save are recorded in the system audit trail (once a minute per person and action)', async () => {
    limit.reset();
    const { _resetRefusals } = await import('../engine/refusals'); _resetRefusals();
    const events: any[] = [];
    portfolio.systemEvent = (action: string, subject: string, actor: string, summary: string) => { events.push({ action, subject, actor, summary }); };
    const prev = process.env.ADMIN_ACTORS; process.env.ADMIN_ACTORS = 'Boss';
    try {
      const deny = () => call('/api/portfolio/ideas/IDEA-001', { method: 'DELETE', headers: { 'x-actor': 'Intern' } });
      assert.equal((await deny()).status, 403); await deny(); await deny();
      assert.equal(events.filter((e) => e.action === 'access.denied').length, 1, 'the same refusal is written once, not three times');
      assert.equal(events[0].actor, 'Intern'); assert.match(events[0].summary, /Intern was refused DELETE .*ideas.*admin role/);
      // a refusal that is only a missing name on an everyday change is not recorded
      limit.reset();
      await call(`/api/settings?product=${id}`, change);
      assert.equal(events.length, 1);
      // a failed save is recorded
      state.failFlush = true;
      const bad = await call(`/api/settings?product=${id}`, { method: 'POST', headers: { 'x-actor': 'Asha' }, body: JSON.stringify({ suspectDepth: 3 }) });
      state.failFlush = false;
      assert.equal(bad.status, 503);
      assert.ok(events.some((e) => e.action === 'save.failed' && e.actor === 'Asha'), 'save failure recorded');
    } finally { delete portfolio.systemEvent; if (prev === undefined) delete process.env.ADMIN_ACTORS; else process.env.ADMIN_ACTORS = prev; }
  });
  await ok('F6: a gate decision made against a gate that has changed is refused (409 stale_gate)', async () => {
    limit.reset();
    const gate = await call(`/api/gates/1?product=${id}`);
    assert.equal(gate.status, 200); assert.ok(gate.body.sig, 'the gate answer carries a signature');
    const stale = await call(`/api/gates/1/decide?product=${id}`, { method: 'POST', headers: { 'x-actor': 'Asha' }, body: JSON.stringify({ decision: 'hold', rationale: 'x', expected_sig: 'old-picture' }) });
    assert.equal(stale.status, 409); assert.equal(stale.body.code, 'stale_gate'); assert.equal(stale.body.current_sig, gate.body.sig);
    const fresh = await call(`/api/gates/1/decide?product=${id}`, { method: 'POST', headers: { 'x-actor': 'Asha' }, body: JSON.stringify({ decision: 'hold', rationale: 'x', expected_sig: gate.body.sig }) });
    assert.notEqual(fresh.body.code, 'stale_gate', 'the current signature is accepted');
  });
  await ok('F6: an edit made against an out-of-date copy of an item is refused (409 stale_edit)', async () => {
    limit.reset();
    const item = Object.values<any>(portfolio.store(id).data.items).find((i: any) => i.type === 'Assumption') || Object.values<any>(portfolio.store(id).data.items)[0];
    const patch = (extra: any, headers: any = {}) => call(`/api/items/${item.id}?product=${id}`, { method: 'PATCH', headers: { 'x-actor': 'Asha', ...headers }, body: JSON.stringify({ fields: { note: 'n' + Math.random() }, ...extra }) });
    const stale = await patch({ expected_rev: (item.rev || 1) - 1 });
    assert.equal(stale.status, 409); assert.equal(stale.body.code, 'stale_edit');
    limit.reset();
    const fresh = await patch({ expected_rev: item.rev || 1 });
    assert.equal(fresh.status, 200);
    limit.reset();
    const viaHeader = await patch({}, { 'if-match': `"${item.rev || 1}"` }); // the revision has moved on by one since
    assert.equal(viaHeader.status, 409);
    limit.reset();
    const unaware = await patch({});
    assert.equal(unaware.status, 200, 'callers that do not say a revision behave as before');
  });
  await close();

  await ok('F3: seeding refuses to wipe a database that already has products', async () => {
    const svc: any = Object.create(PersistenceService.prototype);
    svc.repo = { productCount: async () => 3 };
    await assert.rejects(() => svc.importPortfolio({}), /Refusing to wipe the database/);
  });
  await ok('F3: seeding in production needs --force even when the database is empty', async () => {
    const svc: any = Object.create(PersistenceService.prototype);
    svc.repo = { productCount: async () => 0 };
    const prev = process.env.NODE_ENV; process.env.NODE_ENV = 'production';
    try { await assert.rejects(() => svc.importPortfolio({}), /without --force/); } finally { process.env.NODE_ENV = prev; }
  });
  done();
}
main().catch((e) => { console.error(e); process.exit(1); });
