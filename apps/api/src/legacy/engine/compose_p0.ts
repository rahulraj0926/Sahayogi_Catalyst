/**
 * engine/compose_p0.ts - Phase 0 documents: Product Intake Document, Stakeholder Register, Evidence Register,
 * Constraints, Open Questions, Initial Scope Boundary. Each entry: { key, title, phase, role, artifact, reads, build(kit) }.
 */
import * as K from './compose_kit';
import * as gates from './gates';
import * as freshness from './freshness';
import * as questions from './questions';
import * as plain from './plain';

const { p, ul, note, tableOf, sec, need, needCount, target, cap, clip, sentence, plural, andList, countBy, countsText } = K;

const intake = {
  key: 'intake_document', title: 'Product Intake Document', phase: 0, role: 'Product Owner', artifact: 'intake_document',
  reads: ['Product', 'IntakeBrief', 'Stakeholder', 'Constraint', 'Question', 'Assumption', 'ScopeEntry', 'Risk'],
  build(k) {
    const prod = k.product();
    const brief = k.list('IntakeBrief')[0];
    const sponsor = k.list('Stakeholder', (s) => s.is_sponsor)[0];
    const out = [];
    out.push(sec('product', 'The product', [
      prod ? p(`${prod.name} is ${prod.mode === 'greenfield' ? 'a new product' : prod.mode === 'replace' ? 'a rebuild of an existing product' : 'an extension of an existing product'}, checked with ${plain.THOROUGHNESS[prod.depth_level] || 'Standard'} thoroughness. ${sponsor ? `The sponsor is [[${sponsor.id}]] ${sponsor.title}${sponsor.role_title ? ` (${sponsor.role_title})` : ''}.` : 'No sponsor has been named yet.'}`) : p('No Product record exists yet.'),
    ], [need(prod, 'A named product, and whether it is new or builds on something that exists', 'Everything else is written under the product.', target({ request: 'DR-0-01' })), need(sponsor, 'A named sponsor', 'The Stage 0 sign-off needs a named sponsor.', target({ request: 'DR-0-04' }))]));
    out.push(sec('problem', 'Problem, purpose and outcome', brief ? [
      p(`The request${brief.requester ? ` came from ${brief.requester}` : ' is on record'}${brief.urgency ? `, urgency ${brief.urgency}` : ''}${brief.needed_by ? `, needed by ${brief.needed_by}` : ''}.`),
      brief.idea && p(`The idea in one paragraph: ${clip(brief.idea, 500)}`),
      brief.problem_statement && p(`The problem: ${clip(brief.problem_statement, 600)}`),
      brief.purpose && p(`The purpose: ${clip(brief.purpose, 400)}`),
      brief.desired_outcome && p(`The outcome wanted: ${clip(brief.desired_outcome, 400)}`),
      brief.requested_solution && p(`What the requester has in mind to build: ${clip(brief.requested_solution, 400)}`),
      brief.existing_assets && brief.existing_assets.length && p(`Existing assets: ${brief.existing_assets.join('; ')}.`),
      brief.reference_products && brief.reference_products.length && p(`Reference products: ${brief.reference_products.join(', ')}.`),
    ] : [p('There is no intake summary yet.')], [
      need(brief, 'An intake summary', 'The intake summary is the first record of why this product exists.', target({ request: 'DR-0-02' })),
      need(brief && brief.problem_statement, 'A problem statement (the pain people feel, not the solution)', 'The problem has to be described without already naming the thing to build.', target({ request: 'DR-0-02' })),
      need(brief && brief.purpose, 'A purpose', '', target({ request: 'DR-0-02' })),
      need(brief && brief.desired_outcome, 'The outcome wanted', '', target({ request: 'DR-0-02' })),
    ]));
    if (brief && (brief.data_categories || brief.jurisdictions || brief.personal_data !== undefined)) {
      out.push(sec('data', 'Data and jurisdiction', [p(`${brief.personal_data ? 'The product handles personal data.' : 'The product is recorded as handling no personal data.'}${brief.data_categories && brief.data_categories.length ? ` Data categories: ${brief.data_categories.join(', ')}.` : ''}${brief.jurisdictions && brief.jurisdictions.length ? ` Jurisdictions: ${brief.jurisdictions.join(', ')}.` : ''}${brief.criticality ? ` Criticality: ${brief.criticality}.` : ''}`)], []));
    }
    const qs = k.list('Question', (q) => !['Answered', 'Withdrawn'].includes(q.status));
    const asm = k.list('Assumption');
    out.push(sec('state', 'Where discovery stands', [
      p(`${plural(k.list('Stakeholder').length, 'stakeholder')}, ${plural(k.list('Constraint').length, 'constraint')}, ${plural(asm.length, 'assumption')}, ${plural(qs.length, 'open question')} and ${plural(k.list('Risk').length, 'risk')} are recorded.`),
      p('The detail is in the Stakeholder Register, Constraints, Open Questions and Initial Scope Boundary documents.'),
    ], []));
    return out;
  },
};

const stakeholders = {
  key: 'stakeholder_register', title: 'Stakeholder Register', phase: 0, role: 'Product Owner', artifact: null,
  reads: ['Stakeholder'],
  build(k) {
    const list = k.list('Stakeholder');
    const depth = gates.depthOf(k.store);
    const required = (gates.config().params.required_categories || {})[depth] || [];
    const have = new Set(list.filter((s) => s.status === 'Active').map((s) => s.category));
    const missingCats = required.filter((c) => !have.has(c));
    const byCat = countBy(list, (s) => s.category);
    return [
      sec('who', 'People and groups who matter', [
        list.length ? p(`${plural(list.length, 'stakeholder')} are registered: ${countsText(byCat)}.`) : p('No stakeholders are registered yet.'),
        list.length && K.tableOf(list, [['ID', (s) => `[[${s.id}]]`], ['Name', (s) => s.title], ['Kind of person', (s) => s.category], ['Role', (s) => s.role_title], ['Sponsor', (s) => (s.is_sponsor ? 'yes' : '')], ['Influence (1 to 5)', (s) => s.influence], ['Interest (1 to 5)', (s) => s.interest], ['What they need', (s) => clip(s.needs_summary, 120)], ['Status', (s) => s.status]]),
      ], [
        need(list.some((s) => s.is_sponsor && s.status === 'Active'), 'An active sponsor', 'The Stage 0 sign-off needs a named sponsor.', target({ request: 'DR-0-04' })),
        need(!missingCats.length, `Every kind of person needed at ${plain.THOROUGHNESS[depth] || 'this'} thoroughness is on the list (missing: ${missingCats.join(', ') || 'none'})`, 'The Stage 0 sign-off checks that each kind of person who matters is represented.', target({ request: 'DR-0-05' })),
      ]),
    ];
  },
};

const evidence = {
  key: 'evidence_register', title: 'Evidence Register', phase: 0, role: 'Product Owner', artifact: null,
  reads: ['Evidence'],
  build(k) {
    const today = k.store.today();
    const list = k.list('Evidence', null, { all: true });
    const depth = gates.depthOf(k.store);
    const minEv = (gates.config().params.min_evidence_g0 || {})[depth] || 3;
    const counted = list.filter((e) => e.status === 'Captured' && !(e.origin === 'agent' && e.verification !== 'verified'));
    const rows = list.map((e) => ({ e, f: freshness.evidenceState(e, today) }));
    const stale = rows.filter((r) => r.f.state === 'stale');
    return [
      sec('register', 'What we know and where it came from', [
        list.length ? p(`${plural(list.length, 'piece of evidence', 'pieces of evidence')} are on file; ${counted.length} are captured and checked (items found by an assistant count only after a different person has checked them). ${stale.length ? `${stale.length} ${stale.length === 1 ? 'is' : 'are'} past the maximum age for its kind.` : 'None is past its maximum age.'}`) : p('No evidence is registered yet.'),
        rows.length && K.table(['ID', 'Title', 'Kind', 'Kind of source', 'Reliability (A best)', 'Collected on', 'How recent', 'Status'], rows.map((r) => [`[[${r.e.id}]]`, r.e.title, plain.word('evidence_kind', r.e.kind), plain.word('source_class', r.e.source_class) || '-', r.e.reliability || '-', r.e.retrieved_on || r.e.published_on || '-', plain.word('freshness', r.f.state) + (r.f.ageDays !== null ? ` (${r.f.ageDays} days old)` : ''), r.e.status])),
      ], [
        needCount(counted, minEv, `At least ${minEv} captured and checked pieces of evidence (have ${counted.length})`, 'Recommended for the Stage 0 sign-off.', target({ request: 'DR-0-16' })),
        need(!stale.length, `No out-of-date evidence (${stale.length} out of date)`, 'Out-of-date evidence should be refreshed or retired.', target({ request: 'DR-0-17' })),
      ]),
    ];
  },
};

const constraints = {
  key: 'constraints', title: 'Constraints', phase: 0, role: 'Sponsor', artifact: null,
  reads: ['Constraint', 'Assumption'],
  build(k) {
    const list = k.list('Constraint');
    const kinds = (kk) => list.filter((c) => c.kind === kk && ['Proposed', 'Confirmed'].includes(c.status));
    return [
      sec('limits', 'Limits we must work within', [
        list.length ? p(`${plural(list.length, 'limit')} are recorded: ${countsText(countBy(list, (c) => plain.word('', c.kind).toLowerCase()))}. ${list.filter((c) => c.flexibility === 'hard').length} cannot be moved.`) : p('No constraints are recorded yet.'),
        list.length && K.tableOf(list, [['ID', (c) => `[[${c.id}]]`], ['Kind', (c) => plain.word('', c.kind)], ['Limit', (c) => clip(c.statement, 160)], ['Amount', (c) => (c.amount !== undefined ? `${c.amount} ${c.unit || ''}`.trim() : '')], ['Can it move?', (c) => plain.word('flexibility', c.flexibility)], ['Owner', (c) => c.owner], ['Last reviewed', (c) => c.reviewed_at], ['Status', (c) => c.status]]),
      ], [
        need(kinds('budget').length, 'A budget limit', 'The Stage 0 sign-off needs a budget and a deadline written down.', target({ request: 'DR-0-06' })),
        need(kinds('date').length, 'A deadline', 'The Stage 0 sign-off needs a budget and a deadline written down.', target({ request: 'DR-0-06' })),
        need(list.length && list.every((c) => c.owner && c.flexibility), 'Every limit has an owner and says whether it can move', 'Each limit needs a person who owns it.', target({ request: 'DR-0-07' })),
      ]),
    ];
  },
};

const openQuestions = {
  key: 'open_questions', title: 'Open Questions', phase: 0, role: 'Product Owner', artifact: null,
  reads: ['Question', 'Assumption', 'Waiver'],
  build(k) {
    const list = k.list('Question', null, { all: true });
    const open = list.filter((q) => !['Answered', 'Withdrawn'].includes(q.status));
    const rows = list.map((q) => ({ q, s: questions.effectiveState(k.store, q) }));
    const mustOpen = rows.filter((r) => r.q.priority === 'Must' && r.s.state === 'open');
    return [
      sec('list', 'Questions nobody can answer yet', [
        list.length ? p(`${plural(list.length, 'question')} are recorded, ${open.length} not yet answered. ${mustOpen.length ? `${mustOpen.length} must-answer ${mustOpen.length === 1 ? 'question is' : 'questions are'} still open: ${andList(mustOpen.slice(0, 4).map((r) => `"${clip(r.q.title, 70)}"`))}.` : 'No must-answer question is open.'}`) : p('No questions are recorded yet.'),
        rows.length && K.table(['ID', 'Question', 'How important', 'Needed by', 'Asked of', 'Status', 'How it was settled'], rows.map((r) => [`[[${r.q.id}]]`, clip(r.q.title, 140), r.q.priority === 'Must' ? 'Must answer' : r.q.priority, `Stage ${r.q.needed_by_gate}`, r.q.asked_of || r.q.owner || '-', r.q.status, r.s.state + (r.s.reason ? `: ${plain.clean(clip(r.s.reason, 80))}` : '')])),
      ], [
        needCount(list, 1, 'At least one question recorded', 'An empty list usually means questions have not been asked.', target({ request: 'DR-0-09' })),
        need(!mustOpen.length, `No must-answer question is still open (${mustOpen.length} open)`, 'Answer each one, assume an answer with an owner, or set it aside with an approval.', target({ request: 'DR-0-10' })),
        need(list.every((q) => q.owner || q.asked_of), 'Every question has an owner, or someone it is put to', '', target({ request: 'DR-0-09' })),
      ]),
    ];
  },
};

const initialScope = {
  key: 'initial_scope', title: 'Initial Scope Boundary', phase: 0, role: 'Sponsor', artifact: null,
  reads: ['ScopeEntry', 'Question', 'SystemFunction'],
  build(k) {
    const funcs = k.list('SystemFunction');
    const DEC = { keep: 'Keep as it is', fix: 'Fix', drop: 'Drop', add: 'Add something new', confirm_first: 'Confirm first' };
    const list = k.list('ScopeEntry', (s) => s.kind === 'initial_boundary');
    const by = (d) => list.filter((s) => s.disposition === d);
    const unknown = by('unknown');
    const untied = unknown.filter((s) => !k.inn(s.id, 'clarifies').length);
    const blockOf = (d, title) => by(d).length ? [K.tableOf(by(d), [['ID', (s) => `[[${s.id}]]`], ['Line', (s) => s.subject_text], ['Why', (s) => clip(s.rationale, 140)], ['Decider', (s) => s.decider]])] : [note(`No lines are marked ${title}.`)];
    return [
      ...(funcs.length ? [sec('existing', 'The existing system, function by function', [
        p(`${plural(funcs.length, 'function')} of the old system: ${funcs.filter((x) => x.status === 'Validated').length} confirmed by a second person, ${funcs.filter((x) => !x.decision).length} without a decision yet.`),
        K.tableOf(funcs, [['ID', (x) => `[[${x.id}]]`], ['Function', (x) => x.title], ['How it works today', (x) => clip(x.how_it_works, 160)], ['What is wrong', (x) => clip(x.whats_wrong, 120)], ['Decision', (x) => DEC[x.decision] || 'No decision yet'], ['How it should work', (x) => clip(x.target_behaviour, 160)], ['Confirmed by', (x) => x.verified_by || 'not yet']]),
      ], [])] : []),
      sec('in', 'In scope', [p(by('in').length ? `${plural(by('in').length, 'line')} are in scope.` : 'Nothing is marked in scope yet.'), ...blockOf('in', 'in scope')], [needCount(by('in'), 1, 'At least one in-scope line', 'The Stage 0 sign-off needs a first scope line.', target({ request: 'DR-0-11' }))]),
      sec('out', 'Out of scope', [p(by('out').length ? `${plural(by('out').length, 'line')} are explicitly out.` : 'Nothing is marked out of scope yet.'), ...blockOf('out', 'out of scope')], [needCount(by('out'), 1, 'At least one out-of-scope line', 'To draw an edge you need both sides of it.', target({ request: 'DR-0-11' }))]),
      sec('unknown', 'Not sure yet', [p(unknown.length ? `${plural(unknown.length, 'line')} are undecided; each should point to a question that will settle it.` : 'No undecided lines.'), ...(unknown.length ? [K.tableOf(unknown, [['ID', (s) => `[[${s.id}]]`], ['Line', (s) => s.subject_text], ['Question', (s) => k.inn(s.id, 'clarifies').map((q) => q.title).join('; ') || 'none linked']])] : [])],
        [need(!untied.length, `Every undecided line is tied to a question (${untied.length} are not)`, 'Each "not sure yet" line needs the question that will settle it.', target({ request: 'DR-0-09' }))]),
    ];
  },
};

export default [intake, stakeholders, evidence, constraints, openQuestions, initialScope];
