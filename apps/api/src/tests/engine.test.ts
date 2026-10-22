/* The typed engine controllers (F13) follow the same rules as the older route table. No database needed. Run: npm run test:unit -w apps/api */
import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { engineLimit } from '../engine/limit';
import * as approvals from '../legacy/engine/approvals';
import { seedPortfolio } from '../legacy/scripts/seed_portfolio';
import * as router from '../legacy/router';
import { engineApp } from './engine-app';
import { done, ok } from './helpers';

async function main() {
  const portfolio: any = seedPortfolio(fs.mkdtempSync(path.join(os.tmpdir(), 'sd-engine-')));
  router.setPortfolio(portfolio);
  const calls = { flush: 0, reloadProduct: [] as string[] };
  const state = { failFlush: false };
  const p: any = {
    portfolio,
    async flush() { calls.flush++; if (state.failFlush) throw new Error('connection refused'); },
    async reloadProduct(id: string) { calls.reloadProduct.push(id); },
    async reloadRegistry() { /* nothing to reload in memory */ },
  };
  process.env.LEGACY_WRITE_LIMIT = '5';
  const limit = engineLimit();
  const { base, close } = await engineApp(p);
  const id = portfolio.list()[0].id;
  const call = async (url: string, init: RequestInit = {}) => {
    const r = await fetch(base + url, { ...init, headers: { 'content-type': 'application/json', ...(init.headers || {}) } });
    const text = await r.text(); let body: any = text; try { body = JSON.parse(text); } catch { /* not json */ }
    return { status: r.status, body, headers: r.headers };
  };
  const add = (name: string, headers: Record<string, string> = { 'x-actor': 'Asha' }, extra: object = {}) => call(`/api/v1/people?product=${id}`, { method: 'POST', headers, body: JSON.stringify({ name, category: 'Customer', ...extra }) });

  await ok('typed route: a change without X-Actor is refused (401 actor_required) and nothing is saved', async () => {
    const before = calls.flush;
    const r = await add('Nobody', {});
    assert.equal(r.status, 401); assert.equal(r.body.code, 'actor_required'); assert.ok(r.body.requestId);
    assert.equal(calls.flush, before);
  });
  await ok('typed route: a change with a name answers 200, is saved, and the audit names the person', async () => {
    const before = calls.flush;
    const r = await add('Typed Person');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.person.name, 'Typed Person');
    assert.ok(calls.flush > before, 'saved');
    assert.equal(r.headers.get('x-product'), id);
    assert.ok(portfolio.store(id).data.audit.some((a: any) => a.action === 'people.add' && a.actor === 'Asha'));
  });
  await ok('typed route: the engine still decides what is acceptable (duplicate 409, empty name 422)', async () => {
    assert.equal((await add('Typed Person')).status, 409);
    assert.equal((await add('')).status, 422);
  });
  await ok('typed route: a field that does not exist is refused with the single error envelope (400 validation_failed)', async () => {
    const r = await add('Another', { 'x-actor': 'Asha' }, { colour: 'red' });
    assert.equal(r.status, 400); assert.equal(r.body.code, 'validation_failed'); assert.ok(Array.isArray(r.body.details));
  });
  await ok('typed route: reading needs no name, works without a product, and an unknown product is 404', async () => {
    const r = await call('/api/v1/people'); assert.equal(r.status, 200); assert.ok(Array.isArray(r.body.people));
    assert.equal((await call('/api/v1/people?product=PRD-NOPE')).status, 404);
  });
  await ok('typed route: the older address still works, with the sunset headers', async () => {
    limit.reset();
    const r = await call(`/api/people?product=${id}`);
    assert.equal(r.status, 200); assert.ok(Array.isArray(r.body.people));
    assert.equal(r.headers.get('deprecation'), 'true'); assert.ok(r.headers.get('sunset'));
    const w = await call(`/api/people?product=${id}`, { method: 'POST', headers: { 'x-actor': 'Asha' }, body: JSON.stringify({ name: 'Old Address Person' }) });
    assert.equal(w.status, 200); assert.equal(w.body.person.name, 'Old Address Person');
  });
  await ok('typed route: when saving fails the product is reloaded and the caller gets 503 save_failed', async () => {
    limit.reset(); calls.reloadProduct.length = 0; state.failFlush = true;
    const r = await add('Doomed Person');
    state.failFlush = false;
    assert.equal(r.status, 503); assert.equal(r.body.code, 'save_failed'); assert.ok(r.headers.get('retry-after'));
    assert.deepEqual(calls.reloadProduct, [id]);
  });
  await ok('typed route: the same per-address allowance applies (the 6th change in a minute is 429)', async () => {
    limit.reset();
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await add(`Limit Person ${i}`)).status);
    assert.deepEqual(codes, [200, 200, 200, 200, 200, 429]);
  });
  await ok('typed routes: every read answers 200 at the new and the old address, with the same answer', async () => {
    limit.reset();
    const reads = ['/needed', '/sheet', '/search?q=a', '/existing', '/journey', '/stages', '/stages/0', '/flow-edit', '/feedback', '/people', '/help/guide'];
    for (const r of reads) {
      const sep = r.includes('?') ? '&' : '?';
      const a = await call(`/api/v1${r}${sep}product=${id}`); const b = await call(`/api${r}${sep}product=${id}`);
      assert.equal(a.status, 200, `${r}: ${JSON.stringify(a.body).slice(0, 200)}`);
      assert.equal(b.status, 200, `old ${r}`);
      assert.deepEqual(b.body, a.body, `${r} differs between the two addresses`);
    }
    assert.equal((await call(`/api/v1/stages/9?product=${id}`)).status, 404);
    const guide = await fetch(`${base}/api/v1/help/guide`); assert.match(guide.headers.get('content-type') || '', /markdown/);
  });
  await ok('who is signed in: no login yet, so both addresses answer "none needed"', async () => {
    for (const u of ['/api/auth/me', '/api/v1/auth/me']) {
      const r = await call(u);
      assert.equal(r.status, 200, u); assert.deepEqual(r.body, { required: false, setup_needed: false, user: null });
    }
  });
  await ok('typed routes: leaving a note needs no name, and ticking it works', async () => {
    limit.reset();
    const flushed = calls.flush;
    const n = await call('/api/v1/feedback', { method: 'POST', body: JSON.stringify({ text: 'Typed route note' }) });
    assert.equal(n.status, 200, JSON.stringify(n.body)); assert.equal(n.body.note.text, 'Typed route note');
    assert.equal(calls.flush, flushed + 1, 'a new note is written to the database at once');
    assert.ok(portfolio.reg.feedback.some((x: any) => x.id === n.body.note.id), 'the note is part of the portfolio record that is saved');
    const d = await call(`/api/v1/feedback/${n.body.note.id}/done`, { method: 'POST', body: JSON.stringify({ done: true }) });
    assert.equal(d.status, 200); assert.equal(d.body.note.done, true);
    assert.equal(calls.flush, flushed + 2, 'ticking a note is written to the database too');
    const second = await call('/api/v1/feedback', { method: 'POST', body: JSON.stringify({ text: 'Another' }) });
    assert.notEqual(second.body.note.id, n.body.note.id, 'note numbers are not reused');
  });
  await ok('typed routes: the flow editor refuses an empty flow with the problems the page shows', async () => {
    limit.reset();
    const flow = Object.values<any>(portfolio.store(id).data.items).find((i: any) => i.type === 'Flow');
    if (!flow) return;
    const r = await call(`/api/v1/flow-edit/${flow.id}?product=${id}`, { method: 'POST', headers: { 'x-actor': 'Asha' }, body: JSON.stringify({ steps: [] }) });
    assert.equal(r.status, 422); assert.equal(r.body.code, 'unprocessable'); assert.ok(Array.isArray(r.body.errors) && r.body.errors[0].field === 'steps', 'the field problems the page shows are still sent');
    const bad = await call(`/api/v1/flow-edit/${flow.id}?product=${id}`, { method: 'POST', headers: { 'x-actor': 'Asha' }, body: JSON.stringify({ steps: 'nope' }) });
    assert.equal(bad.status, 400);
  });
  await ok('approver link: opening and deciding are saved at once (no name needed), and the audit says where it came from', async () => {
    limit.reset();
    const store = portfolio.store(id);
    const ap = approvals.create(store, { kind: 'exception', subject: 'EXC-X', title: 'Link test', prepared_by: 'Asha', approver: 'Priya', payload: { waiver: 'NOPE' } });
    portfolio.save(id);
    const before = calls.flush;
    const view = await call(`/api/v1/approve/${ap.token}`);
    assert.equal(view.status, 200, JSON.stringify(view.body)); assert.equal(view.body.status, 'waiting');
    assert.ok(calls.flush > before, 'opening the link is saved');
    const mid = calls.flush;
    const wrong = await call(`/api/v1/approve/${ap.token}/decide`, { method: 'POST', body: JSON.stringify({ decision: 'decline', name: 'Somebody', note: 'x' }) });
    assert.equal(wrong.status, 403); assert.equal(wrong.body.code, 'wrong_name');
    const r = await call(`/api/v1/approve/${ap.token}/decide`, { method: 'POST', body: JSON.stringify({ decision: 'decline', name: 'Priya', note: 'not now' }) });
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.status, 'declined');
    assert.ok(calls.flush > mid, 'the decision is saved');
    const entry = store.data.audit.filter((a: any) => a.action === 'approval.declined').pop();
    assert.ok(entry && entry.details && entry.details.from, 'the audit record carries the address the decision came from');
    assert.equal((await call(`/api/v1/approve/${'x'.repeat(30)}`)).status, 404);
  });
  await close();
  done();
}
main().catch((e) => { console.error(e); process.exit(1); });
