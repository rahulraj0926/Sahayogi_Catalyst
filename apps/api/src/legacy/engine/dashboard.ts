/**
 * engine/dashboard.ts - aggregates for the home dashboard and the item-detail page.
 * Everything here is computed on request from the store; nothing is cached or hand-entered.
 */
import * as Q from './query';
import * as gates from './gates';
import * as requests from './requests';
import * as coverage from './coverage';
import * as freshness from './freshness';
import * as agent from './agent';
import * as handoff from './handoff';
import * as competitors from './competitors';
import * as suspectLib from './suspect';
import { LINK_MAP, ends } from './links';
import { TYPES } from './schema';
import * as questionsMod from './questions';
import * as pointersMod from './pointers';

const PHASE_NAMES = ['Intake / Discovery', 'Product and market analysis', 'Product definition / scope', 'Requirements', 'User and business flows'];

function itemCounts(store) {
  const byPhase = {};
  const byOrigin = {};
  for (const i of store.all()) {
    byPhase[i.phase] = (byPhase[i.phase] || 0) + 1;
    byOrigin[i.origin] = (byOrigin[i.origin] || 0) + 1;
  }
  return { total: store.all().length, links: store.links().length, byPhase, byOrigin };
}

function dashboard(store) {
  const ctx = new Q.Ctx(store, {});
  const prod = store.product();
  const depth = gates.depthOf(store);
  const evals = gates.evaluateAll(store);
  const plan = requests.plan(store, { depth });
  const phaseNo = prod && typeof prod.current_phase === 'number' ? prod.current_phase : 0;
  const counts = itemCounts(store);

  const phases = evals.map((ev, p) => {
    const t = plan.totals.current.phases[p];
    const own = store.all().filter((i) => i.phase === p).length;
    let status = 'Not started';
    if (ev.decision && ['Passed', 'Passed-with-conditions'].includes(ev.decision.state)) status = ev.decision.state === 'Passed' ? 'Complete' : 'Complete with conditions';
    else if (ev.decision && ev.decision.state === 'Held') status = 'On hold';
    else if (own > 0) status = 'In progress';
    return {
      phase: p, name: PHASE_NAMES[p], items: own, readiness: ev.summary.readiness, status, gateState: ev.state, liveState: ev.live_state,
      gate: { mustOk: ev.summary.mustOk, mustTotal: ev.summary.mustTotal, failed: ev.summary.failed, pending: ev.summary.pending, waived: ev.summary.waived, passed: ev.summary.passed, evaluated: ev.summary.evaluated, notEvaluated: ev.summary.notEvaluated },
      collection: { humanMinutes: t.humanMinutes, humanMinutesDone: t.humanMinutesDone, agentTasks: t.agentTasks, agentDone: t.agentDone, derivedTasks: t.derivedTasks, derivedDone: t.derivedDone },
      isCurrent: p === phaseNo,
    };
  });

  const gateCards = evals.map((ev) => ({
    gate: ev.gate, name: ev.name, state: ev.state, liveState: ev.live_state, depth: ev.depth, summary: ev.summary,
    blockers: ev.blockers.slice(0, 3), eligible: ev.eligible, decision: ev.decision ? { decision: ev.decision.decision, by: ev.decision.decided_by, at: ev.decision.decided_at, conditions: ev.decision.conditions } : null,
    results: ev.results.map((r) => ({ id: r.id, severity: r.severity, status: r.status, text: r.text })),
  }));

  const need = requests.ranking(plan, 8, phaseNo).map((r) => ({
    id: r.id, phase: r.phase, owner_kind: r.owner_kind, title: r.title, ask: r.ask, minutes: r.minutes, session: r.session || null, depth_level: r.depth_level,
    blocks: r.criteriaImpact, impactScore: r.impactScore, hasForm: !!r.form || !!r.link_to, link_to: r.link_to || null,
  }));

  const agentTasks = plan.requests.filter((r) => r.owner_kind === 'AGENT_RESEARCH' && r.inDepth).map((r) => ({
    id: r.id, phase: r.phase, title: r.title, status: r.status, done: r.done, minutes: 0, state: r.agent.state, items: r.agent.items, unverified: r.agent.unverified, verified: r.agent.verified, depth_level: r.depth_level,
  }));

  const openMust = Q.select(ctx, { type: 'Question', includeTerminal: true, where: { priority: 'Must' } }).map((q) => ({ q, st: questionsMod.effectiveState(store, q) }))
    .filter((x) => x.st.state === 'open' || x.st.state === 'assumed' || x.st.state === 'waived').map((x) => ({ id: x.q.id, title: x.q.title, needed_by_gate: x.q.needed_by_gate, state: x.st.state, reason: x.st.reason || null, owner: x.q.owner || x.q.asked_of || null, detail: x.st }));

  const today = store.today();
  const staleList = [];
  for (const e of store.list('Evidence')) { const st = freshness.evidenceState(e, today); if (st.state === 'stale' || st.state === 'due') staleList.push({ id: e.id, title: e.title, type: 'Evidence', state: st.state, ageDays: st.ageDays, reason: st.reason }); }
  for (const v of store.list('CompetitorCapability').concat(store.list('PricePoint'))) { if (v.status === 'Retired') continue; const st = freshness.valueState(store, v, today); if (st.state === 'stale' || st.state === 'due') staleList.push({ id: v.id, title: v.title, type: v.type, state: st.state, ageDays: st.ageDays, reason: st.reason }); }
  staleList.sort((a, b) => (a.state === 'stale' ? 0 : 1) - (b.state === 'stale' ? 0 : 1) || (b.ageDays || 0) - (a.ageDays || 0));

  const sm = ctx.suspectMap();
  const stale = ctx.staleMap();
  const suspect = [...sm.entries()].map(([id, entries]) => ({ id, title: (store.get(id) || {}).title, type: (store.get(id) || {}).type, causes: entries.map((e) => ({ driver: e.driver, fields: e.cause ? e.cause.fields : [], since: e.since })) }));

  const q = agent.queue(store);
  const ho = handoff.readiness(new Q.Ctx(store, { gate: 4 }));
  const t = plan.totals.current.all;
  const derivedItems = store.all().filter((i) => i.origin === 'derived').length;

  return {
    asOf: today, depth,
    product: prod ? { id: prod.id, name: prod.name, mode: prod.mode, track: prod.track, risk_class: prod.risk_class, depth_level: depth, current_phase: phaseNo, status: prod.status } : null,
    counts, phases, gates: gateCards, need, agentTasks, funnel: coverage.funnel(ctx), openMustQuestions: openMust,
    staleEvidence: staleList.slice(0, 12), staleCount: staleList.length,
    suspect: { count: suspect.length, items: suspect.slice(0, 8), staleCount: stale.size },
    verificationQueue: { size: q.length, items: q.slice(0, 5) },
    effort: {
      humanMinutesTotal: t.humanMinutes, humanMinutesDone: t.humanMinutesDone, humanRequests: t.humanRequests + t.documentRequests, humanRequestsDone: t.humanDone + t.documentDone,
      agentTotal: t.agentTasks, agentDone: t.agentDone, derivedItems, derivedTasks: t.derivedTasks, derivedDone: t.derivedDone, requestsTotal: t.requests, requestsDone: t.done,
      byDepth: Object.fromEntries(['L1', 'L2', 'L3'].map((d) => [d, { humanMinutes: plan.totals.byDepth[d].all.humanMinutes, humanMinutesDone: plan.totals.byDepth[d].all.humanMinutesDone }])),
      sessionsLeft: plan.sessions.map((x: any) => { const rs = plan.requests.filter((r) => r.session === x.id && r.inDepth && !r.done); return { id: x.id, title: x.title, who: x.who, minutesLeft: rs.reduce((m, r) => m + r.minutes, 0), requestsLeft: rs.length }; }).filter((x) => x.requestsLeft > 0),
    },
    activity: store.data.audit.slice(-12).reverse().map((a) => ({ at: a.at, action: a.action, subject: a.subject, summary: a.summary, actor: a.actor })),
    handoff: { ready: ho.ready, total: ho.total, stories: ho.stories.slice(0, 8) },
    competitors: (() => { const tv = competitors.tierView(store); return { counts: tv.counts, warnings: tv.warnings }; })(),
    demo: store.data.demo || { index: 0 },
  };
}

/** Which criteria/coverage rules/requests mention an item type (for "gates and dashboards that use it"). */
function usedBy(store, item) {
  const type = item.type;
  const hit = (obj) => JSON.stringify(obj).includes(`"${type}"`);
  const crits = gates.criteria().filter((c) => {
    if (c.query && hit(c.query)) return true;
    const rules = JSON.stringify(c.query || {}).match(/CR-[0-9A-Z]+/g) || [];
    return rules.some((rid) => { try { return hit(coverage.rule(rid).population) || hit(coverage.rule(rid).requirement); } catch (e) { return false; } });
  }).map((c) => ({ id: c.id, gate: c.gate, text: c.text, severity: c.severity, depth_level: c.depth_level }));
  const reqs = requests.requests().filter((r) => JSON.stringify(r.done_when).includes(`"${type}"`) || JSON.stringify(r.form || {}).includes(`"type":"${type}"`) || JSON.stringify(r.form || {}).includes(`"type": "${type}"`)).map((r) => ({ id: r.id, title: r.title, owner_kind: r.owner_kind }));
  const tiles = { Requirement: ['Traceability matrix', 'Coverage gaps', 'Funnel'], Story: ['Funnel', 'Handoff readiness'], AcceptanceCriterion: ['Funnel', 'Coverage gaps'], Question: ['Open Must questions'], Evidence: ['Stale evidence', 'Verification queue'], Competitor: ['Competitors page'], CompetitorCapability: ['Capability grid', 'Stale evidence'], PricePoint: ['Price view'], Feature: ['Capacity check', 'Funnel'], Capacity: ['Capacity check'], Flow: ['Flow viewer'], FlowStep: ['Flow viewer', 'Funnel'], Entity: ['State diagram'], State: ['State diagram'], Transition: ['State diagram'] }[type] || [];
  return { criteria: crits, requests: reqs, tiles };
}

function chain(store, id, dir, depth, seen = new Set()) {
  if (depth === 0) return [];
  const out = [];
  for (const l of store.linksOf(id)) {
    for (const e of ends(l)) {
      const [from, to] = dir === 'up' ? [e.dependent, e.driver] : [e.driver, e.dependent];
      if (from !== id || seen.has(to)) continue;
      const it = store.get(to);
      if (!it) continue;
      seen.add(to);
      out.push({ id: to, title: it.title, type: it.type, status: it.status, via: l.type, link: l.id, state: l.state, children: chain(store, to, dir, depth - 1, seen) });
    }
  }
  return out;
}

function itemDetail(store, id) {
  const item = store.get(id);
  if (!item) throw Object.assign(new Error(`item ${id} not found`), { status: 404 });
  const ctx = new Q.Ctx(store, {});
  const sm = ctx.suspectMap().get(id) || null;
  const st = ctx.staleMap().get(id) || null;
  const fr = freshness.stateOf(store, item, store.today());
  const links = store.linksOf(id).map((l) => ({
    id: l.id, type: l.type, direction: l.source === id ? 'out' : 'in', other: l.source === id ? l.target : l.source,
    otherTitle: ((store.get(l.source === id ? l.target : l.source)) || {}).title || l.target, otherType: store.getType(l.source === id ? l.target : l.source),
    attrs: l.attrs || {}, state: l.state, propagation: (LINK_MAP[l.type] || {}).propagation, cause: l.cause || null, inverse: (LINK_MAP[l.type] || {}).inverse,
  }));
  const history = store.data.audit.filter((a) => a.subject === id || (a.details && a.details.items && a.details.items.includes(id))).slice(-30).reverse();
  return {
    item, def: { prefix: TYPES[item.type].prefix, v2Ref: TYPES[item.type].v2Ref, statuses: TYPES[item.type].statuses },
    counted: Q.isCounted(item), suspect: sm, stale: st, freshness: fr, links, upstream: chain(store, id, 'up', 3), downstream: chain(store, id, 'down', 3),
    usedBy: usedBy(store, item), history,
    // confirmed pointers: the exact quotes in uploaded documents that back this item (click back to the viewer with `locator`)
    pointers: pointersMod.forItem(store, id),
  };
}

export { dashboard, itemDetail, usedBy, PHASE_NAMES, itemCounts };
