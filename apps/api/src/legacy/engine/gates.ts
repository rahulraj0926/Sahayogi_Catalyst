/**
 * engine/gates.ts - the gate engine (spec section 4).
 *
 * Criteria are DATA (data/gates.json). Each has a JSON query (the DSL below). The evaluator returns, per criterion,
 *   status  PASS | FAIL | ATTEST_PENDING | WAIVED | NA
 *   message a human sentence explaining why
 *   offenders the items that make it fail (clickable in the UI)
 * Decisions: go, go_with_conditions, hold, recycle, stop. Waivers need owner and expiry; Must questions can be
 * resolved by a documented assumption or a waiver (engine/questions.ts).
 *
 * DSL ops:  count_min, none_open, each_has_fields, exists_link, coverage, freshness, numeric_compare,
 *           categories_covered, must_questions, lint, weak_basis, values_verified, top_n_requirement,
 *           suspect_free, failure_edges_tested, flows_complete, entities_complete, handoff_ready, all.
 * To add an op: add a function to OPS. To add a criterion: add an entry to data/gates.json.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as Q from './query';
import * as coverage from './coverage';
import * as lintLib from './lint';
import * as freshness from './freshness';
import * as questions from './questions';
import * as suspectLib from './suspect';
import * as selfcheck from './selfcheck';
import { APPROVED_LIKE } from './schema';
import { addDays, dayOf } from './units';
import * as stages from './stages';

const LEVEL_ORDER = { L1: 1, L2: 2, L3: 3 };
import * as lifecycle from './lifecycle';
import * as handoff from './handoff';
const GATE_NAMES = lifecycle.GATE_NAMES; // 13 phases (0-12); Phases 0-4 keep their original names in the UI via dashboard.PHASE_NAMES
const LAST_GATE = lifecycle.LAST_GATE;

let CONFIG = null;
function config() {
  if (!CONFIG) {
    CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'gates.json'), 'utf8'));
    Q.gatesMeta.params = CONFIG.params;
  }
  return CONFIG;
}
function reloadConfig() { CONFIG = null; return config(); }
function criteria() { return config().criteria; }

// ---------- helpers ---------------------------------------------------------
const off = (it, reason) => ({ id: it.id, title: it.title || it.id, type: it.type, reason });
const ids = (arr, n = 6) => arr.slice(0, n).map((o) => o.id).join(', ') + (arr.length > n ? `, +${arr.length - n} more` : '');
const num = (x) => (Number.isInteger(x) ? String(x) : (Math.round(x * 10) / 10).toFixed(1));
const plural = (n, noun) => `${n} ${noun}`;

function emptyResult(q, noun) {
  const mode = q.emptyIs || 'fail';
  if (mode === 'pass') return { pass: true, offenders: [], message: `No ${noun}s to check.`, vacuous: true };
  if (mode === 'na') return { pass: true, na: true, offenders: [], message: `Nothing to check yet (no ${noun}).`, vacuous: true };
  return { pass: false, offenders: [], message: `There are no ${noun}s yet, so the check cannot pass.`, vacuous: true };
}

// ---------- ops ---------------------------------------------------------------
const OPS = {
  count_min(ctx, q) {
    const items = Q.select(ctx, q.sel);
    const min = Q.resolveParams(ctx, q.min);
    const pass = items.length >= min;
    return { pass, value: items.length, threshold: min, offenders: [], message: pass ? `${items.length} ${q.noun} (need at least ${min}).` : `Only ${items.length} ${q.noun}; need at least ${min}.` };
  },

  none_open(ctx, q) {
    const items = Q.select(ctx, q.sel);
    const pass = items.length === 0;
    return { pass, value: items.length, threshold: 0, offenders: items.map((i) => off(i, q.reason || `${i.status}`)), message: pass ? `No ${q.noun}.` : `${items.length} ${q.noun}: ${ids(items)}.` };
  },

  each_has_fields(ctx, q) {
    const items = Q.select(ctx, q.sel);
    if (!items.length) return emptyResult(q, q.noun);
    const offenders = [];
    for (const it of items) {
      const missing = q.fields.filter((f) => it[f] === undefined || it[f] === null || it[f] === '' || (Array.isArray(it[f]) && !it[f].length));
      if (missing.length) offenders.push(off(it, `missing ${missing.join(', ')}`));
    }
    const pass = offenders.length === 0;
    return { pass, value: items.length - offenders.length, threshold: items.length, offenders, message: pass ? `All ${items.length} ${q.noun}(s) have ${q.fields.join(', ')}.` : `${offenders.length} of ${items.length} ${q.noun}(s) are incomplete: ${offenders.slice(0, 4).map((o) => `${o.id} (${o.reason})`).join('; ')}${offenders.length > 4 ? '; ...' : ''}.` };
  },

  exists_link(ctx, q) {
    const items = Q.select(ctx, q.sel);
    if (!items.length) return emptyResult(q, q.noun);
    const spec = Q.resolveParams(ctx, q.requirement);
    const offenders = items.filter((i) => !Q.satisfies(ctx, i, spec)).map((i) => off(i, `does not satisfy: ${Q.describeSpec(spec)}`));
    const minPct = q.minPct === undefined ? 100 : q.minPct;
    const pct = Q.pct(items.length - offenders.length, items.length);
    const pass = pct >= minPct;
    return { pass, value: pct, threshold: minPct, offenders: pass ? [] : offenders, message: pass ? `${items.length - offenders.length} of ${items.length} ${q.noun}(s) ${Q.describeSpec(spec)}.` : `${offenders.length} of ${items.length} ${q.noun}(s) do not satisfy "${Q.describeSpec(spec)}": ${ids(offenders)}.` };
  },

  coverage(ctx, q) {
    const results = q.rules.map((r) => coverage.evalRule(ctx, r));
    const parts = [];
    let pass = true;
    let offenders = [];
    let vacuousAll = true;
    for (const r of results) {
      if (r.vacuous) {
        const e = emptyResult(q, r.rule.noun);
        if (!e.pass) { pass = false; parts.push(`${r.id}: ${e.message}`); } else parts.push(`${r.id}: no ${r.rule.noun}s to check`);
        continue;
      }
      vacuousAll = false;
      const groupText = Object.entries(r.groups).map(([k, g]) => `${k === 'default' ? 'all' : k} ${(g as any).met}/${(g as any).population} (need ${(g as any).threshold}%)`).join(', ');
      if (r.pass) parts.push(`${r.id} met: ${groupText}`);
      else {
        pass = false;
        parts.push(`${r.id} ${r.rule.name}: ${groupText}; ${r.failingMissing.length} ${r.rule.noun}(s) ${r.rule.missing}: ${ids(r.failingMissing)}`);
        offenders = offenders.concat(r.failingMissing.map((i) => off(i, `${r.id}: ${r.rule.missing}`)));
      }
    }
    const first = results[0];
    return { pass, na: vacuousAll && pass && q.emptyIs === 'na', value: first ? first.pct : null, threshold: first ? Math.max(...Object.values<number>(first.rule.threshold)) : null, offenders, message: parts.join('. ') + '.' };
  },

  freshness(ctx, q) {
    const items = Q.select(ctx, q.sel);
    if (!items.length) return emptyResult(q, q.noun);
    const offenders = [];
    for (const it of items) {
      const st = q.mode === 'cadence' ? freshness.stateOf(ctx.store, it, ctx.today) : null;
      if (st && st.state === 'stale') offenders.push(off(it, st.reason));
      if (st && st.state === 'unknown') offenders.push(off(it, st.reason));
    }
    const pass = offenders.length === 0;
    return { pass, value: items.length - offenders.length, threshold: items.length, offenders, message: pass ? `All ${items.length} ${q.noun}s are within their maximum age.` : `${offenders.length} of ${items.length} ${q.noun}s are stale or undated: ${ids(offenders)}.` };
  },

  numeric_compare(ctx, q) {
    const groups = Q.select(ctx, q.group);
    if (!groups.length) return emptyResult(q, q.noun || 'group');
    const agg = (g, a) => {
      let cur = [g];
      for (const step of a.walk || []) {
        const next = new Map();
        for (const it of cur) for (const o of Q.linkedItems(ctx, it, { ...step, notTerminal: true })) if (o.type) next.set(o.id, o);
        cur = [...next.values()];
      }
      cur = cur.filter((i) => (!a.type || i.type === a.type) && Q.matches(ctx, i, Q.resolveParams(ctx, a.where || null)) && (!a.counted || Q.isCounted(i, ctx)));
      let v = a.agg === 'count' ? cur.length : cur.reduce((s, i) => s + (typeof i[a.field] === 'number' ? i[a.field] : 0), 0);
      const before = v;
      if (a.mul !== undefined) v *= Q.resolveParams(ctx, a.mul);
      return { v, raw: before, items: cur };
    };
    const offenders = [];
    const lines = [];
    for (const g of groups) {
      const L = agg(g, q.left);
      const R = agg(g, q.right);
      const ok = q.cmp === '<=' ? L.v <= R.v + 1e-9 : q.cmp === '>=' ? L.v >= R.v - 1e-9 : false;
      lines.push(`${g.id}: ${q.left.label || 'left'} ${num(L.v)} ${q.unit || ''} vs ${q.right.label || 'right'} ${num(R.v)} ${q.unit || ''}${q.right.mul !== undefined ? ` (${num(R.raw)} x ${Q.resolveParams(ctx, q.right.mul)})` : ''}`);
      if (!ok) offenders.push({ ...off(g, `${q.left.label || 'left'} ${num(L.v)} exceeds ${q.right.label || 'right'} ${num(R.v)} by ${num(L.v - R.v)} ${q.unit || ''}`), left: L.v, right: R.v });
    }
    const pass = offenders.length === 0;
    return { pass, value: offenders.length ? offenders[0].left : null, threshold: offenders.length ? offenders[0].right : null, offenders, message: (pass ? 'Fits: ' : 'Does not fit: ') + lines.join('; ') + '.' };
  },

  categories_covered(ctx, q) {
    const items = Q.select(ctx, q.sel);
    const required = Q.resolveParams(ctx, q.required) || [];
    const have = new Set(items.map((i) => i[q.field]));
    const missing = required.filter((c) => !have.has(c));
    const pass = missing.length === 0;
    return { pass, value: required.length - missing.length, threshold: required.length, offenders: missing.map((c) => ({ id: c, title: c, type: 'Category', reason: `no active ${q.field} "${c}"` })), message: pass ? `All ${required.length} required ${q.noun} are covered (${required.join(', ')}).` : `Missing ${q.noun}: ${missing.join(', ')}.` };
  },

  /** For each selected item, the items linked to it must together cover every value in `required` of `field` (e.g. a screen has loading, empty, error states). */
  children_cover(ctx, q) {
    const items = Q.select(ctx, q.sel);
    if (!items.length) return emptyResult(q, q.noun);
    const required = Q.resolveParams(ctx, q.required) || [];
    const offenders = [];
    for (const it of items) {
      const kids = Q.linkedItems(ctx, it, { link: q.link, dir: q.dir || 'in', toType: q.toType, notTerminal: true }).filter((k) => k.type);
      const have = new Set(kids.map((k) => k[q.field]));
      const missing = required.filter((r) => !have.has(r));
      if (missing.length) offenders.push(off(it, `missing ${q.field}: ${missing.join(', ')}`));
    }
    const pass = offenders.length === 0;
    return { pass, value: items.length - offenders.length, threshold: items.length, offenders, message: pass ? `All ${items.length} ${q.noun}(s) cover ${required.join(', ')}.` : `${offenders.length} of ${items.length} ${q.noun}(s) are missing a ${q.field}: ${offenders.slice(0, 4).map((o) => `${o.id} (${o.reason})`).join('; ')}${offenders.length > 4 ? '; ...' : ''}.` };
  },

  /** Test cases whose most recent TestRun has an accepted result. At least `min` cases must exist. */
  latest_run(ctx, q) {
    const cases = Q.select(ctx, q.sel);
    const min = q.min === undefined ? 1 : q.min;
    if (cases.length < min) return { pass: false, value: cases.length, threshold: min, offenders: [], message: `Only ${cases.length} ${q.noun}(s); need at least ${min}.` };
    const ok = q.ok || ['Pass'];
    const offenders = [];
    for (const c of cases) {
      const runs = Q.linkedItems(ctx, c, { link: 'executes', dir: 'in', toType: 'TestRun', notTerminal: true }).filter((r) => r.type);
      runs.sort((a, b) => String(b.run_on || '').localeCompare(String(a.run_on || '')) || b.id.localeCompare(a.id, undefined, { numeric: true }));
      if (!runs.length) offenders.push(off(c, 'never run'));
      else if (!ok.includes(runs[0].result)) offenders.push(off(c, `latest run ${runs[0].id} is ${runs[0].result}`));
    }
    const pass = offenders.length === 0;
    return { pass, value: cases.length - offenders.length, threshold: cases.length, offenders, message: pass ? `All ${cases.length} ${q.noun}(s) passed on their latest run.` : `${offenders.length} of ${cases.length} ${q.noun}(s) have no passing latest run: ${ids(offenders)}.` };
  },

  must_questions(ctx, q) {
    const gate = q.gate;
    const qs = Q.select(ctx, { type: 'Question', includeTerminal: true, where: { priority: 'Must', needed_by_gate: { lte: gate } } });
    const open = []; let assumed = 0; let waived = 0;
    for (const x of qs) {
      const st = questions.effectiveState(ctx.store, x);
      if (st.state === 'open') open.push(off(x, st.reason || 'still open'));
      if (st.state === 'assumed') assumed++;
      if (st.state === 'waived') waived++;
    }
    const pass = open.length === 0;
    const extra = `${assumed} resolved by documented assumption, ${waived} by waiver`;
    return { pass, value: open.length, threshold: 0, offenders: open, message: pass ? `No open Must question needed by Gate ${gate} (${extra}).` : `${open.length} open Must question(s) needed by Gate ${gate}: ${ids(open)} (${extra}).`, extra: { assumed, waived } };
  },

  lint(ctx, q) {
    const items = Q.select(ctx, q.sel);
    if (!items.length) return emptyResult(q, q.noun);
    const offenders = [];
    for (const it of items) {
      const f = lintLib.lintItem(it, q.rules).filter((x) => (q.severity === 'High' ? x.severity === 'High' : true));
      if (f.length) offenders.push(off(it, f.map((x) => `${x.field}: ${x.message}`).join('; ')));
    }
    const pass = offenders.length === 0;
    return { pass, value: offenders.length, threshold: 0, offenders, message: pass ? `${items.length} checked, no ${q.rules.join('/')} findings.` : `${offenders.length} of ${items.length} ${q.noun}: ${offenders.slice(0, 3).map((o) => `${o.id} (${o.reason})`).join('; ')}.` };
  },

  weak_basis(ctx, q) {
    const items = Q.select(ctx, q.sel);
    if (!items.length) return emptyResult(q, 'item');
    const offenders = [];
    for (const it of items) {
      const why = [];
      if (it.basis === 'invented' || it.invented_note) why.push('invented numbers');
      if (it.basis === 'assumed' && ctx.store.out(it.id, 'assumes').length === 0) why.push('assumed numbers with no linked Assumption');
      const evs = [];
      for (const l of ctx.store.out(it.id, 'supported_by')) {
        const t = ctx.store.get(l.target);
        if (!t) continue;
        if (t.type === 'Evidence') evs.push(t);
        if (t.type === 'Insight') for (const e of ctx.store.out(t.id, 'evidences')) { const ev = ctx.store.get(e.target); if (ev) evs.push(ev); }
      }
      if (evs.length && evs.every((e) => e.origin === 'invented')) why.push(`all ${evs.length} supporting Evidence record(s) are invented`);
      if (q.requireEvidence && !evs.length) why.push('no supporting Evidence');
      if (why.length) offenders.push(off(it, why.join('; ')));
    }
    const pass = offenders.length === 0;
    return { pass, value: offenders.length, threshold: 0, offenders, message: pass ? `None of ${items.length} item(s) rests on invented evidence or numbers.` : `${offenders.length} of ${items.length} ${q.noun || 'item(s)'}: ${ids(offenders)}.` };
  },

  values_verified(ctx, q) {
    const items = Q.select(ctx, q.sel);
    if (!items.length) return emptyResult(q, 'reviewed competitor value');
    const offenders = [];
    for (const it of items) {
      const why = [];
      if (!it.verified_by) why.push('no verifier recorded');
      else if (it.verified_by === it.proposed_by && !(it.origin === 'human' && selfcheck.allowed(it.verified_by))) why.push('verified by the person who proposed it');
      else if (suspectLib.isAgentActor(it.verified_by)) why.push('verified by an AI agent');
      if (!ctx.store.out(it.id, 'supported_by').some((l) => ctx.store.get(l.target))) why.push('no supporting Evidence');
      if (why.length) offenders.push(off(it, why.join('; ')));
    }
    const pass = offenders.length === 0;
    return { pass, value: items.length - offenders.length, threshold: items.length, offenders, message: pass ? `All ${items.length} reviewed competitor values were verified by a different human and cite a source.` : `${offenders.length} of ${items.length} reviewed values are not properly verified: ${ids(offenders)}.` };
  },

  top_n_requirement(ctx, q) {
    const n = Q.resolveParams(ctx, q.n);
    const items = Q.select(ctx, q.sel).sort((a, b) => (b[q.orderBy] || 0) - (a[q.orderBy] || 0) || a.id.localeCompare(b.id)).slice(0, n);
    if (!items.length) return emptyResult(q, q.noun);
    const spec = Q.resolveParams(ctx, q.requirement);
    const offenders = items.filter((i) => !Q.satisfies(ctx, i, spec)).map((i) => off(i, `${q.orderBy} ${i[q.orderBy]}: does not satisfy "${Q.describeSpec(spec)}"`));
    const pass = offenders.length === 0;
    return { pass, value: items.length - offenders.length, threshold: items.length, offenders, message: pass ? `The top ${items.length} ${q.noun}s all ${Q.describeSpec(spec)}.` : `${offenders.length} of the top ${items.length} ${q.noun}s lack a test plan: ${ids(offenders)}.` };
  },

  suspect_free(ctx, q) {
    const gate = Q.resolveParams(ctx, q.gate);
    const approved = ctx.store.all().filter((i) => APPROVED_LIKE.has(i.status) && (i.phase === 'X' || (typeof i.phase === 'number' && i.phase <= gate)));
    const must = approved.filter((i) => i.priority === 'Must' || ['Decision', 'Obligation', 'Metric'].includes(i.type));
    const sm = ctx.suspectMap();
    const offenders = must.filter((i) => sm.has(i.id)).map((i) => off(i, `suspect: ${sm.get(i.id).map((e) => e.cause ? `${e.driver} changed (${(e.cause.fields || []).join(', ')})` : 'upstream change').join('; ')}`));
    const other = approved.filter((i) => !must.includes(i));
    const otherSuspect = other.filter((i) => sm.has(i.id));
    const otherPct = Q.pct(otherSuspect.length, other.length) || 0;
    const maxOther = q.maxOtherPct === undefined ? 2 : q.maxOtherPct;
    const pass = offenders.length === 0 && otherPct <= maxOther;
    const offAll = offenders.concat(otherPct > maxOther ? otherSuspect.map((i) => off(i, 'suspect (share of non-Must approved items too high)')) : []);
    return { pass, value: offenders.length, threshold: 0, offenders: offAll, message: pass ? `No suspect flags on approved Must items (${otherSuspect.length} suspect among ${other.length} other approved items, ${num(otherPct)}%).` : `${offenders.length} approved Must/decision/obligation/metric item(s) are suspect (${ids(offenders)}); ${num(otherPct)}% of other approved items suspect (max ${maxOther}%).` };
  },

  failure_edges_tested(ctx) {
    const store = ctx.store;
    const flows = Q.select(ctx, { type: 'Flow', where: { priority: 'Must' } });
    const offenders = [];
    let total = 0;
    for (const f of flows) {
      const g = coverage.flowGraph(store, f.id);
      for (const e of g.edges.filter((x) => x.kind === 'failure')) {
        total++;
        const ok = store.inn(e.id, 'exercises').some((l) => { const a = store.get(l.source); return a && Q.isCounted(a) && ['negative', 'edge'].includes(a.scenario_type); });
        if (!ok) offenders.push({ id: e.id, title: `${e.from} -> ${e.to} (${f.id})`, type: 'FlowEdge', reason: 'failure edge has no reviewed negative/edge AC' });
      }
    }
    const forbidden = Q.select(ctx, { type: 'Transition', where: { kind: 'forbidden' } });
    for (const t of forbidden) {
      total++;
      const ok = store.inn(t.id, 'exercises').some((l) => { const a = store.get(l.source); return a && Q.isCounted(a) && a.scenario_type === 'negative'; });
      if (!ok) offenders.push(off(t, 'forbidden transition has no reviewed negative AC'));
    }
    if (!total) return emptyResult({ emptyIs: 'fail' }, 'failure edge or forbidden transition');
    const pass = offenders.length === 0;
    return { pass, value: total - offenders.length, threshold: total, offenders, message: pass ? `All ${total} failure edges and forbidden transitions have a negative AC.` : `${offenders.length} of ${total} failure edges / forbidden transitions have no reviewed negative AC: ${ids(offenders)}.` };
  },

  flows_complete(ctx, q) {
    const flows = Q.select(ctx, q.sel);
    if (!flows.length) return emptyResult(q, 'Must flow');
    const offenders = [];
    for (const f of flows) {
      const c = coverage.flowCheck(ctx.store, f.id);
      if (!c.ok) offenders.push(off(f, `fails ${c.failing.join(', ')}${c.deadEnds.length ? `; dead end at ${c.deadEnds.join(', ')}` : ''}`));
    }
    const pass = offenders.length === 0;
    return { pass, value: flows.length - offenders.length, threshold: flows.length, offenders, message: pass ? `All ${flows.length} Must flows are structurally complete.` : `${offenders.length} of ${flows.length} Must flows are incomplete: ${offenders.map((o) => `${o.id} (${o.reason})`).join('; ')}.` };
  },

  entities_complete(ctx) {
    const list = coverage.lifecycleEntities(ctx);
    if (!list.length) return { pass: true, offenders: [], message: 'No lifecycle entities are declared.', vacuous: true };
    const bad = list.filter((e) => !e.ok);
    const pass = bad.length === 0;
    return { pass, value: list.length - bad.length, threshold: list.length, offenders: bad.map((e) => ({ id: e.entity.id, title: e.entity.title, type: 'Entity', reason: e.problems.map((p) => p.message).join('; ') })), message: pass ? `All ${list.length} lifecycle entities have a complete state model.` : `${bad.length} of ${list.length} lifecycle entities have an incomplete state model: ${bad.map((e) => e.entity.id).join(', ')}.` };
  },

  handoff_ready(ctx) {
    // lazy: handoff.js uses the gate helpers
    const r = handoff.readiness(ctx);
    if (!r.stories.length) return emptyResult({ emptyIs: 'fail' }, 'approved story');
    const bad = r.stories.filter((s) => !s.ready);
    const pass = bad.length === 0;
    return { pass, value: r.stories.length - bad.length, threshold: r.stories.length, offenders: bad.map((s) => ({ id: s.id, title: s.title, type: 'Story', reason: s.reasons.join('; ') })), message: pass ? `All ${r.stories.length} approved stories are handoff-ready.` : `${bad.length} of ${r.stories.length} approved stories are not handoff-ready: ${bad.slice(0, 3).map((s) => `${s.id} (${s.reasons[0]})`).join('; ')}.` };
  },

  all(ctx, q) {
    const rs = q.of.map((sub) => evalQuery(ctx, sub));
    const failing = rs.filter((r) => !r.pass);
    const pass = failing.length === 0;
    const allNa = rs.every((r) => r.na);
    return {
      pass, na: allNa, value: rs[0] ? rs[0].value : null, threshold: rs[0] ? rs[0].threshold : null,
      offenders: failing.flatMap((r) => r.offenders || []),
      message: (pass ? rs : failing).map((r) => r.message).join(' '),
      parts: rs.map((r) => ({ pass: r.pass, message: r.message })),
    };
  },
};

function evalQuery(ctx, q) {
  const fn = OPS[q.op];
  if (!fn) throw new Error(`unknown query op "${q.op}"`);
  return fn(ctx, q);
}

// ---------- waivers and attestations -------------------------------------------------
function waiverFor(store, crit, gate, offenders) {
  const today = store.today();
  const cands = store.list('Waiver', (w) => w.status === 'Active' && w.criterion_id === crit.id
    && (!w.expiry_on || w.expiry_on >= today) && (w.expiry_gate === undefined || w.expiry_gate >= gate)
    && (w.gate === undefined || w.gate === gate || crit.gate === 'C'));
  for (const w of cands) {
    const subj = w.subjects || [];
    if (!subj.length) return { waiver: w, remaining: [] };
    const remaining = offenders.filter((o) => !subj.includes(o.id));
    if (!remaining.length) return { waiver: w, remaining };
  }
  return null;
}

function attestationFor(store, crit, gate) {
  const today = store.today();
  return store.data.attestations.find((a) => a.criterion === crit.id && a.gate === gate && !a.withdrawn && (!a.expires_on || a.expires_on >= today)) || null;
}

// ---------- criterion and gate evaluation ------------------------------------------
function depthOf(store) {
  const p = store.product();
  return (p && p.depth_level) || 'L2';
}

function evaluateCriterion(store, crit, gate, depth, ctx) {
  const base = { id: crit.id, gate: crit.gate, text: crit.text, type: crit.type, severity: crit.severity, depth_level: crit.depth_level, v2Ref: crit.v2Ref || [], waivable: crit.waivable !== false, offenders: [] };
  if (LEVEL_ORDER[crit.depth_level] > LEVEL_ORDER[depth]) return { ...base, status: 'NA', na_reason: 'depth', message: `Not evaluated at depth ${depth} (criterion needs ${crit.depth_level}).` };
  let res = null;
  if (crit.query) {
    try { res = evalQuery(ctx, crit.query); } catch (e) { return { ...base, status: 'FAIL', message: `Criterion could not be evaluated: ${e.message}`, error: true }; }
  }
  const att = crit.attest ? attestationFor(store, crit, gate) : null;
  const out: any = { ...base, value: res ? res.value : null, threshold: res ? res.threshold : null, offenders: res ? res.offenders : [], attest_required: crit.attest || null, attested: att };
  if (crit.type === 'ATTEST') {
    out.status = att ? 'PASS' : 'ATTEST_PENDING';
    out.message = att ? `Attested by ${att.by} (${att.role}) on ${dayOf(att.at)}${att.note ? ': ' + att.note : ''}.` : `Waiting for ${crit.attest.role} to attest: "${crit.attest.statement}"`;
    return out;
  }
  if (res.na) { out.status = 'NA'; out.na_reason = 'vacuous'; out.message = res.message; return out; }
  if (crit.type === 'HYBRID') {
    const mode = crit.attest.mode;
    if (res.pass) {
      if (mode === 'and' && !att) { out.status = 'ATTEST_PENDING'; out.message = `Computed part passes (${res.message}) Waiting for ${crit.attest.role} to attest: "${crit.attest.statement}"`; return out; }
      out.status = 'PASS'; out.message = res.message + (att ? ` Attested by ${att.by}.` : ''); return out;
    }
    if (mode === 'override' && att) { out.status = 'PASS'; out.override = true; out.message = `Computed part fails (${res.message}) but ${att.by} (${att.role}) overrode it: ${att.note || 'no rationale'}.`; return out; }
    out.status = 'FAIL'; out.message = res.message + (mode === 'override' ? ` ${crit.attest.role} may override with a written rationale.` : ''); return out;
  }
  if (res.pass) { out.status = 'PASS'; out.message = res.message; return out; }
  // failing: look for a waiver
  if (crit.waivable !== false) {
    const w = waiverFor(store, crit, gate, res.offenders);
    if (w) { out.status = 'WAIVED'; out.waiver = { id: w.waiver.id, approver: w.waiver.approver, expiry_on: w.waiver.expiry_on, rationale: w.waiver.rationale, subjects: w.waiver.subjects || [] }; out.message = `Waived by ${w.waiver.approver} (${w.waiver.id}) until ${w.waiver.expiry_on || 'gate ' + w.waiver.expiry_gate}: ${w.waiver.rationale} Underlying result: ${res.message}`; return out; }
  }
  out.status = 'FAIL';
  out.message = res.message;
  return out;
}

/** Summarise results into counts and readiness. */
function summarise(results) {
  const s = { must: { PASS: 0, FAIL: 0, ATTEST_PENDING: 0, WAIVED: 0, NA: 0 }, should: { PASS: 0, FAIL: 0, ATTEST_PENDING: 0, WAIVED: 0, NA: 0 } };
  for (const r of results) s[r.severity][r.status]++;
  const evaluated = results.filter((r) => r.status !== 'NA');
  const good = evaluated.filter((r) => r.status === 'PASS' || r.status === 'WAIVED');
  return {
    ...s, total: results.length, evaluated: evaluated.length, notEvaluated: results.length - evaluated.length,
    passed: evaluated.filter((r) => r.status === 'PASS').length, failed: evaluated.filter((r) => r.status === 'FAIL').length,
    pending: evaluated.filter((r) => r.status === 'ATTEST_PENDING').length, waived: evaluated.filter((r) => r.status === 'WAIVED').length,
    readiness: evaluated.length ? Math.round((100 * good.length) / evaluated.length) : 0,
    mustTotal: evaluated.filter((r) => r.severity === 'must').length,
    mustOk: evaluated.filter((r) => r.severity === 'must' && (r.status === 'PASS' || r.status === 'WAIVED')).length,
  };
}

function eligibleDecisions(results, store, gate) {
  const mustBad = results.filter((r) => r.severity === 'must' && (r.status === 'FAIL' || r.status === 'ATTEST_PENDING'));
  const shouldBad = results.filter((r) => r.severity === 'should' && (r.status === 'FAIL' || r.status === 'ATTEST_PENDING'));
  // open follow-ups (spec 4.4): Must questions carried on an assumption or a waiver, and criteria passed only by waiver
  const carried = store.list('Question', (q) => q.priority === 'Must' && q.needed_by_gate <= gate && ['Provisional', 'Waived'].includes(q.status));
  const waived = results.filter((r) => r.status === 'WAIVED');
  const followUps = [...carried.map((q) => q.id), ...waived.map((r) => r.id)];
  if (mustBad.length) return { decisions: ['hold', 'recycle', 'stop'], reason: `${mustBad.length} blocking criteria are not met: ${mustBad.slice(0, 5).map((r) => r.id).join(', ')}${mustBad.length > 5 ? ', ...' : ''}.` };
  if (shouldBad.length || followUps.length) {
    const why = [];
    if (shouldBad.length) why.push(`${shouldBad.length} advisory criteria are open (${shouldBad.map((r) => r.id).join(', ')})`);
    if (followUps.length) why.push(`open follow-ups: ${followUps.join(', ')} (carried by assumption or waiver)`);
    return { decisions: ['go_with_conditions', 'go', 'hold', 'recycle', 'stop'], reason: 'All blocking criteria are met; ' + why.join('; ') + '.' };
  }
  return { decisions: ['go', 'hold', 'recycle', 'stop'], reason: 'All blocking and advisory criteria are met.' };
}

/** Full evaluation of one gate (common criteria included). */
function evaluateGate(store, gate, opts: any = {}) {
  const cfg = config();
  const depth = opts.depth || depthOf(store);
  const ctx = new Q.Ctx(store, { gate, depth });
  const list = cfg.criteria.filter((c) => c.gate === gate || c.gate === 'C');
  const results = list.map((c) => evaluateCriterion(store, c, gate, depth, ctx));
  const decided = store.data.gates[gate] || null;
  const summary: any = summarise(results);
  // Nothing written for this stage yet: say 0 percent, not the share of checks that pass only because there is nothing to check.
  summary.written = store.all().filter((i) => i.phase === gate && i.type !== 'Product' && !['Superseded', 'Retired', 'Deleted'].includes(i.status)).length;
  if (!summary.written) { summary.readiness_raw = summary.readiness; summary.readiness = 0; }
  const elig = eligibleDecisions(results.filter((r) => r.status !== 'NA'), store, gate);
  const mustBad = results.filter((r) => r.severity === 'must' && ['FAIL', 'ATTEST_PENDING'].includes(r.status));
  let state = decided ? decided.state : 'Open';
  let live = null;
  if (decided && ['Passed', 'Passed-with-conditions'].includes(decided.state)) live = mustBad.length ? 'at_risk' : 'consistent';
  // what a person looked at when they opened the gate; a decision made against a different picture is refused (409 stale_gate)
  const sig = crypto.createHash('sha1').update(JSON.stringify([results.map((r) => [r.id, r.status, (r.offenders || []).length]), elig.decisions, decided ? [decided.state, decided.decided_at] : null])).digest('hex').slice(0, 10);
  return {
    gate, name: GATE_NAMES[gate], sig, depth, results, summary, eligible: elig.decisions, eligibleReason: elig.reason,
    state, live_state: live, decision: decided, today: store.today(),
    blockers: mustBad.map((r) => ({ id: r.id, text: r.text, status: r.status, message: r.message, offenders: r.offenders.length })),
  };
}

function evaluateAll(store, opts = {}) {
  return [0, 1, 2, 3, 4].map((g) => evaluateGate(store, g, opts));
}

/** All 13 lifecycle gates (Phase 0-12). evaluateAll keeps returning the original five so Phase 0-4 screens are unchanged. */
function evaluateLifecycle(store, opts = {}) {
  return Array.from({ length: LAST_GATE + 1 }, (_, g) => evaluateGate(store, g, opts));
}

/** Compact effect of the depth setting on one gate: counts per level. */
function depthEffect(store, gate) {
  return ['L1', 'L2', 'L3'].map((d) => {
    const ev = evaluateGate(store, gate, { depth: d });
    return { depth: d, evaluated: ev.summary.evaluated, mustOk: ev.summary.mustOk, mustTotal: ev.summary.mustTotal, failed: ev.summary.failed, pending: ev.summary.pending, waived: ev.summary.waived, readiness: ev.summary.readiness, blockers: ev.blockers.map((b) => b.id) };
  });
}

// ---------- decisions ----------------------------------------------------------------
function baselineHash(store, gate) {
  const rows = store.all().filter((i) => i.phase === 'X' || (typeof i.phase === 'number' && i.phase <= gate)).map((i) => `${i.id}@${i.rev}`).sort();
  return crypto.createHash('sha1').update(rows.join('|')).digest('hex').slice(0, 10);
}

function createBaseline(store, gate, purpose, actor) {
  const items = store.all().filter((i) => i.phase === 'X' || (typeof i.phase === 'number' && i.phase <= gate));
  const prev = store.data.baselines.filter((b) => b.gate < gate).pop();
  const n = (store.data.counters.BSL || 0) + 1;
  store.data.counters.BSL = n;
  const b = { id: `BSL-${String(n).padStart(3, '0')}`, gate, purpose, created_at: store.now(), created_by: actor || null, item_count: items.length, approved_count: items.filter((i) => APPROVED_LIKE.has(i.status)).length, hash: baselineHash(store, gate), parent: prev ? prev.id : null };
  store.data.baselines.push(b);
  return b;
}

/**
 * Record a gate decision.
 * payload: { rationale, conditions:[{text, owner, must_close_by_gate}], recycle_to }
 */
function decide(store, gate, decision, payload: any = {}, actor) {
  if (!['go', 'go_with_conditions', 'hold', 'recycle', 'stop'].includes(decision)) throw Object.assign(new Error(`unknown decision "${decision}"`), { status: 422 });
  const ev = evaluateGate(store, gate);
  if (!ev.eligible.includes(decision)) throw Object.assign(new Error(`decision "${decision}" is not allowed: ${ev.eligibleReason} Allowed: ${ev.eligible.join(', ')}.`), { status: 409, eligible: ev.eligible });
  if (!actor) throw Object.assign(new Error('a named decider is required'), { status: 422 });
  if (decision === 'recycle' && (payload.recycle_to === undefined || payload.recycle_to > gate || payload.recycle_to < 0)) throw Object.assign(new Error('recycle needs recycle_to between 0 and the gate number'), { status: 422 });
  if (decision === 'go_with_conditions' && !(payload.conditions && payload.conditions.length)) throw Object.assign(new Error('go_with_conditions needs at least one condition'), { status: 422 });
  const prod = store.product();
  // A person cannot approve their own submission: a go needs an approver who is not the person who prepared the stage.
  // Enforced whenever the caller names an approver or submitter, and always on the HTTP route (enforce_second_person).
  const approving = ['go', 'go_with_conditions'].includes(decision);
  let approvedBy = null; let submittedBy = null;
  if (approving && (payload.enforce_second_person || payload.approver !== undefined || payload.submitted_by !== undefined)) {
    submittedBy = String(payload.submitted_by || actor).trim(); approvedBy = String(payload.approver || actor).trim();
    if (submittedBy.toLowerCase() === approvedBy.toLowerCase()) throw Object.assign(new Error(`${approvedBy} prepared this stage, so someone else has to approve it. Name a different approver (for example the sponsor).`), { status: 409, code: 'self_approval' });
  }
  if (payload.dry_run) return null;
  const rec: any = {
    gate, decision, state: null, decided_at: store.now(), decided_by: actor, rationale: payload.rationale || '', depth: ev.depth,
    snapshot: { readiness: ev.summary.readiness, mustOk: ev.summary.mustOk, mustTotal: ev.summary.mustTotal, failed: ev.blockers.map((b) => b.id), waived: ev.results.filter((r) => r.status === 'WAIVED').map((r) => r.id), pendingShould: ev.results.filter((r) => r.severity === 'should' && r.status !== 'PASS' && r.status !== 'NA').map((r) => r.id) },
    conditions: [], baseline_id: null,
    ...(approvedBy ? { approved_by: approvedBy, submitted_by: submittedBy } : {}),
  };
  if (['go', 'go_with_conditions'].includes(decision)) {
    rec.baseline_id = createBaseline(store, gate, 'gate', actor).id;
    rec.state = decision === 'go' ? 'Passed' : 'Passed-with-conditions';
    if (prod && gate < LAST_GATE) store.update(prod.id, { current_phase: gate + 1 }, { actor, silent: true });
    for (const c of payload.conditions || []) {
      const cnd = store.create('Condition', { title: c.title || c.text.slice(0, 60), text: c.text, owner: c.owner || actor, must_close_by_gate: c.must_close_by_gate === undefined ? Math.min(LAST_GATE, gate + 1) : c.must_close_by_gate, created_by_gate: gate, status: 'Open' }, { actor });
      store.ensureLink('condition_of', cnd.id, `GATE-${gate}`, {}, { actor });
      if (c.tracks) store.ensureLink('tracks', cnd.id, c.tracks, {}, { actor });
      rec.conditions.push(cnd.id);
    }
  } else if (decision === 'hold') {
    rec.state = 'Held'; rec.hold_review_by = addDays(store.today(), 14);
  } else if (decision === 'recycle') {
    rec.state = 'Recycled'; rec.recycle_to = payload.recycle_to;
    for (let g = payload.recycle_to; g <= gate; g++) if (g !== gate && store.data.gates[g]) store.data.gates[g].state = 'Reopened';
    if (prod) store.update(prod.id, { current_phase: payload.recycle_to }, { actor, silent: true });
  } else if (decision === 'stop') {
    rec.state = 'Killed';
    if (prod) store.update(prod.id, { status: 'Killed' }, { actor, silent: true });
  }
  store.data.gates[gate] = rec;
  const early = approving ? stages.outOfOrder(store).filter((w) => w.passed === gate) : [];
  if (early.length) rec.warning = early.map((w) => w.text).join(' ');
  const dec = store.create('Decision', { title: `Gate ${gate} decision: ${decision.replace(/_/g, ' ')}`, kind: 'gate', chosen: decision, rationale: payload.rationale || '', decided_on: store.today(), decider: actor, status: 'Approved' }, { actor });
  store.ensureLink('decides', dec.id, `GATE-${gate}`, {}, { actor });
  store.audit('gate.decided', `GATE-${gate}`, `${actor} decided Gate ${gate}: ${decision.replace(/_/g, ' ')} (${rec.snapshot.mustOk}/${rec.snapshot.mustTotal} blocking criteria ok)${approvedBy ? `, approved by ${approvedBy}` : ''}${rec.warning ? `. Warning: ${rec.warning}` : ''}`, { actor, decision });
  return rec;
}

function attest(store, p, actor) {
  const crit = criteria().find((c) => c.id === p.criterion);
  if (!crit || !crit.attest) throw Object.assign(new Error(`criterion ${p.criterion} does not take an attestation`), { status: 422 });
  const by = p.by || actor;
  if (!by || suspectLib.isAgentActor(by)) throw Object.assign(new Error('an attestation must be signed by a named person, not an agent'), { status: 422 });
  if (String(p.role || '').toLowerCase() !== crit.attest.role.toLowerCase()) throw Object.assign(new Error(`this attestation must be given in the role "${crit.attest.role}"`), { status: 422 });
  if (crit.attest.mode === 'override' && !p.note) throw Object.assign(new Error('an override needs a written rationale (note)'), { status: 422 });
  const gate = p.gate === undefined ? (crit.gate === 'C' ? 0 : crit.gate) : p.gate;
  store.data.attestations = store.data.attestations.filter((a) => !(a.criterion === crit.id && a.gate === gate));
  const rec = { id: `ATT-${String((store.data.counters.ATT = (store.data.counters.ATT || 0) + 1)).padStart(3, '0')}`, criterion: crit.id, gate, role: crit.attest.role, by, at: store.now(), note: p.note || '', evidence_ref: p.evidence_ref || null, expires_on: p.expires_on || null };
  store.data.attestations.push(rec);
  store.audit('gate.attested', crit.id, `${by} attested ${crit.id} as ${rec.role}`, { actor: by });
  return rec;
}

function waive(store, p, actor) {
  const crit = criteria().find((c) => c.id === p.criterion_id);
  if (!crit) throw Object.assign(new Error(`unknown criterion ${p.criterion_id}`), { status: 422 });
  if (crit.waivable === false) throw Object.assign(new Error(`${crit.id} cannot be waived (use a documented assumption or a question waiver)`), { status: 422 });
  if (!p.approver || !p.rationale || !(p.expiry_on || p.expiry_gate !== undefined)) throw Object.assign(new Error('a waiver needs approver, rationale and an expiry (date or gate)'), { status: 422 });
  const requestedBy = p.requested_by || actor;
  if (requestedBy && requestedBy === p.approver) throw Object.assign(new Error('requester and approver must be different people'), { status: 422 });
  const w = store.create('Waiver', {
    title: `Waive ${crit.id}`, kind: 'criterion_waiver', gate: p.gate === undefined ? (crit.gate === 'C' ? undefined : crit.gate) : p.gate, criterion_id: crit.id, subjects: p.subjects || [],
    rationale: p.rationale, approver: p.approver, approver_role: p.approver_role || 'Sponsor', requested_by: requestedBy,
    ...(p.expiry_on ? { expiry_on: p.expiry_on } : {}), ...(p.expiry_gate !== undefined ? { expiry_gate: p.expiry_gate } : {}), ...(p.linked_risk ? { linked_risk: p.linked_risk } : {}), status: p.pending ? 'Requested' : 'Active',
  }, { actor });
  if (p.pending) return w;
  store.audit('gate.waived', crit.id, `${p.approver} waived ${crit.id} until ${w.expiry_on || 'gate ' + w.expiry_gate}`, { actor });
  return w;
}

export { config, reloadConfig, criteria, OPS, evalQuery, evaluateCriterion, evaluateGate, evaluateAll, evaluateLifecycle, LAST_GATE, depthEffect, decide, attest, waive, depthOf, summarise, eligibleDecisions, createBaseline, GATE_NAMES, LEVEL_ORDER };
