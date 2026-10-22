/**
 * Pack: Sahayogi Developer (software, depth L1). Seeded through Phase 3: Gates 0 to 2 decided, Gate 3 blocked by an open
 * Must question, one Must requirement whose acceptance criterion is still a draft, and one NFR with no measurement tool.
 * All facts are invented (origin invented).
 */
const E = (title, kind, cls, date, grade, extra?) => [title, kind, cls, date, grade, extra];
export default {
  key: 'developer', name: 'Sahayogi Developer', mode: 'greenfield', depth: 'L1', currency: 'INR', sponsor: 'Kanishk', owner: 'Kanishk', legal: 'Meera Iyer',
  reach: 3, decide: [0, 1, 2], artifacts: true, experiments: false, last: '2026-10-09', lastNote: 'Ravi Menon walked the requirements list with two pilot product teams.',
  dates: { start: '2026-07-06', g0: '2026-07-20', g1: '2026-08-14', g2: '2026-09-11' },
  people: [
    ['Kanishk', 'Sponsor', 'Product leader', 'One trusted trail from evidence to developer handoff', true],
    ['Ravi Menon', 'Delivery', 'Tech lead', 'A scope a team of five can build in two quarters', false],
    ['Pilot product team (Dealer Order Portal)', 'Customer', 'Product team', 'Know what is done, what is missing and what changed', false],
    ['Business analyst, pilot team', 'End-user', 'Business analyst', 'Capture facts once and have documents composed from them', false],
  ],
  intake: {
    idea: 'A tool that keeps product evidence, requirements, decisions and flows in one traceable record and writes the readable documents from it.',
    requester: 'Kanishk (Product leader)',
    problem: 'Product teams keep requirements, evidence and decisions in documents and chats that drift apart. Nobody can tell which requirement came from which customer evidence, what changed after approval, or whether a phase is ready to hand over.',
    purpose: 'Give product leaders a single record of why each requirement exists and what is still missing before development starts.',
    outcome: 'Three pilot teams run Phases 0 to 4 on the record and a developer receives a complete, traceable story package.',
    neededBy: '2027-01-31', urgency: 'medium', assets: ['A working prototype of the engine', 'Pilot access to two product teams'], refs: ['Atlas Boards', 'Specsmith'], data: ['product_documents'], personal: false, jurisdictions: ['India'],
  },
  evidence: [
    E('Interviews with 6 product leaders about document drift', 'interview', 'primary', '2026-07-14', 'B'),
    E('Audit of 3 recent PRDs: requirements with no stated source', 'document', 'internal', '2026-07-18', 'B'),
    E('Survey of 25 business analysts on rework causes', 'survey', 'primary', '2026-07-30', 'B'),
    E('Competitor product pages and price lists (dated captures)', 'web_page', 'vendor_claim', '2026-08-04', 'B', { fields: { url_or_file: 'https://atlasboards.example/pricing' } }),
  ],
  insights: [
    ['Teams cannot show where a requirement came from when asked in a review', 'Validated', 'Reported', [0, 1]],
    ['Rework is mostly caused by changes that nobody traced to the affected requirements', 'Validated', 'Reported', [2]],
  ],
  assumptions: [
    ['Product teams will enter facts once if documents are composed from them', 'commercial', 3, 5, 'Kanishk', 2, 'pilot with 3 teams'],
    ['An AI assistant can propose competitor and market data that a person then verifies', 'technical', 3, 4, 'Ravi Menon', 2, 'pilot on one competitor set'],
    ['Teams accept a record where unverified items never count toward a gate', 'commercial', 2, 4, 'Kanishk', 2, 'pilot feedback'],
  ],
  constraints: [
    ['budget', 'Build budget for the first two quarters', 60, 'INR lakh', 'hard', 'Kanishk'],
    ['date', 'Pilot with three product teams starts by the end of January', 2027, 'January', 'soft', 'Kanishk'],
  ],
  questions: [
    ['Do pilot teams need single sign-on in the first release?', 'Must', 1, 'Ravi Menon', 'Answered', 'No. Named accounts are enough for the pilot.'],
    ['Which export format does a developer tool accept for story packages?', 'Must', 3, 'Ravi Menon', 'Open'],
    ['Should the tool offer a Hindi interface?', 'Should', 3, 'Kanishk', 'Open'],
  ],
  risks: [['Teams keep working in documents and ignore the record', 'market', 3, 4, 'Kanishk', 'The record goes stale and loses trust']],
  scope0: [
    ['Evidence, requirements, decisions, flows and the readable documents composed from them', 'in', 'the core of the problem'],
    ['Code generation and test execution', 'out', 'belongs to later lifecycle phases'],
    ['Project scheduling and time tracking', 'unknown', 'depends on pilot team requests', 1],
  ],
  externals: [['AI research assistant', 'model provider', 'partner_api', 'medium', 'Ravi Menon']],
  // ---- phase 1
  segments: [['Product teams in mid-size Indian companies', 'Teams of 4 to 20 people shipping software or devices with a named product leader', true, 300]],
  personas: [['Product leader', 'buyer', true, 'See whether a phase is ready and what is missing', 0], ['Business analyst', 'customer_user', true, 'Capture facts once and trace every requirement to its source', 0]],
  jobs: [
    ['When a requirement is questioned I want to show its source so I can defend it in the review', 5, 0, 1, [0, 1]],
    ['When something changes I want to see what it affects so nothing is missed', 5, 0, 0, [0]],
    ['When a phase ends I want to see what is missing so I can decide to go on or stop', 4, 0, 0, [1]],
  ],
  problems: [['Requirements, evidence and decisions drift apart and changes are not traced', 4, 0]],
  opportunities: [['One traceable record that flags what a change affects and composes the documents from it', 1, 0, 0]],
  competitors: [
    { name: 'Atlas Boards (product management suite)', kind: 'direct', tier: 'T1', basis: 'customer_shortlist', pos: 'Roadmaps and feedback boards for product teams',
      profile: { website: 'https://atlasboards.example', founded_year: 2017, hq_country: 'United States', size_band: '201-1000', funding_summary: 'Series C, invented figures', strengths: 'Polished roadmaps and feedback boards', weaknesses: 'No gate checks; traceability is manual', tier_class: 'tier1' },
      cells: [['Requirement-to-evidence traceability', 'partial', 5, 3, 'links exist but are manual'], ['Change impact flags', 'absent', 5, 3]], prices: [{ plan: 'Team plan', amount: 20, currency: 'USD', unit: 'user/month', metric: 'user', type: 'list', billing: 'subscription', evIdx: 3 }] },
    { name: 'Specsmith (requirements document editor)', kind: 'direct', tier: 'T2', basis: 'marketplace_compare', pos: 'Structured requirements documents with review comments',
      profile: { website: 'https://specsmith.example', hq_country: 'Germany', size_band: '51-200', tier_class: 'tier2' },
      cells: [['Requirement-to-evidence traceability', 'parity', 5, 3], ['Change impact flags', 'partial', 5, 3]], prices: [{ plan: 'Business', amount: 15, currency: 'USD', unit: 'user/month', metric: 'user', type: 'list', billing: 'subscription', evIdx: 3 }] },
    { name: 'Spreadsheets and shared documents (status quo)', kind: 'alternative', tier: 'S', basis: 'customer_shortlist', pos: 'Free and familiar, no trace', cells: [['Change impact flags', 'absent', 5, 0]], noPrice: 'No price; the cost is analyst time' },
  ],
  // ---- phase 2
  objectives: [['vision', 'Every requirement has a traceable reason', 'Every requirement carries its source, its owner and what depends on it.'], ['objective', 'Pilot teams reach a gate-ready record', 'Three pilot teams reach Gate 3 with a complete traceable record by March 2027']],
  metrics: [['Requirements with a stated source', '%', 'measured', 62, 100, '>=', 'Kanishk', 'record query', 1], ['Pilot teams at Gate 3', 'teams', 'none_new_product', null, 3, '>=', 'Kanishk', 'pilot log', 1]],
  modules: [['Record', 'Items, links, status and change flags'], ['Documents and Reports', 'Composed documents, next actions and reports']],
  releases: [['R1 pilot: record, gates and documents', true, '2026-10-12', '2027-01-29']],
  features: [
    { name: 'Typed record with links and change flags', module: 0, pri: 'Must', eff: 14, supports: ['obj:1', 'met:0'], realizes: ['opp:0'], addresses: ['prb:0'], fr: 'When an approved item changes, the tool shall flag every item that depends on it within 5 seconds and list the cause.', want: 'to see what a change affects', persona: 0,
      ac: [['happy', 'an approved requirement linked to two stories', 'the requirement statement is edited', 'both stories are flagged suspect with the changed field named'], ['negative', 'an item with no dependents', 'the item is edited', 'no flag is raised']] },
    { name: 'Gate checks with named blockers', module: 0, pri: 'Must', eff: 12, supports: ['obj:1', 'met:1'], fr: 'The tool shall evaluate each gate criterion from the record and shall list the items that cause every failing criterion.', want: 'to see what blocks a gate', persona: 0,
      ac: [['happy', 'a record with one failing criterion', 'the gate is opened', 'the criterion is shown as failing with its offending items named'], ['negative', 'a criterion that depends on unverified agent items', 'the gate is evaluated', 'the unverified items are not counted']] },
    { name: 'Composed readable documents', module: 1, pri: 'Must', eff: 10, supports: ['obj:1'], fr: 'The tool shall compose each of the 30 phase documents from the record and shall list what is missing with a link to where it can be added.', want: 'to read a complete document built from the facts', persona: 1, acStatus: 'Draft',
      ac: [['happy', 'a record with competitors and prices', 'the competitor analysis is opened', 'the document shows the grid and prices with their provenance'], ['negative', 'a record with no prices', 'the competitor analysis is opened', 'a Missing block names the absent prices and where to add them']] },
    { name: 'Verification queue for agent-proposed values', module: 0, pri: 'Must', eff: 6, supports: ['obj:1'], fr: 'The tool shall keep every agent-proposed value out of gate counts until a person other than the submitter verifies it.', want: 'to verify agent findings against their sources', persona: 1,
      ac: [['happy', 'an unverified agent price', 'a different person verifies it', 'the price counts toward the gate'], ['negative', 'an unverified agent price', 'the submitter tries to verify it', 'the verification is refused']] },
    { name: 'Hindi interface', module: 1, pri: 'Could', eff: 5, scope: 'later', supports: ['obj:1'] },
    { name: 'Code generation from stories', module: 0, pri: 'Wont', eff: 40, scope: 'out', supports: ['obj:0'] },
  ],
  capacity: [['Core build team', 'team', 5, 85, 52]],
  scope2: [['Code generation from stories', 'out', 'Teams still receive stories as text', 'Belongs to Phase 8 and is a separate product decision', 'con:0', 5], ['Hindi interface', 'later', 'Some pilot analysts may ask for it', 'Not a pilot blocker', 'con:1', 4]],
  // ---- phase 3
  nfrs: [
    { title: 'Change flag latency', cat: 'latency', metric: 'time from an edit to the dependent items being flagged', op: '<=', target: 5, unit: 's', pct: 'p95', cond: 'record of 5000 items and 12000 links', point: 'server timing log', tool: 'benchmark script', basis: 'benchmarked', applies: [0], assumes: [0] },
    { title: 'Record availability', cat: 'availability', metric: 'successful requests per month', op: '>=', target: 99.5, unit: '%', cond: 'pilot hours, excluding planned maintenance', point: 'uptime probe', tool: 'uptime probe', basis: 'assumed', global: true, assumes: [0], acStatus: 'Draft' },
  ],
  interfaces: [{ title: 'Accept agent research batches', statement: 'The tool shall accept a batch of proposed items from an AI assistant, shall create them as unverified and shall reject the whole batch if any item is invalid.', counterparty: 'AI research assistant', direction: 'inbound', protocol: 'JSON over HTTP', failure: 'Reject the batch, return every error and keep the record unchanged', ext: 0, feature: 3 }],
};
