/**
 * scripts/seed_lifecycle.ts - demo records for Phases 5 to 12, added to an already seeded product.
 * Everything is invented (origin=invented) and DELIBERATELY incomplete so that every phase shows what a real gap looks like
 * (a story with no screen, a quality target with no alert, a regression test whose latest run failed, an unreviewed incident ...).
 * Gates 5-12 are not decided here: a person decides them in the tool.
 *
 * The wording of the records comes from a LifecycleSpec, so every sample product gets the same structure with its own names.
 * DEALER below is the original spec of the Dealer Order Portal; the other specs live in packs/lifecycle_specs.ts.
 */
export interface LifecycleSpec {
  actor: string; designer: string; reviewer: string; lead: string; dba: string; integ: string; qa: string; ops: string; stakeholder: string;
  fig: string; repo: string; git: string; ci: string;
  screens: [string, string, string, string]; orderWord: string;
  stateTexts: [string, string, string, string, string];
  comps: [[string, string, string, string], [string, string, string, string], [string, string, string, string], [string, string, string, string]]; // title, kind, technology, responsibility
  adr1: [string, string, string, string, string[]]; adr2: [string, string, string, string];
  api1: string; api2: string;
  specs: [string, string, string]; items: [string, string, string]; branch: string;
  plan: [string, string, string]; tests: { neg: string; edge: string; auth: string; integ: string; reg: string; sec: string };
  defect: [string, string]; minor: string; sec: string; uat: [string, string, string];
  release: [string, string, string]; alert: [string, string]; incident: [string, string, string]; feedback: [[string, string], string, string];
}

const DEALER: LifecycleSpec = {
  actor: 'Vikram Shah', designer: 'Meera Joshi', reviewer: 'Rohan Mehta', lead: 'Kanishk', dba: 'Rohan Mehta', integ: 'Priya Nair', qa: 'Anita Rao', ops: 'Rohan Mehta', stakeholder: 'Vikram Shah (dealer lead)',
  fig: 'demo-dealer-portal', repo: 'dealer-portal', git: 'https://git.example/dealer/pull', ci: 'https://ci.example/runs/881',
  screens: ['Dealer sign-in', 'Order entry with price list', 'Order status and history', 'Credit limit warning'], orderWord: 'order',
  stateTexts: ['Wrong password message.', 'Spinner on the sign-in button.', 'Skeleton rows.', 'What the dealer sees when the order page is', 'Order entry'],
  comps: [['Dealer web app', 'frontend', 'Next.js', 'Dealer screens, price list, order forms.'], ['Order API', 'backend', 'NestJS', 'Orders, credit checks, ERP sync.'], ['Order database', 'database', 'PostgreSQL', 'Orders, dealers, price lists.'], ['ERP adapter', 'integration', 'Queue + REST', 'Order status from the ERP and courier.']],
  adr1: ['Use PostgreSQL for orders', 'Orders need transactions and reporting.', 'Store orders in PostgreSQL.', 'Need backups and a migration process.', ['MongoDB', 'ERP tables only']],
  adr2: ['Sync order status through a queue', 'The ERP is slow and sometimes offline.', 'Put ERP calls behind a queue with retries.', 'Order status can be a few minutes late.'],
  api1: 'Order API v1', api2: 'ERP status webhook',
  specs: ['Specification: sign-in', 'Specification: order placement', 'Specification: credit limit check'], items: ['Build sign-in', 'Build order placement', 'Build credit limit check'], branch: 'feature/credit-limit',
  plan: ['Release 1 test plan', 'All Must stories of Release 1.', 'Manual functional tests, API tests, one security scan.'],
  tests: { neg: 'Negative: invalid order quantity', edge: 'Edge: maximum quantity', auth: 'Authorization: dealer sees only own orders', integ: 'Integration: ERP offline', reg: 'Regression: sign-in and ordering', sec: 'Security: password policy' },
  defect: ['Order total wrong after price list change', 'Total uses the old price when the list changes mid-order.'], minor: 'Typo on status page', sec: 'Session cookie missing SameSite', uat: ['Dealer acceptance of sign-in', 'Works for our staff.', 'Order page'],
  release: ['Release 0.9.0 to staging', '0.9.0', 'Redeploy 0.8.4 and restore the nightly database backup.'], alert: ['Order page slower than 2 seconds', 'p95 latency above 2 s for 5 minutes'],
  incident: ['Order page down for 14 minutes', 'No orders for 14 minutes.', 'Database connection limit.'],
  feedback: [['Let dealers reorder a past order', 'Dealers repeat the same order every month.'], 'Price list PDF download', 'Wrong total after price change'],
};

function extendLifecycle(S, spec: LifecycleSpec = DEALER) {
  const A = spec.actor;
  const o = { actor: A, origin: 'invented' };
  const link = (type, a, b, attrs?) => S.ensureLink(type, a.id || a, b.id || b, attrs || {}, { actor: A });
  const day = (n) => { const d = new Date(Date.UTC(2026, 9, 9)); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const stories = S.list('Story').sort((a, b) => a.id.localeCompare(b.id));
  const s1 = stories[0]; const s2 = stories[1] || s1; const s3 = stories[2] || s2; const s4 = stories[3] || s3;
  const nfrs = S.list('Requirement').filter((r) => r.subtype === 'non_functional');
  const musts = S.list('Requirement').filter((r) => r.priority === 'Must' && r.subtype === 'functional');
  const acs = S.list('AcceptanceCriterion');
  const add = (type, f) => { const item = S.create(type, f, o); return item; };
  const T = spec.screens;

  // ---- Phase 5: UX / UI design ------------------------------------------------------------------
  const scr = (title, kind, linkId, extra = {}) => add('Screen', { title, kind, design_link: linkId ? `https://www.figma.com/design/${spec.fig}?node-id=${linkId}` : undefined, designer: spec.designer, status: 'In review', ...extra });
  const signIn = scr(T[0], 'page', '1-10', { responsive_checked: true, accessibility_checked: true });
  const orderEntry = scr(T[1], 'page', '1-22', { responsive_checked: true });
  const orderStatus = scr(T[2], 'page', '1-35');
  const creditDlg = scr(T[3], 'dialog', null); // no design link: a gap
  link('designs', signIn, s1); link('designs', orderEntry, s2); link('designs', creditDlg, s3); // the fourth story has no screen: a gap
  link('designs', orderStatus, s2);
  const st = (screen, state_kind, description) => { const x = add('ScreenState', { title: `${screen.title}: ${state_kind}`, state_kind, description, status: 'In review' }); link('state_of', x, screen); };
  const word = spec.stateTexts[3];
  for (const k of ['loading', 'empty', 'error', 'permission_denied']) st(orderEntry, k, `${word} ${k.replace('_', ' ')}.`);
  st(signIn, 'loading', spec.stateTexts[1]); st(signIn, 'error', spec.stateTexts[0]); // empty and permission states missing: a gap
  st(orderStatus, 'loading', spec.stateTexts[2]);
  const drv = add('DesignReview', { title: `Design review of ${T[1].split(' ')[0].toLowerCase()} ${T[1].split(' ').slice(1, 2).join(' ')}`.trim(), reviewer: spec.reviewer, reviewed_on: day(-6), scope: 'ui_design', findings: 'Approved with small spacing changes.', status: 'Approved' });
  link('reviews', drv, orderEntry);

  // ---- Phase 6: architecture ------------------------------------------------------------------------
  const C = spec.comps;
  const web = add('ArchComponent', { title: C[0][0], kind: C[0][1], technology: C[0][2], owner: spec.lead, responsibility: C[0][3], status: 'In review' });
  const api = add('ArchComponent', { title: C[1][0], kind: C[1][1], technology: C[1][2], owner: spec.lead, responsibility: C[1][3], status: 'In review' });
  const db = add('ArchComponent', { title: C[2][0], kind: C[2][1], technology: C[2][2], owner: spec.dba, responsibility: C[2][3], status: 'In review' });
  const erp = add('ArchComponent', { title: C[3][0], kind: C[3][1], technology: C[3][2], owner: spec.integ, responsibility: C[3][3], status: 'Draft' });
  const adr1 = add('ArchDecision', { title: spec.adr1[0], context: spec.adr1[1], decision: spec.adr1[2], consequences: spec.adr1[3], alternatives: spec.adr1[4], decider: spec.lead, decided_on: day(-9), status: 'Accepted' });
  const adr2 = add('ArchDecision', { title: spec.adr2[0], context: spec.adr2[1], decision: spec.adr2[2], consequences: spec.adr2[3], status: 'Proposed' });
  if (nfrs[0]) link('answers', adr1, nfrs[0]);
  if (nfrs[0]) link('answers', api, nfrs[0]); // the availability target (nfrs[1]) has no answer: a gap
  link('exposes', add('ApiContract', { title: spec.api1, spec_link: `repo://${spec.repo}/openapi/main.yaml`, version: '1.0', owner: spec.lead, kind: 'rest', status: 'In review' }), api);
  add('ApiContract', { title: spec.api2, spec_link: `repo://${spec.repo}/openapi/webhook.yaml`, version: '0.2', kind: 'webhook', status: 'Draft' }); // no owner: a gap
  void web; void db; void erp; void adr2;

  // ---- Phase 7: detailed specification ----------------------------------------------------------
  const fullSpec = (title, story, status, screen) => {
    const x = add('FeatureSpec', {
      title, preconditions: 'The user is signed in and active.', trigger_input: 'The user submits the form.', pre_checks: 'Required fields, user status, value rules.',
      main_flow: '1. Validate. 2. Save. 3. Confirm to the user.', state_data: 'The record moves from Draft to Placed.', output: 'Confirmation with a reference number.',
      edge_cases: 'Duplicate submit, reference data changed mid-way, upstream system offline.', security_notes: 'A user can only see their own records.', observability_notes: 'Log record id and outcome; alert on failure rate.',
      testing_requirements: 'Happy path, invalid value, another user\'s record, upstream system down.', definition_of_done: ['Tests pass', 'Reviewed', 'Audit entry written'], owner: spec.designer, status,
    });
    link('spec_of', x, story); if (screen) link('uses_screen', x, screen);
    return x;
  };
  fullSpec(spec.specs[0], s1, 'Approved', signIn);
  fullSpec(spec.specs[1], s2, 'Approved', orderEntry);
  const spec3 = add('FeatureSpec', { title: spec.specs[2], main_flow: '1. Read the limit. 2. Compare with the value.', status: 'Draft', owner: spec.designer }); // incomplete draft: a gap
  link('spec_of', spec3, s3);

  // ---- Phase 8: development (status and links only) ------------------------------------------------
  const wi = (title, story, status, extra) => { const x = add('WorkItem', { title, assignee: spec.lead, status, ...extra }); link('implements', x, story); return x; };
  wi(spec.items[0], s1, 'Done', { pr_url: `${spec.git}/12`, dod_met: true, code_reviewed: true });
  wi(spec.items[1], s2, 'Done', { pr_url: `${spec.git}/18`, dod_met: true, code_reviewed: true });
  wi(spec.items[2], s3, 'Blocked', { branch: spec.branch }); // blocked: a gap
  return { S, s1, s2, s3, s4, nfrs, musts, acs, signIn, orderEntry, adr1, add, link, day, spec };
}

function extendLifecycleLate(ctx) {
  const { S, s1, s2, s3, s4, nfrs, musts, add, link, day, spec } = ctx;
  const sp: LifecycleSpec = spec || DEALER;
  // ---- Phase 9: QA, testing, security, acceptance ----------------------------------------------------
  const plan = add('TestPlan', { title: sp.plan[0], scope: sp.plan[1], approach: sp.plan[2], owner: sp.qa, status: 'In review' });
  const tcs = {};
  const tc = (key, title, kind, target) => { const x = add('TestCase', { title, kind, priority: 'Must', steps: 'See test sheet.', expected: 'As specified in the acceptance criteria.', status: 'Approved' }); link('in_plan', x, plan); if (target) link('verifies', x, target); tcs[key] = x; return x; };
  musts.slice(0, 3).forEach((r, i) => tc('f' + i, `Functional: ${r.title}`, 'functional', r));
  tc('neg', sp.tests.neg, 'negative', s2); tc('edge', sp.tests.edge, 'edge', s2);
  tc('auth', sp.tests.auth, 'authorization', s1); tc('integ', sp.tests.integ, 'integration', s4);
  tc('reg', sp.tests.reg, 'regression', s2); tc('sec', sp.tests.sec, 'security', s1);
  // data integrity tests: none (a gap)
  const run = (key, result, when, build) => { if (!tcs[key]) return null; const x = add('TestRun', { title: `Run of ${tcs[key].title}`, result, run_on: day(when), run_by: sp.qa, build, environment: 'staging', status: 'Recorded' }); link('executes', x, tcs[key]); return x; };
  ['f0', 'f1', 'f2', 'neg', 'edge', 'auth', 'sec'].forEach((k) => run(k, 'Pass', -3, 'b101'));
  run('reg', 'Pass', -5, 'b098'); const failRun = run('reg', 'Fail', -2, 'b101'); // the latest regression run failed: a gap
  const bug = add('Defect', { title: sp.defect[0], severity: 'High', description: sp.defect[1], found_in: 'b101', assignee: sp.lead, status: 'Open' });
  link('found_by', bug, failRun);
  add('Defect', { title: sp.minor, severity: 'Low', status: 'Open' });
  add('SecurityFinding', { title: sp.sec, severity: 'Medium', source_tool: 'ZAP scan', owner: sp.ops, status: 'Open' });
  const uat = add('UatSignoff', { title: sp.uat[0], stakeholder: sp.stakeholder, signed_on: day(-1), comments: sp.uat[1], status: 'Accepted' });
  link('accepts', uat, s1); // the other Must stories are not accepted yet: a gap
  // ---- Phase 10: deployment -----------------------------------------------------------------------------
  const rel = add('DeployRelease', { title: sp.release[0], version: sp.release[1], environment: 'staging', rollback_plan: sp.release[2], smoke_result: 'pass', deployed_on: day(-2), pipeline_link: sp.ci, status: 'Deployed' }); // no release notes or migration record: a gap
  link('ships', rel, s1); link('ships', rel, s2);
  // ---- Phase 11: operations ---------------------------------------------------------------------------------
  const alert = add('Alert', { title: sp.alert[0], kind: 'latency', condition: sp.alert[1], severity: 'High', owner: sp.ops, status: 'Active' });
  if (nfrs[0]) link('alerts_on', alert, nfrs[0]); // no alert on the availability target and no runbook for this alert: gaps
  add('Incident', { title: sp.incident[0], severity: 'High', started_on: day(-4), resolved_on: day(-4), impact: sp.incident[1], root_cause: sp.incident[2], status: 'Resolved' }); // resolved, not reviewed: a gap
  // ---- Phase 12: feedback ---------------------------------------------------------------------------------------
  add('Feedback', { title: sp.feedback[0][0], source: 'user', kind: 'improvement', detail: sp.feedback[0][1], reported_by: 'Customer contact', received_on: day(-1), status: 'New' });
  add('Feedback', { title: sp.feedback[1], source: 'support', kind: 'new_need', received_on: day(-3), status: 'New' });
  add('Feedback', { title: sp.feedback[2], source: 'defect', kind: 'bug', received_on: day(-2), status: 'Planned' }); // planned without a change request: a gap
  return S;
}

export { extendLifecycle, extendLifecycleLate, DEALER };
export const ACTOR = DEALER.actor;
