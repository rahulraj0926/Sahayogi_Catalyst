/**
 * engine/portfolio.ts - the product layer around the single-product engine.
 *
 * Layout on disk (root = data/ by default, SD_DATA_DIR overrides):
 *   portfolio.json                       registry: products[], ideas[], counters, asOf
 *   products/<PRD-nnn>/store.json        one engine Store per product (atomic write, see Store.save)
 *   products/<PRD-nnn>/uploads/          attachment files for that product
 *
 * A registry entry: { id, name, one_liner, kind, owner, stage, stage_since, depth_level, mode, created_at, archived,
 *                     stage_override, seed }.  `stage`, `depth_level`, `mode` and `name` mirror the product's own store
 * (see sync) unless the stage was overridden by hand (PATCH /api/portfolio/products/:id with stage).
 *
 * The Portfolio keeps a cache of loaded stores keyed by product id. A "single" portfolio wraps one in-memory store; the
 * tests and the legacy SD_DATA=<file> switch use it so the old one-product behaviour keeps working.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Store } from './store';
import { localDate } from './units';
import * as stages from './stages';

const KINDS = ['software', 'hardware', 'service'];
/** URL words a product name must not take (they are other pages). */
const RESERVED_SLUGS = ['new', 'all', 'search', 'edit', 'api', 'archive', 'archived'];
const MODES = ['greenfield', 'existing_system', 'extend', 'replace'];
const STAGES = ['idea', 'P0', 'P1', 'P2', 'P3', 'P4', 'handoff', 'done', 'parked'];
const STORE_MODE = { greenfield: 'greenfield', existing_system: 'replace', extend: 'extend', replace: 'replace' }; // portfolio mode -> Product.mode enum in the engine
const PORTFOLIO_MODE = { greenfield: 'greenfield', extend: 'existing_system', replace: 'existing_system' };

const httpErr = (status, message, extra?) => Object.assign(new Error(message), { status }, extra || {});

function writeJsonAtomic(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1));
  fs.renameSync(tmp, file);
}

/** Stage implied by a product's own data: gates decided, current phase, status. */
function computeStage(store) {
  const p = store.product();
  if (!p) return 'P0';
  if (p.status === 'Killed' || p.status === 'On hold') return 'parked';
  if (p.status === 'Handed off' && stages.hasHandoff(store)) return 'done';
  return stages.stageCode(store); // the earliest stage whose sign-off has not passed (engine/stages.ts)
}

class Portfolio {
  root: any;
  reg: any;
  cache: any;
  memory: any;
  /** @param {string|null} root directory holding portfolio.json (null = purely in memory) */
  constructor(root) {
    this.root = root;
    this.reg = { version: 1, asOf: null, counters: { product: 0, idea: 0 }, products: [], ideas: [] };
    this.cache = new Map();
    this.memory = !root;
  }

  static open(root) {
    const p = new Portfolio(root);
    const f = path.join(root, 'portfolio.json');
    if (fs.existsSync(f)) p.reg = JSON.parse(fs.readFileSync(f, 'utf8'));
    return p;
  }

  /** One-product portfolio around an existing store object (tests, legacy single-file mode). */
  static single(store, name) {
    const p = new Portfolio(null);
    const prod = store.product();
    p.reg.counters.product = 1;
    p.reg.products.push({
      id: 'PRD-001', name: name || (prod && prod.name) || 'Product', one_liner: '', kind: 'software', owner: (prod && prod.sponsor) || '', stage: computeStage(store), stage_since: store.today(),
      depth_level: (prod && prod.depth_level) || 'L2', mode: prod ? PORTFOLIO_MODE[prod.mode] || 'greenfield' : 'greenfield', created_at: store.now(), archived: false, stage_override: false, seed: 'cdn',
    });
    p.cache.set('PRD-001', store);
    return p;
  }

  // ---------------------------------------------------------------- paths
  productDir(id) { return this.root ? path.join(this.root, 'products', id) : null; }
  storeFile(id) { return this.root ? path.join(this.productDir(id), 'store.json') : null; }
  uploadsDir(id) { return this.root ? path.join(this.productDir(id), 'uploads') : null; }
  registryFile() { return this.root ? path.join(this.root, 'portfolio.json') : null; }

  /** Business "today" for portfolio-wide figures: pinned in the registry for the seeded demo, else the wall clock. */
  today() { return this.reg.asOf || localDate(); }
  now() { return this.reg.asOf ? `${this.reg.asOf}T12:00:00.000Z` : new Date().toISOString(); }

  // ---------------------------------------------------------------- registry
  saveRegistry() { if (!this.root) return false; writeJsonAtomic(this.registryFile(), this.reg); return true; }
  list(opts: any = {}) { return this.reg.products.filter((p) => opts.includeArchived || !p.archived); }
  /** A product by id (PRD-001) or by its URL name (sahayogi-cdn). */
  get(id) { return this.reg.products.find((p) => p.id === id) || this.reg.products.find((p) => p.slug && p.slug === id) || null; }

  // ---------------------------------------------------------------- URL names (slugs)
  /** "Sahayogi CDN" -> "sahayogi-cdn". Never empty, never a route word, unique among products. A slug never changes after it is first given. */
  uniqueSlug(name, exceptId) {
    const base = String(name || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '') || 'product';
    const taken = new Set(this.reg.products.filter((p) => p.id !== exceptId && p.slug).map((p) => p.slug.toLowerCase()));
    let slug = RESERVED_SLUGS.includes(base) || /^prd-\d+$/.test(base) ? `${base}-product` : base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    return slug;
  }
  /** Give a slug to every product that has none (older data). Returns the ids that changed. */
  ensureSlugs() {
    const changed = [];
    for (const p of this.reg.products) if (!p.slug) { p.slug = this.uniqueSlug(p.name, p.id); changed.push(p.id); }
    return changed;
  }
  defaultProduct() { return this.list()[0] || this.reg.products[0] || null; }

  /** Product from an id or the default; throws 404 for unknown ids. */
  resolve(id) {
    if (!id) {
      const d = this.defaultProduct();
      if (!d) throw httpErr(404, 'no products yet: create one with POST /api/portfolio/products');
      return d;
    }
    const p = this.get(id);
    if (!p) throw httpErr(404, `unknown product "${id}"`);
    return p;
  }

  // ---------------------------------------------------------------- stores
  store(id) {
    if (this.cache.has(id)) return this.cache.get(id);
    if (!this.get(id)) throw httpErr(404, `unknown product "${id}"`);
    const f = this.storeFile(id);
    if (!f || !fs.existsSync(f)) throw httpErr(500, `store file for ${id} is missing`);
    const s = Store.load(f);
    this.cache.set(id, s);
    return s;
  }
  save(id) {
    const s = this.cache.get(id);
    if (!s) return false;
    s._saves = (s._saves || 0) + 1; // memo key for summaries
    if (this.memory) return s.filePath ? s.save() : false; // legacy single-file mode keeps its own path
    s.filePath = this.storeFile(id);
    return s.save();
  }
  /** Replace a product's store wholesale (seed, reset, import) and persist it. */
  setStore(id, store) {
    store.filePath = this.storeFile(id);
    this.cache.set(id, store);
    this.save(id);
    return store;
  }

  /** Mirror engine state into the registry entry (stage, depth, mode, name). Returns the entry. */
  sync(id) {
    const e = this.get(id);
    if (!e) return null;
    const s = this.cache.get(id);
    if (!s) return e;
    const prod = s.product();
    if (prod) {
      if (e.name !== prod.name && prod.name) e.name = prod.name;
      e.depth_level = prod.depth_level || e.depth_level;
      e.mode = PORTFOLIO_MODE[prod.mode] || e.mode;
    }
    if (!e.stage_override) {
      const st = computeStage(s);
      if (st !== e.stage) { e.stage = st; e.stage_since = s.today(); }
    }
    return e;
  }
  syncAll() { for (const p of this.reg.products) if (this.cache.has(p.id) || !this.memory) { try { this.store(p.id); this.sync(p.id); } catch (e) { /* missing store: leave entry as is */ } } }

  // ---------------------------------------------------------------- products
  /** Record an event that belongs to no single product. The database-backed portfolio overrides this; here it does nothing. */
  systemEvent(_action: string, _subject: string | null, _actor: string | null | undefined, _summary: string) { /* overridden */ }

  nextProductId() {
    this.reg.counters.product = (this.reg.counters.product || 0) + 1;
    return `PRD-${String(this.reg.counters.product).padStart(3, '0')}`;
  }

  /**
   * Create a product with a fresh store: the Product item only. Phase 0 data requests are ready because the plan
   * engine derives them from the (empty) store. `intake` (optional) pre-fills an IntakeBrief.
   */
  create(f, opts: any = {}) {
    const name = String(f.name || '').trim();
    if (!name) throw httpErr(422, 'name is required');
    const kind = f.kind || 'software';
    const mode = f.mode || 'greenfield';
    const depth = f.depth_level || 'L2';
    if (!KINDS.includes(kind)) throw httpErr(422, `kind must be one of ${KINDS.join(', ')}`);
    if (f.audience !== undefined && f.audience !== null && f.audience !== '' && !['sold', 'internal'].includes(f.audience)) throw httpErr(422, 'audience must be sold or internal');
    if (f.structure !== undefined && f.structure !== null && f.structure !== '' && !['single', 'modules'].includes(f.structure)) throw httpErr(422, 'structure must be single or modules');
    if (!MODES.includes(mode)) throw httpErr(422, `mode must be one of ${MODES.join(', ')}`);
    if (!['L1', 'L2', 'L3'].includes(depth)) throw httpErr(422, 'depth_level must be L1, L2 or L3');
    if (this.reg.products.some((p) => !p.archived && p.name.toLowerCase() === name.toLowerCase())) throw httpErr(409, `a product named "${name}" already exists`);
    const id = f.id || this.nextProductId();
    if (this.get(id)) throw httpErr(409, `product ${id} already exists`);
    const actor = opts.actor || f.owner || 'Product leader';
    const S = Store.fresh();
    if (this.reg.asOf) S.data.settings.asOf = this.reg.asOf;
    if (opts.clock) S._clock = opts.clock;
    S.data.meta.productId = 'PRJ-001';
    S.create('Product', { title: name, name, mode: STORE_MODE[mode], depth_level: depth, current_phase: 0, default_currency: 'INR', product_kind: kind, ...(f.audience ? { audience: f.audience } : {}), ...(f.structure ? { structure: f.structure } : {}), status: 'Active', track: 'full' }, { id: 'PRJ-001', actor, origin: opts.origin || 'human' });
    if (opts.intake) S.create('IntakeBrief', opts.intake, { actor, origin: 'human' });
    S._clock = null;
    const entry = { id, slug: this.uniqueSlug(name, id), name, one_liner: String(f.one_liner || ''), kind, owner: String(f.owner || ''), stage: 'P0', stage_since: S.today(), depth_level: depth, mode: PORTFOLIO_MODE[mode] || mode, created_at: opts.clock || this.now(), archived: false, stage_override: false, seed: f.seed || null };
    this.reg.products.push(entry);
    S.audit('product.created', id, `${actor} created product ${id} "${name}" (${kind}, ${mode}, depth ${depth})`, { actor, kind, mode, depth });
    this.systemEvent('product.created', id, actor, `${actor} created product ${id} "${name}"`);
    if (this.root) fs.mkdirSync(this.uploadsDir(id), { recursive: true });
    this.setStore(id, S);
    this.saveRegistry();
    return entry;
  }

  /** Rename, owner, one-liner, stage override, archive or park. */
  update(id, patch, actor) {
    const e = this.resolve(id);
    const s = this.store(id);
    if (patch.name !== undefined) {
      const name = String(patch.name).trim();
      if (!name) throw httpErr(422, 'name cannot be empty');
      e.name = name;
      const prod = s.product();
      if (prod) s.update(prod.id, { name, title: name }, { actor, silent: true });
    }
    if (patch.depth_level !== undefined) {
      if (!['L1', 'L2', 'L3'].includes(patch.depth_level)) throw httpErr(422, 'depth_level must be L1, L2 or L3');
      e.depth_level = patch.depth_level;
      const prod = s.product();
      if (prod) s.update(prod.id, { depth_level: patch.depth_level }, { actor });
    }
    if (patch.one_liner !== undefined) e.one_liner = String(patch.one_liner);
    if (patch.owner !== undefined) e.owner = String(patch.owner);
    if (patch.idea !== undefined) {
      const cur = e.idea || {}; const p = patch.idea || {}; const next = { ...cur };
      for (const k of ['who_for', 'why_now', 'asked_by']) if (p[k] !== undefined) next[k] = String(p[k]).replace(/\s+/g, ' ').trim().slice(0, 400);
      e.idea = next;
      if (['who_for', 'why_now', 'asked_by'].every((k) => next[k]) && e.name && e.one_liner) e.idea.filled_on = e.idea.filled_on || s.today();
    }
    if (patch.kind !== undefined) { if (!KINDS.includes(patch.kind)) throw httpErr(422, `kind must be one of ${KINDS.join(', ')}`); e.kind = patch.kind; }
    if (patch.kind !== undefined && s.product()) s.update(s.product().id, { product_kind: patch.kind }, { actor, silent: true });
    if (patch.structure !== undefined) { if (!['single', 'modules'].includes(patch.structure)) throw httpErr(422, 'structure must be single or modules'); if (s.product()) s.update(s.product().id, { structure: patch.structure }, { actor, silent: true }); }
    if (patch.audience !== undefined) { if (!['sold', 'internal'].includes(patch.audience)) throw httpErr(422, 'audience must be sold or internal'); if (s.product()) s.update(s.product().id, { audience: patch.audience }, { actor, silent: true }); }
    if (patch.stage !== undefined) {
      if (patch.stage === 'auto' || patch.stage === null) { e.stage_override = false; e.stage = computeStage(s); } else {
        if (!STAGES.includes(patch.stage) || patch.stage === 'idea') throw httpErr(422, `stage must be one of ${STAGES.filter((x) => x !== 'idea').join(', ')} or "auto"`);
        e.stage_override = true;
        if (e.stage !== patch.stage) { e.stage = patch.stage; e.stage_since = s.today(); }
      }
    }
    if (patch.archived !== undefined) e.archived = !!patch.archived;
    if (patch.parked !== undefined) {
      if (patch.parked) { e.parked_from = e.parked_from || e.stage; e.stage = 'parked'; e.stage_override = true; e.stage_since = s.today(); } else if (e.stage === 'parked') { e.stage_override = false; e.stage = computeStage(s); e.stage_since = s.today(); }
    }
    s.audit('portfolio.update', id, `${actor || 'system'} updated product ${id}: ${Object.keys(patch).join(', ')}`, { actor });
    this.save(id);
    this.saveRegistry();
    return e;
  }

  // ---------------------------------------------------------------- ideas inbox
  ideas() { return this.reg.ideas.slice(); }
  idea(id) { const i = this.reg.ideas.find((x) => x.id === id); if (!i) throw httpErr(404, `idea ${id} not found`); return i; }
  addIdea(f, actor) {
    const one = String(f.one_liner || f.title || '').trim();
    if (!one) throw httpErr(422, 'one_liner is required');
    this.reg.counters.idea = (this.reg.counters.idea || 0) + 1;
    const idea = { id: `IDEA-${String(this.reg.counters.idea).padStart(3, '0')}`, one_liner: one, text: String(f.text || ''), requester: String(f.requester || actor || ''), created_on: f.created_on || this.today(), status: 'new', kind: KINDS.includes(f.kind) ? f.kind : 'software', product_id: null, origin: f.origin || 'human' };
    this.reg.ideas.push(idea);
    this.systemEvent('idea.created', idea.id, actor, `${actor || 'someone'} added idea ${idea.id}: ${one.slice(0, 120)}`);
    this.saveRegistry();
    return idea;
  }
  updateIdea(id, patch, actor?) {
    const i = this.idea(id);
    for (const k of ['one_liner', 'text', 'requester', 'kind']) if (patch[k] !== undefined) i[k] = String(patch[k]);
    if (patch.status !== undefined) {
      if (!['new', 'shortlisted', 'rejected'].includes(patch.status)) throw httpErr(422, 'status must be new, shortlisted or rejected (promote an idea with POST .../promote)');
      if (i.status !== patch.status) this.systemEvent(`idea.${patch.status}`, id, actor, `${actor || 'someone'} set idea ${id} to ${patch.status}${patch.reject_reason ? ': ' + patch.reject_reason : ''}`);
      i.status = patch.status;
    }
    this.saveRegistry();
    return i;
  }
  deleteIdea(id, actor?) {
    const i = this.idea(id);
    this.systemEvent('idea.deleted', id, actor, `${actor || 'someone'} deleted idea ${id} (${i.status}): ${String(i.one_liner).slice(0, 120)}`);
    this.reg.ideas = this.reg.ideas.filter((x) => x.id !== id);
    this.saveRegistry();
    return i;
  }
  /** Promote an idea to a product at Phase 0 and pre-fill the intake brief from the idea text. */
  promote(id, f, actor) {
    const i = this.idea(id);
    if (i.status === 'promoted') throw httpErr(409, `${id} was already promoted to ${i.product_id}`);
    const name = String(f.name || i.one_liner.replace(/[.\s]+$/, '').slice(0, 60)).trim();
    const entry = this.create({ name, one_liner: i.one_liner, kind: f.kind || i.kind || 'software', audience: f.audience, owner: f.owner || i.requester, mode: f.mode || 'greenfield', depth_level: f.depth_level || 'L2' }, {
      actor: actor || i.requester,
      intake: {
        title: `${name} intake brief`, idea: [i.one_liner, i.text].filter(Boolean).join('\n\n'), requester: i.requester || undefined,
        problem_statement: i.text || i.one_liner, note: `Pre-filled from ${i.id} (${i.created_on}). Rewrite the problem statement as pain, not solution (data request DR-0-02).`, status: 'Draft',
      },
    });
    i.status = 'promoted';
    i.product_id = entry.id;
    this.systemEvent('idea.promoted', id, actor, `${actor || 'someone'} turned idea ${id} into product ${entry.id}`);
    this.saveRegistry();
    return { idea: i, product: entry };
  }
}

export { Portfolio, computeStage, KINDS, MODES, STAGES, STORE_MODE, PORTFOLIO_MODE, writeJsonAtomic, httpErr };
