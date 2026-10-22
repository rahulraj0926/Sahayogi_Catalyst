/**
 * Wording of the Phase 5-12 sample records for each product (see seed_lifecycle.ts). All facts are invented.
 */
import type { LifecycleSpec } from '../seed_lifecycle';

const base = (o: Partial<LifecycleSpec> & Pick<LifecycleSpec, 'actor' | 'fig' | 'repo'>): LifecycleSpec => o as LifecycleSpec;

export const cdn: LifecycleSpec = base({
  actor: 'Anjali Rao', designer: 'Isha Menon', reviewer: 'Anjali Rao', lead: 'Dev Patel', dba: 'Dev Patel', integ: 'Farhan Ali', qa: 'Neha Kapoor', ops: 'Farhan Ali', stakeholder: 'Pilot customer: Streamly',
  fig: 'demo-cdn-console', repo: 'cdn-platform', git: 'https://git.example/cdn/pull', ci: 'https://ci.example/runs/412',
  screens: ['Customer sign-in', 'Domain and cache setup', 'Traffic and bandwidth report', 'Purge confirmation'], orderWord: 'domain',
  stateTexts: ['Wrong password message.', 'Spinner on the sign-in button.', 'Skeleton chart.', 'What the customer sees when the domain page is', 'Domain setup'],
  comps: [['Customer console', 'frontend', 'Next.js', 'Domain setup, cache rules, traffic reports.'], ['Control API', 'backend', 'Go', 'Domains, certificates, purge requests.'], ['Metrics store', 'database', 'ClickHouse', 'Traffic and cache-hit metrics.'], ['Edge config pusher', 'integration', 'gRPC', 'Pushes configuration to edge nodes.']],
  adr1: ['Use ClickHouse for traffic metrics', 'Reports need fast queries over billions of rows.', 'Store traffic metrics in ClickHouse.', 'A second database to run and back up.', ['PostgreSQL', 'Managed time-series service']],
  adr2: ['Push edge config through a versioned stream', 'Edge nodes must apply the same configuration.', 'Publish versioned config that nodes pull and confirm.', 'A change takes up to 30 seconds to reach all nodes.'],
  api1: 'Control API v1', api2: 'Purge status webhook',
  specs: ['Specification: sign-in', 'Specification: domain and cache setup', 'Specification: cache purge'], items: ['Build sign-in', 'Build domain setup', 'Build cache purge'], branch: 'feature/purge',
  plan: ['Launch test plan', 'All Must stories of the launch release.', 'Functional tests, load test at launch traffic, one security scan.'],
  tests: { neg: 'Negative: invalid domain name', edge: 'Edge: 10,000 purge paths', auth: 'Authorization: customer sees only own domains', integ: 'Integration: edge node offline', reg: 'Regression: sign-in and domain setup', sec: 'Security: certificate renewal' },
  defect: ['Purge reports done before all nodes confirm', 'The status turns green when the first node confirms.'], minor: 'Typo on the traffic report', sec: 'Admin console allows weak passwords', uat: ['Pilot acceptance of domain setup', 'Setup took ten minutes.', 'Domain page'],
  release: ['Release 0.9.0 to staging', '0.9.0', 'Redeploy 0.8.4 and restore the control database backup.'], alert: ['Cache-hit ratio below 85 percent', 'Cache-hit ratio under 85 percent for 15 minutes'],
  incident: ['Edge region unreachable for 22 minutes', 'Customers in one region saw origin fetches.', 'A peering link failed.'],
  feedback: [['Show cost per domain', 'Customers want a cost estimate by domain.'], 'Cache rules import from a file', 'Purge status stuck on pending'],
});

export const developer: LifecycleSpec = base({
  actor: 'Kanishk', designer: 'Meera Joshi', reviewer: 'Kanishk', lead: 'Kanishk', dba: 'Rohan Mehta', integ: 'Priya Nair', qa: 'Anita Rao', ops: 'Rohan Mehta', stakeholder: 'Pilot team lead',
  fig: 'demo-developer-tool', repo: 'sahayogi-developer', git: 'https://git.example/developer/pull', ci: 'https://ci.example/runs/233',
  screens: ['Sign-in', 'Record and links view', 'Gate checklist', 'Verification queue'], orderWord: 'item',
  stateTexts: ['Wrong password message.', 'Spinner on the sign-in button.', 'Skeleton rows.', 'What the analyst sees when the record view is', 'Record view'],
  comps: [['Web app', 'frontend', 'Next.js', 'Record, gates, documents and queues.'], ['Record API', 'backend', 'NestJS', 'Items, links, change flags, gates.'], ['Record database', 'database', 'PostgreSQL', 'Items, links, audit history.'], ['Assistant intake', 'integration', 'JSON over HTTP', 'Accepts agent research batches.']],
  adr1: ['Store the record in PostgreSQL tables', 'The record needs links, history and reports.', 'Use typed relational tables.', 'Schema changes need migrations.', ['JSON documents', 'Graph database']],
  adr2: ['Flag dependents inside the same transaction', 'Change flags must never lag behind an edit.', 'Compute flags when the edit is saved.', 'Large edits take slightly longer.'],
  api1: 'Record API v1', api2: 'Assistant batch endpoint',
  specs: ['Specification: change flags', 'Specification: gate checks', 'Specification: verification queue'], items: ['Build change flags', 'Build gate checks', 'Build verification queue'], branch: 'feature/verification-queue',
  plan: ['Pilot test plan', 'All Must stories of the pilot release.', 'Functional tests, API tests and one security scan.'],
  tests: { neg: 'Negative: invalid gate decision', edge: 'Edge: record of 5000 items', auth: 'Authorization: reviewer cannot verify own item', integ: 'Integration: invalid assistant batch', reg: 'Regression: edit and flag', sec: 'Security: session handling' },
  defect: ['Flag missing after a link is removed', 'Removing a link does not flag the former dependent.'], minor: 'Typo on the gate page', sec: 'Session cookie missing SameSite', uat: ['Pilot team acceptance of change flags', 'The flags saved us a review.', 'Record view'],
  release: ['Release 0.9.0 to staging', '0.9.0', 'Redeploy 0.8.4 and restore the nightly database backup.'], alert: ['Edit takes longer than 5 seconds', 'p95 edit-to-flag time above 5 s for 5 minutes'],
  incident: ['Record unavailable for 9 minutes', 'Pilot teams could not edit for 9 minutes.', 'Database connection limit.'],
  feedback: [['Export a gate report as PDF', 'Reviewers want to attach it to e-mails.'], 'Keyboard shortcuts in the record view', 'Wrong blocker shown on Gate 2'],
});

export const meter: LifecycleSpec = base({
  actor: 'Rohan Mehta', designer: 'Tara Nambiar', reviewer: 'Sunita Joshi', lead: 'Sunita Joshi', dba: 'Sunita Joshi', integ: 'Sunita Joshi', qa: 'Imran Qureshi', ops: 'Sunita Joshi', stakeholder: 'Utility pilot engineer',
  fig: 'demo-gateway-app', repo: 'meter-gateway', git: 'https://git.example/meter/pull', ci: 'https://ci.example/runs/77',
  screens: ['Installer sign-in', 'Guided commissioning', 'Meter status list', 'Meter fault alert'], orderWord: 'meter',
  stateTexts: ['Wrong code message.', 'Spinner on the sign-in button.', 'Skeleton rows.', 'What the installer sees when the commissioning page is', 'Commissioning'],
  comps: [['Commissioning app', 'frontend', 'React Native', 'Guided setup and checks for installers.'], ['Gateway firmware', 'backend', 'C on an RTOS', 'Meter polling, buffering and upload.'], ['Reading store', 'database', 'TimescaleDB', 'Meter readings in the cloud.'], ['Cloud ingest', 'integration', 'MQTT', 'Receives readings from gateways.']],
  adr1: ['Poll meters from the gateway, not the cloud', 'Meters sit behind a local RS-485 bus.', 'The gateway polls and uploads in batches.', 'Firmware carries the polling logic.', ['Cloud polling through a modem', 'Meter push']],
  adr2: ['Sign firmware images', 'Gateways must run only trusted firmware.', 'Verify an image signature before install.', 'Key handling must be planned.'],
  api1: 'Ingest API v1', api2: 'Firmware update webhook',
  specs: ['Specification: sign-in', 'Specification: guided commissioning', 'Specification: local buffering'], items: ['Build installer sign-in', 'Build guided commissioning', 'Build local buffering'], branch: 'feature/buffering',
  plan: ['First batch test plan', 'All Must stories of the first batch.', 'Bench tests, chamber tests, field pilot and one security review.'],
  tests: { neg: 'Negative: wrong meter address', edge: 'Edge: 72-hour outage', auth: 'Authorization: installer sees only own gateways', integ: 'Integration: meter does not answer', reg: 'Regression: polling and upload', sec: 'Security: firmware signature check' },
  defect: ['Readings duplicated after reconnect', 'Buffered readings are sent twice after a link flap.'], minor: 'Typo on the status page', sec: 'Debug port left enabled', uat: ['Utility pilot acceptance of commissioning', 'Done in 18 minutes.', 'Commissioning screen'],
  release: ['Firmware 0.9.0 to the pilot batch', '0.9.0', 'Reflash firmware 0.8.4 over the serial port.'], alert: ['Gateway silent for 30 minutes', 'No upload from a gateway for 30 minutes'],
  incident: ['Batch of gateways offline for 3 hours', 'Fifty pilot gateways stopped uploading.', 'A carrier APN change.'],
  feedback: [['Show signal strength during setup', 'Installers want to place the antenna better.'], 'Export readings as CSV', 'Wrong voltage after firmware update'],
});

export const warranty: LifecycleSpec = base({
  actor: 'Priya Nair', designer: 'Kavya Reddy', reviewer: 'Sanjay Kulkarni', lead: 'Sanjay Kulkarni', dba: 'Sanjay Kulkarni', integ: 'Sanjay Kulkarni', qa: 'Anita Rao', ops: 'Sanjay Kulkarni', stakeholder: 'Field service supervisor',
  fig: 'demo-service-desk', repo: 'service-desk', git: 'https://git.example/service/pull', ci: 'https://ci.example/runs/318',
  screens: ['Customer sign-in', 'Claim form', 'Claim status', 'Out-of-warranty notice'], orderWord: 'claim',
  stateTexts: ['Wrong password message.', 'Spinner on the sign-in button.', 'Skeleton rows.', 'What the customer sees when the claim page is', 'Claim form'],
  comps: [['Service desk web app', 'frontend', 'Next.js', 'Registration, claims and status.'], ['Claims API', 'backend', 'NestJS', 'Claims, triage, dispatch.'], ['Claims database', 'database', 'PostgreSQL', 'Products, claims, visits.'], ['SMS adapter', 'integration', 'REST', 'Sends claim status messages.']],
  adr1: ['Use PostgreSQL for claims', 'Claims need history and reporting.', 'Store claims in PostgreSQL.', 'Need backups and a migration process.', ['Spreadsheet export', 'CRM custom objects']],
  adr2: ['Send SMS through a queue', 'The gateway is sometimes slow.', 'Queue messages and retry.', 'A message can arrive a few minutes late.'],
  api1: 'Claims API v1', api2: 'Dealer registration webhook',
  specs: ['Specification: sign-in', 'Specification: claim intake', 'Specification: engineer dispatch'], items: ['Build sign-in', 'Build claim intake', 'Build engineer dispatch'], branch: 'feature/dispatch',
  plan: ['Release 1 test plan', 'All Must stories of Release 1.', 'Manual functional tests, API tests, one security scan.'],
  tests: { neg: 'Negative: serial number not in the list', edge: 'Edge: claim on the last warranty day', auth: 'Authorization: customer sees only own claims', integ: 'Integration: SMS gateway offline', reg: 'Regression: registration and claims', sec: 'Security: password policy' },
  defect: ['Warranty end date off by one day', 'Claims on the last day are treated as out of warranty.'], minor: 'Typo on the claim page', sec: 'Session cookie missing SameSite', uat: ['Service team acceptance of claim intake', 'Faster than the spreadsheet.', 'Claim form'],
  release: ['Release 0.9.0 to staging', '0.9.0', 'Redeploy 0.8.4 and restore the nightly database backup.'], alert: ['Claim page slower than 3 seconds', 'p95 latency above 3 s for 5 minutes'],
  incident: ['Claim form down for 12 minutes', 'No claims could be raised for 12 minutes.', 'Database connection limit.'],
  feedback: [['Let dealers register in bulk', 'Dealers hold many customers at once.'], 'Claim status by WhatsApp', 'Wrong urgency for a leaking unit'],
});

export const boss: LifecycleSpec = base({
  actor: 'Arjun Das', designer: 'Lata Menon', reviewer: 'Rohan Mehta', lead: 'Rohan Mehta', dba: 'Rohan Mehta', integ: 'Rohan Mehta', qa: 'Anita Rao', ops: 'Rohan Mehta', stakeholder: 'Branch manager, Pune',
  fig: 'demo-boss-rebuild', repo: 'boss-rebuild', git: 'https://git.example/boss/pull', ci: 'https://ci.example/runs/540',
  screens: ['Clerk sign-in', 'Settlement run', 'Exception queue', 'Month-end report viewer'], orderWord: 'settlement',
  stateTexts: ['Wrong password message.', 'Spinner on the sign-in button.', 'Skeleton rows.', 'What the clerk sees when the settlement page is', 'Settlement run'],
  comps: [['Back-office web app', 'frontend', 'Angular', 'Settlement, reconciliation and reports.'], ['Settlement service', 'backend', 'Java', 'Settlement runs, matching, posting.'], ['Ledger database', 'database', 'PostgreSQL', 'Ledger entries and reports.'], ['Bank file adapter', 'integration', 'SFTP + parser', 'Reads bank files.']],
  adr1: ['Keep ledger posting rules unchanged', 'Auditors compare month to month.', 'Port the posting rules as they are.', 'Old quirks come along.', ['Redesign the rules', 'Buy a ledger package']],
  adr2: ['Run old and new in parallel for three months', 'Results must match before cut-over.', 'Compare reports automatically each close.', 'Two systems run for a while.'],
  api1: 'Settlement API v1', api2: 'Bank file intake',
  specs: ['Specification: sign-in', 'Specification: settlement run', 'Specification: exception queue'], items: ['Build sign-in', 'Build settlement run', 'Build exception queue'], branch: 'feature/exception-queue',
  plan: ['Release 1 test plan', 'All Must stories of Release 1.', 'Functional tests, parallel-run comparison, one security scan.'],
  tests: { neg: 'Negative: changed bank file layout', edge: 'Edge: 2 million lines in a month', auth: 'Authorization: clerk cannot approve own run', integ: 'Integration: payment gateway offline', reg: 'Regression: settlement and posting', sec: 'Security: role separation' },
  defect: ['Rounding differs by one rupee in a report', 'The new total rounds per line, BoSS rounds per page.'], minor: 'Typo on the queue page', sec: 'Service account has broad rights', uat: ['Branch acceptance of the settlement run', 'Same result as BoSS.', 'Settlement run'],
  release: ['Release 0.9.0 to staging', '0.9.0', 'Switch back to BoSS and restore the ledger backup.'], alert: ['Settlement run longer than 4 hours', 'Run time above 4 hours'],
  incident: ['Settlement run failed at 80 percent', 'The run stopped and had to be restarted.', 'Out of memory on the matching step.'],
  feedback: [['Show matching reason on each line', 'Clerks want to trust the suggestions.'], 'Export queue to a spreadsheet', 'Wrong age on an exception line'],
});
