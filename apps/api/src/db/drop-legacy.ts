/**
 * npm run db:drop-legacy [-- --yes] [-- --yes-lose-data]
 * Drops the old JSON-column tables ("Product", "Item", "Link", "AuditEntry", "Idea", "PortfolioMeta") that the real schema replaced.
 * Safe order: first `npm run db:import-legacy` (if they hold data you want), then `npm run db:backup`, then this.
 *  - Without --yes it only shows what it would drop.
 *  - It refuses when the real tables hold no products (nothing replaced the old data yet).
 *  - It refuses when an old table still holds rows, unless --yes-lose-data is also given.
 */
import { Pool } from 'pg';
import { makePool, logOperator } from './repository';

const LEGACY = ['AuditEntry', 'Link', 'Item', 'Idea', 'Product', 'PortfolioMeta'];

async function main() {
  const yes = process.argv.includes('--yes');
  const lose = process.argv.includes('--yes-lose-data');
  const pool: Pool = makePool();
  try {
    const has = async (t: string) => (await pool.query('SELECT to_regclass($1) IS NOT NULL AS ok', [`public."${t}"`])).rows[0].ok;
    const present: Record<string, number> = {};
    for (const t of LEGACY) if (await has(t)) present[t] = Number((await pool.query(`SELECT count(*) AS n FROM "${t}"`)).rows[0].n);
    if (!Object.keys(present).length) { console.log('No old tables found - nothing to drop.'); return; }
    console.log('Old tables:', Object.entries(present).map(([t, n]) => `${t} (${n} rows)`).join(', '));
    const real = Number((await pool.query('SELECT count(*) AS n FROM products')).rows[0].n);
    if (!real) throw new Error('The real tables hold no products yet. Run `npm run db:import-legacy` (or `npm run seed`) first.');
    const rows = Object.values(present).reduce((a, b) => a + b, 0);
    if (rows > 0 && !lose) throw new Error(`The old tables still hold ${rows} rows. If you have imported them already and have a backup, run again with --yes --yes-lose-data.`);
    if (!yes) { console.log('Nothing dropped. Run again with --yes to drop them.'); return; }
    await pool.query('BEGIN');
    try { for (const t of LEGACY) if (present[t] !== undefined) await pool.query(`DROP TABLE "${t}" CASCADE`); await pool.query('COMMIT'); }
    catch (e) { await pool.query('ROLLBACK'); throw e; }
    await logOperator(pool, 'ops.drop_legacy', `dropped old tables: ${Object.keys(present).join(', ')}`);
    console.log(`Dropped ${Object.keys(present).length} old table(s).`);
  } finally { await pool.end(); }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
