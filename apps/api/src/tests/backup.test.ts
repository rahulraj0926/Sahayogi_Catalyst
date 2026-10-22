/**
 * Backup and restore: a backup of the seeded database, restored after the data was damaged, gives back every table exactly.
 * Empties tables: only runs with NODE_ENV=test against a disposable database.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { makePool } from '../db/repository';
import { ALL_TABLES } from '../db/tables';
import { q } from '../db/spec';
import { backupTo, prune, restoreFrom } from '../db/backup-lib';

if (process.env.NODE_ENV !== 'test') { console.error('This test empties the database tables. Run it only against a disposable database with NODE_ENV=test (CI does this).'); process.exit(1); }
let failed = 0;
const check = (ok: boolean, name: string) => { console.log(`${ok ? '✓' : '✗'} ${name}`); if (!ok) failed++; };

async function fingerprint(pool: any): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const t of ALL_TABLES) {
    const order = t.pk.map(q).join(', ') || '1';
    const r = await pool.query(`SELECT count(*)::int AS n, md5(COALESCE(string_agg(to_jsonb(x)::text, '|' ORDER BY ${order}), '')) AS h FROM ${q(t.table)} x`);
    out[t.table] = `${r.rows[0].n}:${r.rows[0].h}`;
  }
  return out;
}

async function main() {
  const pool = makePool();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sahayogi-bk-'));
  try {
    const before = await fingerprint(pool);
    const products = Number((await pool.query('SELECT count(*) AS n FROM products')).rows[0].n);
    check(products > 0, `database holds ${products} products to back up`);

    const file = path.join(dir, 'sahayogi-20260101-000000.ndjson.gz');
    const b = await backupTo(pool, file);
    check(fs.existsSync(file) && !fs.existsSync(file + '.part'), 'backup file written, no half-written file left');
    check(b.rows === Object.values(before).reduce((a, s) => a + Number(s.split(':')[0]), 0), `backup holds every row (${b.rows})`);

    // damage the data: delete a product (cascades), change a title, add junk
    await pool.query(`DELETE FROM products WHERE id = (SELECT id FROM products ORDER BY id LIMIT 1)`);
    await pool.query(`UPDATE items SET title = 'damaged' WHERE id IN (SELECT id FROM items LIMIT 5)`);
    const damaged = await fingerprint(pool);
    check(JSON.stringify(damaged) !== JSON.stringify(before), 'data really was damaged');

    const r = await restoreFrom(pool, file);
    check(r.rows === b.rows, `restore reports the same row count (${r.rows})`);
    const after = await fingerprint(pool);
    const differ = Object.keys(before).filter((t) => before[t] !== after[t]);
    check(differ.length === 0, differ.length ? `tables differ after restore: ${differ.join(', ')}` : 'every table is identical after restore (row counts and content)');

    // audit counter continues after the restored rows
    const max = Number((await pool.query('SELECT COALESCE(max(seq),0) AS m FROM audit_log')).rows[0].m);
    const ins = await pool.query(`INSERT INTO audit_log (product_id, at, action, subject, actor, summary) SELECT id, now(), 'test', 'x', 'test', 'next seq' FROM products LIMIT 1 RETURNING seq`);
    check(Number(ins.rows[0].seq) > max, 'audit sequence continues after the restored rows');
    await pool.query(`DELETE FROM audit_log WHERE action = 'test' AND summary = 'next seq'`);

    // a corrupt backup must not touch the data
    const bad = path.join(dir, 'sahayogi-bad.ndjson.gz');
    const lines = JSON.stringify({ format: 'sahayogi-backup-1', created_at: 'x', tables: { products: 99 } });
    fs.writeFileSync(bad, require('node:zlib').gzipSync(lines + '\n'));
    let refused = false;
    try { await restoreFrom(pool, bad); } catch { refused = true; }
    check(refused, 'a backup whose row counts do not match is refused');
    const still = await fingerprint(pool);
    check(JSON.stringify(still) === JSON.stringify(before) || differ.length === 0 && Object.keys(before).filter((t) => before[t] !== still[t] && t !== 'audit_log').length === 0, 'a refused restore leaves the data untouched');

    // pruning keeps the newest
    for (const d of ['20260102', '20260103', '20260104']) fs.writeFileSync(path.join(dir, `sahayogi-${d}-000000.ndjson.gz`), 'x');
    const gone = prune(dir, 2);
    check(gone.length === 3 && fs.readdirSync(dir).filter((f) => f.endsWith('.gz')).length === 2, 'prune keeps only the newest 2 backups');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); await pool.end(); }
  if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
  console.log('all backup checks passed');
}
main().catch((e) => { console.error(e); process.exit(1); });
