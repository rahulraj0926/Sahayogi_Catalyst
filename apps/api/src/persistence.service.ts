import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { Portfolio } from './legacy/engine/portfolio';
import { Store } from './legacy/engine/store';
import * as router from './legacy/router';
import { Repository, makePool, ProductState, Snapshot, SystemEvent } from './db/repository';

/**
 * Portfolio whose storage is PostgreSQL instead of JSON files. The lifecycle engine (gates, traceability, suspect
 * propagation, documents ...) works on an in-memory Store per product; this class tells the persistence service which
 * stores changed, and the service writes the difference to Postgres after each mutating request.
 */
class PgPortfolio extends (Portfolio as any) {
  dirty = new Set<string>();
  registryDirty = false;
  /** events that belong to no product; written with the next flush, in the same transaction */
  sysEvents: SystemEvent[] = [];
  constructor(uploadsRoot: string) {
    super(uploadsRoot);
    this.memory = false;
  }
  systemEvent(action: string, subject: string | null, actor: string | null | undefined, summary: string) { this.sysEvents.push({ action, subject, actor: actor || 'system', summary, at: new Date().toISOString() }); this.registryDirty = true; }
  storeFile() { return null; } // Store.save() becomes a no-op
  saveRegistry() { this.registryDirty = true; return true; }
  save(id: string) {
    const s = this.cache.get(id);
    if (!s) return false;
    s._saves = (s._saves || 0) + 1;
    this.dirty.add(id);
    return true;
  }
  store(id: string) {
    if (this.cache.has(id)) return this.cache.get(id);
    const e: any = new Error(`unknown product "${id}"`);
    e.status = 404;
    throw e;
  }
}

@Injectable()
export class PersistenceService implements OnModuleInit {
  private log = new Logger('Persistence');
  repo = new Repository(makePool());
  portfolio: any;
  /** what the database holds for each product / for the portfolio record, so a save sends only differences */
  private states = new Map<string, ProductState>();
  private regSnap: Snapshot | undefined;
  private queue: Promise<unknown> = Promise.resolve();

  get uploadsRoot() { return path.resolve(process.env.UPLOAD_DIR || './uploads'); }

  async onModuleInit() {
    await this.repo.ping();
    if (!(await this.repo.schemaReady())) throw new Error('The database has no tables yet. Run `npm run db:migrate` (then `npm run seed`) and start again.');
    try { await this.repo.ensureTables(); } catch (e: any) { this.log.warn(`Could not create the members table (${e.message}). Run \`npm run db:apply\` in apps/api.`); }
    const added = await this.repo.ensureColumns();
    if (added.length) this.log.warn(`added ${added.length} missing database column(s): ${added.join(', ')}`);
    await this.loadAll();
  }

  /** Read the whole portfolio from Postgres into memory (MVP: one API instance owns the engine state). */
  async loadAll() {
    const pf = new PgPortfolio(this.uploadsRoot);
    const { reg, snapshot } = await this.repo.loadRegistry();
    pf.reg = { ...pf.reg, ...reg, products: [], ideas: reg.ideas || [], feedback: reg.feedback || [] };
    this.states.clear();
    this.regSnap = snapshot;
    const loaded = await this.repo.loadProducts();
    for (const { bundle, state } of loaded) {
      pf.reg.products.push(bundle.entry);
      pf.cache.set(bundle.entry.id, new Store(bundle.data, null));
      this.states.set(bundle.entry.id, state);
    }
    this.portfolio = pf;
    router.setPortfolio(pf);
    // older data has no URL names yet: give each product one and save it
    const sluggish: string[] = pf.ensureSlugs();
    if (sluggish.length) { for (const id of sluggish) pf.dirty.add(id); pf.registryDirty = true; await this.flush(); this.log.log(`gave URL names to ${sluggish.length} products`); }
    await this.importOldFeedback(pf);
    this.log.log(`loaded ${loaded.length} products, ${pf.reg.ideas.length} ideas from PostgreSQL`);
  }

  /** Notes left before they moved to PostgreSQL sit in <uploads>/feedback.json: copy them across once, then set the file aside. */
  private async importOldFeedback(pf: any) {
    const file = path.join(this.uploadsRoot, 'feedback.json');
    if (!fs.existsSync(file)) return;
    try {
      const old = JSON.parse(fs.readFileSync(file, 'utf8'));
      const notes: any[] = Array.isArray(old?.notes) ? old.notes : [];
      const have = new Set((pf.reg.feedback as any[]).map((n) => n.id));
      const add = notes.filter((n) => n && n.id && !have.has(n.id));
      if (add.length) {
        pf.reg.feedback.push(...add);
        pf.reg.counters = pf.reg.counters || {};
        pf.reg.counters.feedback = Math.max(pf.reg.counters.feedback || 0, Number(old.counter) || 0);
        pf.registryDirty = true;
        await this.flush();
      }
      fs.renameSync(file, file + '.imported');
      this.log.log(`moved ${add.length} feedback notes from feedback.json into PostgreSQL (the file is kept as feedback.json.imported)`);
    } catch (e) { this.log.warn(`could not import feedback.json: ${(e as Error).message}; it is left where it is`); }
  }

  /**
   * Throw away what memory holds for one product and read it again from Postgres. Used when a save failed, so memory
   * never keeps a change the database does not have.
   */
  async reloadProduct(id: string) {
    const pf = this.portfolio;
    const found = await this.repo.loadProducts(id);
    // Only ever put back the product that was asked for. Anything else would overwrite another product in memory.
    const one = found.find((x) => x.bundle.entry?.id === id);
    if (!one) {
      this.log.error(`could not reload ${id}: PostgreSQL does not return it (${found.length} other rows ignored); memory is left as it is`);
      return;
    }
    const at = pf.reg.products.findIndex((e: any) => e.id === id);
    if (at >= 0) pf.reg.products[at] = one.bundle.entry; else pf.reg.products.push(one.bundle.entry);
    pf.cache.set(id, new Store(one.bundle.data, null));
    pf.dirty.delete(id);
    this.states.set(id, one.state);
    this.log.warn(`reloaded ${id} from PostgreSQL after a failed save`);
  }

  /** Same for the portfolio-wide record (settings, counters, ideas). */
  async reloadRegistry() {
    const pf = this.portfolio;
    const { reg, snapshot } = await this.repo.loadRegistry();
    pf.reg = { ...pf.reg, ...reg, products: pf.reg.products };
    this.regSnap = snapshot;
    pf.registryDirty = false;
  }

  /** Serialise writes: one flush at a time. */
  flush(): Promise<void> {
    const run = this.queue.then(() => this.doFlush());
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** The registry plus every changed product, in ONE transaction: either all of it is stored or none of it. */
  private async doFlush() {
    const pf = this.portfolio;
    // Never write a registry that lists a product twice: it means memory is wrong, and saving it would copy the mistake into the database.
    const seen = new Set<string>();
    for (const p of pf.reg.products) { if (seen.has(p.id)) throw new Error(`refusing to save: product ${p.id} is in memory twice`); seen.add(p.id); }
    const ids: string[] = [...new Set<string>([...pf.dirty, ...pf.reg.products.map((p: any) => p.id).filter((id: string) => !this.states.has(id))])];
    if (!pf.registryDirty && !ids.length && !pf.sysEvents.length) return;
    const events: SystemEvent[] = pf.sysEvents.slice();
    const nextStates = new Map<string, ProductState>();
    let nextReg: Snapshot | undefined;
    await this.repo.transaction(async (c) => {
      for (const e of events) await this.repo.logSystem(c, e);
      if (pf.registryDirty) {
        const { products, ...rest } = pf.reg;
        nextReg = await this.repo.saveRegistry(c, rest, this.regSnap);
      }
      for (const id of ids) {
        const position = pf.reg.products.findIndex((p: any) => p.id === id);
        const s = pf.cache.get(id);
        const entry = pf.get(id);
        if (!s || !entry || position < 0) continue;
        nextStates.set(id, await this.repo.saveProduct(c, position, { entry, data: s.data, auditTotal: s._auditTotal }, this.states.get(id)));
      }
    });
    // memory is only told about the new database state after the commit; a failed save leaves everything dirty so it is retried
    pf.sysEvents.splice(0, events.length);
    if (nextReg) { this.regSnap = nextReg; pf.registryDirty = false; }
    for (const [id, st] of nextStates) this.states.set(id, st);
    for (const id of ids) pf.dirty.delete(id);
  }

  /** Wipe the database and load a whole file-based portfolio into it (used by the seed script). */
  async importPortfolio(src: any, opts: { force?: boolean } = {}) {
    // This deletes every product. It only runs on an empty database, or when the caller says --force, and never in production without that.
    const existing = await this.repo.productCount();
    if (existing > 0 && !opts.force) throw new Error(`Refusing to wipe the database: it already holds ${existing} product(s). Run the seed again with --force if you really want to replace everything.`);
    if (process.env.NODE_ENV === 'production' && !opts.force) throw new Error('Refusing to seed in production without --force.');
    const pf = new PgPortfolio(this.uploadsRoot);
    pf.reg = { ...src.reg };
    for (const p of src.reg.products) pf.cache.set(p.id, src.store(p.id));
    pf.ensureSlugs();
    await this.repo.transaction((c) => this.repo.wipe(c));
    this.states.clear();
    this.regSnap = undefined;
    this.portfolio = pf;
    router.setPortfolio(pf);
    pf.registryDirty = true;
    await this.doFlush();
    this.log.log(`imported ${pf.reg.products.length} products`);
  }

  async close() { await this.repo.close(); }
}
