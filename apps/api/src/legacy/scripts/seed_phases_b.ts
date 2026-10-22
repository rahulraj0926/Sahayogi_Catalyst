/** scripts/seed_phases_b.ts - phases 2, 3 and 4 of the pack builder (see seed_lib.js for the pack format). */
import * as derive from '../engine/derive';
import { plus } from './seed_phases_a';

/** Resolve a code such as 'obj:0' or 'opp:1' to an item id. */
function ref(h, code) {
  const [k, i] = code.split(':');
  const arr = { obj: h.obj, met: h.met, opp: h.opp, obl: h.obl, con: h.con, prb: h.prb, asm: h.asm, ext: h.ext, ftr: h.ftr, fr: h.fr, sty: h.sty, per: h.per, mod: h.mod, rel: h.rel, ent: h.ent, act: h.act, req: h.req }[k];
  if (!arr || !arr[Number(i)]) throw new Error(`bad reference ${code}`);
  return arr[Number(i)].id;
}

function phase2(h) {
  const { S, pack } = h;
  const d = plus(h.date('g1', '2026-08-20'), 3);
  h.clock(d);
  for (const [kind, title, statement, status] of pack.objectives || []) h.obj.push(h.mk('Objective', { title, kind, statement, status: status || 'Approved', horizon: kind === 'vision' ? '3 years' : '12 months' }));
  (pack.metrics || []).forEach(([title, unit, bt, bv, target, op, owner, method, objIdx]) => {
    const m = h.mk('Metric', { title, definition: title, unit, use: 'key_result', baseline_type: bt, ...(bv !== null && bv !== undefined ? { baseline_value: bv } : {}), ...(bt === 'none_new_product' ? { baseline_reason: 'new product, no baseline exists yet' } : {}), target_value: target, comparator: op, owner, cadence: 'monthly', measurement_method: method, status: 'In review' });
    h.met.push(m); h.lk('measures', m.id, h.obj[objIdx].id);
  });
  for (const [name, desc] of pack.modules || []) h.mod.push(h.mk('Module', { title: name, boundary_description: desc, owner: pack.owner, status: 'In review' }));
  for (const [title, mvp, start, end] of pack.releases || []) h.rel.push(h.mk('Release', { title, order: h.rel.length + 1, is_mvp: !!mvp, window_start: start, window_end: end, status: 'Planned' }));
  (pack.features || []).forEach((f) => {
    const scope = f.scope || 'in';
    const ft = h.mk('Feature', { title: f.name, level: 'feature', description: f.desc || undefined, priority: f.pri, effort_pm: f.eff, effort_confidence: 'medium', scope_status: scope, status: scope === 'out' ? 'Rejected' : (f.status || 'Approved'), ...(f.mandatory ? { mandatory: true } : {}) });
    h.ftr.push(ft);
    h.lk('belongs_to', ft.id, h.mod[f.module].id);
    for (const c of f.supports || []) h.lk('supports', ft.id, ref(h, c));
    for (const c of f.realizes || []) h.lk('realizes', ft.id, ref(h, c));
    for (const c of f.addresses || []) h.lk('addresses', ft.id, ref(h, c));
    if (scope === 'in') h.lk('planned_in', ft.id, h.rel[Math.min(f.release === undefined ? (f.pri === 'Must' ? 0 : Math.min(1, h.rel.length - 1)) : f.release, h.rel.length - 1)].id);
  });
  // functions of the existing system (only packs for a replacement product have them): how it works today, what is wrong, a decision, the target
  (pack.systemFunctions || []).forEach((f) => {
    const fn = h.mk('SystemFunction', { title: f.name, area: f.area, how_it_works: f.how, whats_wrong: f.wrong || undefined, decision: f.decision, target_behaviour: f.target || undefined, owner: f.owner, status: f.confirmed ? 'Validated' : 'Assumed', ...(f.confirmed ? { verification: 'verified', verified_by: f.confirmed, verified_on: h.date('g1', '2026-08-20') } : {}) });
    if (f.feature !== undefined && h.ftr[f.feature]) h.lk('replaces', h.ftr[f.feature].id, fn.id);
  });
  (pack.differentiates || []).forEach(([fIdx, cIdx, cellIdx, rating]) => { const target = cellIdx === null || cellIdx === undefined ? h.cmp[cIdx].item : h.cmp[cIdx].cells[cellIdx]; h.lk('differentiates', h.ftr[fIdx].id, target.id, { rating }); });
  (pack.capacity || []).forEach(([title, kind, fte, avail, pm]) => { const c = h.mk('Capacity', { title, kind, period_start: pack.releases && pack.releases[0] ? pack.releases[0][2] : undefined, period_end: pack.releases && pack.releases[0] ? pack.releases[0][3] : undefined, headcount: fte, availability_pct: avail, person_months: pm, status: 'Approved' }); h.cpc.push(c); h.lk('staffed_by', h.rel[0].id, c.id); if (h.con[0]) h.lk('bounded_by', c.id, h.con.find((x) => x.kind === 'budget' || x.kind === 'date').id); });
  // scope lines: out / later with reason, impact and justification
  (pack.scope2 || []).forEach(([text, disp, impact, why, just, ftrIdx]) => { const s = h.mk('ScopeEntry', { title: text, kind: 'scope', subject_text: text, disposition: disp, rationale: why, exclusion_impact: impact, decider: pack.sponsor, status: 'In review' }); h.lk('justified_by', s.id, ref(h, just)); if (ftrIdx !== undefined && ftrIdx !== null) h.lk('scopes', s.id, h.ftr[ftrIdx].id); h.scp.push(s); });
  // constraints reach the product; high-impact assumptions have dependents
  for (const c of h.con.filter((x) => x.status === 'Confirmed' && ['regulatory', 'technology', 'budget', 'date'].includes(x.kind))) h.lk('constrains', c.id, 'PRJ-001');
  const hi = h.asm.filter((a) => a.impact >= 4);
  hi.forEach((a, i) => { const f = h.ftr[i % h.ftr.length]; if (f) h.lk('assumes', f.id, a.id); });
  if (pack.baselineDecision !== false) h.mk('Decision', { title: 'Scope baseline', kind: 'product', chosen: `${h.ftr.filter((f) => f.scope_status === 'in').length} features in version 1`, rationale: pack.baselineWhy || 'The Must set fits the available capacity and the open questions are settled or carried.', decided_on: plus(d, 14), decider: pack.sponsor, status: pack.baselineStatus || 'Approved' });
  h.clock(plus(d, 15));
  if (pack.artifacts !== false) derive.run(S, 'assemble_artifact', { kind: 'product_definition' }, h.actor);
  derive.run(S, 'feature_scores', {}, h.actor);
  const art = S.list('Artifact', (a) => a.kind === 'product_definition')[0];
  if (art) h.patch(art.id, { status: (pack.reach || 0) >= 3 ? 'Approved' : 'In review' });
}

const AC_STATUS = (h, st) => st || 'Approved';

function phase3(h) {
  const { S, pack } = h;
  const d = plus(h.date('g2', '2026-09-10'), 3);
  h.clock(d);
  const reqStatus = pack.reqStatus || 'Approved';
  const make = (sub, title, statement, pri, extra0, o = {}) => { const extra = Object.fromEntries(Object.entries(extra0).filter(([, v]) => v !== undefined)); return h.mk('Requirement', { title, statement, priority: pri, status: extra.status || reqStatus, flow_applicability: sub === 'functional' || sub === 'interface' ? 'flow' : 'cross_cutting', ...(sub === 'functional' || sub === 'interface' ? {} : { flow_reason: 'Cross-cutting: covered by scope and verification, not by a flow step' }), ...extra }, { subtype: sub, ...o }); };
  const personaOf = (f) => h.per[f.persona === undefined ? 0 : f.persona];
  (pack.features || []).forEach((f, i) => {
    if (!f.fr || (f.scope && f.scope !== 'in')) { h.fr[i] = null; return; }
    const fr = make('functional', f.name, f.fr, f.pri, { status: f.frStatus });
    h.fr[i] = fr; h.req.push(fr);
    h.lk('derives_from', fr.id, h.ftr[i].id);
    h.lk('belongs_to', fr.id, h.mod[f.module].id);
    if (f.pri === 'Must') h.lk('planned_in', fr.id, h.rel[0].id);
    if (f.want && ['Must', 'Should'].includes(f.pri)) {
      const sty = h.mk('Story', { title: f.storyTitle || f.name, want: f.want, benefit: f.benefit || 'so that the work gets done correctly the first time', priority: f.pri, estimate: f.points || 5, status: f.styStatus || 'Approved' });
      h.sty[i] = sty; h.lk('for_persona', sty.id, personaOf(f).id); h.lk('elaborates', sty.id, fr.id);
      if (f.pri === 'Must') h.lk('planned_in', sty.id, h.rel[0].id);
    }
    (f.ac || []).forEach(([scen, given, when, then, st]) => {
      const ac = h.mk('AcceptanceCriterion', { title: `${f.name}: ${scen}`, scenario_type: scen, kind: 'behavioural', given, when, then, verification_method: 'Test', status: AC_STATUS(h, st || f.acStatus) });
      h.ac.push(ac); h.lk('specifies', ac.id, fr.id); if (h.sty[i]) h.lk('specifies', ac.id, h.sty[i].id);
    });
  });
  (pack.nfrs || []).forEach((n) => {
    const r = make('non_functional', n.title, `The ${n.cat} target for ${n.metric} shall be ${n.op} ${n.target} ${n.unit}${n.pct ? ' (' + n.pct + ')' : ''}.`, n.pri || 'Must', {
      category: n.cat, metric: n.metric, comparator: n.op, target_value: n.target, unit: n.unit, ...(n.pct ? { percentile: n.pct } : {}), window: n.window || 'monthly', condition: n.cond, environment: n.env || 'production', measurement_point: n.point, ...(n.tool ? { measurement_tool: n.tool } : {}), basis: n.basis || 'benchmarked', contractual: !!n.contractual, ...(n.global ? { global: true } : {}), status: n.status,
    }, n.strict === false ? { strict: false } : {});
    h.nfr.push(r); h.req.push(r);
    h.lk('derives_from', r.id, n.derives ? ref(h, n.derives) : h.obj[0].id);
    if (!n.global) for (const fi of n.applies || [0]) h.lk('applies_to', r.id, h.ftr[fi].id);
    for (const a of n.assumes || []) h.lk('assumes', r.id, h.asm[a].id);
    const ac = h.mk('AcceptanceCriterion', { title: `${n.title}: threshold`, scenario_type: 'happy', kind: 'threshold', given: n.acGiven || 'a representative month of production measurements', when: 'the metric is computed at the measurement point', then: `${n.metric} is ${n.op} ${n.target} ${n.unit}`, verification_method: 'Test', status: n.acStatus || 'Approved' });
    h.ac.push(ac); h.lk('specifies', ac.id, r.id);
  });
  (pack.interfaces || []).forEach((n) => {
    const r = make('interface', n.title, n.statement, n.pri || 'Must', { counterparty: n.counterparty, direction: n.direction, protocol: n.protocol, failure_handling: n.failure });
    h.req.push(r); h.lk('integrates_with', r.id, h.ext[n.ext].id); h.lk('derives_from', r.id, h.ftr[n.feature || 0].id);
    h.lk('planned_in', r.id, h.rel[0].id);
    const ac = h.mk('AcceptanceCriterion', { title: `${n.title}: interface check`, scenario_type: 'happy', kind: 'behavioural', given: n.acGiven || `the ${n.counterparty} interface is reachable`, when: n.acWhen || 'the exchange is run end to end', then: n.acThen || 'the response is accepted and recorded', verification_method: 'Test', status: 'Approved' });
    h.ac.push(ac); h.lk('specifies', ac.id, r.id);
  });
  (pack.dataReqs || []).forEach((n) => {
    if (!h.ent.length) ensureEntities(h);
    const r = make('data', n.title, n.statement, n.pri || 'Must', { retention_days: n.retention, ...(n.residency ? { residency: n.residency } : {}) });
    h.req.push(r); h.lk('derives_from', r.id, h.ftr[n.feature || 0].id); h.lk('operates_on', r.id, h.ent[n.entity || 0].id); h.lk('planned_in', r.id, h.rel[0].id);
    const ac = h.mk('AcceptanceCriterion', { title: `${n.title}: retention`, scenario_type: 'edge', kind: 'compliance', given: 'records older than the retention period', when: 'the nightly retention job runs', then: 'those records are deleted and no copy remains', verification_method: 'Test', status: 'Approved' });
    h.ac.push(ac); h.lk('specifies', ac.id, r.id);
  });
  (pack.regReqs || []).forEach((n) => {
    const r = make('regulatory', n.title, n.statement, n.pri || 'Must', {});
    h.req.push(r); h.lk('satisfies', r.id, h.obl[n.obligation].id); h.lk('derives_from', r.id, h.obl[n.obligation].id);
    h.lk('applies_to', h.obl[n.obligation].id, h.ftr[n.feature || 0].id);
    const ac = h.mk('AcceptanceCriterion', { title: `${n.title}: compliance`, scenario_type: 'happy', kind: 'compliance', given: n.acGiven || 'a regulated record', when: n.acWhen || 'the audit check is run', then: n.acThen || 'the record meets the stated obligation', verification_method: 'Audit', status: 'Approved' });
    h.ac.push(ac); h.lk('specifies', ac.id, r.id);
  });
  (pack.brules || []).forEach((b) => {
    const r = h.mk('BusinessRule', { title: b.statement.slice(0, 80), statement: b.statement, category: b.cat, kind: b.kind, owner: b.owner || pack.owner, enforcement: 'automated', effective_from: b.from || '2027-01-01', parameters: b.params, status: 'In review' });
    h.brl.push(r); for (const c of b.applies || [0]) h.lk('applies', r.id, h.fr[c].id);
    if (b.derives) h.lk('derives_from', r.id, ref(h, b.derives));
    const ac = h.mk('AcceptanceCriterion', { title: `Rule check: ${b.statement.slice(0, 40)}`, scenario_type: 'boundary', kind: 'behavioural', given: b.acGiven, when: b.acWhen, then: b.acThen, verification_method: 'Test', status: 'Approved' });
    h.ac.push(ac); h.lk('specifies', ac.id, r.id);
  });
  h.clock(plus(d, 12));
  if (pack.artifacts === false) return;
  derive.run(S, 'assemble_artifact', { kind: 'prd' }, h.actor);
  const art = S.list('Artifact', (a) => a.kind === 'prd')[0];
  if (art) h.patch(art.id, { status: (pack.reach || 0) >= 4 ? 'Approved' : 'In review' });
}

/** Entities and states (used by data requirements in phase 3 and by flows in phase 4). */
function ensureEntities(h) {
  const { pack } = h;
  if (h.ent.length) return;
  for (const e of pack.entities || (pack.entity ? [pack.entity] : [])) {
    const ent = h.mk('Entity', { title: e.name, description: e.desc, has_lifecycle: !!e.states, personal_data: !!e.personal, ...(e.retention ? { retention_days: e.retention } : {}), ...(e.fields ? { datafields: e.fields } : {}), status: 'In review' });
    h.ent.push(ent);
    if (!e.states) continue;
    const sta = e.states.map(([name, initial, terminal]) => { const s = h.mk('State', { title: `${e.name}: ${name}`, initial: !!initial, terminal: !!terminal, status: 'In review' }); h.lk('of_entity', s.id, ent.id); h.sta.push(s); return s; });
    (e.transitions || []).forEach(([from, to, kind, trig]) => {
      const t = h.mk('Transition', { title: `${e.name}: ${e.states[from][0]} to ${e.states[to][0]}`, kind: kind || 'allowed', trigger_kind: trig || 'user_action', status: 'In review' });
      h.lk('from_state', t.id, sta[from].id); h.lk('to_state', t.id, sta[to].id); h.trn.push(t);
      if (kind === 'forbidden' && e.testForbidden !== false) {
        const ac = h.mk('AcceptanceCriterion', { title: `Forbidden: ${t.title}`, scenario_type: 'negative', kind: 'behavioural', given: `a record in state ${e.states[from][0]}`, when: `someone tries to move it to ${e.states[to][0]}`, then: 'the request is refused and the state is unchanged', verification_method: 'Test', status: 'Approved' });
        h.ac.push(ac); h.lk('exercises', ac.id, t.id);
      }
    });
  }
}

function phase4(h) {
  const { S, pack } = h;
  const d = plus(h.date('g3', '2026-09-25'), 2);
  h.clock(d);
  for (const [title, kind] of pack.actors || []) h.act.push(h.mk('Actor', { title, kind, status: 'Approved' }));
  ensureEntities(h);
  const stepKind = { S: 'start', T: 'task', D: 'decision', E: 'end', X: 'external', W: 'wait' };
  (pack.flows || []).forEach((f) => {
    const flow = h.mk('Flow', { title: f.title, kind: f.kind || 'workflow', level: f.level || 'L2_workflow', goal: f.goal, trigger_summary: f.trigger, priority: f.prio || 'Must', status: f.status || 'In review' });
    h.flw.push(flow); h.lk('actor_of', h.act[f.actor].id, flow.id);
    if (f.module !== undefined) h.lk('belongs_to', flow.id, h.mod[f.module].id);
    const steps = f.steps.map((code, i) => {
      const [k, ...rest] = code.split(':'); const title = rest.join(':');
      const st = h.mk('FlowStep', { title, kind: stepKind[k], order: i + 1, status: 'In review', ...(f.times && f.times[i] ? { time_bound_ms: f.times[i] } : {}) });
      h.lk('contains', flow.id, st.id); h.stp.push(st); return st;
    });
    for (const spec of String(f.edges).split(',').map((s) => s.trim()).filter(Boolean)) {
      const [pair, kind, ...cond] = spec.split(':'); const [a, b] = pair.split('>').map(Number);
      h.lk('next', steps[a].id, steps[b].id, { kind: kind || 'happy', ...(cond.length ? { condition: cond.join(':') } : {}) });
    }
    steps.forEach((st, i) => {
      if (['task', 'decision', 'external', 'wait'].includes(st.kind)) h.lk('performed_by', st.id, h.act[(f.performers && f.performers[i] !== undefined) ? f.performers[i] : f.actor].id);
    });
    for (const [si, codes] of Object.entries(f.covers || {})) for (const c of (codes as any)) h.lk('covers', steps[Number(si)].id, ref(h, c));
    for (const [si, ei] of Object.entries(f.calls || {})) h.lk('calls', steps[Number(si)].id, h.ext[(ei as any)].id);
    for (const c of f.annotates || []) h.lk('annotates', ref(h, c), flow.id);
    for (const [fromTo, acText] of Object.entries(f.failureAC || {})) {
      const [a, b] = fromTo.split('>').map(Number);
      const edge = h.S.out(steps[a].id, 'next').find((l) => l.target === steps[b].id);
      const ac = h.mk('AcceptanceCriterion', { title: `${f.title}: ${acText[0]}`, scenario_type: 'negative', kind: 'behavioural', given: acText[1], when: acText[2], then: acText[3], verification_method: 'Test', status: 'Approved' });
      h.ac.push(ac); h.lk('exercises', ac.id, edge.id);
    }
  });
  h.clock(plus(d, 8));
  if (pack.artifacts === false) return;
  derive.run(S, 'assemble_artifact', { kind: 'flow_pack' }, h.actor);
  const art = S.list('Artifact', (a) => a.kind === 'flow_pack')[0];
  if (art) h.patch(art.id, { status: 'In review' });
}

export { phase2, phase3, phase4, ensureEntities, ref };
