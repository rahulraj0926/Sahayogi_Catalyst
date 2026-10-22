/**
 * scripts/seed_portfolio.ts - seeds the portfolio: six invented products at different stages plus four ideas.
 *
 *   node scripts/seed_portfolio.ts [dir]     writes <dir>/portfolio.json and <dir>/products/<id>/store.json (default: data/)
 *
 * HOW TO ADD A PRODUCT: (1) write a "pack" in scripts/packs/<name>.js (see packs/README in seed_lib.js: people, evidence,
 * competitors, features, flows... as plain data plus `reach`, the phase it should be seeded through, and optional `defects`
 * that deliberately leave gaps); (2) add a line to PRODUCTS below with its portfolio fields; (3) run this script. Every
 * generated record is origin "invented". seed_lib.js builds and validates the records through the same Store API the server uses.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Portfolio } from '../engine/portfolio';
import { Store } from '../engine/store';
import { buildFromPack } from './seed_lib';
import * as L from './seed_lifecycle';
import * as seedMod from './seed';
import developerMod from './packs/developer';
import meterMod from './packs/meter';
import dealerMod from './packs/dealer';
import * as warrantyMod from './packs/warranty';
import bossMod from './packs/boss';
import * as portfolioMod from '../engine/portfolio';
import * as more from './packs/more';
import * as specs from './packs/lifecycle_specs';

const AS_OF = '2026-10-09';

/** Adds the demo records for Phases 5-12 (design to feedback) so every product has data in every phase. */
const withLifecycle = (S, spec) => { L.extendLifecycleLate(L.extendLifecycle(S, spec)); return S; };

/** key -> builder returning a Store. `cdn` is the original hand-written seed, the rest are generated from packs. */
const SEEDS = {
  cdn: () => withLifecycle(seedMod.buildSeed(), specs.cdn),
  developer: () => withLifecycle(buildFromPack({ ...developerMod, ...more.developer, reach: 4 }), specs.developer),
  meter: () => withLifecycle(buildFromPack({ ...meterMod, ...more.meter, reach: 4 }), specs.meter),
  dealer: () => withLifecycle(buildFromPack(dealerMod), L.DEALER),
  warranty: () => withLifecycle(buildFromPack({ ...warrantyMod, ...more.warranty, reach: 4 }), specs.warranty),
  boss: () => withLifecycle(buildFromPack({ ...bossMod, ...more.boss, features: bossMod.features.map((f, i) => ({ ...f, ...(more.bossFeatureExtras[i] || {}) })), reach: 4 }), specs.boss),
};

/** Portfolio fields per seeded product (stage and stage_since are recomputed from the data unless fixed here). */
const PRODUCTS = [
  { seed: 'cdn', name: 'Sahayogi CDN', one_liner: 'A regional content delivery network for South Asian digital businesses.', kind: 'service', owner: 'Anjali Rao', created_at: '2026-09-02T09:30:00.000Z' },
  { seed: 'developer', name: 'Sahayogi Developer', one_liner: 'The tool that manages product documentation, evidence and traceability from idea to developer handoff.', kind: 'software', owner: 'Kanishk', created_at: '2026-07-06T09:30:00.000Z' },
  { seed: 'meter', name: 'Smart Energy Meter Gateway', one_liner: 'A DIN-rail gateway that reads three-phase meters and reports to the utility cloud.', kind: 'hardware', owner: 'Rohan Mehta', created_at: '2026-08-17T09:30:00.000Z' },
  { seed: 'dealer', name: 'Dealer Order Portal', one_liner: 'Web portal where dealers place, track and reconcile orders without phone calls.', kind: 'software', owner: 'Vikram Shah', created_at: '2026-05-11T09:30:00.000Z' },
  { seed: 'warranty', name: 'Warranty and Service Desk', one_liner: 'One place to register products, raise warranty claims and dispatch service engineers.', kind: 'service', owner: 'Priya Nair', created_at: '2026-10-02T09:30:00.000Z' },
  { seed: 'boss', name: 'BoSS Rebuild', one_liner: 'Replace the ageing Back-office Support System with a maintainable platform, feature for feature.', kind: 'software', owner: 'Arjun Das', created_at: '2026-06-22T09:30:00.000Z' },
];

const IDEAS = [
  { one_liner: 'Offline-first mobile app for field engineers to log installations', text: 'Engineers lose connectivity in basements and plant rooms and re-key notes at night. An app that works offline and syncs later would remove the duplicate entry.', requester: 'Priya Nair', created_on: '2026-09-28', kind: 'software' },
  { one_liner: 'Energy savings calculator for dealers to show customers', text: 'Dealers keep asking for a simple sheet that turns a customer bill into expected savings with our meters.', requester: 'Vikram Shah', created_on: '2026-10-01', kind: 'software' },
  { one_liner: 'Refurbished meter exchange programme', text: 'Take back old meters at a credit and resell refurbished units to smaller utilities.', requester: 'Arjun Das', created_on: '2026-10-05', kind: 'service' },
  { one_liner: 'Partner training academy with certificates', text: 'Certify installers and dealer staff on our products; certificates unlock better dealer margin tiers.', requester: 'Anjali Rao', created_on: '2026-10-07', kind: 'service' },
];

/**
 * Write the whole portfolio under `root`.
 * opts: { reuseLegacyStore: path } uses an existing data/store.json as the CDN product instead of rebuilding it.
 */
function seedPortfolio(root, opts: any = {}) {
  fs.mkdirSync(root, { recursive: true });
  const pf = new Portfolio(root);
  pf.reg.asOf = AS_OF;
  PRODUCTS.forEach((def, i) => {
    let store;
    if (def.seed === 'cdn' && opts.reuseLegacyStore && fs.existsSync(opts.reuseLegacyStore)) { try { store = Store.load(opts.reuseLegacyStore); } catch (e) { store = null; } }
    if (!store) store = SEEDS[def.seed]();
    const id = `PRD-${String(i + 1).padStart(3, '0')}`;
    pf.reg.counters.product = i + 1;
    const prod = store.product();
    const entry = { id, name: def.name, one_liner: def.one_liner, kind: def.kind, owner: def.owner, stage: 'P0', stage_since: AS_OF, depth_level: prod.depth_level, mode: prod.mode === 'greenfield' ? 'greenfield' : 'existing_system', created_at: def.created_at, archived: false, stage_override: false, seed: def.seed };
    pf.reg.products.push(entry);
    if (store.product().name !== def.name) store.update(store.product().id, { name: def.name, title: def.name }, { silent: true });
    pf.setStore(id, store);
    // stage_since: the day the current stage began = decision date of the previous gate, else the product's creation date
    const gates = store.data.gates || {};
    const prev = Math.max(-1, ...Object.keys(gates).filter((g) => gates[g] && ['Passed', 'Passed-with-conditions'].includes(gates[g].state)).map(Number));
    entry.stage = portfolioMod.computeStage(store);
    entry.stage_since = prev >= 0 ? String(gates[prev].decided_at).slice(0, 10) : def.created_at.slice(0, 10);
  });
  IDEAS.forEach((idea) => { pf.reg.counters.idea = (pf.reg.counters.idea || 0) + 1; pf.reg.ideas.push({ id: `IDEA-${String(pf.reg.counters.idea).padStart(3, '0')}`, ...idea, status: 'new', product_id: null, origin: 'invented' }); });
  pf.saveRegistry();
  return pf;
}

if (require.main === module) {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..', 'data');
  const pf = seedPortfolio(root);
  for (const e of pf.list()) {
    const s = pf.store(e.id);
    console.log(`${e.id} ${e.name.padEnd(30)} ${e.kind.padEnd(9)} stage ${e.stage.padEnd(7)} since ${e.stage_since}  ${s.all().length} items, ${s.links().length} links`);
  }
  console.log(`${pf.ideas().length} ideas written to ${path.join(root, 'portfolio.json')}`);
}

export { seedPortfolio, SEEDS, PRODUCTS, IDEAS, AS_OF };
