/**
 * engine/compose_p2.ts - Phase 2 documents: Product Definition, Scope Statement, Capability Map, Priorities, Success Metrics, Out-of-Scope List.
 */
import * as K from './compose_kit';
import * as gates from './gates';
import * as plain from './plain';

const { p, note, tableOf, table, diagram, sec, need, needCount, target, clip, plural, andList, countBy, countsText, layoutSvg, mermaidFlow } = K;

const productDefinition = {
  key: 'product_definition', title: 'Product Definition', phase: 2, role: 'Product Owner', artifact: 'product_definition',
  reads: ['Objective', 'Metric', 'Module', 'Feature', 'Release', 'Capacity', 'ScopeEntry', 'PricingPlan'],
  build(k) {
    const plans = k.list('PricingPlan');
    const lines = (t) => String(t || '').split(String.fromCharCode(10)).map((x) => x.trim()).filter(Boolean).join('; ');
    const priceText = (x) => { if (x.is_free) return 'no charge'; if (x.amount === undefined || x.amount === null || x.amount === '') return 'On request'; const per = x.billing_period === 'per_unit' ? (x.unit ? ` per ${x.unit}` : ' per unit') : ({ monthly: ' a month', quarterly: ' a quarter', yearly: ' a year', one_time: ', one time' })[x.billing_period] || ''; return `${x.currency || ''} ${Number(x.amount).toLocaleString('en-IN')}${per}`.trim(); };
    const vision = k.list('Objective', (o) => o.kind === 'vision'); const objs = k.list('Objective', (o) => o.kind === 'objective');
    const mods = k.list('Module'); const feats = k.list('Feature'); const rel = k.list('Release');
    const prod = k.product();
    return [
      sec('purpose', 'Purpose and objectives', [
        vision[0] ? p(`The vision: ${clip(vision[0].statement, 400)}`) : p('No vision statement is recorded yet.'),
        objs.length ? p(`${plural(objs.length, 'objective')}: ${andList(objs.map((o) => `[[${o.id}]] ${clip(o.statement || o.title, 100)}`))}.`) : p('No objectives are recorded yet.'),
      ], [need(vision.length, 'A vision statement', 'Features need goals to connect to.', target({ request: 'DR-2-01' })), needCount(objs, 1, 'At least one objective', '', target({ request: 'DR-2-01' }))]),
      sec('modules', 'What the product is made of', [
        mods.length ? p(`${prod ? prod.name : 'The product'} is organised into ${plural(mods.length, 'module')} holding ${plural(feats.length, 'feature')}.`) : p('No modules are defined yet.'),
        mods.length && tableOf(mods, [['ID', (m) => `[[${m.id}]]`], ['Module', (m) => m.title], ['Boundary', (m) => clip(m.boundary_description, 120)], ['Features', (m) => String(k.inn(m.id, 'belongs_to').filter((x) => x.type === 'Feature').length)], ['Owner', (m) => m.owner]]),
      ], [needCount(mods, 1, 'At least one module', '', target({ request: 'DR-2-03' })), needCount(feats, 1, 'At least one feature', '', target({ request: 'DR-2-03' }))]),
      sec('pricing', 'Pricing plans', [
        plans.length ? p(`${plural(plans.length, 'pricing plan')}: ${andList(plans.map((x) => `[[${x.id}]] ${x.title} (${priceText(x)})`))}.`) : p('No pricing plans are recorded yet. Add them with the + Pricing plan button at the top of the Product document.'),
        plans.length && tableOf(plans, [['ID', (x) => `[[${x.id}]]`], ['Plan', (x) => x.title], ['Price', priceText], ['Who it is for', (x) => x.audience || ''], ['What is included', (x) => clip(lines(x.includes), 200)], ['Limits', (x) => clip(lines(x.limits), 120)]]),
      ], []),
      sec('release', 'Release plan', [
        rel.length ? p(`${plural(rel.length, 'release')} planned: ${andList(rel.sort((a, b) => (a.order || 0) - (b.order || 0)).map((r) => `[[${r.id}]] ${r.title}${r.window_start ? ` (${r.window_start} to ${r.window_end || '?'})` : ''}`))}.`) : p('No release is defined yet.'),
        rel.length && tableOf(rel, [['ID', (r) => `[[${r.id}]]`], ['Release', (r) => r.title], ['MVP', (r) => (r.is_mvp ? 'yes' : '')], ['Features planned', (r) => String(k.inn(r.id, 'planned_in').length)], ['Team capacity', (r) => k.out(r.id, 'staffed_by').map((c) => c.title).join('; ') || 'none']]),
      ], [needCount(rel, 1, 'At least one release', 'Each must-have feature has to be planned in a release.', target({ request: 'DR-2-06' }))]),
    ];
  },
};

const scopeStatement = {
  key: 'scope_statement', title: 'Scope Statement', phase: 2, role: 'Sponsor', artifact: null,
  reads: ['Feature', 'ScopeEntry'],
  build(k) {
    const inF = k.list('Feature', (f) => f.scope_status === 'in' || !f.scope_status); const later = k.list('Feature', (f) => f.scope_status === 'later'); const out = k.list('Feature', (f) => f.scope_status === 'out', { all: true });
    const sc = k.list('ScopeEntry', (s) => s.kind === 'scope');
    const lines = sc.filter((s) => ['later', 'out'].includes(s.disposition));
    // ONE count of what is put off: later features plus the scope lines marked "later" (they were counted as 0 when only features were looked at)
    const laterLines = sc.filter((s) => s.disposition === 'later'); const outLines = sc.filter((s) => s.disposition === 'out');
    const deferred = later.length + laterLines.length; const excluded = out.length + outLines.length;
    return [
      sec('in', 'In scope for version 1', [inF.length ? p(`${plural(inF.length, 'feature')} are in scope.`) : p('No features are in scope yet.'), inF.length && tableOf(inF, [['ID', (f) => `[[${f.id}]]`], ['Feature', (f) => f.title], ['Priority', (f) => f.priority], ['Effort (person-months)', (f) => f.effort_pm], ['Goal it serves', (f) => k.out(f.id, 'supports').map((x) => x.title).join('; ') || 'none']])],
        [needCount(inF, 1, 'At least one in-scope feature', '', target({ request: 'DR-2-03' })), need(inF.every((f) => k.out(f.id, 'supports').length), 'Every in-scope feature traces to a goal or need', 'Each feature has to connect to a goal or need.', target({ request: 'DR-2-03' }))]),
      sec('later', 'Later and out', [
        p(`${deferred} ${deferred === 1 ? 'item is' : 'items are'} put off until later (${plural(later.length, 'feature')} and ${plural(laterLines.length, 'scope line')}) and ${excluded} ${excluded === 1 ? 'item is' : 'items are'} left out for good (${plural(out.length, 'feature')} and ${plural(outLines.length, 'scope line')}). ${plural(lines.length, 'scope line')} explain the boundary.`),
        lines.length && tableOf(lines, [['ID', (s) => `[[${s.id}]]`], ['Line', (s) => s.subject_text], ['Decision', (s) => plain.word('disposition', s.disposition)], ['Why', (s) => clip(s.rationale, 120)], ['What it costs us to leave it out', (s) => clip(s.exclusion_impact, 120)]]),
      ], [need(sc.some((s) => s.disposition === 'out'), 'At least one explicit out-of-scope line', 'The Stage 2 sign-off needs a clear "out" line.', target({ request: 'DR-2-07' })), need(lines.every((s) => s.rationale && s.exclusion_impact), 'Every later or out line has a reason and a cost of leaving it out', 'Each later or out line has to say why.', target({ request: 'DR-2-07' }))]),
      sec('baseline', 'The decision that fixes the scope', k.list('Decision', (d) => d.kind === 'product').map((d) => p(`${d.title}: ${d.status}${d.chosen ? `; chosen: ${clip(d.chosen, 140)}` : ''}${d.decider ? ` (decided by ${d.decider})` : ''}.`)),
        [need(k.list('Decision', (d) => d.kind === 'product' && /scope baseline/i.test(d.title) && d.status === 'Approved').length, 'An approved decision that fixes the scope', 'The Stage 2 sign-off needs the scope decision recorded and approved.', target({ request: 'DR-2-09' }))]),
    ];
  },
};

const capabilityMap = {
  key: 'capability_map', title: 'Capability Map', phase: 2, role: 'Product Owner', artifact: null,
  reads: ['Module', 'Feature'],
  build(k) {
    const mods = k.list('Module'); const feats = k.list('Feature');
    const rows = [];
    for (const m of mods) for (const f of feats.filter((x) => k.out(x.id, 'belongs_to').some((mm) => mm.id === m.id))) rows.push([`[[${m.id}]] ${m.title}`, `[[${f.id}]] ${f.title}`, f.priority || '-', plain.word('disposition', f.scope_status || 'in'), f.effort_pm === undefined ? '-' : String(f.effort_pm)]);
    const unassigned = feats.filter((f) => !k.out(f.id, 'belongs_to').length);
    const nodes = []; const edges = [];
    if (mods.length && feats.length && feats.length + mods.length <= 60) {
      nodes.push({ id: 'ROOT', label: (k.product() || {}).name || 'Product', shape: 'start' });
      for (const m of mods) { nodes.push({ id: m.id, label: m.title, shape: 'external' }); edges.push({ from: 'ROOT', to: m.id, kind: 'happy' }); }
      for (const f of feats) { nodes.push({ id: f.id, label: f.title, shape: 'task' }); const mm = k.out(f.id, 'belongs_to')[0]; if (mm) edges.push({ from: mm.id, to: f.id, kind: f.scope_status && f.scope_status !== 'in' ? 'alternate' : 'happy' }); }
    }
    return [
      sec('map', 'Modules and the capabilities in them', [
        mods.length ? p(`${plural(mods.length, 'module')} hold ${plural(feats.length - unassigned.length, 'feature')}${unassigned.length ? `; ${unassigned.length} ${unassigned.length === 1 ? 'feature has' : 'features have'} no module yet` : ''}.`) : p('No modules are defined yet.'),
        rows.length && table(['Part of the product', 'Capability or feature', 'Priority', 'Scope', 'Effort (person-months)'], rows),
        nodes.length && diagram('Capability map', mermaidFlow(nodes, edges), layoutSvg(nodes, edges)),
      ], [needCount(mods, 1, 'At least one module', '', target({ request: 'DR-2-03' })), need(!unassigned.length && feats.length > 0, `Every feature belongs to a part of the product (${unassigned.length} do not)`, 'A feature with no home cannot be planned.', target({ request: 'DR-2-03' }))]),
    ];
  },
};

const priorities = {
  key: 'priorities', title: 'Priorities', phase: 2, role: 'Product Owner', artifact: null,
  reads: ['Feature', 'Capacity', 'Release'],
  build(k) {
    const feats = k.list('Feature', (f) => !f.scope_status || f.scope_status === 'in'); const by = (pr) => feats.filter((f) => f.priority === pr);
    const sum = (arr) => arr.reduce((s, f) => s + (f.effort_pm || 0), 0);
    const caps = k.list('Capacity', (c) => c.status === 'Approved'); const cap = caps.reduce((s, c) => s + (c.person_months || 0), 0);
    const util = (gates.config().params.capacity_util_max) || 0.9;
    const mustEffort = sum(by('Must'));
    const unestimated = by('Must').filter((f) => f.effort_pm === undefined);
    return [
      sec('moscow', 'Must, should, could', [
        feats.length ? p(`Of ${plural(feats.length, 'in-scope feature')}, ${by('Must').length} are must-have (${sum(by('Must'))} person-months), ${by('Should').length} should-have (${sum(by('Should'))}) and ${by('Could').length} could-have (${sum(by('Could'))}).`) : p('No features are prioritised yet.'),
        feats.length && tableOf(feats.sort((a, b) => ['Must', 'Should', 'Could', 'Wont'].indexOf(a.priority) - ['Must', 'Should', 'Could', 'Wont'].indexOf(b.priority) || (b.score || 0) - (a.score || 0)), [['Priority', (f) => f.priority], ['ID', (f) => `[[${f.id}]]`], ['Feature', (f) => f.title], ['Effort (person-months)', (f) => f.effort_pm], ['How sure is the estimate', (f) => f.effort_confidence], ['Score', (f) => f.score], ['Release', (f) => k.out(f.id, 'planned_in').map((r) => r.title).join('; ')]]),
      ], [needCount(feats, 1, 'At least one prioritised feature', '', target({ request: 'DR-2-03' })), need(!unestimated.length, `Every must-have feature has an effort estimate (${unestimated.length} do not)`, 'The Stage 2 sign-off needs every must-have feature estimated.', target({ request: 'DR-2-04' }))]),
      sec('capacity', 'Does the must-have work fit the team?', [
        caps.length ? p(`Approved capacity is ${cap} person-months; planning to use at most ${Math.round(util * 100)}% of it, that is ${Math.round(cap * util * 10) / 10}. The must-have features need ${mustEffort}. ${mustEffort <= cap * util ? 'The must-have work fits.' : 'The must-have work does NOT fit: cut scope, add capacity or move the date.'}`) : p('No approved capacity is recorded, so it cannot be checked whether the must-have work fits.'),
      ], [needCount(caps, 1, 'Approved capacity for the first release', 'The Stage 2 sign-off checks the must-have work against capacity.', target({ request: 'DR-2-05' })), need(caps.length && mustEffort <= cap * util, 'The must-have effort fits the capacity', 'The Stage 2 sign-off checks the must-have work against capacity.', target({ request: 'DR-2-14' }))]),
    ];
  },
};

const successMetrics = {
  key: 'success_metrics', title: 'Success Metrics', phase: 2, role: 'Sponsor', artifact: null,
  reads: ['Metric', 'Objective'],
  build(k) {
    const m = k.list('Metric', (x) => ['success_metric', 'key_result', undefined].includes(x.use));
    const incomplete = m.filter((x) => !(x.unit && x.owner && x.cadence && x.target_value !== undefined && x.baseline_type));
    return [
      sec('metrics', 'How we will know it worked', [
        m.length ? p(`${plural(m.length, 'success measure')} ${m.length === 1 ? 'is' : 'are'} defined. ${m.map((x) => `${clip(x.title, 60)} aims for ${x.comparator || ''} ${x.target_value === undefined ? '(no target)' : x.target_value} ${x.unit || ''}`.replace(/\s+/g, ' ').trim()).slice(0, 4).join('; ')}${m.length > 4 ? '; and more' : ''}.`) : p('No metrics are defined yet.'),
        m.length && tableOf(m, [['ID', (x) => `[[${x.id}]]`], ['Measure', (x) => clip(x.title, 100)], ['Target', (x) => (x.target_value === undefined ? '' : `${x.comparator || ''} ${x.target_value} ${x.unit || ''}`.trim())], ['Starting point', (x) => (x.baseline_type === 'none_new_product' ? 'none (new product)' : x.baseline_value !== undefined ? `${x.baseline_value} (${plain.word('baseline_type', x.baseline_type)})` : plain.word('baseline_type', x.baseline_type))], ['How often checked', (x) => plain.word('cadence', x.cadence)], ['Owner', (x) => x.owner], ['Goal it measures', (x) => k.out(x.id, 'measures').map((o) => o.title).join('; ')]]),
      ], [needCount(m, 1, 'At least one success measure', 'The Stage 2 sign-off needs measurable success measures.', target({ request: 'DR-2-02' })), need(!incomplete.length, `Every measure has a unit, an owner, how often it is checked, a target and a starting point (${incomplete.length} incomplete)`, 'Each measure has to be specific enough to check.', target({ request: 'DR-2-02' }))]),
    ];
  },
};

const outOfScope = {
  key: 'out_of_scope', title: 'Out-of-Scope List', phase: 2, role: 'Sponsor', artifact: null,
  reads: ['ScopeEntry', 'Feature'],
  build(k) {
    const lines = k.list('ScopeEntry', (s) => ['out', 'later'].includes(s.disposition), { all: true });
    const feats = k.list('Feature', (f) => ['out', 'later'].includes(f.scope_status), { all: true });
    return [
      sec('list', 'What we are deliberately not doing', [
        lines.length || feats.length ? p(`${plural(lines.filter((l) => l.disposition === 'out').length, 'line')} ${lines.filter((l) => l.disposition === 'out').length === 1 ? 'is' : 'are'} out and ${plural(lines.filter((l) => l.disposition === 'later').length, 'line')} ${lines.filter((l) => l.disposition === 'later').length === 1 ? 'is' : 'are'} later; ${plural(feats.length, 'feature')} ${feats.length === 1 ? 'is' : 'are'} marked out or later.`) : p('Nothing is recorded as out of scope or later.'),
        lines.length && tableOf(lines, [['ID', (s) => `[[${s.id}]]`], ['Line', (s) => s.subject_text], ['Decision', (s) => plain.word('disposition', s.disposition)], ['Reason', (s) => clip(s.rationale, 120)], ['What it costs us', (s) => clip(s.exclusion_impact, 120)], ['Backed by', (s) => k.out(s.id, 'justified_by').map((x) => x.title).join('; ')]]),
        feats.length && tableOf(feats, [['Feature', (f) => `[[${f.id}]] ${f.title}`], ['Scope', (f) => plain.word('disposition', f.scope_status)], ['Priority', (f) => f.priority]]),
      ], [need(lines.some((s) => s.disposition === 'out'), 'At least one out-of-scope line', 'The Stage 2 sign-off needs a clear "out" line.', target({ request: 'DR-2-07' })), need(lines.every((s) => s.rationale && s.exclusion_impact && k.out(s.id, 'justified_by').length), 'Every line has a reason, a cost of leaving it out and something backing it', 'Each later or out line has to say why.', target({ request: 'DR-2-07' }))]),
    ];
  },
};

export default [productDefinition, scopeStatement, capabilityMap, priorities, successMetrics, outOfScope];
