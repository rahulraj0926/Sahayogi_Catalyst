/**
 * engine/coverage.ts - coverage rules (data), flow and state-model completeness, traceability matrix,
 * gap lists and the evidence-to-flow-step funnel.
 *
 * Coverage is computed BY SUBTYPE (spec 3.8.1): functional Musts are covered by flow steps, global NFRs are
 * covered by scope (global flag or an applies_to link) plus a threshold AC, never by invented flow steps.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as Q from './query';
import { TYPES } from './schema';

let RULES = null;
function rules() {
  if (!RULES) RULES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'coverage_rules.json'), 'utf8')).rules;
  return RULES;
}
function rule(id) {
  const r = rules().find((x) => x.id === id);
  if (!r) throw new Error(`unknown coverage rule ${id}`);
  return r;
}

const brief = (it) => ({ id: it.id, title: it.title, type: it.type, status: it.status, priority: it.priority || null });

/**
 * Evaluate a coverage rule. Returns { rule, population:n, met:n, missing:[items], pct, pass, vacuous, groups }.
 * `exempt` is an optional set of item ids excluded from the population (active waivers).
 */
function evalRule(ctx, ruleOrId, exempt = new Set()) {
  const r = typeof ruleOrId === 'string' ? rule(ruleOrId) : ruleOrId;
  const pop = Q.select(ctx, r.population).filter((i) => !exempt.has(i.id));
  const groups = {};
  const missing = [];
  let met = 0;
  for (const it of pop) {
    const key = r.threshold[it.priority] !== undefined ? it.priority : 'default';
    const g = groups[key] || (groups[key] = { threshold: r.threshold[key], population: 0, met: 0, missing: [] });
    g.population++;
    if (Q.satisfies(ctx, it, r.requirement)) { g.met++; met++; } else { g.missing.push(it); missing.push(it); }
  }
  let pass = true;
  const failingMissing = [];
  for (const g of Object.values(groups)) {
    (g as any).pct = Q.pct((g as any).met, (g as any).population);
    (g as any).pass = (g as any).pct === null || (g as any).pct >= (g as any).threshold;
    if (!(g as any).pass) { pass = false; failingMissing.push(...(g as any).missing); }
  }
  return {
    rule: r, id: r.id, population: pop.length, met, missing, failingMissing,
    pct: Q.pct(met, pop.length), pass, vacuous: pop.length === 0, groups,
  };
}

// ======================================================================
// Flow structure checks (spec 3.9, FC-01 .. FC-12 subset)
// ======================================================================

function flowGraph(store, flowId) {
  const stepIds = store.out(flowId, 'contains').map((l) => l.target).filter((id) => store.get(id) && store.get(id).type === 'FlowStep');
  const steps = stepIds.map((id) => store.get(id)).sort((a, b) => (a.order || 0) - (b.order || 0));
  const set = new Set(stepIds);
  const edges = [];
  for (const s of steps) {
    for (const l of store.out(s.id, 'next')) {
      if (set.has(l.target)) edges.push({ id: l.id, from: s.id, to: l.target, kind: (l.attrs && l.attrs.kind) || 'happy', condition: (l.attrs && l.attrs.condition) || '' });
    }
  }
  const outgoing = new Map(steps.map((s) => [s.id, edges.filter((e) => e.from === s.id)]));
  const incoming = new Map(steps.map((s) => [s.id, edges.filter((e) => e.to === s.id)]));
  return { steps, edges, outgoing, incoming };
}

function reach(startIds, adj) {
  const seen = new Set(startIds);
  const q = [...startIds];
  while (q.length) {
    const x = q.pop();
    for (const y of adj(x)) if (!seen.has(y)) { seen.add(y); q.push(y); }
  }
  return seen;
}

/** Structural check of one flow. Returns rule results plus the lists the viewer shows. */
function flowCheck(store, flowId) {
  const flow = store.get(flowId);
  const g = flowGraph(store, flowId);
  const { steps, edges, outgoing, incoming } = g;
  const starts = steps.filter((s) => s.kind === 'start');
  const ends = steps.filter((s) => s.kind === 'end');
  const res = [];
  const add = (id, title, offenders, ok, detail?) => res.push({ id, title, ok, offenders, detail: detail || (ok ? 'ok' : `${offenders.length} problem(s)`) });

  add('FC-01', 'At least one start and one end step', [], starts.length >= 1 && ends.length >= 1,
    starts.length >= 1 && ends.length >= 1 ? `${starts.length} start, ${ends.length} end` : `needs a start step and an end step (has ${starts.length} start, ${ends.length} end)`);

  const forward = reach(starts.map((s) => s.id), (x) => ((outgoing.get(x) || []) as any).map((e) => e.to));
  const backward = reach(ends.map((s) => s.id), (x) => ((incoming.get(x) || []) as any).map((e) => e.from));

  const noPath = starts.filter((s) => !ends.some((e) => forward.has(e.id)) || !backward.has(s.id)).map((s) => s.id);
  add('FC-02', 'Every start has a path to an end', noPath, noPath.length === 0);

  const deadEnds = steps.filter((s) => s.kind !== 'end' && ((outgoing.get(s.id) || []) as any).length === 0).map((s) => s.id);
  add('FC-03', 'No dead end: every non-end step has an outgoing edge', deadEnds, deadEnds.length === 0,
    deadEnds.length ? `dead end at ${deadEnds.join(', ')}` : 'ok');

  const badDecisions = steps.filter((s) => s.kind === 'decision').filter((s) => {
    const out: any = outgoing.get(s.id) || [];
    return out.length < 2 || out.some((e) => !e.condition);
  }).map((s) => s.id);
  add('FC-04', 'Decision steps have two or more guarded outgoing edges', badDecisions, badDecisions.length === 0);

  const noActor = steps.filter((s) => ['task', 'decision', 'external'].includes(s.kind) && store.out(s.id, 'performed_by').length === 0).map((s) => s.id);
  add('FC-05', 'Task, decision and external steps have an actor', noActor, noActor.length === 0);

  const noFailure = steps.filter((s) => s.kind === 'external' && !((outgoing.get(s.id) || []) as any).some((e) => e.kind === 'failure')).map((s) => s.id);
  add('FC-06', 'External steps have a failure edge', noFailure, noFailure.length === 0);

  const unreachable = steps.filter((s) => s.kind !== 'start' && !forward.has(s.id)).map((s) => s.id);
  add('FC-11', 'No step is unreachable from a start', unreachable, unreachable.length === 0);

  const trapped = steps.filter((s) => s.kind !== 'end' && forward.has(s.id) && !backward.has(s.id) && ((outgoing.get(s.id) || []) as any).length > 0).map((s) => s.id);
  add('FC-08', 'No loop without an exit: every step can reach an end', trapped, trapped.length === 0,
    trapped.length ? `steps that can never reach an end: ${trapped.join(', ')}` : 'ok');

  const hasFailure = edges.some((e) => e.kind === 'failure');
  const missingFailurePaths = [
    ...noFailure.map((id) => ({ step: id, reason: 'external call without a failure edge' })),
    ...(!hasFailure && steps.some((s) => s.kind === 'external' || s.kind === 'decision') ? [{ step: null, reason: 'the flow has no failure path at all' }] : []),
  ];

  // structural pass = rules used by gate G4-06
  const gateRules = ['FC-01', 'FC-02', 'FC-03', 'FC-04', 'FC-06', 'FC-08', 'FC-11'];
  const failing = res.filter((r) => gateRules.includes(r.id) && !r.ok);
  return {
    flow: flow ? brief(flow) : { id: flowId }, steps: steps.map((s) => ({ ...s })), edges, rules: res,
    deadEnds, unreachable, trapped, missingFailurePaths, ok: failing.length === 0, failing: failing.map((r) => r.id),
  };
}

// ======================================================================
// Entity / state model (CR-30, CR-32)
// ======================================================================
function entityCheck(store, entityId, ctx) {
  const entity = store.get(entityId);
  const states = store.inn(entityId, 'of_entity').map((l) => store.get(l.source)).filter(Boolean);
  const stateIds = new Set(states.map((s) => s.id));
  const transitions = [];
  for (const s of states) {
    for (const l of store.inn(s.id, 'from_state')) {
      const t = store.get(l.source);
      if (t && !transitions.includes(t)) transitions.push(t);
    }
  }
  const tInfo = transitions.map((t) => {
    const from = store.out(t.id, 'from_state')[0];
    const to = store.out(t.id, 'to_state')[0];
    return { id: t.id, title: t.title, kind: t.kind, from: from && from.target, to: to && to.target, trigger_kind: t.trigger_kind, tested: store.inn(t.id, 'exercises').length > 0 };
  });
  const problems = [];
  const initial = states.filter((s) => s.initial);
  const terminal = states.filter((s) => s.terminal);
  if (states.length === 0) problems.push({ rule: 'CR-30', message: 'entity has no states' });
  if (initial.length !== 1) problems.push({ rule: 'CR-30', message: `needs exactly one initial state (has ${initial.length})` });
  if (terminal.length < 1) problems.push({ rule: 'CR-30', message: 'needs at least one terminal state' });
  for (const t of tInfo) {
    if (!t.from || !t.to) problems.push({ rule: 'CR-30', message: `${t.id} is missing from_state or to_state`, items: [t.id] });
    else if (!stateIds.has(t.to)) problems.push({ rule: 'CR-30', message: `${t.id} leads to a state of another entity`, items: [t.id] });
  }
  for (const s of states) {
    if (!s.terminal && !tInfo.some((t) => t.from === s.id && t.kind !== 'forbidden')) problems.push({ rule: 'CR-30', message: `non-terminal state ${s.id} "${s.title}" has no outgoing transition`, items: [s.id] });
  }
  const untestedForbidden = tInfo.filter((t) => t.kind === 'forbidden' && !t.tested).map((t) => t.id);
  for (const id of untestedForbidden) problems.push({ rule: 'CR-32', message: `forbidden transition ${id} has no negative acceptance criterion`, items: [id] });
  return {
    entity: entity ? brief(entity) : { id: entityId }, states: states.map((s) => ({ id: s.id, title: s.title, initial: !!s.initial, terminal: !!s.terminal, status: s.status })),
    transitions: tInfo, problems, ok: problems.length === 0,
  };
}

/** All entities with has_lifecycle=true, checked. */
function lifecycleEntities(ctx) {
  return Q.select(ctx, { type: 'Entity', where: { has_lifecycle: true } }).map((e) => entityCheck(ctx.store, e.id, ctx));
}

// ======================================================================
// Traceability matrix, gaps and funnel
// ======================================================================

/** Cell state: ok | gap | draft (exists but not counted) | exempt | na. */
function cell(ctx, item, spec, opts: any = {}) {
  const all = Q.linkedItems(ctx, item, { ...spec, counted: false });
  const counted = Q.linkedItems(ctx, item, { ...spec, counted: true });
  if (counted.length) return { state: 'ok', n: counted.length, ids: counted.map((x) => x.id) };
  if (all.length) return { state: 'draft', n: all.length, ids: all.map((x) => x.id) };
  return { state: opts.na ? 'na' : 'gap', n: 0, ids: [] };
}

function matrix(ctx) {
  const reqs = Q.select(ctx, { type: 'Requirement' }).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  const rows = reqs.map((r) => {
    const cross = r.subtype === 'non_functional' || r.subtype === 'regulatory' || r.subtype === 'data' || r.flow_applicability === 'cross_cutting' || r.flow_applicability === 'not_applicable';
    const flowCell = r.subtype === 'non_functional'
      ? ((r.global || ctx.store.out(r.id, 'applies_to').length) ? { state: 'ok', n: r.global ? 1 : ctx.store.out(r.id, 'applies_to').length, ids: ctx.store.out(r.id, 'applies_to').map((l) => l.target), mode: 'scope' } : { state: 'gap', n: 0, ids: [], mode: 'scope' })
      : (cross && r.flow_applicability && r.flow_applicability !== 'flow' ? { state: 'exempt', n: 0, ids: [], mode: 'exempt', reason: r.flow_reason || '' } : { ...cell(ctx, r, { link: 'covers', dir: 'in', toType: 'FlowStep' }), mode: 'flow' });
    return {
      id: r.id, title: r.title, subtype: r.subtype, priority: r.priority, status: r.status,
      provenance: cell(ctx, r, { link: 'derives_from', dir: 'out' }),
      story: cell(ctx, r, { link: 'elaborates', dir: 'in', toType: 'Story' }, { na: r.subtype !== 'functional' }),
      ac: cell(ctx, r, { link: 'specifies', dir: 'in', toType: 'AcceptanceCriterion' }),
      flow: flowCell,
      scope: (r.global || ctx.store.out(r.id, 'applies_to').length) ? 'scoped' : (r.subtype === 'non_functional' ? 'unscoped' : ''),
      suspect: ctx.isSuspect(r.id),
    };
  });
  return rows;
}

/** Gap lists used by the traceability page and the dashboard. */
function gaps(ctx) {
  const store = ctx.store;
  const missingOf = (id) => evalRule(ctx, id).missing.map(brief);
  const storiesNoFlow = Q.select(ctx, { type: 'Story' }).filter((s) => {
    if (store.inn(s.id, 'covers').length) return false;
    const reqs = store.out(s.id, 'elaborates').map((l) => store.get(l.target)).filter((x) => x && x.type === 'Requirement');
    return !(reqs.length && reqs.every((r) => store.inn(r.id, 'covers').length));
  }).map(brief);
  const orphanTypes = new Set(['Product', 'Artifact', 'Release', 'Handoff', 'Waiver', 'Condition', 'Decision', 'ChangeRequest', 'TrackedSource', 'Stakeholder', 'ExternalSystem', 'Module', 'Actor']);
  const orphans = Q.select(ctx, {}).filter((i) => !orphanTypes.has(i.type) && store.linksOf(i.id).length === 0).map(brief);
  const nfrs = Q.select(ctx, { type: 'Requirement', subtype: 'non_functional' }).map((n) => ({
    ...brief(n), global: !!n.global, scope: store.out(n.id, 'applies_to').map((l) => ({ id: l.target, title: (store.get(l.target) || {}).title, type: store.getType(l.target) })),
    ac: store.inn(n.id, 'specifies').map((l) => l.source).length,
  }));
  return {
    requirementsWithoutAC: missingOf('CR-12'),
    requirementsWithoutStory: missingOf('CR-13'),
    requirementsWithoutProvenance: missingOf('CR-11'),
    mustRequirementsNotInFlow: missingOf('CR-28'),
    storiesWithoutFlowCoverage: storiesNoFlow,
    storiesIncomplete: missingOf('CR-20'),
    nfrUnscopedOrUnverified: missingOf('CR-14'),
    orphans,
    nfrs,
    entities: lifecycleEntities(ctx).filter((e) => !e.ok).map((e) => ({ id: e.entity.id, title: e.entity.title, problems: e.problems.map((p) => p.message) })),
    flows: Q.select(ctx, { type: 'Flow' }).map((f) => ({ f, c: flowCheck(store, f.id) })).filter((x) => !x.c.ok).map((x) => ({ id: x.f.id, title: x.f.title, failing: x.c.failing, deadEnds: x.c.deadEnds })),
  };
}

/** Evidence -> insight -> feature -> requirement -> story -> AC -> flow step, with drop-offs. */
function funnel(ctx) {
  const store = ctx.store;
  const has = (id, link, dir, pred?) => (dir === 'in' ? store.inn(id, link) : store.out(id, link)).some((l) => {
    const o = store.get(dir === 'in' ? l.source : l.target);
    return o && (!pred || pred(o));
  });
  const stages = [];
  const mk = (name, type, items, nextName, nextTest, note) => {
    const linked = items.filter(nextTest);
    stages.push({ name, type, total: items.length, continuing: linked.length, dropped: items.filter((i) => !nextTest(i)).map(brief), next: nextName, note: note || null });
  };
  const evidence = Q.select(ctx, { type: 'Evidence' });
  const insights = Q.select(ctx, { type: 'Insight' });
  const features = Q.select(ctx, { type: 'Feature' });
  const reqs = Q.select(ctx, { type: 'Requirement' });
  const stories = Q.select(ctx, { type: 'Story' });
  const acs = Q.select(ctx, { type: 'AcceptanceCriterion' });
  const steps = Q.select(ctx, { type: 'FlowStep', where: { kind: ['task', 'external', 'decision'] } });
  mk('Evidence', 'Evidence', evidence, 'Insight', (e) => has(e.id, 'evidences', 'in'), 'evidence that fed an insight');
  mk('Insight', 'Insight', insights, 'Feature', (i) => store.out(i.id, 'raises').some((l) => has(l.target, 'realizes', 'in')), 'insight -> opportunity -> feature');
  mk('Feature', 'Feature', features, 'Requirement', (f) => has(f.id, 'derives_from', 'in', (o) => o.type === 'Requirement'), 'feature with at least one requirement');
  mk('Requirement', 'Requirement', reqs, 'Story', (r) => r.subtype !== 'functional' || has(r.id, 'elaborates', 'in'), 'functional requirements need a story; other subtypes are scoped, not storied');
  mk('Story', 'Story', stories, 'Acceptance criterion', (s) => has(s.id, 'specifies', 'in'), 'story with at least one AC');
  mk('Acceptance criterion', 'AcceptanceCriterion', acs, 'Flow step', (a) => store.out(a.id, 'exercises').length > 0 || store.out(a.id, 'specifies').some((l) => has(l.target, 'covers', 'in')), 'AC whose target is exercised or covered in a flow');
  stages.push({ name: 'Flow step', type: 'FlowStep', total: steps.length, continuing: steps.filter((s) => store.out(s.id, 'covers').length > 0).length, dropped: steps.filter((s) => store.out(s.id, 'covers').length === 0).map(brief), next: null, note: 'steps that trace to a requirement or story' });
  return stages;
}

export { rules, rule, evalRule, flowCheck, flowGraph, entityCheck, lifecycleEntities, matrix, gaps, funnel, brief };
