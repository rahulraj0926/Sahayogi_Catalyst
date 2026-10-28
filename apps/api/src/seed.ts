/* Loads a seeded portfolio into PostgreSQL. Default: the prototype's 6 demo products and 4 ideas (the regression tests and CI need these).
   With --catalog: the 21 Sahayogi products and the 4 ideas (the demo). Add --force to replace a database that already has products. */
import 'reflect-metadata';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PersistenceService } from './persistence.service';
import { seedCatalog, seedPortfolio } from './legacy/scripts/seed_portfolio';


async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sahayogi-seed-'));
  const src = process.argv.includes('--catalog') ? seedCatalog(tmp) : seedPortfolio(tmp);
  const p = new PersistenceService();
  await p.repo.ping();
  if (!(await p.repo.schemaReady())) throw new Error('The database has no tables yet. Run `npm run db:migrate` first.');
  await p.importPortfolio(src, { force: process.argv.includes('--force') });
  await p.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('seeded');
}
main().catch((e) => { console.error(e); process.exit(1); });
