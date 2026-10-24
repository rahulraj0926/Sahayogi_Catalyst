/**
 * npm run db:apply - creates whatever tables are missing, never drops or changes anything that exists.
 * Use it instead of `prisma migrate deploy` on a database whose old tables were not made by Prisma Migrate (error P3005).
 */
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';

async function main() {
  if (!process.env.DATABASE_URL) { try { (process as any).loadEnvFile(); } catch { /* none */ } }
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const exists = async (t: string) => (await c.query('SELECT to_regclass($1) IS NOT NULL AS ok', [t])).rows[0].ok;
  const dir = path.join(__dirname, '..', '..', 'prisma', 'migrations');
  const run = async (name: string) => { await c.query(fs.readFileSync(path.join(dir, name, 'migration.sql'), 'utf8')); console.log('applied', name); };
  await c.query('BEGIN');
  try {
    if (!(await exists('public."Product"')) && !(await exists('public.products'))) await run('0001_init');
    if (!(await exists('public.products'))) await run('0002_real_schema'); else console.log('real tables already exist');
    if (!(await exists('public.system_audit_log'))) await run('0003_system_audit');
    if (!(await exists('public.feedback_notes'))) await run('0004_feedback_notes');
    if (!(await exists('public.members'))) await run('0005_members');
    if (!(await exists('public.item_competitor_product_line'))) await run('0006_competitor_product_lines');
    if (!(await exists('public.item_capability'))) await run('0007_capability_catalog_and_seats');
    if (!(await c.query("SELECT 1 FROM information_schema.columns WHERE table_name = 'item_competitor' AND column_name = 'todo_done'")).rowCount) await run('0009_competitor_todo');
    if (!(await c.query("SELECT 1 FROM information_schema.columns WHERE table_name = 'item_competitor' AND column_name = 'scopes'")).rowCount) await run('0010_competitor_scopes');
    if (!(await c.query("SELECT 1 FROM information_schema.columns WHERE table_name = 'item_product' AND column_name = 'structure'")).rowCount) await run('0011_product_structure');
    if (!(await c.query("SELECT 1 FROM information_schema.columns WHERE table_name = 'item_competitor' AND column_name = 'todo_items'")).rowCount) await run('0012_competitor_todo_items');
    if (!(await c.query("SELECT 1 FROM information_schema.columns WHERE table_name = 'item_pricing_plan' AND column_name = 'price_yearly'")).rowCount) await run('0013_our_plan_prices_users');
    if (!(await c.query("SELECT 1 FROM information_schema.columns WHERE table_name = 'item_competitor' AND column_name = 'target_market'")).rowCount) await run('0014_competitor_customer_size_market');
    if ((await c.query("SELECT 1 FROM information_schema.columns WHERE column_name = 'tier_tag' AND table_name IN ('item_price_point', 'item_pricing_plan')")).rowCount) await run('0015_drop_plan_level');
    if (!(await c.query("SELECT 1 FROM information_schema.columns WHERE table_name = 'item_competitor_note' AND column_name = 'pinned'")).rowCount) await run('0016_competitor_note_sticky');
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { await c.end(); }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
