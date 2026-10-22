/**
 * engine/store.ts - the persistent store: items, links, audit log, settings, gate decisions.
 *
 * One JSON document (data/store.json) written atomically (temp file + rename). The Store class
 * works purely in memory when no file path is given, which is what the tests use.
 *
 * Data layout:
 *   { version, meta, settings, counters, items{id:item}, linkList[], gates{n:decision}, baselines[],
 *     attestations[], requestState{}, ingests[], audit[], demo{} }
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as schema from './schema';
import * as links from './links';
import * as suspect from './suspect';
import { normalisePrice, DEFAULT_FX, localDate, undouble } from './units';

class ValidationError extends Error {
  errors: any;
  status: any;
  constructor(errors, message?) {
    super(message || errors.join('; '));
    this.name = 'ValidationError';
    this.errors = errors;
    this.status = 422;
  }
}

function emptyData() {
  return {
    version: 1,
    meta: { productId: null, createdAt: new Date().toISOString(), seedVersion: null },
    settings: { asOf: null, suspectDepth: 3, params: {}, fx: { ...DEFAULT_FX }, utilisation: null },
    counters: {},
    items: {},
    linkList: [],
    gates: {},
    baselines: [],
    attestations: [],
    requestState: {},
    ingests: [],
    audit: [],
    demo: { index: 0 },
  };
}

class Store {
  data: any;
  _clock: any;
  filePath: any;
  _idx: any;
  /** every audit entry this product ever had (not cut like data.audit); undefined until the first one is made */
  _auditTotal: number | undefined;
  constructor(data, filePath) {
    this.data = data || emptyData();
    this.filePath = filePath || null;
    this._idx = null;
    this._clock = null; // tests can pin the wall clock
  }

  static fresh() { return new Store(emptyData(), null); }

  static load(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    return new Store(JSON.parse(raw), filePath);
  }

  // ---- time -----------------------------------------------------------
  now() { return this._clock || new Date().toISOString(); }
  /** Business "today" (YYYY-MM-DD). Settings.asOf pins it so the demo is reproducible. */
  today() { return this.data.settings.asOf || localDate(); }

  // ---- persistence ----------------------------------------------------
  save() {
    if (!this.filePath) return false;
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = this.filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.filePath); // atomic replace
    return true;
  }

  replaceData(data) { this.data = data; this._idx = null; this._tc = null; this._auditTotal = undefined; }

  // ---- ids -------------------------------------------------------------
  nextId(prefix) {
    const n = (this.data.counters[prefix] || 0) + 1;
    this.data.counters[prefix] = n;
    return `${prefix}-${String(n).padStart(3, '0')}`;
  }

  // ---- audit -----------------------------------------------------------
  audit(action, subject, summary, extra: any = {}) {
    const a = this.data.audit;
    // how many entries this product has ever had: the database writer uses it to find the new ones. The list below is cut for memory,
    // so its length cannot tell it (once it reaches the cut, the length stops growing and new entries would never be saved).
    this._auditTotal = (this._auditTotal === undefined ? a.length : this._auditTotal) + 1;
    a.push({ at: this.now(), action, subject: subject || null, summary, actor: extra.actor || null, details: extra });
    if (a.length > 6000) a.splice(0, a.length - 6000);
  }

  // ---- items -----------------------------------------------------------
  // own keys only: an id such as "constructor" or "__proto__" must never find something on Object.prototype
  get(id) { return typeof id === 'string' && Object.prototype.hasOwnProperty.call(this.data.items, id) ? this.data.items[id] || null : null; }
  has(id) { return this.get(id) !== null; }
  /**
   * Items grouped by type, built once and dropped whenever an item is added, replaced or removed (create, update, remove, replaceData).
   * Without it every list(type) walked all items, and the checks call it thousands of times: a product of 5,000 items took 4 s to open.
   */
  _tc: { all: any[]; by: Map<string, any[]> } | null = null;
  _types() {
    if (!this._tc) {
      const all = Object.values(this.data.items) as any[];
      const by = new Map<string, any[]>();
      for (const i of all) { let a = by.get(i.type); if (!a) by.set(i.type, (a = [])); a.push(i); }
      this._tc = { all, by };
    }
    return this._tc;
  }
  /** Call after changing store.data.items by hand (the store's own methods already do). */
  touch() { this._tc = null; this._idx = null; }
  // a copy each time: callers sort and filter what they get
  all() { return this._types().all.slice(); }
  list(type, pred?) { const a = this._types().by.get(type) || []; return pred ? a.filter((i: any) => pred(i)) : a.slice(); }
  product() { return this.list('Product')[0] || null; }

  /** Type name for any id: item type, 'Gate' for GATE-n, 'FlowEdge' for an existing next link id. */
  getType(id) {
    const it = this.get(id);
    if (it) return it.type;
    const v = links.virtualType(id);
    if (v === 'Gate') return 'Gate';
    if (v === 'FlowEdge' && this.linkById(id)) return 'FlowEdge';
    return null;
  }

  /** Derived fields written on every save (score, rank, normalised price). */
  _derive(item) {
    if (item.type === 'Assumption' && item.uncertainty && item.impact) item.risk_score = item.uncertainty * item.impact;
    if (item.type === 'Risk' && item.probability && item.impact) item.score = item.probability * item.impact;
    if (item.type === 'PricePoint') {
      for (const k of ['plan', 'unit']) if (typeof item[k] === 'string') item[k] = undouble(item[k]);
      const n = normalisePrice(item, this.data.settings.fx);
      if (n !== null) item.normalised_amount = n; else delete item.normalised_amount;
    }
  }

  _rerank() {
    const open = this.list('Assumption').filter((a: any) => !schema.TERMINAL_STATUSES.has(a.status)).sort((a: any, b: any) => (b.risk_score || 0) - (a.risk_score || 0) || a.id.localeCompare(b.id));
    open.forEach((a: any, i) => { a.rank = i + 1; });
  }

  /**
   * Create an item. `fields` holds type fields plus optional common fields (title, status, note...).
   * opts: { actor, origin, subtype, id, strict }
   */
  create(type, fields: any = {}, opts: any = {}) {
    const def = schema.TYPES[type];
    if (!def) throw new ValidationError([`Unknown item type "${type}"`]);
    const subtype = opts.subtype || fields.subtype;
    const prefix = schema.idPrefix(type, subtype);
    const origin = opts.origin || fields.origin || 'human';
    const item: any = {
      id: opts.id || null, type, ...(subtype ? { subtype } : {}),
      status: def.initialStatus, phase: def.phase, origin,
      verification: origin === 'agent' || origin === 'assistant' ? 'unverified' : null,
      proposed_by: opts.actor || fields.proposed_by || null,
      rev: 1, created_at: this.now(), updated_at: this.now(), created_by: opts.actor || null,
      ...fields,
    };
    if (subtype) item.subtype = subtype;
    if (!item.id) item.id = this.nextId(prefix);
    else {
      // keep counters ahead of explicit ids
      const m = /^([A-Z]+)-(\d+)$/.exec(item.id);
      if (m && (this.data.counters[m[1]] || 0) < Number(m[2])) this.data.counters[m[1]] = Number(m[2]);
    }
    if (typeof item.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(item.id)) throw new ValidationError([`id "${String(item.id).slice(0, 40)}" is not allowed: use letters, digits, dot, dash or underscore (up to 64 characters)`]);
    if (this.has(item.id)) throw new ValidationError([`id ${item.id} already exists`]);
    this._derive(item);
    const errors = schema.validateItem(item, { strictRequired: opts.strict !== false });
    if (errors.length) throw new ValidationError(errors, `${type} invalid: ${errors.join('; ')}`);
    item.fp = suspect.fingerprint(item);
    this.data.items[item.id] = item;
    this._tc = null;
    if (type === 'Assumption') this._rerank();
    if (!opts.silent) this.audit('item.create', item.id, `${opts.actor || 'system'} created ${item.id} "${item.title}" (origin ${item.origin})`, { actor: opts.actor, type });
    return item;
  }

  /** Update fields of an item. opts: { actor, reviewed } where reviewed clears suspect inbound links (S3b). */
  update(id, patch, opts: any = {}) {
    const cur = this.get(id);
    if (!cur) throw Object.assign(new Error(`item ${id} not found`), { status: 404 });
    const before = JSON.parse(JSON.stringify(cur));
    const next = { ...cur };
    for (const [k, v] of Object.entries(patch)) {
      if (['id', 'type', 'subtype', 'rev', 'created_at', 'created_by', 'fp'].includes(k)) continue;
      if (v === null || v === undefined || v === '') delete next[k]; else next[k] = v;
    }
    next.updated_at = this.now();
    next.rev = (cur.rev || 1) + 1;
    this._derive(next);
    const errors = schema.validateItem(next, { strictRequired: opts.strict !== false });
    if (errors.length) throw new ValidationError(errors, `${id} invalid: ${errors.join('; ')}`);
    this.data.items[id] = next;
    this._tc = null;
    if (next.type === 'Assumption') this._rerank();
    const flagged = suspect.afterUpdate(this, before, next, opts);
    if (opts.reviewed) suspect.clearItem(this, id, opts.actor, 'reviewed during edit');
    const changed = Object.keys(patch).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(next[k]));
    if (!opts.silent) this.audit(patch.status && patch.status !== before.status ? 'item.status' : 'item.update', id,
      patch.status && patch.status !== before.status ? `${opts.actor || 'system'} moved ${id} ${before.status} -> ${next.status}` : `${opts.actor || 'system'} edited ${id} (${changed.join(', ') || 'no change'})`,
      { actor: opts.actor, changed, flagged: flagged.length });
    return next;
  }

  setStatus(id, status, opts = {}) { return this.update(id, { status }, opts); }

  remove(id, opts: any = {}) {
    const it = this.get(id);
    if (!it) throw Object.assign(new Error(`item ${id} not found`), { status: 404 });
    const gone = this.data.linkList.filter((l) => l.source === id || l.target === id).length;
    this.data.linkList = this.data.linkList.filter((l) => l.source !== id && l.target !== id);
    delete this.data.items[id];
    this._idx = null; this._tc = null;
    if (it.type === 'Assumption') this._rerank();
    this.audit('item.delete', id, `${opts.actor || 'system'} deleted ${id} "${it.title}" and ${gone} link(s)`, { actor: opts.actor });
    return gone;
  }

  // ---- links -----------------------------------------------------------
  links() { return this.data.linkList; }
  linkById(id) { return this.data.linkList.find((l) => l.id === id) || null; }

  _index() {
    if (this._idx) return this._idx;
    const bySource = new Map();
    const byTarget = new Map();
    for (const l of this.data.linkList) {
      if (!bySource.has(l.source)) bySource.set(l.source, []);
      bySource.get(l.source).push(l);
      if (!byTarget.has(l.target)) byTarget.set(l.target, []);
      byTarget.get(l.target).push(l);
    }
    this._idx = { bySource, byTarget };
    return this._idx;
  }
  /** All links touching an item (either end). */
  linksOf(id) {
    const { bySource, byTarget } = this._index();
    return [...(bySource.get(id) || []), ...(byTarget.get(id) || [])];
  }
  /** Outgoing links of an item, optionally by type. */
  out(id, type) { return (this._index().bySource.get(id) || []).filter((l) => !type || l.type === type); }
  /** Incoming links of an item, optionally by type. */
  inn(id, type) { return (this._index().byTarget.get(id) || []).filter((l) => !type || l.type === type); }

  /** Validate and create a link. Throws ValidationError when illegal. */
  link(type, source, target, attrs = {}, opts: any = {}) {
    const def = links.LINK_MAP[type];
    if (def && def.attrs) for (const a of def.attrs) if (a.default !== undefined && attrs[a.name] === undefined) attrs = { ...attrs, [a.name]: a.default };
    const errors = links.validateLink(this, type, source, target, attrs);
    if (errors.length) throw new ValidationError(errors, `illegal link: ${errors.join('; ')}`);
    const prefix = def.edgeKey || 'LNK';
    const n = (this.data.counters[prefix] || 0) + 1;
    this.data.counters[prefix] = n;
    const link = { id: `${prefix}-${String(n).padStart(4, '0')}`, type, source, target, attrs, state: 'valid', created_at: this.now(), created_by: opts.actor || null };
    suspect.pinLink(this, link);
    this.data.linkList.push(link);
    this._idx = null;
    if (!opts.silent) this.audit('link.create', source, `${opts.actor || 'system'} linked ${source} -${type}-> ${target}`, { actor: opts.actor, link: link.id });
    return link;
  }

  unlink(id, opts: any = {}) {
    const l = this.linkById(id);
    if (!l) throw Object.assign(new Error(`link ${id} not found`), { status: 404 });
    this.data.linkList = this.data.linkList.filter((x) => x.id !== id);
    this._idx = null;
    this.audit('link.delete', l.source, `${opts.actor || 'system'} removed link ${l.source} -${l.type}-> ${l.target}`, { actor: opts.actor });
    return l;
  }

  /** Ensure a link exists (idempotent helper used by seed, ingest and derivations). */
  ensureLink(type, source, target, attrs = {}, opts = {}) {
    const existing = this.out(source, type).find((l) => l.target === target);
    return existing || this.link(type, source, target, attrs, opts);
  }

  // ---- convenience for exports ----------------------------------------
  exportData() { return JSON.parse(JSON.stringify(this.data)); }

  /** Basic structural validation of an arbitrary data blob (used by import). Returns errors[]. */
  static validateData(d) {
    const errors = [];
    if (!d || typeof d !== 'object') return ['not an object'];
    if (!d.items || typeof d.items !== 'object') errors.push('items missing');
    if (!Array.isArray(d.linkList)) errors.push('linkList missing');
    if (errors.length) return errors;
    const tmp = new Store(d, null);
    for (const it of Object.values(d.items)) {
      const e = schema.validateItem(it);
      if (e.length) errors.push(`${(it as any).id}: ${e.join('; ')}`);
    }
    for (const l of d.linkList) {
      if (!tmp.getType(l.source) || !tmp.getType(l.target)) { errors.push(`link ${l.id}: endpoint missing`); continue; }
      const e = links.validateLink({ getType: (x) => tmp.getType(x), linksOf: () => [] }, l.type, l.source, l.target, l.attrs || {});
      if (e.length) errors.push(`link ${l.id}: ${e.join('; ')}`);
    }
    return errors;
  }
}

export { Store, ValidationError, emptyData };
