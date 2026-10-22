/**
 * engine/pstate.ts - one product's computed state, shared by next actions, the portfolio listing, the product summary
 * and the reports, so the (expensive) gate and plan evaluations run once per request.
 * snapshot(store, {cache:true}) memoises on the store by a cheap change signature; the server saves (and thereby changes the
 * signature of) the store after every mutating call.
 */
import * as Q from './query';
import * as gates from './gates';
import * as requests from './requests';
import * as agent from './agent';
import * as freshness from './freshness';
import * as questions from './questions';

function signature(store) {
  const a = store.data.audit;
  return [store._saves || 0, a.length, a.length ? a[a.length - 1].at : '', store.all().length, store.links().length, store.today(), Object.keys(store.data.gates || {}).length, JSON.stringify(store.data.documents || {}).length].join('|');
}

/** Gate-by-gate view plus the first gate that has not been passed yet. */
function nextGateOf(store) {
  let g = 0;
  while (g < 5 && store.data.gates[g] && ['Passed', 'Passed-with-conditions'].includes(store.data.gates[g].state)) g++;
  return g; // 5 = all gates passed
}

function build(store) {
  const ctx = new Q.Ctx(store, {});
  const depth = gates.depthOf(store);
  const evals = gates.evaluateAll(store);
  const plan = requests.plan(store, { depth });
  const prod = store.product();
  const phaseNo = prod && typeof prod.current_phase === 'number' ? prod.current_phase : 0;
  const today = store.today();

  const stale = [];
  for (const e of store.list('Evidence', (x) => !['Superseded', 'Retracted'].includes(x.status))) { const st = freshness.evidenceState(e, today); if (st.state === 'stale' || st.state === 'due') stale.push({ id: e.id, title: e.title, type: 'Evidence', state: st.state, ageDays: st.ageDays, reason: st.reason }); }
  for (const v of store.list('CompetitorCapability').concat(store.list('PricePoint'))) {
    if (v.status === 'Retired') continue;
    const st = freshness.valueState(store, v, today);
    if (st.state === 'stale' || st.state === 'due') stale.push({ id: v.id, title: v.title, type: v.type, state: st.state, ageDays: st.ageDays, reason: st.reason });
  }
  stale.sort((a, b) => (a.state === 'stale' ? 0 : 1) - (b.state === 'stale' ? 0 : 1) || (b.ageDays || 0) - (a.ageDays || 0));

  const suspect = [...ctx.suspectMap().entries()].map(([id, entries]) => { const it = store.get(id) || {}; return { id, title: it.title, type: it.type, status: it.status, priority: it.priority || null, causes: entries.map((e) => e.driver) }; });
  const queue = agent.queue(store);
  const openMust = store.list('Question', (q) => q.priority === 'Must').map((q) => ({ q, st: questions.effectiveState(store, q) })).filter((x) => x.st.state === 'open')
    .map((x) => ({ id: x.q.id, title: x.q.title, needed_by_gate: x.q.needed_by_gate, owner: x.q.owner || x.q.asked_of || null, reason: x.st.reason || null }));
  return { store, ctx, depth, evals, plan, prod, phaseNo, today, stale, suspect, queue, openMust, nextGate: nextGateOf(store) };
}

function snapshot(store, opts: any = {}) {
  if (!opts.cache) return build(store);
  const sig = signature(store);
  if (store._snap && store._snap.sig === sig) return store._snap.value;
  const value = build(store);
  store._snap = { sig, value };
  return value;
}

export { snapshot, nextGateOf };
