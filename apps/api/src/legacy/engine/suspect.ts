/**
 * engine/suspect.ts - suspect propagation (spec 3.11).
 *
 *  - Every item has a fingerprint over its "suspect fields" (schema.suspectFields) plus a status class.
 *  - Every link remembers the fingerprint of its driver end (fp_at_link). When the driver of an approved
 *    item changes, the link becomes `suspect` and the dependent item becomes suspect (direct, rule S1).
 *  - Items two or more hops away from the change become `stale` (rule T1), up to a configurable depth.
 *  - Clearing: confirm still valid (re-pins fingerprint) or edit the dependent with "reviewed" (rule S3).
 *    Agents cannot clear.
 */
import * as crypto from 'node:crypto';
import { TYPES, APPROVED_LIKE, TERMINAL_STATUSES } from './schema';
import { LINK_MAP, ends } from './links';

function statusClass(item) {
  return TERMINAL_STATUSES.has(item.status) || ['Invalidated', 'Converted', 'Challenged', 'Occurred', 'Changed'].includes(item.status) ? 'terminal' : 'active';
}

function sfValues(item) {
  const def = TYPES[item.type];
  const out: any = {};
  for (const k of (def && def.suspectFields) || []) if (k !== 'status') out[k] = item[k] === undefined ? null : item[k];
  out.__status = statusClass(item);
  return out;
}

function fingerprint(item) {
  return crypto.createHash('sha1').update(JSON.stringify(sfValues(item))).digest('hex').slice(0, 12);
}

function changedFields(before, after) {
  const a = sfValues(before);
  const b = sfValues(after);
  return Object.keys({ ...a, ...b }).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map((k) => (k === '__status' ? 'status' : k));
}

/** Pin the driver fingerprint(s) on a new link. */
function pinLink(store, link) {
  link.fp_at_link = {};
  for (const e of ends(link)) {
    const d = store.get(e.driver);
    if (d) link.fp_at_link[e.driver] = fingerprint(d);
  }
  link.state = 'valid';
}

/**
 * Called by the store after an item is updated. Marks links suspect when the changed item is the
 * driver, the item was previously approved-like (or became terminal), and its fingerprint changed.
 * Returns the list of link ids newly marked suspect.
 */
function afterUpdate(store, before, after, opts: any = {}) {
  const fpBefore = before.fp || fingerprint(before);
  const fpAfter = fingerprint(after);
  after.fp = fpAfter;
  if (fpBefore === fpAfter) return [];
  const wasApproved = APPROVED_LIKE.has(before.status);
  const becameTerminal = statusClass(before) !== statusClass(after) && statusClass(after) === 'terminal';
  if (!wasApproved && !becameTerminal) return [];
  const fields = changedFields(before, after);
  const flagged = [];
  for (const link of store.linksOf(after.id)) {
    for (const e of ends(link)) {
      if (e.driver !== after.id) continue;
      if (link.state !== 'suspect') link.suspect_since = store.now();
      link.state = 'suspect';
      link.cause = { item: after.id, fields, at: store.now(), by: opts.actor || null };
      flagged.push(link.id);
    }
  }
  if (flagged.length) store.audit('suspect.raised', after.id, `${after.id} changed (${fields.join(', ')}); ${flagged.length} link(s) marked suspect`, { links: flagged, actor: opts.actor });
  return flagged;
}

/** Map itemId -> [{link, driver, cause}] for items with at least one suspect inbound dependency. */
function suspectMap(store) {
  const m = new Map();
  for (const link of store.links()) {
    if (link.state !== 'suspect') continue;
    for (const e of ends(link)) {
      if (!store.get(e.dependent)) continue;
      if (!m.has(e.dependent)) m.set(e.dependent, []);
      m.get(e.dependent).push({ link: link.id, linkType: link.type, driver: e.driver, cause: link.cause || null, since: link.suspect_since || null });
    }
  }
  return m;
}

/** Stale (multi-hop, rule T1): dependents of suspect or stale items, up to `depth` hops from the cause. */
function staleMap(store, depth?) {
  const D = Math.max(1, Math.min(5, depth || (store.data.settings && store.data.settings.suspectDepth) || 3));
  const suspect = suspectMap(store);
  const stale = new Map();
  let frontier = [...suspect.keys()].map((id) => ({ id, hops: 1, path: [id] }));
  const seen = new Set(suspect.keys());
  while (frontier.length) {
    const next = [];
    for (const node of frontier) {
      if (node.hops >= D) continue;
      for (const link of store.linksOf(node.id)) {
        for (const e of ends(link)) {
          if (e.driver !== node.id) continue;
          const dep = e.dependent;
          if (seen.has(dep) || !store.get(dep)) continue;
          seen.add(dep);
          const entry = { id: dep, hops: node.hops + 1, path: [...node.path, dep] };
          stale.set(dep, { hops: entry.hops, via: node.path });
          next.push(entry);
        }
      }
    }
    frontier = next;
  }
  return stale;
}

function isAgentActor(actor) { return !actor || /^agent[:\s]/i.test(String(actor)) || /^claude/i.test(String(actor)); }

/** Clear suspect flags on one link ("confirm still valid"). */
function clearLink(store, linkId, actor, note) {
  if (isAgentActor(actor)) throw Object.assign(new Error('An AI agent cannot clear suspect flags; a named person must.'), { status: 403 });
  const link = store.linkById(linkId);
  if (!link) throw Object.assign(new Error(`link ${linkId} not found`), { status: 404 });
  if (link.state !== 'suspect') return link;
  for (const e of ends(link)) {
    const d = store.get(e.driver);
    if (d) link.fp_at_link[e.driver] = fingerprint(d);
  }
  link.state = 'valid';
  link.cleared_at = store.now();
  link.cleared_by = actor;
  delete link.cause;
  store.audit('suspect.cleared', link.source, `${actor} confirmed ${link.source} -${link.type}-> ${link.target} still valid${note ? ': ' + note : ''}`, { link: linkId, actor });
  return link;
}

/** Clear every suspect inbound link of an item. */
function clearItem(store, itemId, actor, note) {
  if (isAgentActor(actor)) throw Object.assign(new Error('An AI agent cannot clear suspect flags; a named person must.'), { status: 403 });
  const entries = suspectMap(store).get(itemId) || [];
  for (const e of entries) clearLink(store, e.link, actor, note);
  return entries.length;
}

export { fingerprint, statusClass, changedFields, pinLink, afterUpdate, suspectMap, staleMap, clearLink, clearItem, isAgentActor, LINK_MAP };
