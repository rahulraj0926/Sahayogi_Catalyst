/**
 * engine/compose.ts - the document composer: the 30 key outputs of Phases 0 to 4, rendered from the data.
 *
 * Every document is composed on request from the store (nothing is cached or hand-written), as a model
 * { key, title, phase, status, completeness, sections, missing, ... } that compose_render.js turns into Markdown or HTML.
 * Status lives in store.data.documents[key] = { status, history[] } and is mirrored onto the matching Artifact item
 * (intake_document, market_analysis, competitor_analysis, product_definition, prd, flow_pack) when one exists.
 * Completeness = satisfied "needs" / all needs (see compose_kit.need); unsatisfied needs become the Missing block.
 */
import { Kit } from './compose_kit';
import * as render from './compose_render';
import * as suspectLib from './suspect';
import * as pointers from './pointers';
import * as schema from './schema';
import * as plain from './plain';
import * as approvals from './approvals';
import compose_p0Mod from './compose_p0';
import compose_p1Mod from './compose_p1';
import compose_p2Mod from './compose_p2';
import compose_p3Mod from './compose_p3';
import compose_p4Mod from './compose_p4';
import * as unitsMod from './units';

const DEFS = [].concat(compose_p0Mod, compose_p1Mod, compose_p2Mod, compose_p3Mod, compose_p4Mod);
const BY_KEY = Object.fromEntries(DEFS.map((d) => [d.key, d]));
const STATUSES = ['not_started', 'draft', 'in_review', 'approved'];
const ARTIFACT_TO_DOC = { Draft: 'draft', 'In review': 'in_review', Approved: 'approved', Changed: 'draft' };
const DOC_TO_ARTIFACT = { draft: 'Draft', in_review: 'In review', approved: 'Approved' };
const DEFAULT_THRESHOLD = 80;
const ROLES = ['Product Owner', 'Sponsor', 'Product leader', 'Tech lead', 'QA lead', 'Legal'];

const httpErr = (status, message, extra?) => Object.assign(new Error(message), { status }, extra || {});
const threshold = (store) => { const v = Number(store.data.settings && store.data.settings.params && store.data.settings.params.doc_approval_min_pct); return Number.isFinite(v) && v > 0 ? v : DEFAULT_THRESHOLD; };
const records = (store) => (store.data.documents = store.data.documents || {});

function def(key) {
  const d = Object.prototype.hasOwnProperty.call(BY_KEY, key) ? BY_KEY[key] : null; // own keys only: "constructor" is not a document
  if (!d) throw httpErr(404, `unknown document "${key}"; valid keys: ${DEFS.map((x) => x.key).join(', ')}`);
  return d;
}

/** Footnote-style citations: every confirmed pointer behind an item mentioned in the document, numbered in order of first use. */
function citationsFor(store, sections) {
  const ids = []; const seen = new Set();
  const scan = (t) => { for (const m of String(t).matchAll(/\[\[([A-Z]{2,4}-\d{1,5})\]\]/g)) if (!seen.has(m[1])) { seen.add(m[1]); ids.push(m[1]); } };
  for (const sec of sections) for (const b of sec.blocks) { if (b.text) scan(b.text); if (b.items) b.items.forEach(scan); if (b.rows) b.rows.forEach((r) => r.forEach(scan)); }
  const out = []; const byPointer = new Map();
  for (const id of ids) {
    for (const p of pointers.forItem(store, id)) {
      let c = byPointer.get(p.id);
      if (!c) {
        const ext = (String(p.filename || '').match(/\.[^.]+$/) || [''])[0].toLowerCase();
        const unit = ext === '.pptx' ? 'slide' : ext === '.pdf' ? 'page' : 'section';
        const l = p.locator;
        const label = l.kind === 'slide' || l.kind === 'page' ? `${unit} ${l.index}` : l.kind === 'paragraph' ? `${unit} ${l.index}, line ${l.paragraph}` : l.kind === 'table_cell' ? `${unit} ${l.index}, table ${l.table}, row ${l.row}, column ${l.col}` : l.kind === 'sheet_cell' ? `sheet ${l.sheet}, cell ${l.cell}` : l.kind === 'sheet_range' ? `sheet ${l.sheet}, range ${l.range}` : `characters ${l.offset}`;
        c = { n: out.length + 1, pointer_id: p.id, attachment: p.attachment, filename: p.filename, locator: l, label, quote: p.quote, item_ids: [], viewer_route: `#/viewer/${p.attachment}?locator=${encodeURIComponent(JSON.stringify(l))}`, view_api: `/api/attachments/${p.attachment}/view` };
        byPointer.set(p.id, c); out.push(c);
      }
      c.item_ids.push(id);
    }
  }
  return out;
}

function blockText(b) {
  if (b.t === 'p' || b.t === 'note') return b.text;
  if (b.t === 'ul') return b.items.join(' ');
  if (b.t === 'table') return [...b.headers, ...b.rows.flat()].join(' ');
  return b.t === 'diagram' ? b.title : '';
}
const words = (s) => (String(s).replace(/\[\[[A-Z]{2,4}-\d+\]\]/g, 'ID').match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) || []).length;

/** A "why" that is only rule codes (G1-04, CR-03 ...) becomes a plain sentence; other wording has its codes replaced. */
function plainWhy(why) {
  const w = String(why || '').trim();
  if (!w) return '';
  const codes = w.match(/G([C0-4])-\d+[a-z]?/g) || [];
  const onlyCodes = /^(?:(?:G[C0-4]|CR|FC)-\d+[a-z]?(?:\s*\(advisory\))?[\s.,/;:]*)+$/i.test(w);
  if (onlyCodes) {
    const first = codes[0] ? /G([C0-4])/.exec(codes[0])[1] : null;
    const adv = /advisory/i.test(w);
    if (first === null || first === 'C') return adv ? 'Recommended for every stage.' : 'Needed so that the records stay linked.';
    return `${adv ? 'Recommended for' : 'Needed for'} the Stage ${first} sign-off.`;
  }
  return plain.clean(w).replace(/\b(?:CR|FC)-\d+\b/g, 'the linking rules').replace(/\(advisory\)/g, '(recommended)');
}

/** Compose one document. Returns the full model (sections included). */
function compose(store, key) {
  const d = def(key);
  const k = new Kit(store);
  let sections;
  try { sections = d.build(k); } catch (e) { throw Object.assign(new Error(`document ${key} could not be composed: ${e.message}`), { status: 500 }); }
  // "1 opportunity are recorded" -> "1 opportunity is recorded": counts are written by templates that cannot know the number
  const agree = (t) => (typeof t === 'string' ? t.replace(/(^|[^\d.,])1 ((?:[A-Za-z-]+ ){0,3}?[A-Za-z-]+) are\b/g, '$11 $2 is').replace(/(^|[^\d.,])1 ((?:[A-Za-z-]+ ){0,3}?[A-Za-z-]+) have\b/g, '$11 $2 has') : t);
  for (const s of sections) for (const b of s.blocks) { if (b.text) b.text = agree(b.text); if (b.items) b.items = b.items.map(agree); }
  const needs = sections.flatMap((s) => s.needs.map((n) => ({ ...n, section: s.heading })));
  const missing = needs.filter((n) => !n.ok).map((n) => ({ label: plain.clean(n.label), why: plainWhy(n.why), section: n.section, target: n.target }));
  const sources = store.all().filter((i) => d.reads.includes(i.type) && i.type !== 'Product' && !schema.TERMINAL_STATUSES.has(i.status));
  // a document with no source data at all is 0% complete, even if its checks hold vacuously (for example "no cross-module flows needed")
  const completeness = !sources.length && d.reads.some((t) => t !== 'Product') ? 0 : needs.length ? Math.round((100 * (needs.length - missing.length)) / needs.length) : 100;
  const rec = records(store)[key] || null;
  let status = rec && rec.status;
  if (!status) {
    const art = d.artifact && store.list('Artifact', (a) => a.kind === d.artifact && !schema.TERMINAL_STATUSES.has(a.status))[0];
    status = art && ARTIFACT_TO_DOC[art.status] && sources.length ? ARTIFACT_TO_DOC[art.status] : sources.length && completeness > 0 ? 'draft' : 'not_started';
  }
  const times = sources.map((i) => i.updated_at || i.created_at).filter(Boolean);
  if (rec && rec.history && rec.history.length) times.push(rec.history[rec.history.length - 1].at);
  const last_updated = times.sort().pop() || null;
  const approvedAt = rec && rec.approved_at;
  const outdated = status === 'approved' && approvedAt ? sources.some((i) => (i.updated_at || '') > approvedAt) : false;
  const prov = {};
  for (const i of sources) { const pv = render.provenance(i); prov[pv] = (prov[pv] || 0) + 1; }
  const model: any = {
    key, title: d.title, phase: d.phase, owner_role: d.role, status, completeness, last_updated, missing_count: missing.length, needs_total: needs.length,
    sources: { types: d.reads, items: sources.length, provenance: prov }, artifact_kind: d.artifact || null, changed_since_approval: outdated,
    approved_by: rec && rec.approved_by ? rec.approved_by : null, approved_at: approvedAt || null, waiver: rec && rec.waiver ? rec.waiver : null,
    sections, missing,
  };
  model.citations = citationsFor(store, sections);
  model.word_count = words(sections.flatMap((s) => [s.heading, ...s.blocks.map(blockText)]).join(' '));
  return model;
}

/** Summary rows for the 30 documents (no section bodies). */
function list(store) {
  return DEFS.map((d) => {
    const m: any = compose(store, d.key);
    return { key: m.key, title: m.title, phase: m.phase, status: m.status, completeness: m.completeness, last_updated: m.last_updated, word_count: m.word_count, missing_count: m.missing_count, owner_role: m.owner_role, source_items: m.sources.items, changed_since_approval: m.changed_since_approval, approved_by: m.approved_by, approved_at: m.approved_at };
  });
}

function render1(store, key, format) {
  const m = compose(store, key);
  if (format === 'html') return { model: m, body: render.toHtml(m, store), type: 'text/html; charset=utf-8', ext: 'html' };
  if (format === 'md') return { model: m, body: render.toMarkdown(m, store), type: 'text/markdown; charset=utf-8', ext: 'md' };
  return { model: m, body: null, type: 'application/json', ext: 'json' };
}

/** All documents in one dossier. format html or md. opts.phase restricts to one phase. */
function dossier(store, format, opts: any = {}) {
  const docs = DEFS.filter((d) => opts.phase === undefined || String(d.phase) === String(opts.phase)).map((d) => compose(store, d.key));
  let off = 0; // footnote numbers are unique across the whole dossier
  for (const d of docs) { for (const c of d.citations) c.n += off; off += d.citations.length; }
  const prod = store.product();
  const title = `${prod ? prod.name : 'Product'}: documentation dossier`;
  const approved = docs.filter((d) => d.status === 'approved').length;
  const meta = `As of ${unitsMod.dateWords(store.today())}. ${docs.length} documents, ${approved} approved, average completeness ${Math.round(docs.reduce((s, d) => s + d.completeness, 0) / (docs.length || 1))}%.`;
  if (format === 'md') return { body: render.dossierMd(title, docs, store, meta), type: 'text/markdown; charset=utf-8', ext: 'md', docs };
  return { body: render.dossierHtml(title, docs, store, meta), type: 'text/html; charset=utf-8', ext: 'html', docs };
}

/**
 * Change a document's status. payload: { status, role, by?, note?, waiver?: {reason, approver} }.
 * Approval needs a recognised role, a named human, and completeness at or above the threshold (settings.params.doc_approval_min_pct,
 * default 80) unless a waiver with a reason and a different approver is given. Recorded in the document history and the audit log.
 */
function setStatus(store, key, payload, actor) {
  const d = def(key);
  const status = payload.status;
  if (!['draft', 'in_review', 'approved'].includes(status)) throw httpErr(422, 'status must be draft, in_review or approved');
  const by = payload.by || actor;
  if (!by || suspectLib.isAgentActor(by)) throw httpErr(422, 'a document status can only be changed by a named person, not an agent');
  const role = String(payload.role || '').trim();
  if (!role) throw httpErr(422, 'a role is required (for example "Product Owner" or "Sponsor")');
  if (!ROLES.some((r) => r.toLowerCase() === role.toLowerCase()) && role.toLowerCase() !== d.role.toLowerCase()) throw httpErr(422, `role "${role}" is not recognised; use one of ${ROLES.join(', ')}`);
  const m = compose(store, key);
  const rec = records(store)[key] || { history: [] };
  const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  let waiver = null;
  if (status === 'approved') {
    
    if (m.status === 'not_started') throw httpErr(409, `${d.title} has no data yet, so it cannot be approved`);
    const min = threshold(store);
    const w = payload.waiver;
    if (m.completeness < min) {
      if (!w || !String(w.reason || '').trim() || !String(w.approver || '').trim()) throw httpErr(409, `${d.title} is ${m.completeness}% complete; approval needs at least ${min}% or an exception {reason, approver}`, { completeness: m.completeness, threshold: min, missing: m.missing.map((x) => x.label) });
      if (!payload._confirmed && same(w.approver, by)) throw httpErr(422, 'the exception approver must be a different person from the one asking');
      waiver = { reason: String(w.reason).trim(), approver: String(w.approver).trim(), completeness: m.completeness, threshold: min };
    }
    // The one rule for every approval path: the person who prepared the document never approves it. Someone else decides, by
    // the approval link or in person. Nothing is approved until that happens.
    const sent = rec.history.filter((x) => x.status === 'in_review').pop();
    if (payload._confirmed) {
      if (sent && same(sent.by, by)) throw httpErr(403, `${by} prepared this document, so ${by} cannot approve it.`, { code: 'preparer_blocked' });
    } else {
      const named = String((waiver && waiver.approver) || payload.second_approver || '').trim();
      if (!sent || same(sent.by, by)) {
        if (!named || same(named, by)) throw httpErr(409, `${by} prepared this document, so someone else has to approve it. Pick a different approver (for example the sponsor).`, { code: 'self_approval' });
        rec.status = 'in_review';
        rec.history.push({ status: 'in_review', role, by, at: store.now(), note: payload.note || `Sent to ${named} for approval`, completeness: m.completeness });
        records(store)[key] = rec;
        const ap = approvals.create(store, { kind: 'document', subject: key, stage: d.phase, prepared_by: by, approver: named, title: `Approve the document "${d.title}"`,
          statement: `${by} asks ${named} to approve "${d.title}" (${m.completeness}% complete${m.missing_count ? `, ${m.missing_count} ${m.missing_count === 1 ? 'part' : 'parts'} missing` : ''}).${waiver ? ' It is below the usual ' + min + '% bar, so ' + named + ' also accepts that: ' + waiver.reason : ''}`,
          payload: { role, note: payload.note || '', waiver: waiver ? { reason: waiver.reason } : null, request: payload.request || null } });
        store.audit('document.status', key, `${by} (${role}) sent "${d.title}" to ${named} for approval at ${m.completeness}% complete`, { actor: by, role, completeness: m.completeness });
        return { key, status: 'in_review', completeness: m.completeness, pending: true, approval: ap, history: rec.history.slice(-5), message: `Waiting for ${named} to approve "${d.title}". It does not count until they do.` };
      }
      // someone else sent it for review and this person is a different, acting person: they are the second person
      if (waiver && !same(waiver.approver, by)) throw httpErr(409, `The exception for "${d.title}" has to be accepted by ${waiver.approver}. Choose "Acting as" ${waiver.approver}, or send it to ${waiver.approver} for approval.`, { code: 'wrong_person' });
    }
  }
  const at = store.now();
  rec.status = status;
  rec.history.push({ status, role, by, at, note: payload.note || '', completeness: m.completeness, waiver });
  if (status === 'approved') { rec.approved_at = at; rec.approved_by = `${by} (${role})`; rec.waiver = waiver; } else { delete rec.approved_at; delete rec.approved_by; delete rec.waiver; }
  records(store)[key] = rec;
  if (d.artifact) {
    const art = store.list('Artifact', (a) => a.kind === d.artifact && !schema.TERMINAL_STATUSES.has(a.status))[0];
    if (art && art.status !== DOC_TO_ARTIFACT[status]) store.update(art.id, { status: DOC_TO_ARTIFACT[status] }, { actor: by, silent: true });
  }
  if (status === 'approved' && !payload._confirmed) { // approved directly by the second person: close any request that was still waiting for this document
    
    for (const a of approvals.list(store)) if (a.kind === 'document' && a.subject === key && approvals.statusOf(store, a) === 'waiting') { const mine = same(a.approver, by); a.status = mine ? 'approved' : 'withdrawn'; a.decided_at = at; a.decided_by = mine ? by : null; a.decision_via = 'in_person'; a.audit.push({ at, event: mine ? 'approved' : 'withdrawn', by, via: 'in_person' }); }
  }
  if (key === 'intake_document' && status === 'approved') for (const b of store.list('IntakeBrief')) if (b.status !== 'Approved') store.update(b.id, { status: 'Approved' }, { actor: by, silent: true });
  store.audit('document.status', key, `${by} (${role}) set "${d.title}" to ${status.replace('_', ' ')} at ${m.completeness}% complete${waiver ? ` under an exception accepted by ${waiver.approver}: ${waiver.reason}` : ''}`, { actor: by, role, completeness: m.completeness, waiver });
  return { key, status, completeness: m.completeness, history: rec.history.slice(-5), waiver };
}

export { plainWhy, DEFS, STATUSES, ROLES, compose, list, render1, dossier, setStatus, threshold, def, DEFAULT_THRESHOLD };
