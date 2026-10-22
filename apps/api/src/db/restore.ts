/**
 * npm run db:restore -- <file> [--force]
 * Replaces EVERYTHING in the database with the content of a backup made by db:backup, in one transaction.
 * It refuses to run when the database already holds products, unless --force is given, and in production it always needs --force.
 * Stop the API first (or restart it afterwards): the API keeps the data in memory.
 */
import * as path from 'node:path';
import { makePool, Repository, logOperator } from './repository';
import { readHeader, restoreFrom } from './backup-lib';

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) throw new Error('Say which backup to restore: npm run db:restore -- backups/<file>.ndjson.gz');
  const header = await readHeader(file);
  const pool = makePool();
  const repo = new Repository(pool);
  try {
    if (!(await repo.schemaReady())) throw new Error('The database has no tables yet. Run `npm run db:apply` first.');
    const have = await repo.productCount();
    if (have > 0 && !force) throw new Error(`The database already holds ${have} product(s). Restoring replaces all of them. Run again with --force if that is what you want.`);
    if (process.env.NODE_ENV === 'production' && !force) throw new Error('Refusing to restore in production without --force.');
    console.log(`Restoring ${path.resolve(file)} (made ${header.created_at}) ...`);
    const r = await restoreFrom(pool, file);
    await logOperator(pool, 'ops.restore', `database replaced by backup ${path.basename(file)} (made ${header.created_at}, ${r.rows} rows)`, path.basename(file));
    console.log(`Restored ${r.rows} rows into ${Object.keys(r.tables).length} tables. Restart the API so it loads the restored data.`);
  } finally { await pool.end(); }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
