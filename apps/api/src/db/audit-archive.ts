/**
 * npm run db:audit-archive [-- --years 7] [-- --apply]
 * Retention rule for the audit trail: entries older than AUDIT_RETENTION_YEARS (default 7, or --years) are first written to
 * <BACKUP_DIR>/audit-archive/audit-<date>.ndjson.gz and only then deleted from the database (their details go with them).
 * Without --apply it only reports what it would do. Nothing is deleted unless the archive file was written and counted correctly.
 * Stop the API first (or restart it afterwards): the API keeps recent entries in memory.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { makePool, logOperator } from './repository';

async function main() {
  const args = process.argv.slice(2);
  const yi = args.indexOf('--years');
  const years = yi >= 0 ? Number(args[yi + 1]) : Number(process.env.AUDIT_RETENTION_YEARS || 7);
  if (!(years >= 1)) throw new Error('Retention must be 1 year or more.');
  const apply = args.includes('--apply');
  const cutoff = new Date(); cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
  const pool = makePool();
  try {
    const n = Number((await pool.query('SELECT count(*) n FROM audit_log WHERE at < $1', [cutoff.toISOString()])).rows[0].n);
    console.log(`${n} audit entr${n === 1 ? 'y is' : 'ies are'} older than ${years} year(s) (before ${cutoff.toISOString().slice(0, 10)}).`);
    if (!n) return;
    if (!apply) { console.log('Dry run: nothing changed. Add --apply to archive and delete them.'); return; }

    const dir = path.join(process.env.BACKUP_DIR || './backups', 'audit-archive');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `audit-${new Date().toISOString().slice(0, 10)}-before-${cutoff.toISOString().slice(0, 10)}.ndjson.gz`);
    const gz = zlib.createGzip(); const out = fs.createWriteStream(file + '.part'); gz.pipe(out);
    const done = new Promise<void>((res, rej) => { out.on('finish', () => res()); out.on('error', rej); });
    let written = 0; let last = 0;
    for (;;) {
      const rows = (await pool.query('SELECT * FROM audit_log WHERE at < $1 AND seq > $2 ORDER BY seq LIMIT 2000', [cutoff.toISOString(), last])).rows;
      if (!rows.length) break;
      const det = (await pool.query('SELECT * FROM audit_details WHERE seq = ANY($1::bigint[])', [rows.map((r) => r.seq)])).rows;
      const by = new Map<string, any[]>(); for (const d of det) (by.get(String(d.seq)) || by.set(String(d.seq), []).get(String(d.seq))!).push(d);
      for (const r of rows) gz.write(JSON.stringify({ entry: r, details: by.get(String(r.seq)) || [] }) + '\n');
      written += rows.length; last = rows[rows.length - 1].seq;
    }
    gz.end(); await done;
    if (written !== n) { fs.rmSync(file + '.part', { force: true }); throw new Error(`Archive counted ${written} entries but ${n} were expected (the data changed while running). Nothing was deleted; stop the API and run again.`); }
    fs.renameSync(file + '.part', file);
    const del = await pool.query('DELETE FROM audit_log WHERE at < $1 AND seq <= $2', [cutoff.toISOString(), last]);
    await logOperator(pool, 'ops.audit_archive', `${written} audit entries older than ${cutoff.toISOString().slice(0, 10)} archived to ${path.basename(file)} and deleted`, path.basename(file));
    console.log(`Archived ${written} entries to ${path.resolve(file)} and deleted ${del.rowCount} from the database. Restart the API.`);
  } finally { await pool.end(); }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
