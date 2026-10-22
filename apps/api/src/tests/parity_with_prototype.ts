// New engine (Phases 0-12) vs original prototype engine: gates 0-4 must be identical on every seeded product.
import * as path from 'path'; 
import * as fs from 'fs';
const proto = process.argv[2];
const NewStore = require(path.resolve('src/legacy/engine/store')).Store, newG = require(path.resolve('src/legacy/engine/gates'));
const OldStore = require(path.join(proto, 'engine/store')).Store, oldG = require(path.join(proto, 'engine/gates'));
let bad = 0;
for (const id of fs.readdirSync(path.join(proto, 'data/products'))) {
  const f = path.join(proto, 'data/products', id, 'store.json');
  const a = oldG.evaluateAll(OldStore.load(f)), b = newG.evaluateAll(NewStore.load(f));
  const sig = (ev) => JSON.stringify(ev.map((g) => [g.state, g.summary.readiness, g.summary.mustOk, g.summary.failed, g.results.map((r) => r.id + r.status).join()]));
  const same = sig(a) === sig(b); if (!same) bad++;
  console.log(id, same ? 'identical' : 'DIFFERENT');
}
process.exit(bad ? 1 : 0);
