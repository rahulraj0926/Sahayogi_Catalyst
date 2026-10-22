/**
 * engine/compose_p4.ts - Phase 4 documents: User Journeys, Business Process Maps, Workflow Diagrams, State Maps,
 * Exception Flows, Cross-Module Flows. Flow documents render a Mermaid block and an inline SVG for each flow.
 */
import * as K from './compose_kit';
import * as Q from './query';
import * as coverage from './coverage';
import * as plain from './plain';

const { p, note, tableOf, table, diagram, sec, need, needCount, target, clip, plural, andList, layoutSvg, mermaidFlow, mermaidStates } = K;

const SHAPE = { start: 'start', end: 'end', decision: 'decision', external: 'external', wait: 'task', task: 'task' };

/** Steps (ordered), edges and actor of one flow. */
function flowGraph(k, flow) {
  const steps = k.out(flow.id, 'contains').filter((s) => s.type === 'FlowStep').sort((a, b) => (a.order || 0) - (b.order || 0));
  const ids = new Set(steps.map((s) => s.id));
  const edges = [];
  for (const s of steps) for (const l of k.store.out(s.id, 'next')) if (ids.has(l.target)) edges.push({ from: s.id, to: l.target, kind: (l.attrs && l.attrs.kind) || 'happy', label: (l.attrs && l.attrs.condition) || '' });
  const actor = k.inn(flow.id, 'actor_of')[0] || null;
  return { steps, edges, actor, nodes: steps.map((s) => ({ id: s.id, label: s.title, shape: SHAPE[s.kind] || 'task' })) };
}

/** Blocks describing one flow: sentence, happy path, diagram, step table. */
function flowBlocks(k, flow, ctx?) {
  const g = flowGraph(k, flow);
  const check = coverage.flowCheck(k.store, flow.id);
  const happy = []; // follow happy edges from the start step
  const startStep = g.steps.find((s) => s.kind === 'start') || g.steps[0];
  const seen = new Set();
  for (let cur = startStep; cur && !seen.has(cur.id); ) { seen.add(cur.id); happy.push(cur); const nx = g.edges.find((e) => e.from === cur.id && e.kind === 'happy'); cur = nx ? g.steps.find((s) => s.id === nx.to) : null; }
  const fails = g.edges.filter((e) => e.kind === 'failure').length; const alts = g.edges.filter((e) => e.kind === 'alternate').length;
  return [
    p(`${flow.title}${flow.goal ? ` aims for: ${clip(flow.goal, 200)}` : ''}${flow.trigger_summary ? ` It starts with: ${clip(flow.trigger_summary, 160)}.` : ''}${g.actor ? ` Main person involved: ${g.actor.title}.` : ' No main person is recorded.'}`),
    g.steps.length ? p(`The flow has ${plural(g.steps.length, 'step')}, ${plural(g.edges.filter((e) => e.kind === 'happy').length, 'normal connection')}, ${plural(alts, 'other path')} and ${plural(fails, 'failure path')}. ${check.ok ? 'It is complete: it starts, it ends and nothing leads nowhere.' : `It is not complete yet: ${check.rules.filter((r) => !r.ok).map((r) => r.title.toLowerCase()).join('; ')}.`}`) : p('This flow has no steps yet.'),
    happy.length > 1 && p(`Normal path: ${happy.map((s) => s.title).join(' > ')}.`),
    g.steps.length && diagram(`Flow: ${flow.title}`, mermaidFlow(g.nodes, g.edges), layoutSvg(g.nodes, g.edges)),
    g.steps.length && tableOf(g.steps, [['#', (s) => s.order], ['Step', (s) => `[[${s.id}]] ${s.title}`], ['Kind', (s) => plain.word('step_kind', s.kind)], ['Who', (s) => k.out(s.id, 'performed_by').map((a) => a.title).join(', ')], ['Uses', (s) => k.out(s.id, 'calls').map((e) => e.title).join('; ')], ['Requirements it covers', (s) => k.out(s.id, 'covers').map((r) => r.title).join('; ')], ['Must finish within (milliseconds)', (s) => s.time_bound_ms]]),
  ].filter(Boolean);
}

const flowsOf = (k, pred) => k.list('Flow', pred);
const actorKind = (k, f) => { const a = k.inn(f.id, 'actor_of')[0]; return a ? a.kind : null; };
const structOK = (k, flows) => flows.every((f) => coverage.flowCheck(k.store, f.id).ok);

function flowDoc(def) {
  return {
    key: def.key, title: def.title, phase: 4, role: def.role || 'Product Owner', artifact: def.artifact || null, reads: ['Flow', 'FlowStep', 'Actor'],
    build(k) {
      const flows = flowsOf(k, (f) => def.pick(k, f));
      const blocks = [flows.length ? p(def.intro(flows)) : p(def.none)];
      const out = [sec('summary', def.heading, blocks, [needCount(flows, 1, def.needLabel, def.why, target({ request: def.request })), ...(def.extraNeeds ? def.extraNeeds(k, flows) : [])])];
      for (const f of flows.slice(0, 25)) out.push(sec(`flow-${f.id}`, f.title, flowBlocks(k, f), []));
      return out;
    },
  };
}

const userJourneys = flowDoc({
  key: 'user_journeys', title: 'User Journeys', heading: 'How people move through the product', request: 'DR-4-01', needLabel: 'At least one user journey', why: 'A journey follows a person from the moment something starts to the outcome.',
  pick: (k, f) => f.kind === 'journey' || ['customer_user', 'internal_user'].includes(actorKind(k, f)), none: 'No user journeys are recorded yet.',
  intro: (fl) => `${plural(fl.length, 'journey')} follow a person from trigger to outcome: ${andList(fl.map((f) => f.title))}.`,
  extraNeeds: (k, fl) => [need(fl.every((f) => k.inn(f.id, 'actor_of').length), 'Every journey names the person it follows', 'A journey follows a person.', target({ request: 'DR-4-01' }))],
});
const processMaps = flowDoc({
  key: 'process_maps', title: 'Business Process Maps', heading: 'End-to-end business processes', request: 'DR-4-01', needLabel: 'At least one business process map', why: 'A business process shows how work moves from end to end across the company.',
  pick: (k, f) => f.kind === 'process' || f.level === 'L1_process', none: 'No business process maps are recorded yet.',
  intro: (fl) => `${plural(fl.length, 'business process', 'business processes')}: ${andList(fl.map((f) => f.title))}.`,
});
const workflowDiagrams = flowDoc({
  key: 'workflow_diagrams', title: 'Workflow Diagrams', heading: 'Step-by-step workflows', request: 'DR-4-01', needLabel: 'At least one workflow diagram', why: 'A workflow shows the steps someone follows, one after the other.', artifact: 'flow_pack',
  pick: (k, f) => f.kind === 'workflow' || f.level === 'L2_workflow', none: 'No workflows are recorded yet.',
  intro: (fl) => `${plural(fl.length, 'workflow')}: ${andList(fl.map((f) => f.title))}.`,
  extraNeeds: (k, fl) => [need(structOK(k, fl), 'Every workflow has a start, an end, no dead end and clear decisions', 'The Stage 4 sign-off needs every must-have flow complete.', target({ request: 'DR-4-11' }))],
});
const exceptionFlows = {
  key: 'exception_flows', title: 'Exception Flows', phase: 4, role: 'Product Owner', artifact: null, reads: ['Flow', 'FlowStep', 'AcceptanceCriterion'],
  build(k) {
    const flows = flowsOf(k, () => true); const exc = flows.filter((f) => f.kind === 'exception');
    const rows = [];
    for (const f of flows) { const g = flowGraph(k, f); for (const e of g.edges.filter((x) => x.kind !== 'happy')) rows.push([f.title, plain.word('edge_kind', e.kind), k.title(e.from), k.title(e.to), e.label || '-']); }
    const must = flows.filter((f) => f.priority === 'Must');
    const noFail = must.filter((f) => coverage.flowCheck(k.store, f.id).missingFailurePaths.length);
    const blocks = [rows.length ? p(`${plural(rows.length, 'other or failure path')} ${rows.length === 1 ? 'is' : 'are'} recorded across ${plural(flows.length, 'flow')}${exc.length ? `; ${plural(exc.length, 'flow')} ${exc.length === 1 ? 'is' : 'are'} dedicated exception flows` : ''}.`) : p('No alternate or failure paths are recorded yet.'),
      rows.length && table(['Flow', 'Kind of path', 'From step', 'To step', 'When'], rows)];
    const out = [sec('paths', 'What happens when things go wrong', blocks, [need(rows.length, 'At least one failure or other path', 'The Stage 4 sign-off needs failure paths shown.', target({ request: 'DR-4-02' })), need(!noFail.length, `Every must-have flow shows what happens when a step fails (${noFail.length} do not)`, 'The Stage 4 sign-off needs failure paths shown.', target({ request: 'DR-4-02' }))])];
    for (const f of exc.slice(0, 15)) out.push(sec(`flow-${f.id}`, f.title, flowBlocks(k, f), []));
    return out;
  },
};
const crossModule = {
  key: 'cross_module_flows', title: 'Cross-Module Flows', phase: 4, role: 'Tech lead', artifact: null, reads: ['Flow', 'FlowStep', 'Module', 'Requirement'],
  build(k) {
    const mods = k.list('Module');
    const modsOf = (f) => { const set = new Set(k.out(f.id, 'belongs_to').map((m) => m.id)); for (const s of k.out(f.id, 'contains')) for (const r of k.out(s.id, 'covers')) for (const m of k.out(r.id, 'belongs_to')) set.add(m.id); return [...set]; };
    const flows = flowsOf(k, (f) => f.kind === 'cross_module' || modsOf(f).length >= 2);
    const out = [sec('cross', 'Flows that cross from one part into another', [
      flows.length ? p(`${plural(flows.length, 'flow')} cross from one part of the product into another: ${andList(flows.map((f) => `${f.title} (${modsOf(f).map((m) => k.title(m)).join(' + ') || 'parts not recorded'})`))}.`) : p(mods.length > 1 ? 'No flow crosses from one part of the product to another yet.' : 'The product has fewer than two parts, so there are no flows across parts to show.'),
    ], [need(flows.length || mods.length < 2, 'At least one flow across parts when the product has several parts', 'Handovers between parts are where flows break.', target({ request: 'DR-4-01' }))])];
    for (const f of flows.slice(0, 15)) out.push(sec(`flow-${f.id}`, f.title, flowBlocks(k, f), []));
    return out;
  },
};
const stateMaps = {
  key: 'state_maps', title: 'State Maps (Life Cycles)', phase: 4, role: 'Tech lead', artifact: null, reads: ['Entity', 'State', 'Transition', 'AcceptanceCriterion'],
  build(k) {
    const ents = k.list('Entity'); const life = ents.filter((e) => e.has_lifecycle);
    const ctx = new Q.Ctx(k.store, {});
    const out = [sec('entities', 'Things that go through stages', [
      life.length ? p(`${plural(life.length, 'thing')} we keep records of ${life.length === 1 ? 'has' : 'have'} a life cycle: ${andList(life.map((e) => e.title))}. ${ents.length - life.length} further ${ents.length - life.length === 1 ? 'thing has' : 'things have'} none.`) : p(ents.length ? 'None of the things we keep records of is marked as having a life cycle.' : 'No things we keep records of are recorded yet.'),
    ], [needCount(life, 1, 'At least one thing with a life cycle', 'The Stage 4 sign-off needs each life cycle complete.', target({ request: 'DR-4-03' }))])];
    for (const e of life) {
      const c = coverage.entityCheck(k.store, e.id, ctx);
      const nodes = c.states.map((s) => ({ id: s.id, label: s.title.replace(/^[^:]+:\s*/, ''), shape: s.terminal ? 'final' : 'state', initial: s.initial, terminal: s.terminal }));
      const edges = c.transitions.map((t) => ({ from: t.from, to: t.to, kind: t.kind === 'forbidden' ? 'forbidden' : 'happy', label: t.kind === 'forbidden' ? 'forbidden' : '' }));
      out.push(sec(`entity-${e.id}`, `Life cycle: ${e.title}`, [
        p(`${e.title} has ${plural(c.states.length, 'state')} and ${plural(c.transitions.length, 'allowed or forbidden change')} (${c.transitions.filter((t) => t.kind === 'forbidden').length} not allowed). ${c.ok ? 'The life cycle is complete.' : `Still to fix: ${c.problems.map((x) => plain.clean(x.message)).join('; ')}.`}`),
        nodes.length && diagram(`States of ${e.title}`, mermaidStates(nodes, edges), layoutSvg(nodes, edges)),
        c.transitions.length && tableOf(c.transitions, [['ID', (t) => `[[${t.id}]]`], ['From', (t) => k.title(t.from).replace(/^[^:]+:\s*/, '')], ['To', (t) => k.title(t.to).replace(/^[^:]+:\s*/, '')], ['Kind', (t) => plain.word('transition_kind', t.kind)], ['What triggers it', (t) => plain.word('trigger_kind', t.trigger_kind)], ['Tested', (t) => (t.tested ? 'yes' : 'no')]]),
      ], [need(c.ok, `${e.title} has a complete life cycle`, 'Every state and every allowed change has to be written down and tested.', target({ request: 'DR-4-03' }))]));
    }
    return out;
  },
};

export default [userJourneys, processMaps, workflowDiagrams, stateMaps, exceptionFlows, crossModule];
