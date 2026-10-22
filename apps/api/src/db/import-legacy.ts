/**
 * npm run db:import-legacy [-- --force]
 *
 * One-time move of the data from the old JSON tables ("Product", "Item", "Link", "AuditEntry", "Idea", "PortfolioMeta")
 * into the real tables. Needs both migrations applied. Refuses to run when the real tables already hold products,
 * unless --force is given (that replaces them). The old tables are left as they are; drop them later with migration 0003.
 */
import 'reflect-metadata';
import { Portfolio } from '../legacy/engine/portfolio';
import { Repository, makePool } from './repository';

async function main() {
  const force = process.argv.includes('--force');
  const repo = new Repository(makePool());
  try {
    if (!(await repo.schemaReady())) throw new Error('The real tables do not exist yet. Run `npm run db:migrate` first.');
    const has = await repo.pool.query(`SELECT to_regclass('public."Product"') IS NOT NULL AS ok`);
    if (!has.rows[0].ok) { console.log('No old JSON tables found - nothing to import.'); return; }
    const old = await repo.pool.query('SELECT count(*)::int AS n FROM "Product"');
    if (!old.rows[0].n) { console.log('The old tables are empty - nothing to import.'); return; }
    const have = await repo.productCount();
    if (have > 0 && !force) throw new Error(`The real tables already hold ${have} product(s). Run again with --force to replace them with the old data.`);

    const q = async (sql: string) => (await repo.pool.query(sql)).rows;
    const [meta] = await q('SELECT reg FROM "PortfolioMeta" WHERE id = 1');
    const products = await q('SELECT * FROM "Product" ORDER BY id');
    const items = await q('SELECT "productId", id, data FROM "Item" ORDER BY id');
    const links = await q('SELECT "productId", id, data FROM "Link" ORDER BY data->>\'created_at\', id');
    const audit = await q('SELECT "productId", at, action, subject, actor, summary, details FROM "AuditEntry" ORDER BY seq');
    const ideas = await q('SELECT data FROM "Idea" ORDER BY id');

    const by = <T extends { productId: string }>(rows: T[]) => {
      const m = new Map<string, T[]>();
      for (const r of rows) (m.get(r.productId) || m.set(r.productId, []).get(r.productId)!).push(r);
      return m;
    };
    const itemsBy = by(items), linksBy = by(links), auditBy = by(audit);

    const pf: any = new Portfolio(null);
    pf.reg = { ...(meta ? meta.reg : pf.reg), products: products.map((p) => p.entry), ideas: ideas.map((i) => i.data) };
    pf.ensureSlugs();

    const bundles = products.map((p, i) => {
      const st = p.state || {};
      const data = {
        version: 1, meta: p.meta, settings: p.settings, counters: p.counters,
        items: Object.fromEntries((itemsBy.get(p.id) || []).map((r) => [r.id, r.data])),
        linkList: (linksBy.get(p.id) || []).map((r) => r.data),
        gates: st.gates || {}, baselines: st.baselines || [], attestations: st.attestations || [],
        requestState: st.requestState || {}, ingests: st.ingests || [], demo: st.demo || { index: 0 },
        audit: (auditBy.get(p.id) || []).map((a) => ({ at: a.at, action: a.action, subject: a.subject, summary: a.summary, actor: a.actor, details: a.details })),
      };
      return { position: i, entry: pf.reg.products[i], data };
    });

    const { products: _p, ...regRest } = pf.reg;
    await repo.transaction(async (c) => {
      if (force) await repo.wipe(c);
      await repo.saveRegistry(c, regRest);
      for (const b of bundles) await repo.saveProduct(c, b.position, { entry: b.entry, data: b.data });
    });
    console.log(`Imported ${bundles.length} products, ${items.length} items, ${links.length} links, ${audit.length} audit entries and ${ideas.length} ideas.`);
  } finally { await repo.close(); }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
