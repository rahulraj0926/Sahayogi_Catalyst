/**
 * Pack: BoSS Rebuild (software, existing system being replaced, depth L1). Seeded through Phase 2: Gates 0 and 1 decided,
 * Gate 2 blocked because the Must effort does not fit the approved capacity, the scope baseline decision is still only
 * proposed, and one Must question is open. The AS-IS side is recorded as Evidence (inventory of the current modules) and in
 * each Feature's description ("replaces ..."); the engine has no dedicated AS-IS or gap item types yet. All facts are invented.
 */
const E = (title, kind, cls, date, grade, extra?) => [title, kind, cls, date, grade, extra];
export default {
  key: 'boss', name: 'BoSS Rebuild', mode: 'replace', depth: 'L1', currency: 'INR', sponsor: 'Arjun Das', owner: 'Arjun Das', legal: 'Meera Iyer',
  reach: 2, decide: [0, 1], artifacts: false, experiments: false, last: '2026-09-20', lastNote: 'Rohan Mehta asked for a second estimate of the settlement module after the capacity check failed.',
  baselineStatus: 'Proposed', baselineWhy: 'Waiting for the capacity check to pass and the integration question to be answered.',
  dates: { start: '2026-06-22', g0: '2026-07-10', g1: '2026-08-07' },
  people: [
    ['Arjun Das', 'Sponsor', 'Head of Finance and Operations', 'Retire the old system without a gap in month-end close', true],
    ['Rohan Mehta', 'Delivery', 'CTO', 'A rebuild that does not stop feature work for two years', false],
    ['Branch manager panel (internal customers)', 'Customer', 'Branch managers', 'Same reports, fewer manual fixes', false],
    ['Back-office clerks (internal users)', 'End-user', 'Back-office clerk', 'Keep the screens they know where it makes sense', false],
  ],
  intake: {
    idea: 'Replace the 14-year-old Back-office Support System (BoSS) with a maintainable platform that keeps today\'s behaviour first and improves it later.',
    requester: 'Arjun Das (Head of Finance and Operations)',
    problem: 'The back-office system that runs settlements, reconciliation and branch reporting is 14 years old. Only two people understand its code, each change takes weeks and breaks other reports, and the vendor stops support in 2028.',
    purpose: 'Remove the single-point-of-knowledge risk and the end-of-support deadline without disturbing month-end close.',
    outcome: 'All BoSS functions run on the new platform by March 2028 with identical month-end results for three months in parallel.',
    neededBy: '2028-03-31', urgency: 'high', assets: ['BoSS source code and database', 'Two engineers who know BoSS', 'Month-end close calendar'], refs: ['Current BoSS screens and reports'], data: ['ledger', 'settlements'], personal: true, jurisdictions: ['India'], criticality: 'business',
  },
  evidence: [
    E('AS-IS inventory: 9 BoSS modules, 212 screens, 140 reports', 'document', 'internal', '2026-07-01', 'B'),
    E('Change log analysis: 38 percent of changes in two years broke another report', 'data_file', 'internal', '2026-07-08', 'B'),
    E('Interviews with 7 back-office clerks and 3 branch managers', 'interview', 'primary', '2026-07-15', 'B'),
  ],
  insights: [
    ['The cost and risk of change in BoSS is rising, not the lack of features', 'Validated', 'Reported', [0, 1]],
    ['Clerks value the existing reconciliation screens and will resist a redesign', 'Validated', 'Reported', [2]],
  ],
  assumptions: [
    ['The ledger database can be migrated with a one-time load and a three-month parallel run', 'technical', 3, 5, 'Rohan Mehta', 2, 'migration rehearsal on a copy'],
    ['The vendor will extend support by six months if the rebuild slips', 'commercial', 3, 4, 'Arjun Das', 2, 'written confirmation'],
    ['Branch reports can be reproduced exactly from the new platform', 'technical', 2, 4, 'Rohan Mehta', 2, 'report comparison on 12 months of data'],
  ],
  constraints: [
    ['budget', 'Rebuild budget over two years', 3.2, 'INR crore', 'hard', 'Arjun Das'],
    ['date', 'BoSS vendor support ends', 2028, 'March 2028', 'hard', 'Arjun Das'],
  ],
  questions: [
    ['Must the new platform keep the old report layouts exactly?', 'Must', 1, 'Arjun Das', 'Answered', 'Yes for the 20 statutory and month-end reports; others may change.'],
    ['Which payment-gateway interface will settlements use after cut-over?', 'Must', 2, 'Rohan Mehta', 'Open'],
    ['Is a branch self-service portal in scope for the rebuild?', 'Should', 2, 'Arjun Das', 'Open'],
  ],
  risks: [['Month-end results differ between old and new systems', 'market', 3, 5, 'Arjun Das', 'Close is delayed and trust in the rebuild is lost']],
  scope0: [
    ['Settlements, reconciliation, ledger posting and the 20 statutory reports', 'in', 'the functions BoSS exists for'],
    ['New products and features beyond today\'s behaviour', 'out', 'behaviour first, improvements after cut-over'],
    ['Branch self-service portal', 'unknown', 'depends on the answer from branch managers', 2],
  ],
  externals: [['Payment gateway', 'payment provider', 'payment_gateway', 'critical', 'Rohan Mehta']],
  // ---- phase 1
  segments: [['Back-office and branch finance staff', 'About 120 clerks and 30 branch managers who use BoSS every working day', true, 150]],
  personas: [['Back-office clerk', 'internal_user', true, 'Post and reconcile quickly with the screens they know', 0], ['Branch manager', 'buyer', true, 'Get the month-end numbers on time and unchanged', 0]],
  jobs: [
    ['When the month ends I want settlements reconciled without manual fixes so the close finishes on time', 5, 0, 0, [0, 1]],
    ['When a report is needed I want the same layout as before so I can compare months', 5, 0, 1, [2]],
    ['When a rule changes I want it changed once so I do not repeat the fix in many reports', 4, 0, 0, [1]],
  ],
  problems: [['Changes to BoSS take weeks and often break another report', 5, 0]],
  opportunities: [['A like-for-like rebuild on a maintained platform with automated report comparison', 0, 0, 0]],
  competitors: [
    { name: 'Off-the-shelf finance back-office suite', kind: 'direct', tier: 'T1', basis: 'customer_shortlist', pos: 'Standard modules for settlement and reconciliation',
      profile: { website: 'https://backoffice-suite.example', hq_country: 'United States', size_band: '5000+', strengths: 'Maintained by the vendor', weaknesses: 'Statutory report layouts need custom work', tier_class: 'tier1' },
      cells: [['Statutory report layouts', 'partial', 5, 0, 'custom work needed'], ['Parallel-run support', 'absent', 4, 0]], noPrice: 'Enterprise licence quoted per deal; no list price' },
    { name: 'Keep BoSS and patch it (status quo)', kind: 'in_house', tier: 'S', basis: 'customer_shortlist', pos: 'No migration risk, rising cost of change', cells: [['Statutory report layouts', 'strong', 5, 1, 'exact today']], noPrice: 'Only maintenance cost; no price' },
  ],
  // ---- phase 2
  objectives: [['vision', 'Run back-office on a maintainable platform', 'Run settlement, reconciliation and reporting on a platform the company can change safely.'], ['objective', 'Cut over without a gap in close', 'Cut over all BoSS functions by March 2028 with identical month-end results']],
  metrics: [['Report match rate in parallel run', '%', 'none_new_product', null, 100, '>=', 'Rohan Mehta', 'automated report comparison', 1]],
  modules: [['Settlement and Reconciliation', 'Settlement runs, matching and exception handling'], ['Ledger and Reporting', 'Ledger posting, statutory and branch reports']],
  releases: [['Release 1: settlement and reconciliation', true, '2026-11-02', '2027-09-30']],
  features: [
    { name: 'Settlement runs (replaces BoSS module SET)', desc: 'Replaces the AS-IS settlement module with 38 screens and 12 reports', module: 0, pri: 'Must', eff: 14, supports: ['obj:1'] },
    { name: 'Reconciliation and exception queue (replaces module REC)', desc: 'Replaces the AS-IS reconciliation module with 27 screens', module: 0, pri: 'Must', eff: 12, supports: ['obj:1'] },
    { name: 'Ledger posting (replaces module LDG)', desc: 'Replaces the AS-IS ledger module; posting rules move unchanged', module: 1, pri: 'Must', eff: 10, supports: ['obj:1', 'met:0'] },
    { name: 'Statutory and month-end reports (replaces 20 reports)', desc: 'Replaces 20 AS-IS statutory and month-end reports with identical layouts', module: 1, pri: 'Must', eff: 11, supports: ['obj:1', 'met:0'] },
    { name: 'Automated report comparison for the parallel run', module: 1, pri: 'Should', eff: 5, supports: ['met:0'] },
    { name: 'Branch self-service portal', module: 1, pri: 'Could', eff: 12, scope: 'later', supports: ['obj:0'] },
  ],
  systemFunctions: [
    { name: 'Month-end settlement run', area: 'Module SET', how: 'A clerk exports the day files, runs a macro, and posts the result by hand. It takes about two days.', wrong: 'The macro breaks every quarter when a bank changes its file layout.', decision: 'fix', target: 'The platform reads the bank files itself and posts without a manual export.', owner: 'Arjun Das', confirmed: 'Rohan Mehta', feature: 0 },
    { name: 'Reconciliation queue', area: 'Module REC', how: 'Unmatched lines wait in a list. A clerk matches each by hand, oldest first.', wrong: 'No way to see what is waiting longest or who has it.', decision: 'fix', target: 'The same list, with age and owner shown, and matching suggestions.', owner: 'Arjun Das', confirmed: 'Rohan Mehta', feature: 1 },
    { name: 'Statutory report layouts', area: '20 reports', how: 'Twenty reports with fixed layouts that auditors compare month to month.', decision: 'keep', target: 'Identical layouts and numbers, checked by a parallel run.', owner: 'Arjun Das', feature: 3 },
    { name: 'Fax receipt gateway', area: 'Module MSG', how: 'Receives branch confirmations by fax and files them as images.', wrong: 'Nobody has sent a fax in three years.', decision: 'drop', owner: 'Arjun Das', confirmed: 'Rohan Mehta' },
    { name: 'Branch confirmation by phone call', area: 'Outside BoSS', how: 'Branches phone the head office to confirm month-end totals. Nothing is recorded.', decision: 'confirm_first', owner: 'Arjun Das' },
  ],
  capacity: [['Rebuild team', 'team', 5, 80, 40]],
  scope2: [['New products and features beyond today\'s behaviour', 'out', 'Business requests wait until after cut-over', 'Behaviour first keeps the parallel run comparable', 'con:1'], ['Branch self-service portal', 'later', 'Branch managers keep asking the back office', 'Not needed for cut-over', 'con:0', 5]],
};
