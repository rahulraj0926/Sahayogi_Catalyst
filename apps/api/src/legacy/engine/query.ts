/**
 * engine/query.ts - the small query toolkit under the gate DSL and the coverage rules.
 *
 *   Selector   { type|types, subtype|subtypes, where, includeTerminal, counted }   -> items
 *   Where      { field: value | [a,b] | {in,notIn,not,gte,lte,gt,lt,exists,contains,olderThanDays}, $or, $and, $not,
 *                $suspect, $stale, $counted, $expired, $unverified, $hasOut, $noOut, $hasIn, $noIn }
 *   Link spec  { link, dir:'out'|'in', toType, toWhere, counted, min, attrs }  |  { field:Where } | { anyOf:[..] } | { all:[..] } | { not:spec }
 *
 * "counted" (spec 3.8): an item counts toward a numerator only if its status is in the type's counted statuses
 * and it is not an unverified agent item.
 */
import { TYPES, TERMINAL_STATUSES } from './schema';
import * as suspectLib from './suspect';
import * as freshness from './freshness';
const gatesMeta: any = {}; // filled by gates.js with default parameter values

class Ctx {
  store: any;
  today: any;
  depth: any;
  _stale: any;
  params: any;
  _suspect: any;
  constructor(store, params: any = {}) {
    this.store = store;
    this.params = params;
    this.today = store.today();
    this.depth = params.depth || 'L2';
    this.params = { today: this.today, ...params };
    this._suspect = null;
    this._stale = null;
  }
  param(name) {
    let v = this.params[name];
    if (v === undefined && this.store.data.settings.params) v = this.store.data.settings.params[name];
    if (v === undefined && gatesMeta.params) v = gatesMeta.params[name];
    // depth-keyed parameter: { L1: .., L2: .., L3: .. }
    if (v && typeof v === 'object' && !Array.isArray(v) && ('L1' in v || 'L2' in v || 'L3' in v)) v = v[this.depth] !== undefined ? v[this.depth] : v.L2;
    return v;
  }
  suspectMap() { return this._suspect || (this._suspect = suspectLib.suspectMap(this.store)); }
  staleMap() { return this._stale || (this._stale = suspectLib.staleMap(this.store)); }
  isSuspect(id) { return this.suspectMap().has(id); }
  isStale(id) { return this.staleMap().has(id); }
}

/** Replace "$name" strings (values only) by parameter values, recursively. */
function resolveParams(ctx, v) {
  if (typeof v === 'string' && v.startsWith('$') && !v.startsWith('$$')) {
    const p = ctx.param(v.slice(1));
    return p === undefined ? v : p;
  }
  if (Array.isArray(v)) return v.map((x) => resolveParams(ctx, x));
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = resolveParams(ctx, x);
    return o;
  }
  return v;
}

/**
 * Does the item count toward a gate numerator? Status must be a counted one and agent items must be verified.
 * When `ctx` ({store, today}) is given, a STALE competitor value (capability cell or price older than its maximum age)
 * is excluded too: the competitor design report says a stale value "drops out of outputs", and the grid already
 * shows it as stale, so the gate must not keep counting it (earlier build bug: grid flagged, API still counted).
 */
function isCounted(item, ctx?) {
  const def = TYPES[item.type];
  if (!def) return false;
  if (!def.countedStatuses.includes(item.status)) return false;
  if ((item.origin === 'agent' || item.origin === 'assistant') && item.verification !== 'verified') return false;
  // customer words typed in by hand on a research step back a job only once a second person has checked them
  if (item.type === 'Evidence' && item.origin === 'human' && item.provenance && item.provenance.method === 'by_hand' && item.verification !== 'verified') return false;
  if (ctx && ctx.store && (item.type === 'CompetitorCapability' || item.type === 'PricePoint')) {
    if (freshness.valueState(ctx.store, item, ctx.today || ctx.store.today()).state === 'stale') return false;
  }
  return true;
}

function inScope(item) {
  if (TERMINAL_STATUSES.has(item.status)) return false;
  if (item.type === 'Feature' && item.scope_status && item.scope_status !== 'in') return false;
  return true;
}

function cmp(actual, spec) {
  if (spec === null) return actual === undefined || actual === null || actual === '';
  if (Array.isArray(spec)) return spec.includes(actual);
  if (typeof spec === 'object') {
    for (const [op, v] of Object.entries(spec)) {
      switch (op) {
        case 'in': if (!(v as any).includes(actual)) return false; break;
        case 'notIn': if ((v as any).includes(actual)) return false; break;
        case 'not': if (cmp(actual, v)) return false; break;
        case 'gte': if (!(typeof actual === 'number' && actual >= (v as any))) return false; break;
        case 'lte': if (!(typeof actual === 'number' && actual <= (v as any))) return false; break;
        case 'gt': if (!(typeof actual === 'number' && actual > (v as any))) return false; break;
        case 'lt': if (!(typeof actual === 'number' && actual < (v as any))) return false; break;
        case 'exists': {
          const has = !(actual === undefined || actual === null || actual === '' || (Array.isArray(actual) && actual.length === 0));
          if (has !== v) return false; break;
        }
        case 'contains': if (!(Array.isArray(actual) ? actual.includes(v) : String(actual || '').toLowerCase().includes(String(v).toLowerCase()))) return false; break;
        case 'includesAny': if (!(Array.isArray(actual) && actual.some((x) => (v as any).includes(x)))) return false; break;
        case 'before': if (!(typeof actual === 'string' && actual < v)) return false; break;
        case 'after': if (!(typeof actual === 'string' && actual > v)) return false; break;
        case 'lengthGte': if (!(Array.isArray(actual) && actual.length >= (v as any))) return false; break;
        default: throw new Error(`unknown where operator ${op}`);
      }
    }
    return true;
  }
  if (spec === false) return !actual;
  return actual === spec;
}

/** Does item match the where-condition? */
function matches(ctx, item, where) {
  if (!where) return true;
  for (const [k, v] of Object.entries(where)) {
    switch (k) {
      case '$or': if (!(v as any).some((w) => matches(ctx, item, w))) return false; break;
      case '$and': if (!(v as any).every((w) => matches(ctx, item, w))) return false; break;
      case '$not': if (matches(ctx, item, v)) return false; break;
      case '$suspect': if (ctx.isSuspect(item.id) !== v) return false; break;
      case '$stale': if (ctx.isStale(item.id) !== v) return false; break;
      case '$counted': if (isCounted(item, ctx) !== v) return false; break;
      case '$unverified': if (((item.origin === 'agent' || item.origin === 'assistant') && item.verification !== 'verified') !== v) return false; break;
      case '$expired': {
        const st = freshness.stateOf(ctx.store, item, ctx.today);
        if (((st && st.state === 'stale') || false) !== v) return false; break;
      }
      case '$hasOut': case '$noOut': case '$hasIn': case '$noIn': {
        const spec: any = typeof v === 'string' ? { link: v } : v;
        const dir = k.endsWith('Out') ? 'out' : 'in';
        const has = linkedItems(ctx, item, { ...spec, dir }).length >= (spec.min || 1);
        if (has !== k.startsWith('$has')) return false; break;
      }
      default: if (!cmp(item[k], v)) return false;
    }
  }
  return true;
}

/** Select items. */
function select(ctx, selector) {
  const sel = resolveParams(ctx, selector);
  const types = sel.types || (sel.type ? [sel.type] : null);
  const subtypes = sel.subtypes || (sel.subtype ? [sel.subtype] : null);
  let items = ctx.store.all();
  if (types) items = items.filter((i) => types.includes(i.type));
  if (subtypes) items = items.filter((i) => subtypes.includes(i.subtype));
  if (!sel.includeTerminal) items = items.filter(inScope);
  if (sel.where) items = items.filter((i) => matches(ctx, i, sel.where));
  if (sel.counted) items = items.filter((i) => isCounted(i, ctx));
  return items;
}

/** Items at the other end of links of `spec.link` from `item`. */
function linkedItems(ctx, item, spec) {
  const s = resolveParams(ctx, spec);
  const ls = s.dir === 'in' ? ctx.store.inn(item.id, s.link) : ctx.store.out(item.id, s.link);
  const out = [];
  for (const l of ls) {
    if (s.attrs && !Object.entries(s.attrs).every(([k, v]) => cmp(l.attrs && l.attrs[k], v))) continue;
    const otherId = s.dir === 'in' ? l.source : l.target;
    const other = ctx.store.get(otherId);
    if (!other) { if (!s.toType && !s.toWhere && !s.counted) out.push({ id: otherId, type: ctx.store.getType(otherId), virtual: true }); continue; }
    if (s.toType && !(Array.isArray(s.toType) ? s.toType : [s.toType]).includes(other.type)) continue;
    if (s.toSubtype && other.subtype !== s.toSubtype) continue;
    if (s.toWhere && !matches(ctx, other, s.toWhere)) continue;
    if (s.counted && !isCounted(other, ctx)) continue;
    if (s.notTerminal !== false && TERMINAL_STATUSES.has(other.status)) continue;
    out.push(other);
  }
  return out;
}

/** Evaluate a requirement spec for one item. Returns true/false. */
function satisfies(ctx, item, spec) {
  if (spec.anyOf) return spec.anyOf.some((s) => satisfies(ctx, item, s));
  if (spec.all) return spec.all.every((s) => satisfies(ctx, item, s));
  if (spec.not) return !satisfies(ctx, item, spec.not);
  if (spec.field) return matches(ctx, item, resolveParams(ctx, spec.field));
  if (spec.link) return linkedItems(ctx, item, spec).length >= (resolveParams(ctx, spec.min) || 1);
  throw new Error('bad requirement spec ' + JSON.stringify(spec));
}

/** Human description of a requirement spec ("has an acceptance criterion"), used for default messages. */
function describeSpec(spec) {
  if (spec.label) return spec.label;
  if (spec.anyOf) return spec.anyOf.map(describeSpec).join(' or ');
  if (spec.all) return spec.all.map(describeSpec).join(' and ');
  if (spec.field) return `has ${Object.keys(spec.field).join(', ')}`;
  if (spec.link) return `${spec.dir === 'in' ? 'is the target of' : 'has'} ${spec.link}${spec.toType ? ' to ' + [].concat(spec.toType).join('/') : ''}`;
  return 'meets the rule';
}

function pct(n, d) { return d === 0 ? null : Math.round((1000 * n) / d) / 10; }

export { Ctx, gatesMeta, resolveParams, isCounted, inScope, cmp, matches, select, linkedItems, satisfies, describeSpec, pct };
