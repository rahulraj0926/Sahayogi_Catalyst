/**
 * npm run db:backup [-- <file>] [-- --keep 14]
 * Writes a compressed backup of every table to ./backups/sahayogi-<time>.ndjson.gz (folder: BACKUP_DIR). --keep N deletes the
 * oldest backups in that folder afterwards, so a daily job does not fill the disk. Uploaded files (UPLOAD_DIR) are not in it.
 */
import * as path from 'node:path';
import { makePool, logOperator } from './repository';
import { backupTo, defaultBackupFile, prune } from './backup-lib';

async function main() {
  const args = process.argv.slice(2);
  const ki = args.indexOf('--keep');
  const keep = ki >= 0 ? Number(args[ki + 1]) : 0;
  if (ki >= 0 && !(keep >= 1)) throw new Error('--keep needs a number of 1 or more.');
  const file = args.find((a, i) => !a.startsWith('--') && i !== ki + 1) || defaultBackupFile();
  const pool = makePool();
  try {
    const r = await backupTo(pool, file);
    console.log(`Backed up ${r.rows} rows from ${Object.values(r.tables).filter((n) => n).length} tables to ${path.resolve(r.file)} (${(r.bytes / 1024).toFixed(0)} KB).`);
    await logOperator(pool, 'ops.backup', `backup written: ${path.basename(r.file)} (${r.rows} rows, ${(r.bytes / 1024).toFixed(0)} KB)`, path.basename(r.file));
    console.log(`Uploaded files are not included: also copy the folder ${path.resolve(process.env.UPLOAD_DIR || './uploads')}.`);
    if (keep) { const gone = prune(path.dirname(file), keep); if (gone.length) console.log(`Removed ${gone.length} old backup(s), keeping the newest ${keep}.`); }
  } finally { await pool.end(); }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
