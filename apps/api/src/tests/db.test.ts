/* Real-database round trip. Needs DATABASE_URL pointing at a database where migrations 0001 and 0002 are applied (it empties the new tables). */
import * as os from 'node:os'; import * as fs from 'node:fs'; import * as path from 'node:path';
import { seedPortfolio } from '../legacy/scripts/seed_portfolio';
import { Repository, makePool } from '../db/repository';

const norm = (v: any): any => JSON.parse(JSON.stringify(v));
function diff(a: any, b: any, p = '', out: string[] = []): string[] {
  if (out.length > 20 || a === b) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], p + '/' + k, out); return out; }
  out.push(`${p}: ${JSON.stringify(a)?.slice(0, 70)}  !=  ${JSON.stringify(b)?.slice(0, 70)}`);
  return out;
}
let failed = 0;
const check = (name: string, ok: boolean, more: string[] = []) => { console.log(`${ok ? '✓' : '✗'} ${name}`); if (!ok) { failed++; more.forEach((m) => console.log('    ' + m)); } };

if (process.env.NODE_ENV !== 'test') { console.error('This test empties the database tables. Run it only against a disposable database with NODE_ENV=test (CI does this).'); process.exit(2); }
(async () => {
  const repo = new Repository(makePool());
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-'));
  const src: any = seedPortfolio(tmp);
  src.ensureSlugs();
  const reg = { ...src.reg };

  const states = new Map<string, any>();
  let regSnap: any;
  await repo.transaction(async (c) => {
    await repo.wipe(c);
    regSnap = await repo.saveRegistry(c, reg);
    for (const [i, entry] of src.reg.products.entries()) states.set(entry.id, await repo.saveProduct(c, i, { entry, data: src.store(entry.id).data }));
  });

  // 1. everything comes back as it went in
  const back = await repo.loadProducts();
  check('all products loaded', back.length === src.reg.products.length);
  for (const b of back) {
    const entry = src.reg.products.find((e: any) => e.id === b.bundle.entry.id);
    const want = norm({ entry, data: src.store(entry.id).data });
    for (const r of Object.values<any>(want.data.requestState)) delete r.report;
    const d = diff(want, norm(b.bundle));
    check(`${entry.id} identical after save + load`, d.length === 0, d);
  }
  const loadedReg = await repo.loadRegistry();
  const wantReg = norm(reg); const gotReg = norm({ ...loadedReg.reg, products: reg.products });
  check('registry (counters, settings, ideas) identical', diff(wantReg, gotReg).length === 0, diff(wantReg, gotReg));

  // 2. saving again without changes writes nothing
  const counting = async () => { let n = 0; const orig = (repo.pool as any).query; return { n: () => n }; };
  const e1 = src.reg.products[0]; const d1 = src.store(e1.id).data;
  let statements = 0;
  await repo.transaction(async (c) => {
    const q0 = c.query.bind(c); (c as any).query = (...a: any[]) => { if (!/^(BEGIN|COMMIT)/.test(String(a[0]))) statements++; return (q0 as any)(...a); };
    states.set(e1.id, await repo.saveProduct(c, 0, { entry: e1, data: d1 }, states.get(e1.id)));
  });
  check('saving an unchanged product sends no SQL', statements === 0, [`${statements} statements`]);

  // 3. changes: edit an item, add an item, remove a link, add audit entries
  const itemId = Object.keys(d1.items)[3]; d1.items[itemId].title = 'Edited title';
  const linkGone = d1.linkList.pop(); const auditBefore = d1.audit.length;
  d1.audit.push({ at: new Date().toISOString(), action: 'test.edit', subject: itemId, summary: 'edited in test', actor: 'Test', details: { n: 2, list: ['a', 'b'] } });
  statements = 0;
  await repo.transaction(async (c) => {
    const q0 = c.query.bind(c); (c as any).query = (...a: any[]) => { if (!/^(BEGIN|COMMIT)/.test(String(a[0]))) statements++; return (q0 as any)(...a); };
    states.set(e1.id, await repo.saveProduct(c, 0, { entry: e1, data: d1 }, states.get(e1.id)));
  });
  check('a small change sends only a few statements', statements > 0 && statements <= 12, [`${statements} statements`]);
  const again = (await repo.loadProducts(e1.id))[0];
  check('edited title stored', again.bundle.data.items[itemId].title === 'Edited title');
  check('removed link is gone', !again.bundle.data.linkList.some((l: any) => l.id === linkGone.id));
  check('new audit entry stored with its details', again.bundle.data.audit.length === auditBefore + 1 && JSON.stringify(again.bundle.data.audit.at(-1).details) === JSON.stringify({ n: 2, list: ['a', 'b'] }));

  // 3b. audit cap: a product at the 6000-entry cap must still save new entries
  const CAP = 6000;
  d1.audit = Array.from({ length: CAP }, (_, i) => ({ at: new Date().toISOString(), action: 'test.fill', subject: 'x', summary: `fill ${i}`, actor: 'Test' }));
  await repo.transaction(async (c) => { states.set(e1.id, await repo.saveProduct(c, 0, { entry: e1, data: d1 }, states.get(e1.id))); });
  d1.audit.push({ at: new Date().toISOString(), action: 'test.cap', subject: 'x', summary: 'after the cap', actor: 'Test' });
  d1.audit.splice(0, d1.audit.length - CAP);
  await repo.transaction(async (c) => { states.set(e1.id, await repo.saveProduct(c, 0, { entry: e1, data: d1, auditTotal: CAP + 1 }, states.get(e1.id))); });
  const capRows = await repo.pool.query("SELECT count(*)::int n, count(*) FILTER (WHERE summary='after the cap')::int newest FROM audit_log WHERE product_id=$1", [e1.id]);
  check('entry added at the audit cap is saved exactly once', capRows.rows[0].newest === 1, [JSON.stringify(capRows.rows[0])]);
  await repo.transaction(async (c) => { states.set(e1.id, await repo.saveProduct(c, 0, { entry: e1, data: d1, auditTotal: CAP + 1 }, states.get(e1.id))); });
  const capRows2 = await repo.pool.query("SELECT count(*)::int n FROM audit_log WHERE product_id=$1", [e1.id]);
  check('saving again adds no audit rows', capRows2.rows[0].n === capRows.rows[0].n, [`${capRows.rows[0].n} -> ${capRows2.rows[0].n}`]);

  // 4. deleting an item removes its typed row and its extras (cascade)
  const delId = Object.keys(d1.items).find((k) => /^(FR|NFR)-/.test(k)) || Object.keys(d1.items).at(-1)!;
  delete d1.items[delId];
  d1.linkList = d1.linkList.filter((l: any) => l.source !== delId && l.target !== delId);
  await repo.transaction(async (c) => { states.set(e1.id, await repo.saveProduct(c, 0, { entry: e1, data: d1 }, states.get(e1.id))); });
  const orphan = await repo.pool.query('SELECT count(*)::int n FROM items WHERE product_id=$1 AND id=$2', [e1.id, delId]);
  check('deleted item is gone', orphan.rows[0].n === 0);

  // 5. no JSON columns anywhere in the new tables
  const j = await repo.pool.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND data_type IN ('json','jsonb') AND table_name !~ '^[A-Z]'");
  check('no JSON columns in the real schema', j.rows[0].n === 0);

  // leave the database as the seed makes it, so the other tests can rely on it
  const fresh: any = seedPortfolio(tmp); fresh.ensureSlugs();
  await repo.transaction(async (c) => {
    await repo.wipe(c);
    await repo.saveRegistry(c, { ...fresh.reg });
    for (const [i, entry] of fresh.reg.products.entries()) await repo.saveProduct(c, i, { entry, data: fresh.store(entry.id).data });
  });
  await repo.close();
  console.log(failed ? `\n${failed} check(s) failed` : '\nall database checks passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
