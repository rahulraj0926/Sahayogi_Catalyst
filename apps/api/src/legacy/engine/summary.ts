/**
 * engine/summary.ts - plain-language summaries: the product overview (GET /api/product/summary) and the one-row
 * portfolio summary of a product (GET /api/portfolio). Everything is computed from the store on request.
 */
import * as gates from './gates';
import * as plain from './plain';
import * as stages from './stages';
import * as compose from './compose';
import * as nextactions from './nextactions';
import * as competitors from './competitors';
import { snapshot } from './pstate';
import * as handoffLib from './handoff';
import { daysBetween, dayOf } from './units';
import * as dashboardMod from './dashboard';
import * as unitsMod from './units';
import * as schemaMod from './schema';
const dashboardNames = () => dashboardMod.PHASE_NAMES;

const lastActivity = (store) => { const a = store.data.audit; return a.length ? a[a.length - 1].at : (store.product() || {}).updated_at || null; };
const daysSince = (isoOrDate, today) => (isoOrDate ? Math.max(0, daysBetween(dayOf(isoOrDate), today)) : null);
const countBy = (arr, fn) => { const m = {}; for (const x of arr) { const k = fn(x) || 'unspecified'; m[k] = (m[k] || 0) + 1; } return m; };

/** Gate-by-gate state used by the portfolio listing and reports. */
function gateStates(st) {
  return st.evals.map((ev) => ({
    gate: ev.gate, name: ev.name, state: ev.state, live_state: ev.live_state, readiness: ev.summary.readiness, must_ok: ev.summary.mustOk, must_total: ev.summary.mustTotal,
    blockers: ev.blockers.length, state_text: plain.stateText(ev), nothing_written: !ev.summary.written, decided_at: ev.decision ? ev.decision.decided_at : null, decided_by: ev.decision ? ev.decision.decided_by : null, decision: ev.decision ? ev.decision.decision : null,
  }));
}

/** Registry entry + live metrics, for GET /api/portfolio. */
function portfolioRow(entry, store, opts: any = {}) {
  const st = snapshot(store, { cache: opts.cache !== false });
  const acts = nextactions.build(store, { state: st });
  const docs = compose.list(store);
  const today = opts.today || store.today();
  const g = st.nextGate >= 5 ? 4 : st.nextGate;
  const evalNow = st.evals[g];
  const plan = st.plan.totals.current.all;
  const top = acts[0] || null;
  return {
    id: entry.id, slug: entry.slug || entry.id, name: entry.name, one_liner: entry.one_liner, kind: entry.kind, owner: entry.owner, mode: entry.mode, depth_level: entry.depth_level, thoroughness: plain.THOROUGHNESS[entry.depth_level] || entry.depth_level, archived: !!entry.archived,
    stage: entry.stage, stage_label: plain.stageLabel(entry.stage), stage_rule: plain.STAGE_RULE, stage_warnings: stages.outOfOrder(store).map((w) => w.text), stage_since: entry.stage_since, days_in_stage: daysSince(entry.stage_since, today), stage_override: !!entry.stage_override, created_at: entry.created_at,
    current_phase: st.phaseNo, readiness_percent: evalNow.summary.readiness, readiness_gate: g, gates: gateStates(st),
    top_next_action: top ? { id: top.id, kind: top.kind, title: top.title, minutes: top.minutes, why: top.why, route: top.route } : null,
    what_happens_next: nextactions.whatNext(store, acts, st),
    blocker_count: st.nextGate >= 5 ? 0 : evalNow.blockers.length, handoff: handoffLib.status(store), needed_text: st.nextGate >= 5 ? handoffLib.status(store).headline : plain.stateText(evalNow), open_must_questions: st.openMust.length,
    stale_values: st.stale.filter((s) => s.state === 'stale').length, due_values: st.stale.filter((s) => s.state === 'due').length, suspect_items: st.suspect.length,
    unverified_agent_items: st.queue.length, human_minutes_owed: plan.humanMinutes - plan.humanMinutesDone, human_minutes_total: plan.humanMinutes,
    last_activity: lastActivity(store), days_since_activity: daysSince(lastActivity(store), today),
    documents_approved: docs.filter((d) => d.status === 'approved').length, documents_total: docs.length, documents_avg_completeness: Math.round(docs.reduce((s, d) => s + d.completeness, 0) / (docs.length || 1)),
    items: store.all().length, links: store.links().length,
  };
}

const sentenceOf = (a, store) => `${unitsMod.dateWords(a.at)}: ${plain.activity(a.summary, store)}`;

/** GET /api/product/summary */
function productSummary(entry, store) {
  const st = snapshot(store);
  const prod = store.product();
  const k = (type, pred?) => store.list(type, (i) => !schemaMod.TERMINAL_STATUSES.has(i.status) && (!pred || pred(i)));
  const brief = k('IntakeBrief')[0] || null;
  const segs = k('Segment'); const pers = k('Persona');
  const primary = segs.filter((s) => s.primary);
  const scope = k('ScopeEntry'); const feats = k('Feature');
  const inScope = feats.filter((f) => !f.scope_status || f.scope_status === 'in');
  const objectives = k('Objective').map((o) => ({ id: o.id, kind: o.kind, title: o.title, statement: o.statement, status: o.status, key_results: store.inn(o.id, 'measures').map((l) => store.get(l.source)).filter((m) => m && m.type === 'Metric').map((m) => ({ id: m.id, title: m.title, target: m.target_value === undefined ? null : `${m.comparator || ''} ${m.target_value} ${m.unit || ''}`.trim(), baseline_type: m.baseline_type || null, owner: m.owner || null })) }));
  const reqs = k('Requirement');
  const tv = competitors.tierView(store);
  const docs = compose.list(store);
  const evs = st.evals;
  const timeline = evs.map((ev, i) => ({ phase: i, name: dashboardNames()[i], gate: i, gate_state: ev.state, state_text: plain.stateText(ev), nothing_written: !ev.summary.written, live_state: ev.live_state, readiness: ev.summary.readiness, decision: ev.decision ? ev.decision.decision : null, decided_on: ev.decision ? dayOf(ev.decision.decided_at) : null, decided_by: ev.decision ? ev.decision.decided_by : null, rationale: ev.decision ? ev.decision.rationale : null, conditions: ev.decision ? ev.decision.conditions : [], is_current: i === Math.min(4, st.nextGate), blockers: ev.blockers.length }));
  const acts = nextactions.build(store, { state: st });
  return {
    product: { id: entry.id, name: entry.name, kind: entry.kind, owner: entry.owner, mode: entry.mode, depth_level: entry.depth_level, thoroughness: plain.THOROUGHNESS[entry.depth_level] || entry.depth_level, stage: entry.stage, stage_label: plain.stageLabel(entry.stage), stage_since: entry.stage_since, status: prod ? prod.status : null, structure: prod ? prod.structure || null : null },
    stage_rule: plain.STAGE_RULE, stage_warnings: stages.outOfOrder(store).map((w) => ({ text: w.text, detail: w.detail, passed: w.passed, unfinished: w.unfinished })),
    one_liner: entry.one_liner || (brief ? String(brief.idea || '').split(/[.\n]/)[0] : ''),
    purpose: brief ? { text: brief.purpose || null, problem: brief.problem_statement || null, desired_outcome: brief.desired_outcome || null } : null,
    target_customers: { segments: primary.length ? primary.map((s) => ({ id: s.id, title: s.title, definition: s.definition || null })) : segs.slice(0, 3).map((s) => ({ id: s.id, title: s.title, definition: s.definition || null })), personas: pers.map((p) => ({ id: p.id, title: p.title, kind: p.kind, primary: !!p.primary })) },
    scope: {
      in: scope.filter((s) => s.disposition === 'in').map((s) => ({ id: s.id, text: s.subject_text })).concat(inScope.map((f) => ({ id: f.id, text: f.title }))).slice(0, 25),
      out: scope.filter((s) => s.disposition === 'out').map((s) => ({ id: s.id, text: s.subject_text, why: s.rationale || null })), later: scope.filter((s) => s.disposition === 'later').map((s) => ({ id: s.id, text: s.subject_text })),
      counts: { in_scope_features: inScope.length, scope_lines: scope.length },
    },
    objectives,
    headline_numbers: {
      competitors_tracked: tv.counts.total, requirements: reqs.length, requirements_by_priority: countBy(reqs, (r) => r.priority), stories: k('Story').length, acceptance_criteria: k('AcceptanceCriterion').length,
      features: feats.length, open_questions: k('Question', (q) => !['Answered', 'Withdrawn'].includes(q.status)).length, open_must_questions: st.openMust.length, risks_open: k('Risk', (r) => !['Closed'].includes(r.status)).length, assumptions_open: k('Assumption', (a) => a.status === 'Open').length,
      documents_approved: docs.filter((d) => d.status === 'approved').length, documents_total: docs.length,
    },
    stage_timeline: timeline,
    handoff: handoffLib.status(store),
    next: { what_happens_next: nextactions.whatNext(store, acts, st), top_actions: acts.slice(0, 5).map((a) => ({ id: a.id, kind: a.kind, title: a.title, minutes: a.minutes })) },
    recent_activity: store.data.audit.slice(-15).reverse().map((a) => ({ at: a.at, action: a.action, actor: a.actor, subject: a.subject, sentence: sentenceOf(a, store) })),
    documents: docs.map((d) => ({ key: d.key, title: d.title, phase: d.phase, status: d.status, completeness: d.completeness, missing_count: d.missing_count })),
  };
}

export { portfolioRow, productSummary, gateStates, lastActivity, daysSince, countBy };
