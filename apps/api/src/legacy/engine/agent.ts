/**
 * engine/agent.ts - AI/agent research ingest and the human verification queue.
 *
 * Rule of the whole design (competitor report, section 4): AI proposes, a DIFFERENT human verifies.
 *  - ingest creates items with origin='agent', verification='unverified', status = first status (never Reviewed)
 *  - unverified agent items are visible but never counted (engine/query.ts isCounted), so gates that need verified
 *    evidence do not pass on them
 *  - verify(): only a named person who is not the submitter may verify; verifying a value also verifies its source
 *    Evidence (the verifier opened the source); AI actors are refused
 */
import * as schema from './schema';
import * as suspect from './suspect';
import { ValidationError } from './store';

const CONFIDENCE_TO_CRED = { high: 2, moderate: 3, low: 4 };
const VERIFIED_STATUS = { Competitor: 'Reviewed', CompetitorCapability: 'Reviewed', PricePoint: 'Reviewed', Evidence: 'Captured', Insight: 'Validated', Obligation: 'In review', Feature: 'In review', Requirement: 'In review', AcceptanceCriterion: 'In review' };
const REJECTED_STATUS = { Competitor: 'Retired', CompetitorCapability: 'Disputed', PricePoint: 'Disputed', Evidence: 'Retracted', Insight: 'Retracted' };

function snapshot(store) { return JSON.stringify(store.data); }
function restore(store, snap) { store.replaceData(JSON.parse(snap)); }

/**
 * Ingest a batch.
 * batch: { request_id?, submitted_by, provenance:{source_url, retrieved_on, grade, confidence, agent},
 *          items:[{tmp, type, subtype?, fields, provenance?}], links:[{type, source, target, attrs?}] }
 * All-or-nothing: on any error the store is restored and the errors are returned in a ValidationError.
 */
function ingest(store, batch) {
  const errors = [];
  if (!batch || !Array.isArray(batch.items) || !batch.items.length) throw new ValidationError(['batch.items must be a non-empty list']);
  const prov = batch.provenance || {};
  if (!prov.agent) errors.push('provenance.agent (name of the agent/model) is required');
  if (!prov.retrieved_on) errors.push('provenance.retrieved_on (YYYY-MM-DD) is required');
  if (!prov.grade || !schema.ENUMS.grade.includes(prov.grade)) errors.push('provenance.grade must be A-F');
  if (!batch.submitted_by) errors.push('submitted_by (the person pushing the batch) is required');
  if (errors.length) throw new ValidationError(errors);
  const snap = snapshot(store);
  const tmpMap = {};
  const createdItems = [];
  const createdLinks = [];
  const evidenceByUrl = {};
  const evidenceIds = [];
  const resolve = (ref) => tmpMap[ref] || ref;
  try {
    // 1. evidence per distinct source url
    const urls = new Set();
    for (const it of batch.items) { const p = { ...prov, ...(it.provenance || {}) }; if (p.source_url) urls.add(p.source_url); }
    for (const url of urls) {
      const p = batch.items.map((it) => ({ ...prov, ...(it.provenance || {}) })).find((x) => x.source_url === url);
      const ev = store.create('Evidence', {
        title: `Web capture: ${(url as any).replace(/^https?:\/\//, '').slice(0, 70)}`, kind: p.kind || 'web_page', source_class: p.source_class || 'vendor_claim', retrieved_on: p.retrieved_on, url_or_file: url,
        reliability: p.grade, credibility: CONFIDENCE_TO_CRED[p.confidence] || 4, captured: true, status: 'Captured', agent: p.agent, provenance: { source_url: url, retrieved_on: p.retrieved_on, grade: p.grade, confidence: p.confidence, agent: p.agent },
      }, { actor: batch.submitted_by, origin: 'agent' });
      evidenceByUrl[(url as any)] = ev.id; evidenceIds.push(ev.id); createdItems.push(ev.id);
    }
    // 2. items
    for (const it of batch.items) {
      const def = schema.TYPES[it.type];
      if (!def) { errors.push(`item ${it.tmp || ''}: unknown type ${it.type}`); continue; }
      const p = { ...prov, ...(it.provenance || {}) };
      const fields = { ...(it.fields || {}) };
      if (fields.status && fields.status !== def.initialStatus) errors.push(`item ${it.tmp || fields.title}: agents cannot set status "${fields.status}"; items start as ${def.initialStatus} and a human verifies them`);
      fields.status = def.initialStatus;
      const known = new Set(schema.fieldsFor(it.type, it.subtype).map((f) => f.name));
      if (known.has('captured_on') && !fields.captured_on) fields.captured_on = p.retrieved_on;
      if (known.has('capture_method') && !fields.capture_method) fields.capture_method = 'ai_proposed';
      if (known.has('source_grade') && !fields.source_grade) fields.source_grade = p.grade;
      if (known.has('value_class') && !fields.value_class) fields.value_class = 'verified_fact';
      fields.agent = p.agent;
      fields.provenance = { source_url: p.source_url || null, retrieved_on: p.retrieved_on, grade: p.grade, confidence: p.confidence || null, agent: p.agent };
      try {
        const created = store.create(it.type, fields, { actor: batch.submitted_by, origin: 'agent', subtype: it.subtype });
        created.request_id = batch.request_id || undefined;
        if (!created.request_id) delete created.request_id;
        if (it.tmp) tmpMap[it.tmp] = created.id;
        createdItems.push(created.id);
        if (p.source_url && it.type !== 'Evidence' && it.type !== 'Competitor') {
          const l = store.link('supported_by', created.id, evidenceByUrl[p.source_url], { role: 'supports' }, { actor: batch.submitted_by, silent: true });
          createdLinks.push(l.id);
        } else if (p.source_url && it.type === 'Competitor') {
          const l = store.link('supported_by', created.id, evidenceByUrl[p.source_url], { role: 'supports' }, { actor: batch.submitted_by, silent: true });
          createdLinks.push(l.id);
        }
      } catch (e) { errors.push(`item ${it.tmp || (it.fields && it.fields.title)}: ${e.errors ? e.errors.join('; ') : e.message}`); }
    }
    if (errors.length) throw new ValidationError(errors);
    // 3. links
    for (const l of batch.links || []) {
      try { const created = store.link(l.type, resolve(l.source), resolve(l.target), l.attrs || {}, { actor: batch.submitted_by, silent: true }); createdLinks.push(created.id); } catch (e) { errors.push(`link ${l.type} ${l.source}->${l.target}: ${e.errors ? e.errors.join('; ') : e.message}`); }
    }
    if (errors.length) throw new ValidationError(errors);
  } catch (e) {
    restore(store, snap);
    if (e instanceof ValidationError) throw e;
    throw e;
  }
  const n = (store.data.counters.ING = (store.data.counters.ING || 0) + 1);
  const rec = { id: `ING-${String(n).padStart(3, '0')}`, at: store.now(), agent: prov.agent, submitted_by: batch.submitted_by, request_id: batch.request_id || null, source_urls: [...Object.keys(evidenceByUrl)], items: createdItems, links: createdLinks, retrieved_on: prov.retrieved_on, grade: prov.grade };
  store.data.ingests.push(rec);
  store.audit('agent.ingest', rec.id, `${batch.submitted_by} ingested ${createdItems.length} item(s) from ${prov.agent} (all unverified)`, { actor: batch.submitted_by, agent: prov.agent });
  return { ingest: rec, created: createdItems, links: createdLinks, unverified: createdItems.length };
}

/** Items waiting for a human. */
function queue(store) {
  return store.all().filter((i) => needsVerification(i) && (i.type !== 'Competitor' || i.origin !== 'human')).map((i) => {
    const ev = store.out(i.id, 'supported_by').map((l) => store.get(l.target)).filter(Boolean);
    const parent = store.inn(i.id, 'contains').map((l) => store.get(l.source))[0];
    // what the item is about, for a hand-typed customer quote: the job or opportunity it backs
    const backs = store.inn(i.id, 'supported_by').map((l) => store.get(l.source)).filter(Boolean).map((x) => ({ id: x.id, type: x.type, title: x.title, stance: ((store.inn(i.id, 'supported_by').find((l) => l.source === x.id) || {}).attrs || {}).role || 'supports' }));
    return { id: i.id, type: i.type, title: i.title, status: i.status, proposed_by: i.proposed_by, entered_by: i.origin === 'human' ? (i.created_by || null) : null, origin: i.origin, agent: i.agent, provenance: i.provenance || null, parent: parent ? { id: parent.id, title: parent.title } : null, evidence: ev.map((e) => ({ id: e.id, title: e.title, url: e.url_or_file, grade: e.reliability, retrieved_on: e.retrieved_on })), backs, quote: i.type === 'Evidence' ? (i.content || null) : null, source_text: i.type === 'Evidence' ? (i.url_or_file || null) : null, fields: summaryFields(i), request_id: i.request_id || null, created_at: i.created_at };
  }).sort((a, b) => a.id.localeCompare(b.id));
}

/** Things a second person has already checked, newest first: who checked, when, and the source note. */
function checked(store, limit = 40) {
  return store.all().filter((i) => i.verified_by && i.verification === 'verified' && ['CompetitorCapability', 'PricePoint', 'Evidence', 'Opportunity', 'Competitor'].includes(i.type))
    .sort((a, b) => String(b.verified_on || '').localeCompare(String(a.verified_on || '')) || b.id.localeCompare(a.id)).slice(0, limit)
    .map((i) => ({ id: i.id, type: i.type, title: i.title, entered_by: i.created_by || i.proposed_by || null, verified_by: i.verified_by, verified_on: i.verified_on || null, verified_note: i.verified_note || null }));
}

function summaryFields(i) {
  const keys = ['level', 'capability_tag', 'amount', 'currency', 'unit', 'value_metric', 'price_type', 'plan', 'tier', 'kind', 'captured_on', 'applicability', 'statement'];
  return Object.fromEntries(keys.filter((k) => i[k] !== undefined).map((k) => [k, i[k]]));
}

function assertHuman(actor) {
  if (suspect.isAgentActor(actor)) throw Object.assign(new Error('Only a named person can verify or reject agent items; AI can never verify.'), { status: 403 });
}

/** Waiting for a second person: found by an agent or the assistant, read from a file, or a competitor value typed by hand that nobody else has checked. */
const HAND_CHECKED = new Set(['Competitor', 'CompetitorCapability', 'PricePoint']);
/** Customer words (or other evidence) typed in by hand on a research step: they back a top job or an opportunity only once a second person has looked at them. */
const isHandEvidence = (it) => it.type === 'Evidence' && it.origin === 'human' && !!(it.provenance && it.provenance.method === 'by_hand');
/** An opportunity typed in on the opportunities step: a second person looks at it and the evidence behind it. */
const isHandOpportunity = (it) => it.type === 'Opportunity' && it.origin === 'human' && it.request_id === 'DR-1-08';
function needsVerification(it) {
  if (['agent', 'assistant', 'document'].includes(it.origin)) return it.verification === 'unverified';
  return it.origin === 'human' && (HAND_CHECKED.has(it.type) || isHandEvidence(it) || isHandOpportunity(it)) && it.verification !== 'verified' && it.verification !== 'rejected' && !it.verified_by;
}

/** Verify an item (and the unverified Evidence behind it). Different person from the submitter, with a source note. */
function verify(store, id, actor, note?) {
  assertHuman(actor);
  note = String(note || '').trim();
  if (note.length < 3) throw Object.assign(new Error('Say where you checked it: write a short source note (for example "vendor price page, opened today").'), { status: 422, code: 'source_note_required' });
  const it = store.get(id);
  if (!it) throw Object.assign(new Error(`item ${id} not found`), { status: 404 });
  if (!needsVerification(it)) throw Object.assign(new Error(`${id} is not waiting for verification`), { status: 409 });
  const same = (n) => n && String(n).trim().toLowerCase() === String(actor).trim().toLowerCase();
  if (same(it.proposed_by) || same(it.created_by) || same(it.requested_by)) throw Object.assign(new Error(`${actor} created or asked for ${id}, so a different person has to check it.`), { status: 409, code: 'same_person' });
  if (it.type === 'Competitor' && !(it.tier && it.tier_basis)) throw Object.assign(new Error('a Competitor needs a tier and a tier_basis before it can be reviewed'), { status: 409 });
  const patch = { verification: 'verified', verified_by: actor, verified_on: store.today(), verified_note: note.slice(0, 300), status: VERIFIED_STATUS[it.type] || it.status };
  store.update(id, patch, { actor, silent: true, strict: false });
  const done = [id];
  // a competitor value typed by hand has no source record yet: the checker's note becomes it, so the stage rule "checked by a different person, with a source" can hold
  if (['CompetitorCapability', 'PricePoint'].includes(it.type) && !store.out(id, 'supported_by').some((l) => store.get(l.target))) {
    const src = store.create('Evidence', { title: `Checked by ${actor}: ${note.slice(0, 60)}`, kind: 'other', source_class: 'secondary', retrieved_on: store.today(), content: note.slice(0, 300), url_or_file: note.slice(0, 300), reliability: 'C', credibility: 3, captured: true, status: 'Captured' }, { actor, origin: 'human', silent: true });
    store.link('supported_by', id, src.id, { role: 'supports' }, { actor, silent: true });
    done.push(src.id);
  }
  for (const l of store.out(id, 'supported_by')) {
    const ev = store.get(l.target);
    if (ev && ev.origin === 'agent' && ev.verification === 'unverified') {
      store.update(ev.id, { verification: 'verified', verified_by: actor, verified_on: store.today(), verified_note: note.slice(0, 300) }, { actor, silent: true, strict: false });
      done.push(ev.id);
    }
  }
  for (const l of store.out(id, 'supersedes')) { // a refreshed value retires the older one it supersedes
    const old = store.get(l.target);
    if (old && !['Retired', 'Retracted'].includes(old.status)) { store.update(old.id, { status: 'Retired' }, { actor, silent: true, strict: false }); done.push(old.id); }
  }
  store.audit('agent.verified', id, `${actor} verified ${id}${done.length > 1 ? ' and ' + (done.length - 1) + ' source record(s)' : ''}, source noted: ${note}`, { actor, items: done, note });
  return done;
}

function reject(store, id, actor, note) {
  assertHuman(actor);
  const it = store.get(id);
  if (!it) throw Object.assign(new Error(`item ${id} not found`), { status: 404 });
  if (!needsVerification(it)) throw Object.assign(new Error(`${id} is not waiting for verification`), { status: 409 });
  if (!note) throw Object.assign(new Error('a reason is required to reject'), { status: 422 });
  store.update(id, { verification: 'rejected', verified_by: actor, verified_on: store.today(), status: REJECTED_STATUS[it.type] || it.status, note }, { actor, silent: true, strict: false });
  store.audit('agent.rejected', id, `${actor} rejected ${id}: ${note}`, { actor });
  return [id];
}

export { ingest, queue, verify, reject, needsVerification, checked };
