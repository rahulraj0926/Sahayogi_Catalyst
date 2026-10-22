/**
 * scripts/seed_mail.ts - builds the complete "Sahayogi Mail" demo product: Phases 0 to 12 filled in without gaps and every gate decided.
 *
 *   tsx scripts/seed_mail.ts <out.json>      writes the product data set (use POST /import to load it into a product)
 *
 * Everything is invented demo data (origin "invented"). Gate decisions go through gates.decide, so a gate is only decided when the
 * engine says it is allowed; nothing here edits a number. The Phase 5-12 records are complete on purpose (the other sample
 * products keep deliberate gaps there). Postfix, Dovecot and Rspamd appear only as the technology the design selects.
 */
import * as fs from 'node:fs';
import { buildFromPack } from './seed_lib';
import * as gates from '../engine/gates';
import * as compose from '../engine/compose';
import mailPack from './packs/mail';

const OWNER = 'Dhruv Singla';
const SPONSOR = 'Kanishk';
const TECH = 'Rohan Mehta';
const OPS = 'Priya Nair';
const QA = 'Anita Rao';
const UX = 'Isha Menon';
const SEC = 'Farhan Ali';
const PILOT = 'Pilot organisation administrator';

const attest = (S, criterion, gate, role, by, note) => gates.attest(S, { criterion, gate, role, by, note }, by);

function build() {
  const pack: any = {
    ...mailPack,
    hooks: {
      after2: (h) => {
        for (const e of h.S.list('ScopeEntry', (x) => ['out', 'later'].includes(x.disposition))) {
          if (!e.exclusion_impact) h.patch(e.id, { exclusion_impact: 'Customers who need this use another product for now.' });
          if (!h.S.out(e.id, 'justified_by').length) h.lk('justified_by', e.id, h.con[0].id);
        }
      },
      after4: (h) => { attest(h.S, 'G4-12', 4, 'Product Owner', OWNER, 'Walkthrough of the three Must flows held with Priya Nair, Rohan Mehta and Meera Iyer; two changes taken.'); },
    },
  };
  const S = buildFromPack(pack);
  const o = { actor: OWNER, origin: 'invented' };
  let n = 0;
  const day = (k) => { const d = new Date(Date.UTC(2026, 8, 18)); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); };
  const clock = (k) => { S._clock = `${day(k)}T09:30:00.000Z`; };
  const add = (type, f, opts: any = {}) => S.create(type, f, { ...o, ...opts });
  const link = (type, a, b, attrs?) => S.ensureLink(type, a.id || a, b.id || b, attrs || {}, { actor: OWNER });
  const stories = S.list('Story').sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  const must = stories.filter((s) => s.priority === 'Must');
  const reqs = S.list('Requirement').sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  const nfrs = reqs.filter((r) => r.subtype === 'non_functional');
  const mustReqs = reqs.filter((r) => r.priority === 'Must' && ['In review', 'Approved'].includes(r.status));
  void n;

  // ======================================================= PHASE 5: UX / UI design
  clock(1);
  const scr = (title, kind, node, forStories, extra = {}) => {
    const x = add('Screen', { title, kind, design_link: `https://www.figma.com/design/sahayogi-mail-webmail?node-id=${node}`, designer: UX, responsive_checked: true, accessibility_checked: true, purpose: `Screen: ${title}`, status: 'Approved', ...extra });
    for (const s of forStories) link('designs', x, stories[s]);
    for (const k of ['loading', 'empty', 'error', 'permission_denied']) {
      const st = add('ScreenState', { title: `${title}: ${k.replace('_', ' ')}`, state_kind: k, description: `What the user sees on "${title}" when the state is ${k.replace('_', ' ')}.`, design_link: `https://www.figma.com/design/sahayogi-mail-webmail?node-id=${node}-${k}`, status: 'Approved' });
      link('state_of', st, x);
    }
    return x;
  };
  const sSign = scr('Sign-in and account recovery', 'page', '1-10', [0]);
  const sInbox = scr('Inbox and message list', 'page', '1-22', [2, 7]);
  const sCompose = scr('Compose and send with recipient check', 'page', '1-35', [1, 6]);
  const sStatus = scr('Message detail and delivery status', 'page', '1-48', [1]);
  const sQuar = scr('Spam quarantine review', 'page', '1-60', [3]);
  const sDomain = scr('Domain setup and DNS check', 'page', '1-72', [4]);
  const sTrace = scr('Administrator message trace and audit trail', 'report', '1-85', [5]);
  const sMbox = scr('Mailbox administration', 'page', '1-97', [0, 5]);
  const rv1 = add('DesignReview', { title: 'Design review: information architecture and wireframes', reviewer: SPONSOR, reviewed_on: day(6), scope: 'information_architecture', findings: 'Navigation reads well. Move the delivery status next to the sent time.', status: 'Approved' });
  const rv2 = add('DesignReview', { title: 'Design review: high-fidelity screens and accessibility', reviewer: 'Meera Iyer', reviewed_on: day(9), scope: 'accessibility', findings: 'Keyboard order and contrast pass. Suspicious-sender banner added to the message view.', status: 'Approved' });
  for (const s of [sSign, sInbox, sCompose, sStatus]) link('reviews', rv1, s);
  for (const s of [sQuar, sDomain, sTrace, sMbox]) link('reviews', rv2, s);
  attest(S, 'G5-06', 5, 'UX designer', UX, 'Narrow window, keyboard order and screen-reader labels checked on all eight screens.');

  // ======================================================= PHASE 6: architecture
  clock(12);
  const comp = (title, kind, tech, owner, resp, status = 'Approved') => add('ArchComponent', { title, kind, technology: tech, owner, responsibility: resp, status });
  const cWeb = comp('Webmail web app', 'frontend', 'Next.js', TECH, 'Inbox, compose, message status, quarantine review and administrator screens.');
  const cApi = comp('Mail application API', 'backend', 'NestJS', TECH, 'Accounts, domains, message submission, status, audit trail and administrator actions.');
  const cDb = comp('Account and message-status database', 'database', 'PostgreSQL', OPS, 'Accounts, domains, message status, audit records and delivery logs.');
  const cMta = comp('SMTP transport and queue', 'integration', 'Postfix (selected for the pilot design)', OPS, 'Accepts, queues, retries and delivers mail; produces delivery and bounce records.');
  const cBox = comp('Mailbox storage and access', 'infrastructure', 'Dovecot (selected for the pilot design)', OPS, 'Stores mailboxes and serves them to the webmail application.');
  const cSpam = comp('Spam filtering', 'security', 'Rspamd (selected for the pilot design)', SEC, 'Scores incoming mail, applies the approved policy and signs outgoing mail.');
  const cObs = comp('Logging, metrics and alerts', 'observability', 'Prometheus and Grafana', OPS, 'Queue depth and age, deferral and bounce rates, sign-in failures and certificate expiry.');
  const adr = (title, context, decision, consequences, alts) => add('ArchDecision', { title, context, decision, consequences, alternatives: alts, decider: SPONSOR, decided_on: day(14), status: 'Accepted' });
  const a1 = adr('Separate the web application from the mail transport', 'Users need a clear delivery status and the transport must stay replaceable.', 'The webmail application talks to the transport and mailbox storage only through the application API.', 'One more service to run; the status model lives in one place.', ['Webmail directly on the mail server', 'Hosted mail relay']);
  const a2 = adr('Record delivery status from transport events', 'A message accepted by one component can fail later; users must not believe it was read or delivered when it was only accepted.', 'Status is built from queue and delivery events and says "accepted by the receiving server", never "read".', 'Status can lag by seconds; the wording is stricter than a simple "sent".', ['Show Sent on submit']);
  const a3 = adr('Enforce TLS and domain authentication at the edge', 'Mail security depends on encrypted transport and on SPF, DKIM and DMARC being checked and signed.', 'Require TLS where the other side supports it; sign outgoing mail with DKIM; check SPF, DKIM and DMARC on incoming mail.', 'Some old servers fall back to unencrypted delivery and are logged.', ['Opportunistic TLS only']);
  const a4 = adr('Keep message content out of logs', 'Logs are kept for operations and audit and must not expose message bodies or credentials.', 'Log identifiers, sizes, status and timestamps only.', 'Debugging a content problem needs the user to resend a sample.', ['Full-content debug logs']);
  const answers = [[a2, nfrs[0]], [cMta, nfrs[0]], [cApi, nfrs[1]], [cObs, nfrs[1]], [a3, nfrs[2]], [cSpam, nfrs[3]], [a4, nfrs[2]]];
  for (const [src, tgt] of answers) if (tgt) link('answers', src, tgt);
  void a1;
  const api1 = add('ApiContract', { title: 'Mail application API v1', spec_link: 'repo://sahayogi-mail/openapi/main.yaml', version: '1.0', owner: TECH, kind: 'rest', summary: 'Accounts, domains, send, status and administrator actions.', status: 'Approved' });
  const api2 = add('ApiContract', { title: 'Delivery event feed', spec_link: 'repo://sahayogi-mail/openapi/events.yaml', version: '1.0', owner: OPS, kind: 'event', summary: 'Queue and delivery events consumed by the status service.', status: 'Approved' });
  link('exposes', api1, cApi); link('exposes', api2, cMta);
  attest(S, 'G6-06', 6, 'Security lead', SEC, 'Authentication, authorization, secret storage, TLS and data protection reviewed against the design.');
  void cWeb; void cDb; void cBox;

  // ======================================================= PHASE 7: detailed specification
  clock(20);
  const specTexts = [
    ['Mailbox and account management', 'An administrator with a verified domain.', 'Administrator submits the new-mailbox form.', 'Domain verified, user limit not reached, name not in use.', '1. Validate. 2. Create the mailbox. 3. Send the first-sign-in link. 4. Write the audit record.', 'A mailbox in the Active state and an audit entry.', 'Duplicate name, domain not verified, user limit reached, link expired.', 'Only administrators of the domain can create mailboxes; passwords are never logged.'],
    ['Compose and send with delivery status', 'The user is signed in and the mailbox is active.', 'The user presses Send.', 'Recipients are valid, size is within the limit, the user is not rate limited.', '1. Validate. 2. Queue. 3. Hand to the transport. 4. Record each delivery event. 5. Show the status.', 'A status: queued, delayed, accepted by the receiving server, or failed with the reason.', 'Recipient rejected, server unreachable, retries exhausted, duplicate submit.', 'Rate limit per mailbox; the body is never written to logs.'],
    ['Receive, filter and deliver incoming mail', 'A hosted domain with an active mailbox.', 'A message arrives from an external server.', 'Recipient exists, size within limit, sender checks (SPF, DKIM, DMARC) evaluated.', '1. Check the recipient. 2. Score the message. 3. Apply the policy. 4. Deliver, tag, quarantine or reject. 5. Log the decision.', 'The message in the inbox, the quarantine or rejected, with a logged reason.', 'Unknown mailbox, oversized message, policy engine unavailable, delivery to a full mailbox.', 'Decisions are logged without message content.'],
    ['Spam quarantine and false-positive review', 'A message held in quarantine by policy.', 'The user opens the quarantine list or reports a message.', 'The user owns the mailbox.', '1. List quarantined messages. 2. The user marks not spam or confirms. 3. Release or delete. 4. Count the false positive.', 'The message released to the inbox or removed, and a counted report.', 'Message released twice, mailbox full, report for a message already deleted.', 'Only the mailbox owner and administrators can see quarantined mail.'],
    ['Domain authentication setup and check', 'A domain added by an administrator.', 'The administrator runs the domain check.', 'The domain name is valid and owned by the organisation.', '1. Show the records to publish. 2. Read DNS. 3. Compare. 4. Report each record as valid or missing.', 'A per-record result and signing enabled for verified domains.', 'DNS temporarily unavailable, record published with a typo, propagation delay.', 'Private keys never leave the signing service.'],
    ['Administrator message trace and audit trail', 'An administrator of the organisation.', 'The administrator searches for a message.', 'The administrator role is present for this organisation.', '1. Search by sender, recipient and time. 2. Show the message path. 3. Write an audit record of the search.', 'The message path with each step and an audit entry.', 'No result, very wide time window, trace for another organisation.', 'Users without the role are refused; the audit trail cannot be edited.'],
  ];
  const specs = specTexts.map((t, i) => {
    const x = add('FeatureSpec', {
      title: `Specification: ${t[0]}`, preconditions: t[1], trigger_input: t[2], pre_checks: t[3], main_flow: t[4], state_data: 'Records move through the states in the Mail message life cycle.', output: t[5],
      edge_cases: t[6], security_notes: t[7], observability_notes: 'Log identifiers and outcome; alert on a rising failure rate.', testing_requirements: 'Happy path, invalid input, permission denied, upstream failure and retry.',
      definition_of_done: ['Code reviewed', 'Tests pass', 'Audit entry written', 'Documented in the runbook'], owner: TECH, status: 'Approved',
    });
    link('spec_of', x, must[i]);
    return x;
  });
  link('uses_screen', specs[0], sMbox); link('uses_screen', specs[1], sCompose); link('uses_screen', specs[2], sInbox);
  link('uses_screen', specs[3], sQuar); link('uses_screen', specs[4], sDomain); link('uses_screen', specs[5], sTrace);
  link('uses_api', specs[1], api1); link('uses_api', specs[2], api2);

  // ======================================================= PHASE 8: development
  clock(34);
  const items = must.map((s, i) => {
    const w = add('WorkItem', { title: `Build: ${specTexts[i][0]}`, assignee: TECH, status: 'Done', branch: `feature/${i + 1}`, pr_url: `https://git.example/sahayogi-mail/pull/${40 + i}`, commit_sha: `a1b2c3${i}`, dod_met: true, code_reviewed: true, build_ref: 'build-218' });
    link('implements', w, s);
    return w;
  });
  attest(S, 'G8-05', 8, 'Tech lead', TECH, 'Unit and integration tests pass on build 218; the build was reproduced from a clean checkout.');
  void items;

  // ======================================================= PHASE 9: QA, testing, security, acceptance
  clock(40);
  const plan = add('TestPlan', { title: 'Release 1 test plan', scope: 'Every Must requirement and story of release 1.', approach: 'Controlled internal and external test accounts and test domains; manual and automated tests; one security scan; one restore drill.', environments: 'staging', owner: QA, exit_criteria: 'All ten quality gates met and no blocking defect open.', status: 'Approved' });
  const kindOf = { functional: 'functional', non_functional: 'performance', interface: 'integration', data: 'data_integrity', regulatory: 'security' };
  const cases = [];
  const tc = (title, kind, target, extra: any = {}) => {
    const x = add('TestCase', { title, kind, priority: 'Must', steps: 'Run the scenario on a controlled test account; capture the log or status as evidence.', expected: 'The result matches the acceptance criterion and is visible in the log or delivery status.', test_data: 'Controlled test domain and authorised test recipients only.', status: 'Approved', ...extra });
    link('in_plan', x, plan); for (const t of [].concat(target)) link('verifies', x, t); cases.push(x); return x;
  };
  for (const r of mustReqs) tc(`Verify: ${r.title}`, kindOf[r.subtype] || 'functional', r);
  const tNeg = tc('Negative: invalid recipient and oversized attachment are refused', 'negative', [reqs.find((r) => /Compose|send/i.test(r.title)) || mustReqs[1], must[1]]);
  const tEdge = tc('Edge: attachment exactly at the size limit', 'edge', must[1]);
  const tAuth = tc('Authorization: a user cannot open another mailbox or the administrator trace', 'authorization', [must[0], must[5]]);
  const tData = tc('Data integrity: a message keeps one status across queue, retry and bounce', 'data_integrity', must[1]);
  const tInteg = tc('Integration: receiving server offline, message retried and reported', 'integration', must[1]);
  const tReg = tc('Regression: sign-in, send and receive after the build change', 'regression', [must[0], must[1], must[2]]);
  const tSec = tc('Security: TLS enforced, sessions expire, rate limits apply', 'security', must[0]);
  const runs = [];
  const run = (t, result, k, build, notes?) => { const x = add('TestRun', { title: `Run of ${t.title}`.slice(0, 90), result, run_on: day(k), run_by: QA, build, environment: 'staging', notes: notes || 'Evidence in the shared test report.', status: 'Recorded' }); link('executes', x, t); runs.push(x); return x; };
  for (const t of cases) { if (t !== tReg) run(t, 'Pass', 44, 'build-221'); }
  const failRun = run(tReg, 'Fail', 42, 'build-219', 'Sent messages stayed in Queued after a restart of the queue service.');
  run(tReg, 'Pass', 45, 'build-221', 'Passes after the fix in build 221.');
  const bug = add('Defect', { title: 'Queued messages not retried after a queue-service restart', severity: 'High', description: 'After the queue service restarted, messages in Queued were not picked up again until a manual flush.', steps_to_reproduce: '1. Send ten messages. 2. Restart the queue service. 3. Wait five minutes.', found_in: 'build-219', assignee: TECH, fixed_on: day(43), status: 'Closed', acceptance_note: 'Fix verified by a retest on build 221.' });
  link('found_by', bug, failRun);
  add('Defect', { title: 'Typo in the quarantine empty state', severity: 'Low', description: 'The empty-state text had a spelling mistake.', status: 'Closed', fixed_on: day(43) });
  add('SecurityFinding', { title: 'Session cookie missing the SameSite attribute', severity: 'Medium', source_tool: 'ZAP scan', description: 'The session cookie did not set SameSite.', owner: SEC, status: 'Fixed', acceptance_note: 'Fixed in build 220 and rescanned.' });
  add('SecurityFinding', { title: 'Weak password policy on first release candidate', severity: 'High', source_tool: 'Manual review', description: 'Minimum length was too low.', owner: SEC, status: 'Fixed', acceptance_note: 'Policy raised and tested in build 220.' });
  must.forEach((s, i) => {
    const u = add('UatSignoff', { title: `Acceptance: ${specTexts[i][0]}`, stakeholder: PILOT, signed_on: day(48), comments: 'Works for our staff in the pilot test.', status: 'Accepted' });
    link('accepts', u, s);
  });
  attest(S, 'G9-11', 9, 'QA lead', QA, 'All ten quality gates are met; the High defect and the High security finding were fixed and retested. I recommend release.');

  // ======================================================= PHASE 10: deployment
  clock(52);
  const dStage = add('DeployRelease', { title: 'Release 0.9.0 to staging', version: '0.9.0', environment: 'staging', release_notes: 'Release candidate: send, receive, spam handling and administrator trace.', rollback_plan: 'Redeploy 0.8.4 and restore the last database backup.', migration_record: 'Schema migration 12 applied to staging and rolled back once in rehearsal.', smoke_result: 'pass', deployed_on: day(50), pipeline_link: 'https://ci.example/sahayogi-mail/runs/902', approved_by: SPONSOR, status: 'Deployed' });
  const dPilot = add('DeployRelease', { title: 'Release 1.0.0 to the pilot organisations', version: '1.0.0', environment: 'pilot', release_notes: 'First pilot release: mailbox management, send with delivery status, filtered receiving, domain checks and administrator trace.', rollback_plan: 'Redeploy 0.9.0, restore the database backup taken before the change and re-point the queue service.', migration_record: 'Migration 13 applied during the agreed window; row counts verified before and after.', smoke_result: 'pass', deployed_on: day(55), pipeline_link: 'https://ci.example/sahayogi-mail/runs/931', approved_by: SPONSOR, status: 'Deployed' });
  for (const s of must) { link('ships', dPilot, s); link('ships', dStage, s); }
  attest(S, 'G10-06', 10, 'Sponsor', SPONSOR, 'I approve release 1.0.0 for the pilot organisations; rollback readiness confirmed in the rehearsal.');

  // ======================================================= PHASE 11: operations
  clock(60);
  const alertDefs = [
    ['Outbound queue delay above one minute', 'latency', 'p95 time from submit to first delivery attempt above 60 seconds for 10 minutes', 'High', nfrs[0], 'Queue is stuck or delayed'],
    ['Service availability below target', 'availability', 'Failed sign-in or send requests push monthly availability below 99.5 percent', 'High', nfrs[1], 'Service is down or unreachable'],
    ['Unencrypted connections detected', 'security', 'Any client connection accepted without TLS, or a certificate within 14 days of expiry', 'High', nfrs[2], 'Certificate or TLS problem'],
    ['Spam false positives above target', 'business', 'User-reported false positives above 0.5 percent over a week', 'Medium', nfrs[3], 'Spam policy too strict'],
  ];
  const alerts = alertDefs.map(([title, kind, cond, sev, nfr, rb]) => {
    const a = add('Alert', { title, kind, condition: cond, severity: sev, owner: OPS, dashboard_link: 'https://grafana.example/d/mail-health', status: 'Active' });
    if (nfr) link('alerts_on', a, nfr);
    const r = add('Runbook', { title: `Runbook: ${rb}`, owner: OPS, steps: '1. Open the dashboard. 2. Check the queue and the transport log. 3. Follow the matching section. 4. Escalate to the tech lead after 30 minutes.', last_reviewed: day(58), doc_link: 'https://wiki.example/sahayogi-mail/runbooks', status: 'Approved' });
    link('responds_to', r, a);
    return a;
  });
  const inc = add('Incident', { title: 'Outbound queue delayed for 18 minutes', severity: 'Medium', started_on: day(61), resolved_on: day(61), impact: 'Messages from two pilot organisations showed Delayed for up to 18 minutes.', root_cause: 'A full disk on the queue host stopped new deliveries.', post_incident_review: 'Disk alert added with a threshold at 80 percent; queue host disk doubled; runbook updated. No messages were lost.', status: 'Reviewed' });
  add('HealthReview', { title: 'Production health review, first pilot month', period_end: day(75), availability_summary: 'Availability 99.8 percent against the 99.5 percent target.', latency_summary: 'p95 time to first delivery attempt 22 seconds.', incidents_summary: 'One medium incident, reviewed and closed.', actions: 'Keep the disk alert; review the spam policy with pilot administrators.', reviewer: SPONSOR, status: 'Reviewed' });
  void alerts; void inc;

  // ======================================================= PHASE 12: feedback and iteration
  clock(80);
  const cr1 = add('ChangeRequest', { title: 'Add a delivery report that administrators can export', reason: 'Pilot administrators asked for a monthly delivery report.', kind: 'feedback', class: 'minor', requester: PILOT, status: 'Approved' });
  const cr2 = add('ChangeRequest', { title: 'Show why a message was quarantined', reason: 'Users could not tell which rule held a message.', kind: 'requirement', class: 'minor', requester: 'Pilot mailbox user', status: 'Approved' });
  const fb = (title, source, kind, detail, status, by) => add('Feedback', { title, source, kind, detail, reported_by: by, received_on: day(70), status });
  const f1 = fb('Export a monthly delivery report', 'stakeholder', 'improvement', 'Administrators want a report of delivered, delayed and failed messages.', 'Planned', PILOT);
  const f2 = fb('Show the reason a message was quarantined', 'user', 'improvement', 'Users want to know which rule caught a message.', 'Planned', 'Pilot mailbox user');
  fb('Search is slow on very large mailboxes', 'usage_data', 'bug', 'Search over 50,000 messages takes more than ten seconds.', 'Triaged', 'Support');
  fb('Add a mobile app', 'user', 'new_need', 'Some users asked for a mobile app; the webmail works on a phone browser.', 'Rejected', 'Pilot mailbox user');
  link('raises_change', f1, cr1); link('raises_change', f2, cr2);
  add('Lesson', { title: 'Delivery status wording prevents support calls', what_happened: 'Using "accepted by the receiving server" instead of "delivered" removed most "was it read?" questions.', what_to_change: 'Use the same wording in the help pages and the API.', owner: OWNER, status: 'Shared' });
  add('Lesson', { title: 'Rehearse the rollback before the pilot', what_happened: 'The staging rollback rehearsal found a missing migration step.', what_to_change: 'Rehearse the rollback in every release plan.', owner: TECH, status: 'Shared' });
  S._clock = null;
  return S;
}

function decideAll(S) {
  const out = [];
  const T = [
    [5, 'Design is reviewed and accessible; every Must story has a screen with its states.', 14],
    [6, 'Architecture answers every quality target and the security design was reviewed.', 22],
    [7, 'Every Must story has a complete feature specification.', 36],
    [8, 'Every Must story is built, reviewed and covered by developer tests.', 42],
    [9, 'The ten quality gates are met and the release is recommended by QA.', 50],
    [10, 'Release 1.0.0 is deployed to the pilot with a passing smoke test and a rollback plan.', 57],
    [11, 'Alerts, runbooks and the first health review are in place.', 77],
    [12, 'Feedback is triaged, planned items have change requests and lessons are recorded.', 84],
  ];
  const day = (k) => { const d = new Date(Date.UTC(2026, 8, 18)); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); };
  for (const [g, text, k] of T as any) {
    S._clock = `${day(k)}T10:00:00.000Z`;
    const ev = gates.evaluateGate(S, g);
    const decision = ev.eligible.includes('go') ? 'go' : null;
    if (!decision) { out.push(`Gate ${g} blocked: ${ev.eligibleReason} :: ${ev.blockers.map((b) => b.id + ' ' + b.message.slice(0, 120)).join(' | ')}`); break; }
    gates.decide(S, g, 'go', { rationale: text, approver: SPONSOR, submitted_by: OWNER }, SPONSOR);
    out.push(`Gate ${g} decided: go`);
  }
  S._clock = null;
  return out;
}

function approveDocuments(S) {
  const res = [];
  for (const d of compose.DEFS) {
    try {
      const m = compose.compose(S, d.key);
      if (m.status === 'not_started') { res.push(`${d.key}: not started (no data)`); continue; }
      S._clock = '2026-10-15T09:00:00.000Z';
      compose.setStatus(S, d.key, { status: 'approved', role: d.role, second_approver: SPONSOR, waiver: m.completeness < 80 ? { reason: 'Sample product: remaining parts are carried into the next release.', approver: SPONSOR } : undefined }, OWNER);
      S._clock = '2026-10-15T11:00:00.000Z';
      compose.setStatus(S, d.key, { status: 'approved', role: d.role, waiver: m.completeness < 80 ? { reason: 'Sample product: remaining parts are carried into the next release.', approver: SPONSOR } : undefined }, SPONSOR);
      res.push(`${d.key}: approved (${m.completeness}%)`);
    } catch (e) { res.push(`${d.key}: ${e.message.slice(0, 140)}`); }
  }
  S._clock = null;
  return res;
}

if (require.main === module) {
  const out = process.argv[2] || 'mail-data.json';
  const S = build();
  const g = decideAll(S);
  console.log(g.join('\n'));
  const docs = approveDocuments(S);
  console.log(docs.join('\n'));
  fs.writeFileSync(out, JSON.stringify(S.exportData()));
  console.log(`wrote ${out}: ${S.all().length} items, ${S.links().length} links`);
}
export { build, decideAll, approveDocuments };
