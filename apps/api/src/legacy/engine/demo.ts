/**
 * engine/demo.ts - the guided demo: ten narrated steps that call the REAL engine (the same functions the API
 * routes call). Nothing here edits the UI or fakes numbers: each step mutates the store and the dashboard simply
 * re-reads it. Each step lists the gate criteria it claims to change; `run` checks the claim and returns it, and
 * tests/demo.test.js asserts the claims.
 *
 * Back/Reset: the store is rebuilt from the seed and the first N steps are replayed (the steps are deterministic).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as gates from './gates';
import * as requests from './requests';
import * as agent from './agent';
import * as questions from './questions';
import * as suspectLib from './suspect';
import * as Q from './query';

const EXAMPLE = path.join(__dirname, '..', 'data', 'examples', 'competitor_research_cloudflare_refresh.json');

/** Status of one criterion at its gate. */
function critStatus(store, id) {
  const crit = gates.criteria().find((c) => c.id === id);
  const g = crit.gate === 'C' ? 2 : crit.gate;
  const ev = gates.evaluateGate(store, g);
  const r = ev.results.find((x) => x.id === id);
  return { status: r.status, message: r.message, offenders: r.offenders.length };
}
function metrics(store) {
  const ctx = new Q.Ctx(store, {});
  return {
    verificationQueue: agent.queue(store).length,
    suspectItems: ctx.suspectMap().size,
    openMustQuestions: store.list('Question', (q) => q.priority === 'Must' && questions.effectiveState(store, q).state === 'open').length,
    items: store.all().length,
  };
}

const STEPS = [
  {
    id: 'start', title: 'Where we are today',
    narration: 'Sahayogi CDN is mid-journey. Gate 0 passed with two conditions. Gate 1 is blocked by three stale competitor values and an unsigned legal scan; Gate 2 fails the capacity check; Phase 3 has Must requirements with no acceptance criteria; Phase 4 has a flow with a dead end. Watch these numbers change, step by step.',
    api: 'GET /api/dashboard', watch: ['G1-04b', 'G1-07', 'G2-07', 'G2-14', 'G3-08b', 'G4-02', 'G4-06'], claims: [],
    run() { return { summary: 'No change. This is the starting picture.' }; },
  },
  {
    id: 'answer-capacity', title: 'Answer a human request: team capacity',
    narration: 'The capacity check fails: Must effort is 89 person-months but approved capacity times 0.9 is only 77.4. Only the company knows whether more capacity exists. The request DR-2-05 takes 5 minutes: you tell us about two contract engineering vendors (20 person-months). The form creates a Capacity item and links it to the release.',
    api: 'POST /api/requests/DR-2-05/answer', watch: ['G2-07'], claims: [{ criterion: 'G2-07', from: 'FAIL', to: 'PASS' }],
    run(store) {
      const r = requests.answer(store, 'DR-2-05', { name: 'Contract engineering (2 vendors)', kind: 'team', pm: 20, avail: 90, release: 'RLS-001' }, 'Kanishk');
      return { summary: `Created ${r.created.join(', ')} and linked it to RLS-001. Capacity is now 106 person-months; 106 x 0.9 = 95.4 >= 89.` };
    },
  },
  {
    id: 'agent-ingest', title: 'An agent returns a competitor refresh (unverified)',
    narration: 'The research agent re-captured three Cloudflare values that had gone stale (India PoP depth, in-country logs, standard price). The batch is pushed through POST /api/agent/ingest. Every item arrives as origin=agent, status Draft, unverified. Gates do NOT count them yet, so the stale-value criterion does not change.',
    api: 'POST /api/agent/ingest', watch: ['G1-04b'], claims: [{ criterion: 'G1-04b', from: 'FAIL', to: 'FAIL' }],
    run(store) {
      const batch = JSON.parse(fs.readFileSync(EXAMPLE, 'utf8'));
      const r = agent.ingest(store, batch);
      return { summary: `Ingested ${r.created.length} item(s) as ${r.ingest.id}, all unverified; ${r.links.length} link(s). They sit in the verification queue.` };
    },
  },
  {
    id: 'verify', title: 'A different person verifies the queue',
    narration: 'First the tool refuses verification by the person who pushed the batch (separation of duties). Then the research analyst opens each source and verifies. Verified values become Reviewed and the stale values they supersede are retired.',
    api: 'POST /api/agent/verify/:id', watch: ['G1-04', 'G1-04b', 'G1-20'], claims: [{ criterion: 'G1-04b', from: 'FAIL', to: 'PASS' }, { criterion: 'G1-20', from: 'PASS', to: 'PASS' }],
    run(store) {
      const q = agent.queue(store);
      let refused = null;
      try { agent.verify(store, q[0].id, 'Kanishk'); } catch (e) { refused = e.message; }
      const done = [];
      for (const it of agent.queue(store)) { if (store.get(it.id).verification === 'unverified') done.push(...agent.verify(store, it.id, 'Research analyst', 'source opened, value confirmed')); }
      return { summary: `Self-verification refused: "${refused}". Research analyst then verified ${[...new Set(done)].length} record(s).`, refused };
    },
  },
  {
    id: 'clear-suspect', title: 'Suspect propagation: review what the new values touched',
    narration: 'Replacing a reviewed value is a change to an approved item, so everything that depends on it (the Cloudflare profile, the opportunity that exploits the gap) is flagged suspect. A named person reviews and confirms they are still valid. An AI agent cannot clear a flag.',
    api: 'POST /api/items/:id/clear', watch: [], claims: [],
    run(store) {
      const ctx = new Q.Ctx(store, {});
      const before = [...ctx.suspectMap().keys()];
      const gone = [];
      for (const id of before) {
        const it = store.get(id);
        if (it && ['CMP-001', 'OPP-001'].includes(id)) { suspectLib.clearItem(store, id, 'Kanishk', 'checked against the refreshed values: still valid'); gone.push(id); }
      }
      return { summary: `Suspect items before: ${before.join(', ') || 'none'}. Cleared by Kanishk: ${gone.join(', ') || 'none'}.` };
    },
  },
  {
    id: 'ac-drafts', title: 'Add the missing acceptance criteria',
    narration: 'Seven requirements (four functional Musts and the interface and data requirements) have no acceptance criteria. The DERIVED request DR-3-14 drafts a happy and a failure scenario for each; drafts do not count. The business analyst reviews them (Draft to In review) and only then do they count toward coverage.',
    api: 'POST /api/requests/DR-3-14/derive + PATCH /api/items/:id', watch: ['G3-08b', 'G3-09'], claims: [{ criterion: 'G3-08b', from: 'FAIL', to: 'PASS' }, { criterion: 'G3-09', from: 'FAIL', to: 'PASS' }],
    run(store) {
      const d = requests.runDerive(store, 'DR-3-14', 'Kanishk');
      const drafts = store.list('AcceptanceCriterion', (a) => a.origin === 'derived' && a.status === 'Draft');
      for (const a of drafts) store.update(a.id, { status: 'In review' }, { actor: 'Business analyst' });
      return { summary: `${d.message}. The business analyst reviewed ${drafts.length} derived draft(s).` };
    },
  },
  {
    id: 'flows', title: 'Cover Must requirements with flow steps and close the dead end',
    narration: 'Six Must requirements appear in no flow. The DERIVED request DR-4-10 drafts flow skeletons for the uncovered stories; FR-003 (stale-if-error) has no story, so a person adds a small flow for it. Then request DR-4-02 records what happens when the upstream scrubbing step fails, which removes the dead end in the DDoS flow.',
    api: 'POST /api/requests/DR-4-10/derive + POST /api/items + POST /api/links + POST /api/requests/DR-4-02/answer', watch: ['G4-02', 'G4-06'], claims: [{ criterion: 'G4-02', from: 'FAIL', to: 'PASS' }, { criterion: 'G4-06', from: 'FAIL', to: 'PASS' }],
    run(store) {
      const d = requests.runDerive(store, 'DR-4-10', 'Kanishk');
      const A = 'Business analyst';
      const mkI = (type, f) => store.create(type, f, { actor: A, origin: 'human' });
      const flow = mkI('Flow', { title: 'Serve stale content when the origin fails', kind: 'workflow', level: 'L2_workflow', goal: 'Users keep getting content during an origin outage', trigger_summary: 'Client requests an expired object', priority: 'Must', status: 'In review' });
      const s: any = {};
      const step = (k, kind, title, order) => { s[k] = mkI('FlowStep', { title, kind, order, status: 'In review' }); store.link('contains', flow.id, s[k].id, {}, { actor: A, silent: true }); };
      step('start', 'start', 'Client request arrives for an expired object', 1); step('d1', 'decision', 'Origin healthy?', 2); step('fetch', 'task', 'Fetch a fresh object and cache it', 3);
      step('d2', 'decision', 'Stale copy within the stale-if-error window?', 4); step('stale', 'task', 'Serve the stale object with a stale indicator', 5); step('err', 'task', 'Return 502 or 504', 6); step('end', 'end', 'Response sent', 7);
      const e = (a, b, kind, cond?) => store.link('next', s[a].id, s[b].id, { kind, ...(cond ? { condition: cond } : {}) }, { actor: A, silent: true });
      e('start', 'd1', 'happy'); e('d1', 'fetch', 'happy', 'origin healthy'); e('d1', 'd2', 'failure', 'origin returns 5xx or times out'); e('fetch', 'end', 'happy');
      e('d2', 'stale', 'happy', 'yes'); e('d2', 'err', 'alternate', 'no'); e('stale', 'end', 'happy'); e('err', 'end', 'happy');
      store.link('covers', s.stale.id, 'FR-003', {}, { actor: A, silent: true });
      const a2 = requests.answer(store, 'DR-4-02', { rows: 'STP-017 | Escalate to the CEO and keep customers informed | upstream scrubbing provider does not respond | Switch the scrubbing provider off and check customers are told and nothing is lost' }, 'Kanishk');
      return { summary: `${d.message}. Added ${flow.id} covering FR-003. DR-4-02 created ${a2.created.join(', ')} (failure edge out of STP-017).` };
    },
  },
  {
    id: 'waive-question', title: 'Waive a Must question with an owner and an expiry',
    narration: 'QST-004 (who owns the ASN?) blocks Gate 2 and nobody can answer it this month. A Must question can be resolved by a documented assumption or by a waiver. Here the sponsor waives it until 31 December 2026, accepting risk RSK-001. The condition that tracks the question stays open: waiving is not answering.',
    api: 'POST /api/questions/QST-004/resolve', watch: ['G2-14', 'GC-02'], claims: [{ criterion: 'G2-14', from: 'FAIL', to: 'PASS' }],
    run(store) {
      const r = questions.resolve(store, 'QST-004', 'waived', { rationale: 'Upstream transit contracts are under negotiation; ASN ownership is believed to be the company but cannot be confirmed before the review date.', approver: 'Anjali Rao', expiry_on: '2026-12-31', requested_by: 'Kanishk', linked_risk: 'RSK-001' }, 'Kanishk');
      return { summary: `Created ${r.waiver.id} (approver Anjali Rao, expires 2026-12-31). QST-004 is Waived; condition CND-002 is still open.` };
    },
  },
  {
    id: 'legal-attest', title: 'Legal signs the obligation register',
    narration: 'The gate criterion for the legal scan is HYBRID: the computed part (every obligation scanned for applicability) already passes, but a person in the Legal role must attest. That is a 3-minute human request (DR-1-07). Attestations are shown as attested, never as computed.',
    api: 'POST /api/requests/DR-1-07/answer', watch: ['G1-07'], claims: [{ criterion: 'G1-07', from: 'ATTEST_PENDING', to: 'PASS' }],
    run(store) {
      requests.answer(store, 'DR-1-07', { by: 'Meera Iyer', note: 'Reviewed the four obligations and the applicability calls for India.' }, 'Meera Iyer');
      return { summary: 'Meera Iyer attested G1-07 in the Legal role.' };
    },
  },
  {
    id: 'decide-gate1', title: 'Re-evaluate Gate 1 and record the decision',
    narration: 'All blocking criteria at depth L2 are now met. The decision options offered by the engine include Go. The sponsor records Go: the engine creates a baseline, advances the product to Phase 2 and the pipeline strip turns Phase 1 green.',
    api: 'POST /api/gates/1/decide', watch: ['G1-04', 'G1-04b', 'G1-07', 'G1-20'], claims: [{ criterion: 'G1-07', from: 'PASS', to: 'PASS' }],
    run(store) {
      const ev = gates.evaluateGate(store, 1);
      const rec = gates.decide(store, 1, 'go', { rationale: 'Segment, jobs, competitors, assumptions and legal scan are evidenced and verified; stale values were refreshed.' }, 'Anjali Rao');
      return { summary: `Gate 1 evaluated: ${ev.summary.mustOk}/${ev.summary.mustTotal} blocking criteria ok. Decision recorded: ${rec.decision} (baseline ${rec.baseline_id}). Product is now in phase ${store.product().current_phase}.` };
    },
  },
];

function describeSteps() {
  return STEPS.map((s, i) => ({ index: i, id: s.id, title: s.title, narration: s.narration, api: s.api, watch: s.watch, claims: s.claims }));
}

function status(store) {
  const d = store.data.demo || { index: 0 };
  return { index: d.index || 0, total: STEPS.length, steps: describeSteps(), results: d.results || {}, last: d.last || null };
}

/** Run the next step against the live store. Returns the step result with before/after and claim checks. */
function next(store) {
  const d = store.data.demo = store.data.demo || { index: 0 };
  const i = d.index || 0;
  if (i >= STEPS.length) throw Object.assign(new Error('the demo is finished; press Reset to start again'), { status: 409 });
  const step = STEPS[i];
  const watched = (st) => Object.fromEntries(step.watch.map((id) => [id, critStatus(st, id)]));
  const before = watched(store);
  const mBefore = metrics(store);
  const out = step.run(store);
  const after = watched(store);
  const mAfter = metrics(store);
  const claims = step.claims.map((c) => ({ ...c, actualFrom: before[c.criterion].status, actualTo: after[c.criterion].status, ok: before[c.criterion].status === c.from && after[c.criterion].status === c.to }));
  const result = { index: i, id: step.id, title: step.title, summary: out.summary, before, after, metricsBefore: mBefore, metricsAfter: mAfter, claims, claimsOk: claims.every((c) => c.ok) };
  d.index = i + 1;
  d.results = { ...(d.results || {}), [step.id]: result };
  d.last = result;
  store.audit('demo.step', step.id, `Demo step ${i + 1}: ${step.title}`, { actor: 'demo' });
  return result;
}

export { STEPS, describeSteps, status, next, critStatus, metrics };
