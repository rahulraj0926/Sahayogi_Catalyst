/**
 * npm run db:drill [-- <file>] [--max-age-hours 36]
 * Proves that the newest backup can really be restored: it restores the backup into a throwaway database (never the real one),
 * checks every table's row count against the backup, loads every product through the repository, then drops the scratch database.
 * Fails (exit 1) when there is no backup, the newest backup is older than --max-age-hours, or anything does not match.
 * Needs a database user that may CREATE DATABASE. Run it daily/weekly (see .github/workflows/restore-drill.yml).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Client } from 'pg';
import { makePool, Repository, logOperator } from './repository';
import { readHeader, restoreFrom } from './backup-lib';

function newestBackup(dir: string): string | undefined {
  if (!fs.existsSync(dir)) return undefined;
  const f = fs.readdirSync(dir).filter((x) => /^sahayogi-.*\.ndjson\.gz$/.test(x)).sort().at(-1);
  return f ? path.join(dir, f) : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const ai = args.indexOf('--max-age-hours');
  const maxAge = ai >= 0 ? Number(args[ai + 1]) : 36;
  const file = args.find((a, i) => !a.startsWith('--') && i !== ai + 1) || newestBackup(process.env.BACKUP_DIR || './backups');
  if (!file) throw new Error('No backup found. Run `npm run db:backup` first (folder: BACKUP_DIR).');
  const header = await readHeader(file);
  const ageH = (Date.now() - new Date(header.created_at).getTime()) / 3.6e6;
  if (ageH > maxAge) throw new Error(`The newest backup (${file}) is ${ageH.toFixed(1)} hours old; the limit is ${maxAge}. Backups are not running.`);

  if (!process.env.DATABASE_URL) { try { (process as any).loadEnvFile(); } catch { /* none */ } }
  const base = new URL(process.env.DATABASE_URL || '');
  const scratch = `sahayogi_drill_${Date.now()}`;
  const admin = new Client({ connectionString: process.env.DATABASE_URL });
  await admin.connect();
  const url = new URL(base.toString()); url.pathname = `/${scratch}`;
  let pool: ReturnType<typeof makePool> | undefined;
  try {
    await admin.query(`CREATE DATABASE "${scratch}"`);
    const mig = path.join(__dirname, '..', '..', 'prisma', 'migrations');
    const c = new Client({ connectionString: url.toString() }); await c.connect();
    try { for (const m of ['0001_init', '0002_real_schema']) await c.query(fs.readFileSync(path.join(mig, m, 'migration.sql'), 'utf8')); } finally { await c.end(); }

    pool = makePool(url.toString(), 2);
    const r = await restoreFrom(pool, file);          // already checks every table's row count against the header
    const repo = new Repository(pool);
    const products = await repo.loadProducts();
    const expected = Number(header.tables.products || 0);
    if (products.length !== expected) throw new Error(`The backup holds ${expected} products but ${products.length} could be loaded.`);
    const audit = products.reduce((n, p) => n + p.bundle.data.audit.length, 0);
    if (audit !== Number(header.tables.audit_log || 0)) throw new Error(`audit rows: backup ${header.tables.audit_log || 0}, loaded ${audit}.`);
    await logOperator(admin, 'ops.restore_drill', `restore drill passed with ${path.basename(file)}: ${r.rows} rows, ${products.length} products`, path.basename(file));
    console.log(`DRILL OK: ${path.basename(file)} (${ageH.toFixed(1)} h old) restored into a scratch database: ${r.rows} rows, ${products.length} products, ${audit} audit entries, all loaded.`);
  } finally {
    if (pool) await pool.end().catch(() => undefined);
    await admin.query(`DROP DATABASE IF EXISTS "${scratch}" WITH (FORCE)`).catch((e) => console.error('Could not drop the scratch database', scratch, e.message));
    await admin.end();
  }
}
main().catch((e) => { console.error('DRILL FAILED:', e.message || e); process.exit(1); });
