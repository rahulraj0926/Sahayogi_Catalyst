/* The /competitors addresses over real HTTP: what they accept, what they refuse, and that every reading address still answers. No database needed. */
import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { seedPortfolio } from '../legacy/scripts/seed_portfolio';
import * as router from '../legacy/router';
import { engineApp } from './engine-app';
import { done, ok } from './helpers';

async function main() {
  const portfolio: any = seedPortfolio(fs.mkdtempSync(path.join(os.tmpdir(), 'sd-capi-')));
  router.setPortfolio(portfolio);
  const p: any = { portfolio, async flush() { /* kept in memory */ }, async reloadProduct() { /* nothing */ }, async reloadRegistry() { /* nothing */ } };
  const { base, close } = await engineApp(p);
  const id = portfolio.list()[0].id;
  const call = async (url: string, init: RequestInit = {}) => {
    const r = await fetch(`${base}/api/v1/competitors${url}${url.includes('?') ? '&' : '?'}product=${id}`, { ...init, headers: { 'content-type': 'application/json', 'x-actor': 'Asha', ...(init.headers || {}) } });
    const text = await r.text(); let body: any = text; try { body = JSON.parse(text); } catch { /* not json */ }
    return { status: r.status, body };
  };
  const post = (url: string, body: unknown) => call(url, { method: 'POST', body: JSON.stringify(body) });

  try {
    await ok('the demo competitors can be added', async () => { const r = await post('/sample', {}); assert.equal(r.status, 200, JSON.stringify(r.body)); });

    const list = await call('/completeness');
    const comp = (list.body as any[])[0];

    await ok('a competitor profile answers 200 with its own plans, and 404 for anything else', async () => {
      const r = await call(`/${comp.id}/profile`);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.item.id, comp.id);
      assert.ok(Array.isArray(r.body.prices) && Array.isArray(r.body.product_lines) && r.body.completeness.id === comp.id);
      assert.equal((await call('/CMP-NOPE/profile')).status, 404);
    });

    await ok('every reading address answers 200, with the options the web app uses', async () => {
      const paths = ['/tiers', '/tiers?scope=Accounting', '/grid', '/prices', '/sources', '/effort', '/product-lines', '/completeness', '/normalized-prices?users=25&scope=', '/plan-capabilities', '/catalog',
        '/plans', `/plans?competitor=${comp.id}`, '/plans?scope=Accounting', '/plan-position-features', '/recommended?threshold=60&users=1', '/compare-plans?position=cheapest&users=5&fallback=top', '/our-plans',
        '/our-plans/pick-features?q=pay&limit=6', '/our-plans/pick-features?names_only=1&position=cheapest', '/must-have?threshold=80', '/scopes', '/overview?threshold=60&users=1&coverage=50&must=80&common=60&compare_users=1',
        `/export?id=${comp.id}`, '/export', '/import/template?kind=plans'];
      for (const u of paths) { const r = await call(u); assert.equal(r.status, 200, `${u} gave ${r.status}: ${JSON.stringify(r.body).slice(0, 200)}`); }
    });

    await ok('an option nobody knows is refused with the single error envelope, not ignored', async () => {
      const r = await call('/tiers?colour=red');
      assert.equal(r.status, 400); assert.equal(r.body.code, 'validation_failed');
      assert.equal((await call('/plans?users=abc')).status, 400);
      assert.equal((await call('/recommended?users=abc')).status, 400);
      assert.equal((await call('/compare-plans?position=gold')).status, 400);
    });

    await ok('adding common features: wrong shape is 400, a good request is saved, and repeating it adds nothing', async () => {
      assert.equal((await post('/catalog/common', { features: 'x' })).status, 400);
      assert.equal((await post('/catalog/common', { features: [{ name: 'Single sign-on', price: 5 }] })).status, 400, 'an extra field is refused');
      const a = await post('/catalog/common', { features: [{ name: 'Single sign-on', category: 'Security' }] });
      assert.equal(a.status, 200, JSON.stringify(a.body)); assert.equal(a.body.features_added, 1);
      const b = await post('/catalog/common', { features: [{ name: 'single sign-on' }] });
      assert.equal(b.body.features_added, 0); assert.equal(b.body.features_existing, 1);
    });

    await ok('adding competitors by rows: rows must be a list; a check-only request saves nothing', async () => {
      assert.equal((await post('/bulk', { rows: 'x' })).status, 400);
      assert.equal((await post('/bulk', { commit: true })).status, 400);
      const before = (await call('/completeness')).body.length;
      const r = await post('/bulk', { rows: [{ Competitor: 'Check Only Ltd', Plan: 'Basic', 'Monthly price': '100' }] });
      assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.committed, false);
      assert.equal((await call('/completeness')).body.length, before);
    });

    await ok('plan features: required fields are enforced before any work is done', async () => {
      assert.equal((await post('/plans/features', { competitor: comp.id, features: [] })).status, 400, 'no plans, no answer on included');
      assert.equal((await post('/plans/features', { competitor: comp.id, price_ids: ['x'], included: 'yes' })).status, 400);
      assert.equal((await post('/our-plans/features', { capability_id: 'CAP-1', included: true })).status, 400, 'a plan is needed');
      assert.equal((await post('/our-plans/features/new', { features: [] })).status, 400);
    });

    await ok('a change still needs a name (X-Actor), as everywhere else', async () => {
      const r = await call('/catalog/common', { method: 'POST', headers: { 'x-actor': '' }, body: JSON.stringify({ features: [{ name: 'Audit log' }] }) });
      assert.equal(r.status, 401);
    });
  } finally { await close(); }
  done();
}
main().catch((e) => { console.error(e); process.exit(1); });
