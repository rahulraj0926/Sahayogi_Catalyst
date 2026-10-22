/**
 * scripts/seed_lib.ts - builds a product Store from a "pack" (plain data) instead of hand-typed JSON.
 *
 * Every record is created through Store.create / Store.link (so it is validated exactly like data entered in the
 * server) with origin "invented". The builder produces COMPLETE, gate-passing data for each phase up to pack.reach and
 * records gate decisions for pack.decide; packs then deliberately leave gaps through the pack.hooks callbacks (an open
 * Must question, a stale price, an unverified agent batch...) so that every product has a believable mixed gate picture.
 *
 * Pack fields (all arrays are positional rows, see the packs in scripts/packs/ for worked examples):
 *   key name mode('greenfield'|'replace') depth('L1'|'L2') currency sponsor owner reach decide[] dates{} last lastNote
 *   people[[name, category, role, needs, isSponsor]]            intake{idea, requester, problem, ...}
 *   evidence[[title, kind, class, date, grade, extra]]          insights[[text, status, confidence, [evidenceIdx]]]
 *   assumptions[[text, category, uncertainty, impact, owner, gate, method]]
 *   constraints[[kind, text, amount, unit, flexibility, owner]]  questions[[text, priority, gate, who, state, answer]]
 *   risks[[title, category, probability, impact, owner, effect]] scope0[[text, disposition, why, questionIdx]]
 *   externals[[name, provider, kind, criticality, owner]]
 *   segments personas jobs problems opportunities competitors obligations   (phase 1)
 *   objectives metrics modules releases features capacity scope2             (phase 2)
 *   nfrs interfaces dataReqs regReqs brules                                  (phase 3)
 *   actors flows entity                                                      (phase 4)
 *   hooks{ after0..after4(h) }  h = the helper object (h.S store, h.mk, h.lk, h.ref arrays) for deliberate gaps
 * Flow step codes: 'S:text' start, 'T:' task, 'D:' decision, 'E:' end, 'X:' external, 'W:' wait. Edge string: '0>1, 1>2:failure:no'.
 */
import { Store } from '../engine/store';
import * as gates from '../engine/gates';
import * as derive from '../engine/derive';
import * as requests from '../engine/requests';
import * as phases from './seed_phases';

const DEFAULT_ASOF = '2026-10-09';

function makeHelpers(pack) {
  const S = Store.fresh();
  S.data.settings.asOf = pack.asOf || DEFAULT_ASOF;
  S.data.meta.seedVersion = `${pack.key}-${S.data.settings.asOf}`;
  const actor = pack.owner || pack.sponsor || 'Kanishk';
  const h = {
    S, pack, actor,
    clock: (d) => { S._clock = `${d}T09:30:00.000Z`; },
    mk: (type, f, o = {}) => S.create(type, f, { origin: 'invented', actor, ...o }),
    lk: (type, s, t, attrs = {}) => S.link(type, s, t, attrs, { actor, silent: true }),
    many: (type, s, ts, attrs) => ts.forEach((t) => h.lk(type, s, t, attrs)),
    patch: (id, f) => S.update(id, f, { silent: true, strict: false }),
    ids: (arr, idxs) => idxs.map((i) => arr[i].id),
    date: (key, fallback) => (pack.dates && pack.dates[key]) || fallback,
    stk: [], ev: [], ins: [], asm: [], con: [], qst: [], rsk: [], scp: [], ext: [], seg: [], per: [], job: [], prb: [], opp: [], cmp: [], tsr: [], obl: [], exp: [],
    obj: [], met: [], mod: [], rel: [], ftr: [], cpc: [], req: [], fr: [], nfr: [], sty: [], ac: [], brl: [], act: [], flw: [], stp: [], ent: [], sta: [], trn: [],
  };
  return h;
}

/** Gate decision helper: decides only when the engine says the decision is allowed (so seeds never fake a pass). */
function decideIf(h, gate, on, text, conditions) {
  const pack = h.pack;
  if (!(pack.decide || []).includes(gate)) return null;
  h.clock(on);
  const ev = gates.evaluateGate(h.S, gate);
  const decision = ev.eligible.includes('go') ? 'go' : ev.eligible.includes('go_with_conditions') ? 'go_with_conditions' : null;
  if (!decision) throw new Error(`seed ${pack.key}: Gate ${gate} cannot be decided (${ev.eligibleReason})`);
  return gates.decide(h.S, gate, decision, { rationale: text, conditions: decision === 'go_with_conditions' ? (conditions || [{ text: 'Close the follow-ups carried by this decision.', owner: pack.owner }]) : [] }, pack.sponsor || pack.owner);
}

function buildFromPack(pack) {
  const h = makeHelpers(pack);
  const S = h.S;
  const reach = pack.reach === undefined ? 0 : pack.reach;
  const hooks = pack.hooks || {};
  phases.phase0(h);
  if (hooks.after0) hooks.after0(h);
  decideIf(h, 0, h.date('g0', '2026-08-01'), pack.gateText ? pack.gateText[0] : `Problem, sponsor and scope boundary are clear enough to go on to market analysis.`, pack.conditions && pack.conditions[0]);
  if (reach >= 1) {
    phases.phase1(h);
    if (hooks.after1) hooks.after1(h);
    decideIf(h, 1, h.date('g1', '2026-08-20'), pack.gateText ? pack.gateText[1] : `Customers, competitors and obligations are understood well enough to define the product.`, pack.conditions && pack.conditions[1]);
  }
  if (reach >= 2) {
    phases.phase2(h);
    if (hooks.after2) hooks.after2(h);
    decideIf(h, 2, h.date('g2', '2026-09-10'), pack.gateText ? pack.gateText[2] : `Scope is baselined and the Must set fits the capacity.`, pack.conditions && pack.conditions[2]);
  }
  if (reach >= 3) {
    phases.phase3(h);
    if (hooks.after3) hooks.after3(h);
    decideIf(h, 3, h.date('g3', '2026-09-25'), pack.gateText ? pack.gateText[3] : `Requirements are quantified, traceable and covered by acceptance criteria.`, pack.conditions && pack.conditions[3]);
  }
  if (reach >= 4) {
    phases.phase4(h);
    if (hooks.after4) hooks.after4(h);
    decideIf(h, 4, h.date('g4', '2026-10-05'), `Flows are complete and the handoff package validates.`, pack.conditions && pack.conditions[4]);
  }
  // current phase pointer follows the decided gates (gates.decide sets it); a product whose last decided gate is N is working on N+1
  // the request ledger tells the story: requests that are already satisfied by the data count as answered
  h.clock(pack.last || DEFAULT_ASOF);
  const plan = requests.plan(S);
  for (const r of plan.requests) {
    if (['HUMAN', 'DOCUMENT'].includes(r.owner_kind) && r.done && !S.data.requestState[r.id]) S.data.requestState[r.id] = { status: 'answered', at: `${h.date('start', '2026-07-01')}T10:00:00.000Z`, by: pack.owner, created: [], updated: [], warnings: [] };
    if (r.owner_kind === 'DERIVED' && r.done && !S.data.requestState[r.id]) S.data.requestState[r.id] = { status: 'derived', at: `${h.date('start', '2026-07-01')}T10:00:00.000Z`, by: pack.owner, created: [], message: 'generated by the tool' };
  }
  if (pack.lastNote) S.audit('note', null, pack.lastNote, { actor: pack.owner });
  S._clock = null;
  S.data.demo = { index: 0 };
  void derive;
  return S;
}

export { buildFromPack, makeHelpers, decideIf };
