// Dev helper: apply prisma/migrations/*/migration.sql with plain pg (for environments where the Prisma schema engine is unavailable).
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const dir = path.join(__dirname, '..', 'prisma', 'migrations');
  for (const d of fs.readdirSync(dir).filter((x) => /^\d/.test(x)).sort()) await c.query(fs.readFileSync(path.join(dir, d, 'migration.sql'), 'utf8'));
  await c.end(); console.log('migrated');
})().catch((e) => { console.error(e); process.exit(1); });
