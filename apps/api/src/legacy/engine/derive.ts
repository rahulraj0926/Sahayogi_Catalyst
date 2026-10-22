/**
 * engine/derive.ts - the DERIVED layer of the data-collection model: drafts, links and reports the tool generates
 * itself so humans do not type them. Everything created here has origin='derived' and status Draft (or the type's
 * first status); derived items do NOT count toward gates until a person reviews them (status In review / Approved).
 */
import * as Q from './query';
import * as coverage from './coverage';
import * as freshness from './freshness';
import * as handoffLib from './handoff';
import * as stories from './stories';
import * as gates from './gates';

const mk = (store, type, fields, actor, requestId, subtype?) => {
  const it = store.create(type, fields, { actor, origin: 'derived', subtype });
  it.request_id = requestId || undefined;
  if (!it.request_id) delete it.request_id;
  return it;
};

const KIND_TYPES = {
  intake_document: [{ type: 'IntakeBrief' }, { type: 'Stakeholder' }, { type: 'Evidence' }, { type: 'Constraint' }, { type: 'Question' }, { type: 'Assumption' }, { type: 'ScopeEntry', where: { kind: 'initial_boundary' } }, { type: 'Risk' }],
  market_analysis: [{ type: 'Segment' }, { type: 'Persona' }, { type: 'Job' }, { type: 'Competitor' }, { type: 'Opportunity' }, { type: 'Problem' }, { type: 'Obligation' }, { type: 'Risk', where: { category: 'market' } }],
  competitor_analysis: [{ type: 'Competitor' }],
  product_definition: [{ type: 'Objective' }, { type: 'Metric' }, { type: 'Feature' }, { type: 'Module' }, { type: 'ScopeEntry', where: { kind: 'scope' } }, { type: 'Capacity' }, { type: 'Release' }],
  prd: [{ type: 'Requirement' }, { type: 'Story' }, { type: 'BusinessRule' }, { type: 'AcceptanceCriterion' }],
  flow_pack: [{ type: 'Flow' }, { type: 'Entity' }],
};
const KIND_TITLE = { intake_document: 'Product Intake Document', market_analysis: 'Market Analysis', competitor_analysis: 'Competitor Analysis', product_definition: 'Product Definition', prd: 'PRD / Requirements', flow_pack: 'Flow Pack' };
const KIND_GATE = { intake_document: 0, market_analysis: 1, competitor_analysis: 1, product_definition: 2, prd: 3, flow_pack: 4 };

const FUNCS = {
  rank_assumptions(store) {
    let n = 0;
    for (const a of [...store.list('Assumption'), ...store.list('Risk')]) { store.update(a.id, {}, { silent: true }); n++; }
    return { created: [], message: `Ranked ${n} assumptions and risks, riskiest first.` };
  },

  assemble_artifact(store, args, actor, rid) {
    const kind = args.kind;
    const ctx = new Q.Ctx(store, {});
    let art = store.list('Artifact', (a) => a.kind === kind)[0];
    const created = [];
    if (!art) {
      art = mk(store, 'Artifact', { title: KIND_TITLE[kind] || kind, kind, gate: KIND_GATE[kind], open_clarification_count: 0 }, actor, rid);
      created.push(art.id);
    }
    let n = 0;
    for (const spec of KIND_TYPES[kind] || []) {
      for (const it of Q.select(ctx, spec)) {
        if (!store.out(art.id, 'contains').some((l) => l.target === it.id)) { store.link('contains', art.id, it.id, {}, { actor, silent: true }); n++; }
      }
    }
    return { created, message: `${KIND_TITLE[kind]} ${created.length ? 'started' : 'refreshed'}: ${n} item${n === 1 ? '' : 's'} added. It stays a draft until a person approves it.` };
  },

  link_questions_to_gates(store, args, actor) {
    let n = 0;
    for (const q of store.list('Question', (x) => x.status !== 'Withdrawn')) {
      if (q.needed_by_gate === undefined) continue;
      if (!store.out(q.id, 'blocks').some((l) => l.target === `GATE-${q.needed_by_gate}`)) { store.link('blocks', q.id, `GATE-${q.needed_by_gate}`, {}, { actor, silent: true }); n++; }
    }
    return { created: [], message: `Connected ${n} open question${n === 1 ? '' : 's'} to the sign-off they hold up.` };
  },

  normalise_prices(store) {
    const ps = store.list('PricePoint');
    for (const p of ps) store.update(p.id, {}, { silent: true });
    const usable = ps.filter((p) => p.normalised_amount !== undefined).length;
    return { created: [], message: `Put ${ps.length} price${ps.length === 1 ? '' : 's'} on the same scale in rupees using the saved exchange rate${usable ? ` (${usable} billed by data used also shown per GB)` : ''}.` };
  },

  stale_value_questions(store, args, actor, rid) {
    const created = [];
    for (const v of store.list('CompetitorCapability').concat(store.list('PricePoint'))) {
      if (['Retired'].includes(v.status)) continue;
      const st = freshness.valueState(store, v, store.today());
      if (st.state !== 'stale') continue;
      const exists = store.inn(v.id, 'clarifies').some((l) => { const q = store.get(l.source); return q && q.status === 'Open'; });
      if (exists) continue;
      const q = mk(store, 'Question', { title: `Re-capture ${v.title}`, priority: 'Should', category: 'commercial', needed_by_gate: 1, owner: 'Research', status: 'Open', answer: undefined }, actor, rid);
      store.link('clarifies', q.id, v.id, {}, { actor, silent: true });
      created.push(q.id);
    }
    return { created, message: `${created.length} out-of-date competitor fact${created.length === 1 ? '' : 's'} turned into questions to refresh.` };
  },

  problems_from_insights(store, args, actor, rid) {
    const created = [];
    for (const i of store.list('Insight')) {
      if (i.status === 'Retracted') continue;
      if (store.out(i.id, 'raises').some((l) => store.getType(l.target) === 'Problem')) continue;
      const p = mk(store, 'Problem', { title: `Problem implied by ${i.id}`, statement: `Evidence indicates: ${i.statement}`, severity: 3, frequency: 'frequent' }, actor, rid);
      store.link('raises', i.id, p.id, {}, { actor, silent: true });
      created.push(p.id);
    }
    return { created, message: `${created.length} draft problem${created.length === 1 ? '' : 's'} written from findings that pointed at no problem yet.` };
  },

  feature_scores(store) {
    const w = { Must: 5, Should: 3, Could: 2, Wont: 1 };
    let n = 0;
    for (const f of store.list('Feature', (x) => x.scope_status !== 'out')) {
      const goals = store.out(f.id, 'supports').length;
      const value = w[f.priority] || 1;
      const strategic = 1 + Math.min(4, goals * 1.5);
      const inverse = 5 - Math.min(4, (f.effort_pm || 0) / 4);
      const score = Math.round((0.4 * value + 0.3 * strategic + 0.3 * inverse) * 10) / 10;
      store.update(f.id, { score: Math.min(5, score) }, { actor: 'derived', silent: true, strict: false }); n++;
    }
    return { created: [], message: `Scored ${n} features (value 40%, fit to goals 30%, low effort 30%).` };
  },

  requirements_from_features(store, args, actor, rid) {
    const created = [];
    const ctx = new Q.Ctx(store, {});
    for (const f of Q.select(ctx, { type: 'Feature', where: { priority: ['Must', 'Should'] } })) {
      const has = store.inn(f.id, 'derives_from').some((l) => (store.get(l.source) || {}).type === 'Requirement');
      if (has) continue;
      const desc = String(f.description || '').replace(/\s+/g, ' ').trim();
      const r = mk(store, 'Requirement', { title: f.title, statement: `The system shall provide "${f.title}"${desc ? ': ' + desc.replace(/[.\s]+$/, '') : ''}.`, priority: f.priority, flow_applicability: 'flow' }, actor, rid, 'functional');
      stories.markDrafted(r);
      store.link('derives_from', r.id, f.id, {}, { actor, silent: true });
      for (const m of store.out(f.id, 'belongs_to')) store.link('belongs_to', r.id, m.target, {}, { actor, silent: true });
      created.push(r.id);
    }
    return { created, message: `${created.length} draft requirement${created.length === 1 ? '' : 's'} written from features that had none. Each is marked "Draft, needs your rewrite".` };
  },

  stories_from_requirements(store, args, actor, rid) {
    const created = [];
    const ctx = new Q.Ctx(store, {});
    const personas = Q.select(ctx, { type: 'Persona' });
    const primary = personas.find((p) => p.primary) || personas[0];
    if (!primary) return { created, message: 'No type of user is named yet, so no stories could be drafted.' };
    const words = (t) => new Set(String(t || '').toLowerCase().match(/[a-z]{4,}/g) || []);
    const guess = (text) => { // the user type whose own words overlap most with the feature; otherwise the main one
      const w = words(text); let best = primary; let bestN = 0;
      for (const p of personas) { const pw = words(`${p.title} ${p.goals || ''} ${p.frustrations || ''}`); let n = 0; for (const x of w) if (pw.has(x)) n++; if (n > bestN) { best = p; bestN = n; } }
      return best;
    };
    for (const r of Q.select(ctx, { type: 'Requirement', subtype: 'functional', where: { priority: ['Must', 'Should'] } })) {
      if (store.inn(r.id, 'elaborates').some((l) => (store.get(l.source) || {}).type === 'Story')) continue;
      const feat = store.out(r.id, 'derives_from').map((l) => store.get(l.target)).find((x) => x && x.type === 'Feature');
      const text = `${r.title} ${feat && feat.description ? feat.description : ''}`;
      const persona = guess(text);
      const goal = String(persona.goals || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s/)[0].replace(/[.\s]+$/, '');
      const want = feat && feat.description ? String(feat.description).replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '') : `use "${r.title}"`;
      const s = mk(store, 'Story', { title: `As ${persona.title}, I want ${want.slice(0, 80)}`, want, benefit: goal ? `so that ${goal.charAt(0).toLowerCase() + goal.slice(1)}` : `(say why this matters to ${persona.title})`, priority: r.priority }, actor, rid);
      stories.markDrafted(s);
      store.link('elaborates', s.id, r.id, {}, { actor, silent: true });
      store.link('for_persona', s.id, persona.id, {}, { actor, silent: true });
      created.push(s.id);
    }
    return { created, message: `${created.length} draft stor${created.length === 1 ? 'y' : 'ies'} written, each marked "Draft, needs your rewrite". The tool only guessed the type of user: open "Complete this story" to put each one in your own words.` };
  },

  ac_drafts(store, args, actor, rid) {
    const created = [];
    const ctx = new Q.Ctx(store, {});
    for (const r of Q.select(ctx, { type: 'Requirement', subtypes: ['functional', 'interface', 'data'], where: { priority: ['Must', 'Should'] } })) {
      if (store.inn(r.id, 'specifies').some((l) => (store.get(l.source) || {}).type === 'AcceptanceCriterion')) continue;
      const st = store.inn(r.id, 'elaborates').map((l) => store.get(l.source)).find((x) => x && x.type === 'Story');
      const per = st && store.out(st.id, 'for_persona').map((l) => store.get(l.target)).find(Boolean);
      const who = per ? per.title : 'the user';
      const what = r.title;
      const happy = mk(store, 'AcceptanceCriterion', { title: `Normal case: ${what}`.slice(0, 120), given: `the preconditions for "${what}" hold (${who} has what is needed)`, when: 'the user performs the action', then: `the system fulfils: ${r.statement}`, scenario_type: 'happy', kind: 'behavioural', verification_method: 'Test' }, actor, rid);
      const neg = mk(store, 'AcceptanceCriterion', { title: `Failure case: ${what}`.slice(0, 120), given: 'the input is invalid or the user lacks permission', when: 'the user attempts the action', then: 'the system refuses it with a clear error and changes nothing', scenario_type: 'negative', kind: 'behavioural', verification_method: 'Test' }, actor, rid);
      stories.markDrafted(happy); stories.markDrafted(neg);
      store.link('specifies', happy.id, r.id, {}, { actor, silent: true });
      store.link('specifies', neg.id, r.id, {}, { actor, silent: true });
      created.push(happy.id, neg.id);
    }
    return { created, message: `${created.length} draft acceptance tests written (a normal case and a failure case for each requirement), each marked "Draft, needs your rewrite". They count once a person has rewritten or explicitly kept them.` };
  },

  flow_skeletons(store, args, actor, rid) {
    const created = [];
    const ctx = new Q.Ctx(store, {});
    for (const s of Q.select(ctx, { type: 'Story', where: { priority: ['Must', 'Should'] } })) {
      const reqs = store.out(s.id, 'elaborates').map((l) => store.get(l.target)).filter((x) => x && x.type === 'Requirement');
      const covered = store.inn(s.id, 'covers').length > 0 || (reqs.length && reqs.every((r) => store.inn(r.id, 'covers').length));
      if (covered) continue;
      const nice = String((reqs[0] && reqs[0].title) || s.want || 'this flow').replace(/^use "(.*)"$/, '$1'); // named by the feature, not by the tool's own wording
      const flow = mk(store, 'Flow', { title: `Flow: ${nice.slice(0, 80)}`, kind: 'workflow', level: 'L2_workflow', goal: nice, priority: s.priority }, actor, rid);
      stories.markDrafted(flow);
      const start = mk(store, 'FlowStep', { title: 'Someone needs this done', kind: 'start', order: 1 }, actor, rid);
      const task = mk(store, 'FlowStep', { title: nice.slice(0, 70), kind: 'task', order: 2 }, actor, rid);
      const end = mk(store, 'FlowStep', { title: 'Done', kind: 'end', order: 3 }, actor, rid);
      for (const st of [start, task, end]) store.link('contains', flow.id, st.id, {}, { actor, silent: true });
      store.link('next', start.id, task.id, { kind: 'happy' }, { actor, silent: true });
      store.link('next', task.id, end.id, { kind: 'happy' }, { actor, silent: true });
      store.link('covers', task.id, s.id, {}, { actor, silent: true });
      for (const r of reqs) store.link('covers', task.id, r.id, {}, { actor, silent: true });
      created.push(flow.id, start.id, task.id, end.id);
    }
    return { created, message: `${created.length} flow draft item${created.length === 1 ? '' : 's'} written (a start, a task and an end), each marked "Draft, needs your rewrite". Add the failure paths yourself.` };
  },

  trace_report(store) {
    const ctx = new Q.Ctx(store, {});
    const g = coverage.gaps(ctx);
    const report = Object.fromEntries(Object.entries(g).map(([k, v]) => [k, Array.isArray(v) ? v.length : v]));
    return { created: [], report, message: `Gaps: ${g.requirementsWithoutAC.length} requirements without a test, ${g.requirementsWithoutStory.length} without a story, ${g.storiesWithoutFlowCoverage.length} stories not in any flow, ${g.orphans.length} requirements with no source.` };
  },

  flow_report(store) {
    const rows = store.list('Flow').map((f) => ({ id: f.id, ...(({ ok, failing, deadEnds }) => ({ ok, failing, deadEnds }))(coverage.flowCheck(store, f.id)) }));
    return { created: [], report: rows, message: `${rows.filter((r) => r.ok).length} of ${rows.length} flows are complete; ${rows.filter((r) => r.deadEnds.length).length} have a dead end.` };
  },

  handoff_dry_run(store) {
    const r = handoffLib.readiness(new Q.Ctx(store, { gate: 4 }));
    return { created: [], report: r, message: `${r.ready} of ${r.total} approved stories have everything the developers need.` };
  },

  capacity_report(store) {
    
    const crit = gates.criteria().find((c) => c.id === 'G2-07');
    const res = gates.evalQuery(new Q.Ctx(store, { gate: 2 }), crit.query);
    return { created: [], report: res, message: res.message };
  },
};

function run(store, name, args = {}, actor = 'derived', requestId?) {
  const fn = FUNCS[name];
  if (!fn) throw Object.assign(new Error(`unknown derivation "${name}"`), { status: 422 });
  return fn(store, args, actor, requestId);
}

export { run, FUNCS, KIND_TYPES };
