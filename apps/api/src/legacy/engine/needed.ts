/**
 * engine/needed.ts - "Who you need": every person the process needs, by stage, with what is needed from each and where it stands.
 *
 * Nothing here decides anything. It reads the product (stakeholders, approval requests, the facts waiting for a second person) and
 * says, row by row: who, what is needed, and one of four states:
 *     not_asked   nobody has been asked yet            asked   a request exists and the link has not been opened
 *     waiting     the link was opened, no decision yet  done    the person has decided (declined and expired are shown as such)
 * Rows that use an approval link carry the request (link, mailto, whatsapp) so the screen can offer Copy link, Email and WhatsApp.
 * ask(...) creates the pending requests of one stage in one go ("Send everything for this stage"); a row that cannot be asked yet
 * says why, in a sentence, and is simply skipped.
 */
import * as approvals from './approvals';
import * as stages from './stages';
import * as gates from './gates';
import * as agent from './agent';
import * as compose from './compose';
import * as stories from './stories';
import * as Q from './query';
import * as plainMod from './plain';

const NAMES = stages.STAGE_NAMES;
const same = approvals.same;
const DOC_STAGE = { intake_document: 0, prd: 3 };
const LEGAL = { criterion: 'G1-07', gate: 1, role: 'Legal' };

function stakeholders(store) { return store.list('Stakeholder', (s) => s.status !== 'Left'); }
function sponsorOf(store) {
  const st = stakeholders(store);
  const s = st.find((x) => x.is_sponsor) || st.find((x) => x.category === 'Sponsor');
  if (s) return { name: s.title, role: s.role_title || 'Sponsor' };
  const p = store.product();
  return p && p.sponsor ? { name: p.sponsor, role: 'Sponsor' } : null;
}
function legalOf(store) { const s = stakeholders(store).find((x) => x.category === 'Regulator/Legal'); return s ? { name: s.title, role: s.role_title || 'Legal' } : null; }
function customersOf(store) { return stakeholders(store).filter((x) => ['Customer', 'End-user'].includes(x.category)).map((x) => x.title); }

const firstSentence = (m) => { const t = String(m || '').replace(/decision "[a-z_]+" is not allowed: /i, '').replace(/\b[A-Z]{1,3}\d?-\d+[a-z]?,?\s*/g, '').replace(/\.{2,}/g, '.').replace(/\s+/g, ' ').trim(); const i = t.search(/[.!?](\s|$)/); const s = i > 0 ? t.slice(0, i + 1) : t; return s.length > 200 ? s.slice(0, 197) + '...' : s; };

/** The newest request that is still alive (waiting, approved, declined, expired) for a kind and subject. */
function latest(store, kind, subject) {
  const l = approvals.list(store).filter((a) => a.kind === kind && a.subject === subject && a.status !== 'withdrawn');
  return l.length ? l[l.length - 1] : null;
}
function stateOf(store, ap) {
  if (!ap) return { status: 'not_asked', word: 'Not asked yet' };
  const st = approvals.statusOf(store, ap);
  if (st === 'approved') return { status: 'done', word: 'Done' };
  if (st === 'declined') return { status: 'declined', word: 'Said no' };
  if (st === 'expired') return { status: 'not_asked', word: 'Link expired: ask again' };
  return ap.audit.some((e) => e.event === 'opened') ? { status: 'waiting', word: 'Waiting' } : { status: 'asked', word: 'Asked' };
}

function build(store, entry, opts: any = {}) {
  const actor = opts.actor || 'Kanishk';
  const base = opts.base || approvals.baseUrl({}, 4317);
  const pid = entry.id; const b = `#/p/${encodeURIComponent(pid)}`;
  const sponsor = sponsorOf(store); const legal = legalOf(store);
  const used = new Set();
  const out = [];
  const stageRows = Array.from({ length: 6 }, (_, n) => ({ n, name: n < 5 ? NAMES[n] : 'Hand-over', rows: [] }));
  const view = (ap) => (ap && approvals.statusOf(store, ap) === 'waiting' ? approvals.view(store, ap, base) : ap ? approvals.view(store, ap, base) : null);

  function addApprovalRow(n, spec) {
    const ap = spec.kind ? latest(store, spec.kind, spec.subject) : null;
    if (ap) used.add(ap.id);
    const s = stateOf(store, ap);
    const who = ap ? ap.approver : spec.who ? spec.who.name : null;
    const row = {
      id: spec.id, stage: n, type: 'approval', who, role: ap ? '' : (spec.who && spec.who.role) || '', need: spec.need, why: spec.why || '', status: s.status, word: s.word,
      approval: ap ? view(ap) : null, href: spec.href || null, ask: spec.ask || null, can_ask: false, why_not: null,
    };
    if (s.status === 'not_asked' && spec.ask) {
      if (!who) row.why_not = spec.noWho || 'Name this person first.';
      else if (same(who, actor)) row.why_not = `${who} is the person using the tool now, so someone else has to be asked.`;
      else { const w = spec.check ? spec.check(who) : null; if (w) row.why_not = w; else row.can_ask = true; }
    }
    stageRows[n].rows.push(row);
    return row;
  }

  // ---- the sign-off of every stage: the sponsor ---------------------------------------------------------------------------
  for (let g = 0; g < 5; g++) {
    const passed = stages.isPassed(store, g);
    addApprovalRow(g, {
      id: `signoff-${g}`, kind: 'stage_decision', subject: `gate-${g}`, who: sponsor, need: `Sign off ${NAMES[g]}`, why: 'Nothing moves on until the sponsor signs off.',
      href: `${b}`, ask: { type: 'stage', gate: g }, noWho: 'Name the sponsor first (Stage 0, kick-off).',
      check: (who) => {
        if (passed) return 'This stage is already signed off.';
        if (g > stages.earliestOpen(store)) return `Opens after ${NAMES[g - 1]} is signed off.`;
        try { gates.decide(store, g, 'go', { rationale: 'All required items are in place.', approver: who, submitted_by: actor, dry_run: true }, actor); return null; } catch (e) {
          try { const v = plainMod.stageView(gates.evaluateGate(store, g)); const left = v.required_total - v.required_done; if (left > 0) return `${left} required ${left === 1 ? 'item is' : 'items are'} still needed before the sign-off can be asked for.`; } catch (x) { /* fall through */ }
          return 'Not ready to ask for the sign-off yet.';
        }
      },
    });
  }

  // ---- documents that a second person approves ----------------------------------------------------------------------------
  for (const [key, g] of Object.entries(DOC_STAGE)) {
    let d; try { d = compose.compose(store, key); } catch (e) { continue; }
    addApprovalRow(g, {
      id: `doc-${key}`, kind: 'document', subject: key, who: sponsor, need: `Approve the ${d.title}`, why: 'The document is read by someone other than the person who wrote it.', href: `${b}/documents/${encodeURIComponent(key)}`,
      ask: { type: 'document', key }, noWho: 'Name the sponsor first (Stage 0, kick-off).',
      check: () => (d.status === 'not_started' ? 'The document has no content yet.' : d.completeness < compose.threshold(store) ? `The document is ${d.completeness}% complete; it needs ${compose.threshold(store)}% first.` : null),
    });
  }

  // ---- Legal signs the list of laws and standards (Stage 1) ---------------------------------------------------------------
  const legalCrit = gates.criteria().find((c) => c.id === LEGAL.criterion);
  const legalDepthOk = legalCrit && gates.LEVEL_ORDER && gates.LEVEL_ORDER[legalCrit.depth_level] <= gates.LEVEL_ORDER[gates.depthOf(store)];
  if (legalCrit && (legalDepthOk !== false)) {
    addApprovalRow(1, {
      id: 'legal-1', kind: 'sign_off', subject: `${LEGAL.criterion}-${LEGAL.gate}`, who: legal, need: 'Check and sign the list of laws and standards', why: 'The law check has to be signed by the person for Legal.', href: `${b}/work/S1-B`,
      ask: { type: 'legal' }, noWho: 'Add a person for Legal first (Add a person, "Legal or regulator").',
      check: () => (store.list('Obligation').length ? null : 'List the laws and standards first.'),
    });
  }

  // ---- stories: one approval each (the Hand-over step) ---------------------------------------------------------------------
  for (const s of stories.listStories(store)) {
    if (s.state === 'handed_off') continue;
    addApprovalRow(5, {
      id: `story-${s.id}`, kind: 'story', subject: s.id, who: sponsor, need: `Approve the story "${s.title.length > 60 ? s.title.slice(0, 57) + '...' : s.title}"`, why: 'A story is approved by someone other than the person who completed it.', href: `${b}/stories/${encodeURIComponent(s.id)}`,
      ask: { type: 'story', story: s.id }, noWho: 'Name the sponsor first (Stage 0, kick-off).',
      check: () => (s.state === 'approved' ? 'Already approved.' : s.missing.length ? `Not complete yet: ${firstSentence(s.missing[0].text)}` : null),
    });
  }

  // ---- facts typed in by hand wait for a second person -------------------------------------------------------------------
  const queue = agent.queue(store); const checked = agent.checked(store, 500);
  if (queue.length || checked.length) {
    const typists = new Set(queue.flatMap((i) => [i.entered_by, i.proposed_by]).filter(Boolean).map((x) => String(x).toLowerCase()));
    const others = stakeholders(store).map((x) => x.title).filter((n) => !typists.has(n.toLowerCase()));
    stageRows[1].rows.push({
      id: 'checks', stage: 1, type: 'check', who: others.slice(0, 2).join(' or ') || 'A second person', role: 'Checks the facts', need: queue.length ? `Check ${queue.length} ${queue.length === 1 ? 'fact' : 'facts'} typed in by hand` : 'Check the facts typed in by hand', why: 'Prices, ratings and customer quotes count only after a different person opens the source and checks them.',
      status: queue.length ? 'not_asked' : 'done', word: queue.length ? 'Not asked yet' : 'Done', approval: null, href: `${b}/checks`, ask: null, can_ask: false, why_not: null, note: queue.length ? 'They open "Things to check" as themselves: choose their name under "Acting as" at the top.' : '',
    });
  }

  // ---- customers and dealers give real quotes (Stage 1) ---------------------------------------------------------------------
  const prim = store.list('Segment', (s) => s.primary)[0];
  if (prim) {
    const ev = store.out(prim.id, 'supported_by').map((l) => store.get(l.target)).filter(Boolean);
    const good = ev.filter((e) => Q.isCounted(e)).length;
    const names = customersOf(store);
    stageRows[1].rows.push({
      id: 'quotes', stage: 1, type: 'info', who: names.length ? names.slice(0, 3).join(', ') : 'A customer or a dealer', role: 'Customers and dealers', need: 'Give at least two real quotes about the problem', why: `Your main customer group needs two checked quotes. ${good} so far.`,
      status: good >= 2 ? 'done' : ev.length ? 'waiting' : 'not_asked', word: good >= 2 ? 'Done' : ev.length ? 'Some, not checked' : 'Not asked yet', approval: null, href: `${b}/work/S1-B`, ask: null, can_ask: false, why_not: null, note: '',
    });
  }

  // ---- every other request that exists (exceptions, anything asked elsewhere) --------------------------------------------------
  for (const ap of approvals.list(store)) {
    if (used.has(ap.id) || ap.status === 'withdrawn') continue;
    const s = stateOf(store, ap);
    const n = Number.isInteger(ap.stage) && ap.stage >= 0 && ap.stage <= 4 ? ap.stage : 5;
    stageRows[n].rows.push({ id: ap.id, stage: n, type: 'approval', who: ap.approver, role: '', need: ap.title.replace(/^Go ahead without: /, 'Agree to go ahead without: '), why: '', status: s.status, word: s.word, approval: view(ap), href: null, ask: null, can_ask: false, why_not: null });
  }

  const current = stages.earliestOpen(store);
  for (const sr of stageRows) {
    (sr as any).state = sr.n < 5 ? (stages.isPassed(store, sr.n) ? 'done' : sr.n === current ? 'current' : 'later') : (current >= 5 ? 'current' : 'later');
    (sr as any).counts = { total: sr.rows.length, done: sr.rows.filter((r) => r.status === 'done').length, waiting: sr.rows.filter((r) => ['asked', 'waiting'].includes(r.status)).length, not_asked: sr.rows.filter((r) => r.status === 'not_asked').length };
    (sr as any).can_ask_count = sr.rows.filter((r) => r.can_ask).length;
    out.push(sr);
  }
  const all = out.flatMap((s) => s.rows);
  return {
    stages: out.filter((s) => s.rows.length), current,
    summary: { total: all.length, done: all.filter((r) => r.status === 'done').length, waiting: all.filter((r) => ['asked', 'waiting'].includes(r.status)).length, not_asked: all.filter((r) => r.status === 'not_asked').length },
    sponsor, legal, base: { url: base.url, warning: base.warning || null },
  };
}

/** Create one request. Returns { approval } or throws. */
function askOne(store, row, actor) {
  const a = row.ask; const who = row.who;
  if (!a) throw Object.assign(new Error('Nothing to send for this row.'), { status: 409 });
  if (a.type === 'stage') return approvals.requestStageDecision(store, a.gate, 'go', { rationale: 'All required items are in place.', approver: who }, actor);
  if (a.type === 'document') return compose.setStatus(store, a.key, { status: 'approved', role: compose.def(a.key).role, by: actor, second_approver: who }, actor);
  if (a.type === 'legal') return approvals.requestAttest(store, { criterion: LEGAL.criterion, gate: LEGAL.gate, role: LEGAL.role, by: who }, actor);
  if (a.type === 'story') return approvals.requestStory(store, a.story, who, actor);
  throw Object.assign(new Error('Unknown request.'), { status: 422 });
}

/**
 * Ask for every row of a stage (or of one row id) that can be asked now.
 * Returns { created: [row ids], approvals: [view], skipped: [{ id, need, why }] }
 */
function send(store, entry, opts: any = {}) {
  const actor = opts.actor || 'Kanishk';
  const before = build(store, entry, opts);
  const stage = opts.stage === undefined || opts.stage === null || opts.stage === '' ? null : Number(opts.stage);
  const rows = before.stages.flatMap((s) => s.rows).filter((r) => (opts.row ? r.id === opts.row : stage === null || r.stage === stage));
  const created = []; const skipped = [];
  for (const r of rows) {
    if (r.status !== 'not_asked' || !r.ask) continue;
    if (!r.can_ask) { skipped.push({ id: r.id, need: r.need, why: r.why_not || 'Cannot be asked yet.' }); continue; }
    try { askOne(store, r, actor); created.push(r.id); } catch (e) { skipped.push({ id: r.id, need: r.need, why: firstSentence(e.message) }); }
  }
  const after = build(store, entry, opts);
  const byId = new Map(after.stages.flatMap((s) => s.rows).map((r) => [r.id, r]));
  return { created, approvals: created.map((id) => (byId.get(id) || {}).approval).filter(Boolean), skipped, needed: after };
}

export { build, send, sponsorOf, legalOf };
