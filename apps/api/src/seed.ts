/* Loads the prototype's seeded demo portfolio (6 products, 4 ideas) into PostgreSQL. */
import 'reflect-metadata';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PersistenceService } from './persistence.service';
import { seedPortfolio } from './legacy/scripts/seed_portfolio';


async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sahayogi-seed-'));
  const src = seedPortfolio(tmp);
  const p = new PersistenceService();
  await p.repo.ping();
  if (!(await p.repo.schemaReady())) throw new Error('The database has no tables yet. Run `npm run db:migrate` first.');
  await p.importPortfolio(src, { force: process.argv.includes('--force') });
  await p.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('seeded');
}
main().catch((e) => { console.error(e); process.exit(1); });
