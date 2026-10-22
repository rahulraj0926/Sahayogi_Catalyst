/**
 * Backup and restore of every table, in plain Node (no pg_dump needed, so it works the same on Windows, Linux and in Docker).
 *
 * File format: gzip of newline-delimited JSON.
 *   line 1   {"format":"sahayogi-backup-1","created_at":"...","tables":{"products":6,...}}
 *   then     {"t":"<table>","r":{...row as JSON...}}   one line per row, tables in dependency order
 * Rows are written with Postgres to_jsonb() and read back with jsonb_populate_recordset(), so dates, timestamps, arrays and
 * numbers come back exactly as they were. The backup is read in ONE repeatable-read transaction: it is a consistent snapshot even
 * while the API is writing. Uploaded files (the UPLOAD_DIR folder) are not in the database: copy that folder as well.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import * as readline from 'node:readline';
import { Pool } from 'pg';
import { ALL_TABLES, TABLE_BY_NAME } from './tables';
import { q } from './spec';

export const FORMAT = 'sahayogi-backup-1';
const CHUNK = 500;

export interface BackupResult { file: string; tables: Record<string, number>; rows: number; bytes: number }

export function defaultBackupFile(dir = process.env.BACKUP_DIR || './backups', now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
  return path.join(dir, `sahayogi-${stamp}.ndjson.gz`);
}

export async function backupTo(pool: Pool, file: string): Promise<BackupResult> {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const tmp = file + '.part';
  const out = zlib.createGzip();
  const sink = fs.createWriteStream(tmp, { mode: 0o600 });
  out.pipe(sink);
  let streamError: Error | null = null;
  out.on('error', (e) => { streamError = e; });
  sink.on('error', (e) => { streamError = e; });
  const write = (s: string) => new Promise<void>((res, rej) => { if (streamError) rej(streamError); else if (out.write(s + '\n')) res(); else out.once('drain', () => res()); });
  const c = await pool.connect();
  const counts: Record<string, number> = {};
  try {
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    for (const t of ALL_TABLES) counts[t.table] = Number((await c.query(`SELECT count(*) AS n FROM ${q(t.table)}`)).rows[0].n);
    await write(JSON.stringify({ format: FORMAT, created_at: new Date().toISOString(), tables: counts }));
    for (const t of ALL_TABLES) {
      if (!counts[t.table]) continue;
      const order = t.pk.map(q).join(', ') || '1';
      let last = 0;
      const rows = (await c.query(`SELECT to_jsonb(x) AS r FROM ${q(t.table)} x ORDER BY ${order}`)).rows;
      for (const row of rows) { await write(JSON.stringify({ t: t.table, r: row.r })); last++; }
      if (last !== counts[t.table]) throw new Error(`table ${t.table}: counted ${counts[t.table]} rows but read ${last}`);
    }
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK').catch(() => undefined); out.destroy(); sink.destroy(); fs.rmSync(tmp, { force: true }); throw e; } finally { c.release(); }
  await new Promise<void>((res, rej) => { sink.on('finish', res); sink.on('error', rej); out.end(); });
  fs.renameSync(tmp, file);
  return { file, tables: counts, rows: Object.values(counts).reduce((a, b) => a + b, 0), bytes: fs.statSync(file).size };
}

/** Delete the oldest backups in a folder, keeping the newest `keep`. Only touches files named sahayogi-*.ndjson.gz. */
export function prune(dir: string, keep: number): string[] {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => /^sahayogi-.*\.ndjson\.gz$/.test(f)).sort();
  const drop = files.slice(0, Math.max(0, files.length - keep));
  for (const f of drop) fs.rmSync(path.join(dir, f));
  return drop;
}

export async function readHeader(file: string): Promise<any> {
  const rl = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()), crlfDelay: Infinity });
  for await (const line of rl) { rl.close(); const h = JSON.parse(line); if (h.format !== FORMAT) throw new Error(`${file} is not a Sahayogi backup (format ${h.format}).`); return h; }
  throw new Error(`${file} is empty.`);
}

/** Replace the whole content of the database with the backup, in ONE transaction: a failure leaves the old data untouched. */
export async function restoreFrom(pool: Pool, file: string): Promise<{ tables: Record<string, number>; rows: number }> {
  const header = await readHeader(file);
  const known = new Set(ALL_TABLES.map((t) => t.table));
  for (const t of Object.keys(header.tables)) if (!known.has(t)) throw new Error(`The backup has a table "${t}" that this version does not know. Restore with the version that made it.`);
  const c = await pool.connect();
  const seen: Record<string, number> = {};
  try {
    await c.query('BEGIN');
    await c.query(`TRUNCATE ${ALL_TABLES.map((t) => q(t.table)).join(', ')} RESTART IDENTITY CASCADE`);
    const rl = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()), crlfDelay: Infinity });
    let first = true; let cur = ''; let batch: any[] = [];
    const flush = async () => {
      if (!batch.length) return;
      await c.query(`INSERT INTO ${q(cur)} SELECT * FROM jsonb_populate_recordset(null::${q(cur)}, $1::jsonb)`, [JSON.stringify(batch)]);
      seen[cur] = (seen[cur] || 0) + batch.length; batch = [];
    };
    for await (const line of rl) {
      if (first) { first = false; continue; }
      if (!line) continue;
      const { t, r } = JSON.parse(line);
      if (t !== cur) { await flush(); cur = t; }
      batch.push(r);
      if (batch.length >= CHUNK) await flush();
    }
    await flush();
    for (const [t, n] of Object.entries<number>(header.tables)) if ((seen[t] || 0) !== n) throw new Error(`table ${t}: the backup says ${n} rows but ${seen[t] || 0} were read.`);
    // keep the audit counter ahead of the restored rows
    const seq = await c.query(`SELECT pg_get_serial_sequence('"audit_log"', 'seq') AS s`);
    if (seq.rows[0].s) await c.query(`SELECT setval($1, GREATEST((SELECT COALESCE(MAX(seq), 0) FROM "audit_log"), 1))`, [seq.rows[0].s]);
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK').catch(() => undefined); throw e; } finally { c.release(); }
  return { tables: seen, rows: Object.values(seen).reduce((a, b) => a + b, 0) };
}

export const tableExists = (name: string) => TABLE_BY_NAME.has(name);
