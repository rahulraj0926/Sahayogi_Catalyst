import * as fs from 'node:fs';
import * as path from 'node:path';

export interface BackupAge { last_at: string; age_hours: number; file: string }

/** The newest backup file in BACKUP_DIR (made by `npm run db:backup`), or null when there is none. Reads file times only. */
export function newestBackup(dir = process.env.BACKUP_DIR || './backups', now = Date.now()): BackupAge | null {
  try {
    let best: { f: string; t: number } | null = null;
    for (const f of fs.readdirSync(dir)) {
      if (!/^sahayogi-.*\.ndjson\.gz$/.test(f)) continue;
      const t = fs.statSync(path.join(dir, f)).mtimeMs;
      if (!best || t > best.t) best = { f, t };
    }
    return best ? { last_at: new Date(best.t).toISOString(), age_hours: Math.round(((now - best.t) / 3600_000) * 10) / 10, file: best.f } : null;
  } catch { return null; }
}
