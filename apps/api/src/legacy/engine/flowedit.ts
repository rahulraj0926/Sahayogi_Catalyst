/**
 * engine/flowedit.ts - edit one flow in plain words: a list of steps (what happens, who does it, what happens next), a failure path
 * for any step ("What if this fails?") with the one-sentence safety test, add a step, remove a step.
 *
 * It saves through the same records the question forms use (Flow, FlowStep, Actor, next links, performed_by, and the "Fails safely"
 * acceptance test that exercises the failure link), so the dead-end and coverage checks (engine/coverage.ts flowCheck) keep working.
 *
 *   model(store, flowId)        -> what the editor shows
 *   save(store, flowId, body, actor) -> writes the whole list, returns the new model
 * A flow always has one start and one end. The editor never shows them as steps: "What starts it" and "How it ends" are two boxes.
 * Failure paths end in their own "stopped" step (kind end, request DR-4-02), so the step "Say what happens when a step fails" ticks.
 */
import * as coverage from './coverage';
import * as stories from './stories';

const httpErr = (status, message, extra?) => Object.assign(new Error(message), { status }, extra || {});
const clean = (s) => String(s === undefined || s === null ? '' : s).replace(/\s+/g, ' ').trim();
const FAIL_REQUEST = 'DR-4-02';

function actorKind(name) { return /\b(system|server|portal|service|scheduler|app|database|gateway|api)\b/i.test(name) ? 'system' : 'internal_user'; }

function stepsOf(store, flowId) {
  const g = coverage.flowGraph(store, flowId);
  return g;
}

/** The editor's list: steps in the order of the normal path from the start; steps not on it follow, by their order number. */
function model(store, flowId) {
  const flow = store.get(flowId);
  if (!flow || flow.type !== 'Flow') throw httpErr(404, `No such flow: ${flowId}`);
  const g = stepsOf(store, flowId);
  const byId = new Map(g.steps.map((s) => [s.id, s]));
  const failEdges = g.edges.filter((e) => e.kind === 'failure');
  const failEnds = new Set(failEdges.map((e) => e.to).filter((id) => { const s: any = byId.get(id); return s && s.kind === 'end'; }));
  const starts = g.steps.filter((s) => s.kind === 'start'); const ends = g.steps.filter((s) => s.kind === 'end' && !failEnds.has(s.id));
  const start = starts[0] || null; const end = ends[0] || null;
  // walk the normal path
  const order = []; const seen = new Set();
  const walk = (id) => {
    let guard = 0;
    while (id && !seen.has(id) && guard++ < 200) {
      seen.add(id); const s: any = byId.get(id); if (!s) break;
      if (s.kind !== 'start' && s.kind !== 'end') order.push(s);
      const out = ((g.outgoing.get(id) || []) as any).find((e) => e.kind === 'happy') || ((g.outgoing.get(id) || []) as any).find((e) => e.kind === 'alternate');
      id = out ? out.to : null;
    }
  };
  if (start) walk(start.id);
  for (const s of g.steps.filter((x) => !seen.has(x.id) && x.kind !== 'start' && x.kind !== 'end' && !failEnds.has(x.id))) { order.push(s); seen.add(s.id); }
  const actorOf = (id) => { const l = store.out(id, 'performed_by')[0]; return l ? (store.get(l.target) || {}).title || '' : ''; };
  const steps = order.map((s, i) => {
    const outs: any = g.outgoing.get(s.id) || [];
    const happy = outs.find((e) => e.kind === 'happy');
    const follower = order[i + 1] ? order[i + 1].id : null;
    let next = 'auto';
    if (happy) {
      const tgt: any = byId.get(happy.to);
      if (tgt && tgt.kind === 'end') next = i === order.length - 1 ? 'auto' : 'end';
      else if (happy.to !== follower) next = happy.to;
    }
    const f = outs.find((e) => e.kind === 'failure');
    let fail = null;
    if (f) {
      const tgt: any = byId.get(f.to);
      const ac = store.inn(f.id, 'exercises').map((l) => store.get(l.source)).find((a) => a && a.type === 'AcceptanceCriterion' && a.status !== 'Rejected');
      fail = { edge: f.id, step: f.to, text: tgt ? tgt.title : '', condition: f.condition || '', test: ac ? clean(ac.then) : '', test_id: ac ? ac.id : null };
    }
    const others = outs.filter((e) => e.kind === 'alternate' || (e.kind === 'happy' && e !== happy)).length;
    return { id: s.id, text: s.title, kind: s.kind, actor: actorOf(s.id), next, fail, other_paths: others, draft: s.status === 'Draft' };
  });
  const c = coverage.flowCheck(store, flowId);
  const problems = [];
  for (const r of c.rules.filter((x) => !x.ok)) {
    const names = (r.offenders || []).map((id) => { const s: any = byId.get(id); return s ? `"${s.title}"` : id; }).slice(0, 3).join(', ');
    const msg = { 'FC-01': 'The flow needs a start and an end.', 'FC-02': 'There is no way from the start to the end.', 'FC-03': `A step has nothing after it: ${names}. Say what happens next.`, 'FC-04': `A decision needs two or more ways out, each with its condition: ${names}.`, 'FC-05': `Say who does ${names}.`, 'FC-06': `An outside step needs a "What if this fails?" path: ${names}.`, 'FC-11': `Nothing leads to ${names}.`, 'FC-08': `${names} can never reach the end.` }[r.id];
    if (msg && ['FC-01', 'FC-02', 'FC-03', 'FC-04', 'FC-06', 'FC-08', 'FC-11', 'FC-05'].includes(r.id)) problems.push(msg);
  }
  const actors = store.list('Actor', (a) => !['Rejected', 'Deprecated', 'Retired'].includes(a.status)).map((a) => a.title);
  const withFail = steps.filter((s) => s.fail).length;
  return {
    flow: { id: flow.id, title: flow.title, goal: flow.goal || '', trigger: flow.trigger_summary || (start ? start.title : ''), priority: flow.priority || null, status: flow.status, draft: stories.isUnchanged(flow) || flow.status === 'Draft', end_text: end ? end.title : '' },
    start: start ? { id: start.id, text: start.title } : null, end: end ? { id: end.id, text: end.title } : null,
    steps, actors, problems, ok: c.ok && !problems.length, failure_paths: withFail,
    check: { ok: c.ok, failing: c.failing, dead_ends: c.deadEnds },
  };
}

function ensureActor(store, name, actor) {
  const t = clean(name); if (!t) return null;
  const hit = store.list('Actor').find((a) => clean(a.title).toLowerCase() === t.toLowerCase() && !['Rejected', 'Deprecated', 'Retired'].includes(a.status));
  if (hit) return hit;
  return store.create('Actor', { title: t, kind: actorKind(t), status: 'In review' }, { actor, origin: 'human' });
}

/** Write the editor's list. body: { title?, goal?, trigger?, end_text?, steps: [{ id?, text, actor?, next?: 'auto'|<step id>|'end', fail?: { text, condition?, test } | null }] } */
function save(store, flowId, body, actor) {
  const flow = store.get(flowId);
  if (!flow || flow.type !== 'Flow') throw httpErr(404, `No such flow: ${flowId}`);
  const before = model(store, flowId);
  const rows = Array.isArray(body.steps) ? body.steps : [];
  const problems = [];
  if (!rows.length) problems.push({ field: 'steps', message: 'Add at least one step: what someone does.' });
  rows.forEach((r, i) => {
    const n = i + 1;
    if (clean(r.text).length < 3) problems.push({ field: 'steps', row: n, col: 'text', message: `Step ${n}: say what happens, in a few words.` });
    if (r.fail && (clean(r.fail.text) || clean(r.fail.test))) {
      if (clean(r.fail.text).length < 3) problems.push({ field: 'steps', row: n, col: 'fail_text', message: `Step ${n}: say what happens when it fails.` });
      if (clean(r.fail.test).length < 8) problems.push({ field: 'steps', row: n, col: 'fail_test', message: `Step ${n}: write one sentence saying how you will check that it fails safely.` });
    }
  });
  if (problems.length) throw httpErr(422, problems.length === 1 ? problems[0].message : `${problems.length} things need fixing: ${problems.slice(0, 3).map((p) => p.message).join(' ')}`, { errors: problems });

  const snap = JSON.stringify(store.data);
  try {
    const g = stepsOf(store, flowId);
    const existing = new Map(g.steps.map((s) => [s.id, s]));
    const failEdgesAll = g.edges.filter((e) => e.kind === 'failure');
    const failEnds = new Set(failEdgesAll.map((e) => e.to));
    const mk = (type, fields) => store.create(type, { status: 'In review', ...fields }, { actor, origin: 'human' });
    // flow words
    const fpatch: any = {};
    if (body.title !== undefined && clean(body.title) && clean(body.title) !== flow.title) fpatch.title = clean(body.title).slice(0, 200);
    if (body.goal !== undefined && clean(body.goal) !== (flow.goal || '')) fpatch.goal = clean(body.goal);
    if (body.trigger !== undefined && clean(body.trigger) !== (flow.trigger_summary || '')) fpatch.trigger_summary = clean(body.trigger);
    // start and end
    let start = g.steps.find((s) => s.kind === 'start'); let end = g.steps.filter((s) => s.kind === 'end' && !failEnds.has(s.id))[0];
    if (!start) { start = mk('FlowStep', { title: clean(body.trigger) || 'Start', kind: 'start', order: 1 }); store.link('contains', flowId, start.id, {}, { actor, silent: true }); }
    else if (body.trigger !== undefined && clean(body.trigger) && clean(body.trigger) !== start.title) store.update(start.id, { title: clean(body.trigger).slice(0, 200) }, { actor, silent: true, strict: false });
    if (!end) { end = mk('FlowStep', { title: clean(body.end_text) || 'Done', kind: 'end', order: 99 }); store.link('contains', flowId, end.id, {}, { actor, silent: true }); }
    else if (body.end_text !== undefined && clean(body.end_text) && clean(body.end_text) !== end.title) store.update(end.id, { title: clean(body.end_text).slice(0, 200) }, { actor, silent: true, strict: false });
    // steps: create or update, remember the ids
    const ids = [];
    rows.forEach((r, i) => {
      let s: any = r.id && existing.has(r.id) && !failEnds.has(r.id) && (existing.get(r.id) as any).kind !== 'start' && (existing.get(r.id) as any).kind !== 'end' ? existing.get(r.id) : null;
      const text = clean(r.text).slice(0, 200);
      if (s) { const patch: any = { order: i + 2 }; if (s.title !== text) patch.title = text; if (s.status === 'Draft') patch.status = 'In review'; store.update(s.id, patch, { actor, silent: true, strict: false }); }
      else { s = mk('FlowStep', { title: text, kind: 'task', order: i + 2 }); store.link('contains', flowId, s.id, {}, { actor, silent: true }); }
      ids.push(s.id);
      const a = ensureActor(store, r.actor, actor);
      for (const l of store.out(s.id, 'performed_by')) if (!a || l.target !== a.id) store.unlink(l.id, { actor, silent: true });
      if (a) store.ensureLink('performed_by', s.id, a.id, {}, { actor, silent: true });
    });
    // steps removed from the list: delete them (and any failure end they owned); the steps before them now lead to the steps after
    const keep = new Set(ids);
    for (const s of g.steps) {
      if (s.kind === 'start' || s.kind === 'end' || keep.has(s.id) || failEnds.has(s.id)) continue;
      for (const e of g.edges.filter((x) => x.from === s.id && x.kind === 'failure')) { const t = store.get(e.to); if (t && t.kind === 'end') { for (const l of store.inn(e.id, 'exercises')) { const ac = store.get(l.source); if (ac) store.update(ac.id, { status: 'Rejected' }, { actor, silent: true, strict: false }); } store.remove(t.id, { actor }); } }
      store.remove(s.id, { actor });
    }
    // rebuild the normal-path edges between the listed steps
    const all = [start.id, ...ids];
    const live = new Set([...all, end.id]);
    for (const id of all) for (const l of store.out(id, 'next').slice()) { const k = (l.attrs && l.attrs.kind) || 'happy'; if (k === 'happy' && live.has(l.target)) store.unlink(l.id, { actor, silent: true }); else if (k === 'happy' && !store.get(l.target)) store.unlink(l.id, { actor, silent: true }); }
    const edge = (from, to, kind, condition?) => { const attrs = { kind, ...(condition ? { condition } : {}) }; store.link('next', from, to, attrs, { actor, silent: true }); };
    edge(start.id, ids[0], 'happy');
    ids.forEach((id, i) => {
      const r = rows[i]; const follower = ids[i + 1] || end.id;
      let to = follower;
      if (r.next === 'end') to = end.id;
      else if (r.next && r.next !== 'auto' && keep.has(r.next) && r.next !== id) to = r.next;
      edge(id, to, 'happy');
    });
    // failure paths
    rows.forEach((r, i) => {
      const id = ids[i]; const want = r.fail && clean(r.fail.text) ? { text: clean(r.fail.text).slice(0, 200), condition: clean(r.fail.condition), test: clean(r.fail.test) } : null;
      const cur = store.out(id, 'next').find((l) => l.attrs && l.attrs.kind === 'failure');
      if (!want) {
        if (cur) { const t = store.get(cur.target); for (const l of store.inn(cur.id, 'exercises')) { const ac = store.get(l.source); if (ac) store.update(ac.id, { status: 'Rejected' }, { actor, silent: true, strict: false }); } store.unlink(cur.id, { actor, silent: true }); if (t && t.kind === 'end' && !store.inn(t.id, 'next').length) store.remove(t.id, { actor }); }
        return;
      }
      let endStep = cur ? store.get(cur.target) : null; let l = cur;
      if (endStep && endStep.kind === 'end') { if (endStep.title !== want.text) store.update(endStep.id, { title: want.text }, { actor, silent: true, strict: false }); }
      else { endStep = mk('FlowStep', { title: want.text, kind: 'end', order: 98, request_id: FAIL_REQUEST }); store.link('contains', flowId, endStep.id, {}, { actor, silent: true }); l = store.link('next', id, endStep.id, { kind: 'failure', ...(want.condition ? { condition: want.condition } : {}) }, { actor, silent: true }); }
      if (l && cur && want.condition !== ((cur.attrs || {}).condition || '')) { store.unlink(cur.id, { actor, silent: true }); l = store.link('next', id, endStep.id, { kind: 'failure', ...(want.condition ? { condition: want.condition } : {}) }, { actor, silent: true }); }
      if (!endStep.request_id) store.update(endStep.id, { request_id: FAIL_REQUEST }, { actor, silent: true, strict: false });
      // the safety test
      const acOld = l ? store.inn(l.id, 'exercises').map((x) => store.get(x.source)).find((a) => a && a.type === 'AcceptanceCriterion' && a.status !== 'Rejected') : null;
      const fields = { title: `Fails safely: ${want.text}`.slice(0, 200), given: `a step goes wrong${want.condition ? ': ' + want.condition : ''}`, when: 'the person carries on', then: want.test, scenario_type: 'negative', kind: 'behavioural', verification_method: 'Test' };
      if (acOld) store.update(acOld.id, fields, { actor, silent: true, strict: false });
      else { const ac = mk('AcceptanceCriterion', { ...fields, request_id: FAIL_REQUEST }); store.link('exercises', ac.id, l.id, {}, { actor, silent: true }); }
    });
    // the flow itself now reads as written by a person
    const after = model(store, flowId);
    const changed = JSON.stringify({ s: before.steps, t: before.flow.trigger, e: before.flow.end_text, g: before.flow.goal, n: before.flow.title }) !== JSON.stringify({ s: after.steps, t: after.flow.trigger, e: after.flow.end_text, g: after.flow.goal, n: after.flow.title }) || Object.keys(fpatch).length > 0;
    const pf: any = { ...fpatch };
    if (flow.status === 'Draft') pf.status = 'In review';
    if (changed && flow.drafted_text !== undefined) pf.drafted_text = 'edited in the flow editor';
    if (Object.keys(pf).length) store.update(flowId, pf, { actor, silent: true, strict: false });
    store.audit('flow.edited', flowId, `${actor} edited the flow "${store.get(flowId).title}" (${rows.length} ${rows.length === 1 ? 'step' : 'steps'})`, { actor });
  } catch (e) {
    store.replaceData(JSON.parse(snap));
    throw e;
  }
  return model(store, flowId);
}

/** The flows of the product with what each still needs, for the list that opens the editor. */
function list(store) {
  return store.list('Flow', (f) => !['Rejected', 'Deprecated', 'Retired'].includes(f.status)).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })).map((f) => {
    const m = model(store, f.id);
    return { id: f.id, title: f.title, steps: m.steps.length, failure_paths: m.failure_paths, ok: m.ok, problems: m.problems, draft: m.flow.draft };
  });
}

export { model, save, list };
