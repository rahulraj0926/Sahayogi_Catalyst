/**
 * engine/compose_p3.ts - Phase 3 documents: PRD/Requirements, User Stories, Business Rules, Acceptance Criteria, NFRs,
 * Integration Requirements, Traceability.
 */
import * as K from './compose_kit';
import * as Q from './query';
import * as coverage from './coverage';
import * as plain from './plain';

const { p, note, tableOf, table, sec, need, needCount, target, clip, plural, andList, countBy, countsText } = K;
const SUB = { functional: 'Function', non_functional: 'Quality target', interface: 'Link to another system', data: 'Data', regulatory: 'Rule or law' };
const SUB_PLURAL = { functional: 'Functions', non_functional: 'Quality targets', interface: 'Links to other systems', data: 'Data', regulatory: 'Rules and laws' };

const prd = {
  key: 'prd', title: 'PRD / Requirements', phase: 3, role: 'Product Owner', artifact: 'prd',
  reads: ['Requirement', 'Story', 'AcceptanceCriterion', 'BusinessRule', 'Feature'],
  build(k) {
    const reqs = k.list('Requirement'); const prod = k.product();
    const out = [sec('overview', 'Overview', [
      reqs.length ? p(`${prod ? prod.name : 'The product'} has ${plural(reqs.length, 'requirement')}: ${countsText(countBy(reqs, (r) => SUB[r.subtype] || r.subtype))}. By priority: ${countsText(countBy(reqs, (r) => plain.word('priority', r.priority).toLowerCase()))}. ${reqs.filter((r) => r.status === 'Approved').length} are approved.`) : p('No requirements are recorded yet.'),
    ], [needCount(reqs, 1, 'At least one requirement', 'Requirements are drafted from the features you list in Stage 2.', target({ request: 'DR-2-03' })), need(reqs.every((r) => k.out(r.id, 'derives_from').length), 'Every requirement comes from a feature, a finding, a rule or a limit', 'A requirement with no source is only an opinion.', target({ request: 'DR-3-12' }))])];
    for (const [sub, label] of Object.entries(SUB)) {
      const list = reqs.filter((r) => r.subtype === sub);
      if (!list.length) continue;
      out.push(sec(`req-${sub}`, SUB_PLURAL[sub] || label, [tableOf(list, [['ID', (r) => `[[${r.id}]]`], ['Requirement', (r) => clip(r.statement, 220)], ['Priority', (r) => plain.word('priority', r.priority)], ['Status', (r) => r.status], ['Comes from', (r) => k.out(r.id, 'derives_from').map((x) => x.title).join('; ')], ['Tests written', (r) => String(k.inn(r.id, 'specifies').length)]])], []));
    }
    const noAC = reqs.filter((r) => r.subtype !== 'non_functional' && !k.inn(r.id, 'specifies').length);
    out.push(sec('quality', 'Can each requirement be tested?', [p(noAC.length ? `${plural(noAC.length, 'requirement')} still ${noAC.length === 1 ? 'has' : 'have'} no test of how it should behave: ${andList(noAC.slice(0, 6).map((r) => `"${clip(r.title, 60)}"`))}${noAC.length > 6 ? ' and more' : ''}.` : 'Every requirement that describes behaviour has at least one test.')],
      [need(!noAC.length && reqs.length, `Every requirement has a test of how it should behave (${noAC.length} do not)`, 'The Stage 3 sign-off needs a test for every requirement that describes behaviour.', target({ request: 'DR-3-14', ui: '#/screen/stories' }))]));
    return out;
  },
};

const userStories = {
  key: 'user_stories', title: 'User Stories', phase: 3, role: 'Product Owner', artifact: null,
  reads: ['Story', 'Persona', 'Requirement'],
  build(k) {
    const st = k.list('Story');
    const per = k.list('Persona', (x) => x.primary);
    const noPer = st.filter((s) => !k.out(s.id, 'for_persona').length);
    const primUncovered = per.filter((x) => !k.inn(x.id, 'for_persona').length);
    return [sec('stories', 'Stories by kind of user', [
      st.length ? p(`${plural(st.length, 'story', 'stories')} are written: ${countsText(countBy(st, (s) => s.status))}.`) : p('No stories are written yet.'),
      st.length && tableOf(st, [['ID', (s) => `[[${s.id}]]`], ['Story', (s) => `As ${k.out(s.id, 'for_persona').map((x) => x.title).join(', ') || '(no kind of user named)'} I want ${clip(s.want, 120)}${s.benefit ? ' ' + clip(s.benefit, 80) : ''}`], ['Priority', (s) => plain.word('priority', s.priority)], ['Delivers', (s) => k.out(s.id, 'elaborates').map((x) => x.title).join('; ')], ['Status', (s) => s.status]]),
    ], [needCount(st, 1, 'At least one story', 'Stories are drafted from the requirements, then completed by you.', target({ request: 'DR-3-01', ui: '#/screen/stories' })), need(!noPer.length && st.length, `Every story names the kind of user it is for (${noPer.length} do not)`, 'Each story has to serve a kind of user.', target({ request: 'DR-3-05', ui: '#/screen/stories' })), need(!primUncovered.length, `Every main kind of user has a story (${primUncovered.length} without)`, 'The Stage 3 sign-off needs a story for each main kind of user.', target({ request: 'DR-3-05', ui: '#/screen/stories' }))])];
  },
};

const businessRules = {
  key: 'business_rules', title: 'Business Rules', phase: 3, role: 'Product Owner', artifact: null,
  reads: ['BusinessRule'],
  build(k) {
    const r = k.list('BusinessRule');
    return [sec('rules', 'The rules only the company can set', [
      r.length ? p(`${plural(r.length, 'business rule')} are recorded: ${countsText(countBy(r, (x) => x.category))}.`) : p('No business rules are recorded yet.'),
      r.length && tableOf(r, [['ID', (x) => `[[${x.id}]]`], ['Rule', (x) => clip(x.statement, 240)], ['Category', (x) => plain.word('', x.category)], ['Kind', (x) => plain.word('', x.kind)], ['Numbers it uses', (x) => (x.parameters || []).join('; ')], ['Applies to', (x) => k.out(x.id, 'applies').map((y) => y.title).join('; ')], ['Owner', (x) => x.owner], ['Status', (x) => x.status]]),
    ], [needCount(r, 1, 'At least one business rule', 'Pricing, limits, roles and SLAs are rules.', target({ request: 'DR-3-02' })), need(r.every((x) => k.out(x.id, 'applies').length), 'Every rule is applied to a requirement, story or step', 'A rule nobody applies does nothing.', target({ request: 'DR-3-02' }))])];
  },
};

const acceptanceCriteria = {
  key: 'acceptance_criteria', title: 'Acceptance Criteria', phase: 3, role: 'QA lead', artifact: null,
  reads: ['AcceptanceCriterion', 'Requirement', 'Story'],
  build(k) {
    const acs = k.list('AcceptanceCriterion');
    const must = k.list('Requirement', (r) => r.priority === 'Must' && r.subtype === 'functional');
    const lacking = must.filter((r) => { const a = k.inn(r.id, 'specifies'); return !(a.some((x) => x.scenario_type === 'happy') && a.some((x) => ['negative', 'boundary', 'edge'].includes(x.scenario_type))); });
    const groups = new Map();
    for (const a of acs) for (const t of k.out(a.id, 'specifies')) { if (!groups.has(t.id)) groups.set(t.id, { t, list: [] }); groups.get(t.id).list.push(a); }
    const blocks = [acs.length ? p(`${plural(acs.length, 'acceptance test')} ${acs.length === 1 ? 'is' : 'are'} written for ${plural(groups.size, 'item')}: ${countsText(countBy(acs, (a) => plain.word('scenario', a.scenario_type).toLowerCase()))}.`) : p('No acceptance criteria are written yet.')];
    for (const g of [...groups.values()].sort((a, b) => a.t.id.localeCompare(b.t.id, undefined, { numeric: true })).slice(0, 40)) {
      blocks.push(p(`For ${clip(g.t.title, 90)}:`));
      blocks.push((tableOf(g.list, [['ID', (a) => `[[${a.id}]]`], ['Kind of test', (a) => plain.word('scenario', a.scenario_type)], ['Given', (a) => clip(a.given, 120)], ['When', (a) => clip(a.when, 120)], ['Then', (a) => clip(a.then, 160)], ['Status', (a) => a.status]]) as any));
    }
    return [sec('ac', 'Tests by requirement', blocks, [needCount(acs, 1, 'At least one acceptance test', '', target({ request: 'DR-3-06', ui: '#/screen/stories' })), need(!lacking.length, `Every must-have function has a normal-case test and a failure or edge-case test (${lacking.length} do not)`, 'The Stage 3 sign-off needs both kinds of test for every must-have function.', target({ request: 'DR-3-06', ui: '#/screen/stories' }))])];
  },
};

const nfrs = {
  key: 'nfrs', title: 'Quality Targets (Non-Functional Requirements)', phase: 3, role: 'Tech lead', artifact: null,
  reads: ['Requirement'],
  build(k) {
    const n = k.list('Requirement', (r) => r.subtype === 'non_functional');
    const must = n.filter((r) => r.priority === 'Must');
    const incomplete = must.filter((r) => ['category', 'metric', 'comparator', 'target_value', 'unit', 'condition', 'environment', 'measurement_point', 'measurement_tool'].some((f) => r[f] === undefined || r[f] === ''));
    const unscoped = n.filter((r) => !r.global && !k.out(r.id, 'applies_to').length);
    const weak = n.filter((r) => r.basis === 'invented' || (r.basis === 'assumed' && !k.out(r.id, 'assumes').length));
    return [sec('nfr', 'Quality targets', [
      n.length ? p(`${plural(n.length, 'quality target')} across ${countsText(countBy(n, (r) => plain.word('', r.category).toLowerCase()))}.`) : p('No quality targets are recorded yet.'),
      n.length && tableOf(n, [['ID', (r) => `[[${r.id}]]`], ['Kind', (r) => plain.word('', r.category)], ['Target', (r) => `${r.metric || ''}: ${r.comparator || ''} ${r.target_value === undefined ? '?' : r.target_value} ${r.unit || ''}${r.percentile ? ` for ${String(r.percentile).replace(/^p/i, '')} out of 100 cases` : ''}`.trim()], ['When', (r) => clip(r.condition, 90)], ['Measured by', (r) => [r.measurement_point, r.measurement_tool].filter(Boolean).join(' / ')], ['Where the number came from', (r) => plain.word('', r.basis)], ['Applies to', (r) => (r.global ? 'whole product' : k.out(r.id, 'applies_to').map((x) => x.title).join('; ') || 'not said yet')], ['Priority', (r) => plain.word('priority', r.priority)]]),
    ], [needCount(n, 1, 'At least one quality target', '', target({ request: 'DR-3-03' })), need(!incomplete.length, `Every must-have quality target has a number and a way to measure it (${incomplete.length} incomplete)`, 'The Stage 3 sign-off needs every must-have target measurable.', target({ request: 'DR-3-03' })), need(!unscoped.length, `Every quality target says whether it applies to the whole product or to parts (${unscoped.length} do not)`, 'Each target has to say where it applies.', target({ request: 'DR-3-04' })), need(!weak.length, `No quality target rests on an invented number or an unlinked assumption (${weak.length})`, 'Numbers must have a source, or be recorded as assumptions.', target({ request: 'DR-3-03' }))])];
  },
};

const integrationRequirements = {
  key: 'integration_requirements', title: 'Integration Requirements', phase: 3, role: 'Tech lead', artifact: null,
  reads: ['Requirement', 'ExternalSystem'],
  build(k) {
    const ifr = k.list('Requirement', (r) => r.subtype === 'interface'); const ext = k.list('ExternalSystem');
    const unlinked = ext.filter((e) => !k.inn(e.id, 'integrates_with').length);
    return [
      sec('interfaces', 'Links to other systems', [
        ifr.length ? p(`${plural(ifr.length, 'link to another system', 'links to other systems')} ${ifr.length === 1 ? 'is' : 'are'} recorded.`) : p('No links to other systems are recorded yet.'),
        ifr.length && tableOf(ifr, [['ID', (r) => `[[${r.id}]]`], ['Other side', (r) => r.counterparty], ['Direction', (r) => r.direction], ['How they talk', (r) => r.protocol], ['What it must do', (r) => clip(r.statement, 140)], ['When it fails', (r) => clip(r.failure_handling, 120)]]),
      ], [need(ifr.length || !ext.length, 'A written link for each outside system', 'Each outside system needs its connection described.', target({ request: 'DR-3-01' })), need(ifr.every((r) => r.failure_handling && r.counterparty && r.direction), 'Every link says who is on the other side, which way data goes and what happens on failure', 'Each connection has to say what happens when it fails.', target({ request: 'DR-3-01' }))]),
      sec('ext', 'Outside systems', [
        ext.length ? p(`${plural(ext.length, 'outside system')} ${ext.length === 1 ? 'is' : 'are'} registered.`) : p('No external systems are registered yet.'),
        ext.length && tableOf(ext, [['ID', (e) => `[[${e.id}]]`], ['System', (e) => e.title], ['Provider', (e) => e.provider], ['Kind', (e) => e.kind], ['Criticality', (e) => e.criticality], ['Owner', (e) => e.owner], ['Used by', (e) => k.inn(e.id, 'integrates_with').map((x) => x.title).join('; ') || 'no requirement yet']]),
      ], [need(!unlinked.length, `Every outside system is covered by a written link (${unlinked.length} are not)`, 'Each outside system needs its connection described.', target({ request: 'DR-3-01' }))]),
    ];
  },
};

const traceability = {
  key: 'traceability', title: 'Traceability', phase: 3, role: 'Product Owner', artifact: null,
  reads: ['Evidence', 'Insight', 'Feature', 'Requirement', 'Story', 'AcceptanceCriterion', 'FlowStep'],
  build(k) {
    const ctx = new Q.Ctx(k.store, {});
    const fu = coverage.funnel(ctx); const gaps = coverage.gaps(ctx);
    const reqs = k.list('Requirement');
    const gapRows = [['Requirements with no test', gaps.requirementsWithoutAC.length], ['Requirements with no story', gaps.requirementsWithoutStory.length], ['Requirements that do not come from anything', gaps.requirementsWithoutProvenance.length], ['Must-have requirements not in any flow step', gaps.mustRequirementsNotInFlow.length], ['Incomplete stories', gaps.storiesIncomplete.length], ['Quality targets with no place to apply or no test', gaps.nfrUnscopedOrUnverified.length]];
    return [
      sec('funnel', 'From evidence to flow step', [
        note('How to read this: traceability follows each idea down the chain, from evidence to finding to feature to requirement to story to test to flow step. The percentage shown on screen is the share of items that continue to the next link. It can go down when you add new items that are not yet linked, even though nothing already linked was lost.'),
        p(`The chain runs ${fu.map((s) => `${s.total} ${s.name.toLowerCase()}${s.total === 1 ? '' : 's'}`).join(' > ')}. Each number counts the items that continue to the next link in the chain.`),
        table(['Link in the chain', 'Items', 'Continuing', 'Dropped'], fu.map((s) => [s.name, String(s.total), String(s.continuing), String(s.total - s.continuing)])),
      ], [need(fu.every((s) => s.total > 0 || s.name === 'Flow step'), 'Every link in the chain up to requirements has items', '', target({ request: 'DR-3-15' }))]),
      sec('gaps', 'Gaps', [
        table(['Gap', 'Count'], gapRows.map((r) => [r[0], String(r[1])])),
        reqs.length && tableOf(reqs, [['Requirement', (r) => `[[${r.id}]]`], ['Comes from', (r) => k.out(r.id, 'derives_from').map((x) => x.title).join('; ') || 'none'], ['Stories', (r) => k.inn(r.id, 'elaborates').map((x) => x.title).join('; ') || 'none'], ['Tests', (r) => k.inn(r.id, 'specifies').map((x) => x.title).join('; ') || 'none'], ['Flow steps', (r) => k.inn(r.id, 'covers').map((x) => x.title).join('; ') || 'none']]),
      ], [need(!gaps.requirementsWithoutProvenance.length, `Every requirement comes from something (${gaps.requirementsWithoutProvenance.length} do not)`, 'A requirement with no source is only an opinion.', target({ request: 'DR-3-12' })), need(!gaps.requirementsWithoutAC.length, `No requirement without a test (${gaps.requirementsWithoutAC.length})`, 'The Stage 3 sign-off needs a test for every requirement that describes behaviour.', target({ request: 'DR-3-14', ui: '#/screen/stories' }))]),
    ];
  },
};

export default [prd, userStories, businessRules, acceptanceCriteria, nfrs, integrationRequirements, traceability];
