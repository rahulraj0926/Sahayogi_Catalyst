/**
 * engine/pointers.ts - Pointers: exact quotes anchored at a locator inside an uploaded document, used as evidence.
 *
 * A Pointer item (PTR) says "this quote, at this slide / page / cell / line of this attachment, backs that item". It is
 * linked points_to -> Attachment, cited_by -> the backed item, and the item is supported_by the Pointer. A CONFIRMED pointer
 * also makes the item supported_by an Evidence record for the attachment (created on demand, origin document), so the
 * existing gate rules that look for Evidence count it, with provenance back to the exact place.
 * The quote is checked against the extracted text at creation: a quote that does not occur at the locator is refused.
 */
import * as attachments from './attachments';
import * as loc from './locators';
import * as schema from './schema';

const httpErr = (status, message, extra?) => Object.assign(new Error(message), { status }, extra || {});
const KIND_BY_EXT = { '.pdf': 'document', '.docx': 'document', '.pptx': 'document', '.xlsx': 'data_file', '.csv': 'data_file', '.tsv': 'data_file', '.html': 'web_page', '.png': 'screenshot', '.jpg': 'screenshot', '.jpeg': 'screenshot' };

const tryLink = (store, type, s, t, attrs, actor) => { try { return store.ensureLink(type, s, t, attrs || {}, { actor, silent: true }); } catch (e) { return null; } };

/** The Evidence record that represents an attachment (one per attachment). */
function ensureEvidence(store, att, actor) {
  const key = `attachment:${att.id}`;
  let ev = store.list('Evidence', (e) => e.url_or_file === key, { all: true })[0];
  if (ev) return ev;
  const ext = (att.filename.match(/\.[^.]+$/) || [''])[0].toLowerCase();
  ev = store.create('Evidence', { title: `Uploaded document: ${att.filename}`.slice(0, 150), kind: KIND_BY_EXT[ext] || 'document', source_class: 'secondary', retrieved_on: store.today(), url_or_file: key, reliability: 'C', credibility: 3, captured: true, status: 'Captured', note: `Evidence record for attachment ${att.id}; the exact places are Pointers.` }, { actor, origin: 'document', silent: true });
  tryLink(store, 'attached_to', att.id, ev.id, {}, actor);
  return ev;
}

/** Make `item` supported_by the attachment's Evidence iff it has at least one confirmed pointer into that attachment. */
function syncEvidence(store, itemId, attachmentId, actor) {
  const att = store.get(attachmentId);
  const item = store.get(itemId);
  if (!att || !item) return;
  const confirmed = store.inn(itemId, 'cited_by').map((l) => store.get(l.source)).filter((p) => p && p.type === 'Pointer' && p.status === 'confirmed' && p.attachment === attachmentId);
  const ev = store.list('Evidence', (e) => e.url_or_file === `attachment:${attachmentId}`, { all: true })[0];
  if (confirmed.length) {
    const e = ensureEvidence(store, att, actor);
    tryLink(store, 'supported_by', itemId, e.id, { role: 'supports', locator: loc.labelOf(loc.fromItem(confirmed[0])) }, actor);
  } else if (ev) {
    const l = store.out(itemId, 'supported_by').find((x) => x.target === ev.id);
    if (l) store.unlink(l.id, { actor });
  }
}

const present = (store, p) => {
  const att = store.get(p.attachment);
  return {
    id: p.id, status: p.status, attachment: p.attachment, filename: att ? att.filename : null, locator: loc.fromItem(p), quote: p.quote, created_by: p.created_by, origin: p.pointer_origin, confidence: p.confidence === undefined ? null : p.confidence,
    reason: p.reason || null, targets: store.out(p.id, 'cited_by').map((l) => ({ id: l.target, type: store.getType(l.target), title: (store.get(l.target) || {}).title || null })), created_at: p.created_at,
  };
};

/**
 * Create a pointer. opts: { attachment, locator, quote, target?, create?:{type, subtype?, fields}, status?, origin?, confidence?, reason? }
 * Returns { pointer, target, created_item?, evidence? }.
 */
function create(store, opts, actor, dir) {
  const att = attachments.get(store, opts.attachment);
  if (att.status === 'Deleted') throw httpErr(410, `${att.id} was deleted`);
  if (!opts.locator || !opts.locator.kind) throw httpErr(422, 'locator is required, for example {"kind":"slide","index":3}');
  const { extraction } = attachments.text(store, att.id, dir);
  const v = loc.verifyQuote(extraction, opts.locator, opts.quote);
  if (!v.ok) throw httpErr(422, `pointer refused: ${v.reason}`, { errors: [v.reason] });
  const origin = opts.origin === 'assistant' ? 'assistant' : 'human';
  const status = opts.status || (origin === 'human' ? 'confirmed' : 'proposed');
  if (!['proposed', 'confirmed', 'rejected'].includes(status)) throw httpErr(422, 'status must be proposed, confirmed or rejected');
  if (opts.target && opts.create) throw httpErr(422, 'send either target (an existing item) or create (a new item), not both');
  const snap = JSON.stringify(store.data);
  try {
    let targetItem = null; let createdItem = null;
    if (opts.target) { targetItem = store.get(opts.target); if (!targetItem) throw httpErr(404, `target item ${opts.target} not found`); }
    if (opts.create) {
      if (!schema.TYPES[opts.create.type]) throw httpErr(422, `unknown item type "${opts.create.type}"`);
      createdItem = store.create(opts.create.type, { ...(opts.create.fields || {}) }, { actor, origin: origin === 'assistant' ? 'assistant' : 'document', subtype: opts.create.subtype });
      targetItem = createdItem;
    }
    const q = String(opts.quote).replace(/\s+/g, ' ').trim();
    const p = store.create('Pointer', {
      title: `${att.filename}: ${q.slice(0, 70)}`, attachment: att.id, ...loc.toFields(opts.locator), quote: q, created_by: actor, pointer_origin: origin, ...(opts.confidence !== undefined ? { confidence: opts.confidence } : {}), ...(opts.reason ? { reason: String(opts.reason).slice(0, 500) } : {}), status,
    }, { actor, origin: origin === 'assistant' ? 'assistant' : 'human', silent: true });
    if (origin === 'assistant') store.update(p.id, { verification: 'unverified' }, { actor, silent: true, strict: false });
    store.link('points_to', p.id, att.id, {}, { actor, silent: true });
    if (targetItem) {
      store.link('cited_by', p.id, targetItem.id, {}, { actor, silent: true });
      tryLink(store, 'supported_by', targetItem.id, p.id, { role: 'supports', locator: loc.labelOf(opts.locator) }, actor);
      if (status === 'confirmed') syncEvidence(store, targetItem.id, att.id, actor);
    }
    store.audit('pointer.create', p.id, `${actor} created ${status} pointer ${p.id} into ${att.filename} (${loc.labelOf(opts.locator)})${targetItem ? ` backing ${targetItem.id}` : ''}`, { actor });
    return { pointer: present(store, store.get(p.id)), target: targetItem ? { id: targetItem.id, type: targetItem.type, title: targetItem.title } : null, created_item: createdItem ? { id: createdItem.id, type: createdItem.type } : null };
  } catch (e) { store.replaceData(JSON.parse(snap)); throw e; }
}

function list(store, q) {
  let ps = store.list('Pointer', (p) => p.status !== 'rejected' || q.include_rejected === '1', { all: true });
  if (q.attachment) { attachments.get(store, q.attachment); ps = ps.filter((p) => p.attachment === q.attachment); }
  if (q.target) { if (!store.get(q.target)) throw httpErr(404, `item ${q.target} not found`); ps = ps.filter((p) => store.out(p.id, 'cited_by').some((l) => l.target === q.target)); }
  if (q.status) ps = ps.filter((p) => p.status === q.status);
  if (!q.attachment && !q.target && !q.status && ps.length > 500) ps = ps.slice(0, 500);
  return { total: ps.length, pointers: ps.map((p) => present(store, p)) };
}

/** PATCH: { status: 'confirmed'|'rejected'|'proposed', target: itemId (retarget), reason } */
function patch(store, id, body, actor) {
  const p = store.get(id);
  if (!p || p.type !== 'Pointer') throw httpErr(404, `pointer ${id} not found`);
  const targets = store.out(id, 'cited_by').map((l) => l.target);
  if (body.target !== undefined) {
    if (!store.get(body.target)) throw httpErr(404, `target item ${body.target} not found`);
    for (const t of targets) { for (const l of store.out(id, 'cited_by').filter((x) => x.target === t)) store.unlink(l.id, { actor }); const sl = store.out(t, 'supported_by').find((x) => x.target === id); if (sl) store.unlink(sl.id, { actor }); syncEvidence(store, t, p.attachment, actor); }
    store.link('cited_by', id, body.target, {}, { actor, silent: true });
    tryLink(store, 'supported_by', body.target, id, { role: 'supports' }, actor);
  }
  if (body.status !== undefined) {
    if (!['proposed', 'confirmed', 'rejected'].includes(body.status)) throw httpErr(422, 'status must be proposed, confirmed or rejected');
    store.update(id, { status: body.status, ...(body.reason ? { reason: String(body.reason).slice(0, 500) } : {}) }, { actor, silent: true, strict: false });
  }
  for (const t of store.out(id, 'cited_by').map((l) => l.target).concat(targets)) syncEvidence(store, t, p.attachment, actor);
  store.audit('pointer.update', id, `${actor} updated pointer ${id}: ${Object.keys(body).join(', ')}`, { actor });
  return { pointer: present(store, store.get(id)) };
}

function remove(store, id, actor) {
  const p = store.get(id);
  if (!p || p.type !== 'Pointer') throw httpErr(404, `pointer ${id} not found`);
  const targets = store.out(id, 'cited_by').map((l) => l.target);
  store.remove(id, { actor });
  for (const t of targets) syncEvidence(store, t, p.attachment, actor);
  return { deleted: id, was: { attachment: p.attachment, quote: p.quote } };
}

/** Confirmed pointers that back an item, with their locators (for citations and the item page). */
function forItem(store, itemId) {
  return store.inn(itemId, 'cited_by').map((l) => store.get(l.source)).filter((p) => p && p.type === 'Pointer' && p.status === 'confirmed').map((p) => present(store, p));
}

export { create, list, patch, remove, forItem, ensureEvidence, syncEvidence, present };
