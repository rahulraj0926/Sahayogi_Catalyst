/**
 * scripts/seed.ts - builds the "Sahayogi CDN" seed: a hypothetical product mid-journey at depth L2.
 *
 * Source material: pipeline_dry_run/agent03_walkthrough.md (+ agent07 for acceptance criteria and state maps).
 * HONESTY RULE: Sahayogi CDN is hypothetical. Every invented fact (people, numbers, prices, dates) is tagged
 * origin=invented. Regulation texts taken from general knowledge are origin=document and unverified (see note field).
 *
 * Shape of the picture (as of 2026-10-09):
 *   Phase 0  complete; Gate 0 decided "go with conditions" on 2026-09-12 (two open conditions due by Gate 2)
 *   Phase 1  mostly complete; Gate 1 pending: Bunny.net values are agent-proposed and unverified, three Cloudflare
 *            values are stale, Legal has not signed the obligation register
 *   Phase 2  partly complete; capacity check FAILS on purpose (Must effort 89 pm vs 86 pm x 0.9), scope baseline
 *            decision still only Proposed, one Must question (ASN ownership) open
 *   Phase 3  partial; Must requirements without reviewed AC, one unscoped NFR, one NFR missing a tool, a waiver in use
 *   Phase 4  started; two flows (one with a dead end) and one entity with states
 * Usage: node scripts/seed.ts   -> writes data/store.json and data/seed.json
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Store } from '../engine/store';
import * as gates from '../engine/gates';
import * as derive from '../engine/derive';
import * as agent from '../engine/agent';
import * as requests from '../engine/requests';
import * as seed_portfolioMod from './seed_portfolio';

const SEED_VERSION = 'sahayogi-cdn-2026-10-09';
const ACTOR = 'Kanishk';

function buildSeed() {
  const S = Store.fresh();
  S.data.settings.asOf = '2026-10-09';
  S.data.meta.seedVersion = SEED_VERSION;
  const clock = (d) => { S._clock = `${d}T09:30:00.000Z`; };
  const mk = (type, id, f, o = {}) => S.create(type, f, { id, origin: 'invented', actor: ACTOR, ...o });
  const lk = (type, s, t, attrs = {}) => S.link(type, s, t, attrs, { actor: ACTOR, silent: true });
  const many = (type, s, targets, attrs?) => targets.forEach((t) => lk(type, s, t, attrs));
  const patch = (id, f) => S.update(id, f, { silent: true, strict: false });

  // ===================================================================== PHASE 0
  clock('2026-09-02');
  mk('Product', 'PRJ-001', { title: 'Sahayogi CDN', name: 'Sahayogi CDN', mode: 'greenfield', track: 'full', risk_class: 'standard', depth_level: 'L2', current_phase: 0, default_currency: 'INR', sponsor: 'Anjali Rao', status: 'Active' });
  S.data.meta.productId = 'PRJ-001';

  const stk = [
    ['STK-001', 'Anjali Rao', 'Sponsor', 'CEO', true, 'Revenue within 18 months; capex cap'],
    ['STK-002', 'Rohan Mehta', 'Delivery', 'CTO', false, 'Technical credibility against global CDNs'],
    ['STK-003', 'Priya Nair', 'Operations', 'Head of Network Ops', false, 'Operable by a 6-person NOC; clear runbooks'],
    ['STK-004', 'Meera Iyer', 'Regulator/Legal', 'Legal and Compliance', false, 'DPDP Act, CERT-In directions, IT Act blocking orders'],
    ['STK-005', 'Arjun Das', 'Finance', 'CFO', false, 'Capex versus opex model; margin floor'],
    ['STK-006', 'Pilot OTT customer CTO (external)', 'Customer', 'CTO of pilot customer', false, 'p95 start-up time; burst capacity for live events'],
    ['STK-007', 'Pilot customer NOC engineer (external)', 'End-user', 'NOC engineer', false, 'Simple purge and real-time status'],
    ['STK-008', 'ISP partnership manager (external)', 'Partner', 'Partner manager', false, 'Cache-node hosting terms'],
  ];
  for (const [id, name, cat, role, sp, needs] of stk) mk('Stakeholder', id, { title: name, category: cat, role_title: role, is_sponsor: sp, needs_summary: needs, influence: sp ? 5 : 3, interest: 4, status: 'Active' });

  mk('IntakeBrief', 'INT-001', {
    title: 'Sahayogi CDN intake brief',
    idea: 'Sahayogi CDN: a Content Delivery Network (assumption ASM-001) that caches and serves web content, video and APIs from edge locations in South Asia, sold to businesses.',
    requester: 'Rohan Mehta (CTO)',
    problem_statement: 'Digital businesses serving users in India and neighbouring countries see slow page and video start on tier-2 and tier-3 city mobile networks, pay high APAC egress prices to global providers, and struggle to prove that logs and personal data stay in the country.',
    requested_solution: 'A regional delivery network with points of presence in Mumbai, Chennai and inside partner ISPs.',
    desired_outcome: 'A paying base of 12 regional businesses by month 12 whose users get measurably faster delivery (p95 cached TTFB <= 60 ms) at lower cost with in-country data handling.',
    urgency: 'high', needed_by: '2027-04-30', purpose: 'Win regional customers who are poorly served on speed, price and data residency by global providers.',
    existing_assets: ['An ASN', '2 colocation racks in Mumbai and Chennai', 'NOC team of 6'], reference_products: ['Cloudflare', 'Akamai', 'Fastly', 'Amazon CloudFront', 'Bunny.net'],
    data_categories: ['telemetry_ip', 'behavioural'], personal_data: true, jurisdictions: ['India'], criticality: 'business', strategic_fit_rating: 4, status: 'Approved',
  });

  const ev = (id, title, kind, cls, date, extra = {}, o = {}) => mk('Evidence', id, { title, kind, source_class: cls, retrieved_on: date, published_on: date, reliability: 'B', credibility: 2, captured: true, status: 'Captured', ...extra }, o);
  ev('SRC-001', 'Internal strategy memo "Regional CDN opportunity" (R. Mehta)', 'document', 'internal', '2026-08-12');
  ev('SRC-002', 'Pilot customer interview notes, OTT video platform', 'interview', 'primary', '2026-09-02');
  ev('SRC-003', 'Pilot customer RUM export: p95 video start 4.2 s on tier-2 mobile', 'data_file', 'primary', '2026-09-02');
  ev('SRC-004', 'ISP call notes: ISP willing to host caches if transit saving is shared', 'interview', 'primary', '2026-09-10');
  ev('SRC-005', 'Competitor public price pages (dated screenshots)', 'web_page', 'vendor_claim', '2026-09-14', { reliability: 'C', credibility: 3 });
  ev('SRC-006', 'CERT-In cyber-security directions (log retention 180 days in India, incident report within 6 hours)', 'regulation', 'secondary', '2026-09-12', { reliability: 'C', credibility: 3 }, { origin: 'document' });
  ev('SRC-007', 'DPDP Act 2023 summary supplied by Legal', 'regulation', 'secondary', '2026-09-12', { reliability: 'C', credibility: 3 }, { origin: 'document' });
  patch('SRC-006', { note: 'general knowledge, not independently verified (GK-UNVERIFIED in the walkthrough)' });
  patch('SRC-007', { note: 'general knowledge, not independently verified (GK-UNVERIFIED in the walkthrough)' });

  const ins = (id, title, st, conf, evids) => { mk('Insight', id, { title, statement: title, confidence: conf, status: st }); many('evidences', id, evids); };
  ins('INS-001', 'Tier-2/3 mobile users get 3-5x slower start-up than metro users on global CDNs', 'Validated', 'Reported', ['SRC-002', 'SRC-003']);
  ins('INS-002', 'Customers pay a premium for APAC egress and want a local price', 'Raw', 'Inferred', ['SRC-001', 'SRC-002', 'SRC-005']);
  ins('INS-003', 'Regulated customers must keep logs in India and report incidents fast', 'Validated', 'Reported', ['SRC-006', 'SRC-007']);
  ins('INS-004', 'ISPs will host caches to cut their transit cost', 'Raw', 'Reported', ['SRC-004']);

  const asm = (id, st, cat, unc, imp, owner, gate, extra = {}) => mk('Assumption', id, { title: st.slice(0, 80), statement: st, category: cat, uncertainty: unc, impact: imp, owner, validate_by_gate: gate, basis: 'assumed', status: 'Open', ...extra });
  asm('ASM-001', '"CDN" means Content Delivery Network; the product is an edge caching and delivery service', 'other', 2, 5, 'Rohan Mehta', 3, { reconfirm_by: '2026-11-15', validation_method: 'written confirmation from the requester', impact_if_false: 'Entire project mis-scoped' });
  asm('ASM-002', 'The company ASN and 2 racks can be used for anycast announcement', 'technical', 3, 5, 'Priya Nair', 2, { validation_method: 'check with upstream providers' });
  asm('ASM-003', 'At least 2 ISPs host cache nodes at zero colocation fee', 'commercial', 4, 5, 'Priya Nair', 2, { validation_method: 'signed LOIs' });
  asm('ASM-004', '3 anchor customers sign within 6 months', 'commercial', 4, 5, 'Vikram Shah', 2, { validation_method: 'LOIs' });
  asm('ASM-005', 'Open-source cache software (NGINX/Varnish/Apache Traffic Server class) is sufficient for v1', 'technical', 3, 4, 'Rohan Mehta', 2, { validation_method: '4-week spike' });
  asm('ASM-006', 'A NOC of at most 6 people can run the network 24x7 in v1', 'operational', 3, 3, 'Priya Nair', 3);
  asm('ASM-008', 'Targets of p95 TTFB <= 60 ms are achievable with 8 PoPs of 100 Gbps', 'technical', 4, 4, 'Rohan Mehta', 2, { validation_method: 'load test' });

  const con = (id, kind, st, amount, unit, flex, owner, extra = {}) => mk('Constraint', id, { title: st.slice(0, 80), kind, statement: st, ...(amount !== null ? { amount } : {}), ...(unit ? { unit } : {}), flexibility: flex, owner, status: 'Confirmed', reviewed_at: '2026-09-12', ...extra });
  con('CON-001', 'budget', 'Capex ceiling for the first 12 months', 12, 'INR crore', 'hard', 'CFO');
  con('CON-002', 'date', 'Pilot traffic must be on the network by month 9', 9, 'months', 'soft', 'CEO');
  con('CON-003', 'regulatory', 'Access logs of Indian end users are stored in India for the retention period', 180, 'days', 'hard', 'Legal');
  con('CON-004', 'regulatory', 'Cyber incidents are reported to CERT-In within the required time', 6, 'hours', 'hard', 'Legal');
  con('CON-005', 'regulatory', 'Content under a government blocking order (IT Act s69A) must be blocked', null, null, 'hard', 'Legal');
  con('CON-006', 'organisation', 'NOC staffed 24x7 by at most 6 people for v1', 6, 'people', 'soft', 'Head of Network Ops', { reviewed_at: undefined });
  patch('CON-006', { reviewed_at: null });

  const qst = (id, text, pr, gate, who, st = 'Open', extra = {}) => mk('Question', id, { title: text, priority: pr, needed_by_gate: gate, asked_of: who, owner: who, status: st, ...extra });
  qst('QST-001', 'What does CDN stand for and what is the intended product?', 'Must', 0, 'Rohan Mehta', 'Provisional', { resolution: 'assumed', category: 'scope' });
  qst('QST-002', 'Which countries are in version 1?', 'Must', 1, 'Anjali Rao', 'Answered', { resolution: 'answered', answer: 'India only for version 1; Nepal and Bangladesh in release R3.', category: 'scope' });
  qst('QST-003', 'Is live low-latency streaming in version 1?', 'Should', 2, 'Pilot OTT customer CTO', 'Open', { category: 'scope' });
  qst('QST-004', 'Who legally owns the ASN and are the upstream transit contracts fixed-term?', 'Must', 2, 'Arjun Das', 'Open', { category: 'legal' });
  qst('QST-005', 'Is a managed WAF expected by regulated customers at launch?', 'Should', 3, 'Meera Iyer', 'Open', { category: 'scope' });
  qst('QST-006', 'Which format does CERT-In expect for incident reports?', 'Must', 3, 'Meera Iyer', 'Open', { category: 'legal' });
  lk('provisionally_answered_by', 'QST-001', 'ASM-001');

  const rsk = (id, title, cat, p, i, owner, ev) => mk('Risk', id, { title, event: title, effect: ev, category: cat, probability: p, impact: i, owner, status: 'Open', review_date: '2026-12-01' });
  rsk('RSK-001', 'ISP cache agreements slip', 'partner', 3, 4, 'Priya Nair', 'Fewer than 6 PoPs at pilot; latency target missed');
  rsk('RSK-002', 'Volumetric DDoS exceeds capacity', 'security', 3, 4, 'Priya Nair', 'Customers offline; reputational damage');
  rsk('RSK-003', 'Price war: Cloudflare or Bunny cut APAC prices', 'market', 3, 4, 'Kanishk', 'Price advantage disappears; margin falls below floor');
  rsk('RSK-004', 'Localisation rules tighten', 'regulatory', 2, 3, 'Meera Iyer', 'Extra compliance cost');
  rsk('RSK-005', 'Customer concentration: one OTT customer is 60 percent of traffic', 'market', 3, 4, 'Vikram Shah', 'Churn kills revenue');

  const scp = (id, text, disp, kind, extra = {}) => mk('ScopeEntry', id, { title: text, kind, subject_text: text, disposition: disp, status: kind === 'initial_boundary' ? 'Approved' : 'In review', ...extra });
  scp('SCP-001', 'Edge caching and delivery of HTTP(S) content from in-region PoPs', 'in', 'initial_boundary', { rationale: 'core of the product' });
  scp('SCP-002', 'Customer portal and API, usage billing, in-country logs', 'in', 'initial_boundary', { rationale: 'needed to sell and operate the service' });
  scp('SCP-003', 'Customer DNS hosting and registrar services', 'out', 'initial_boundary', { rationale: 'not core; customers keep their DNS' });
  scp('SCP-004', 'Edge compute / serverless', 'out', 'initial_boundary', { rationale: 'needs a sandbox runtime; too big for 9 months' });
  scp('SCP-005', 'Low-latency live streaming', 'unknown', 'initial_boundary', { rationale: 'depends on the pilot customer' });
  scp('SCP-006', 'Managed WAF', 'unknown', 'initial_boundary', { rationale: 'depends on regulated-customer expectations' });
  lk('clarifies', 'QST-003', 'SCP-005'); lk('clarifies', 'QST-005', 'SCP-006');

  const ext = (id, name, prov, kind, crit, owner) => mk('ExternalSystem', id, { title: name, provider: prov, kind, criticality: crit, owner, terms_version: 'v1', review_by: '2027-03-01', status: 'Active' });
  ext('EXT-001', 'Customer origin servers', 'customers', 'origin', 'critical', 'Rohan Mehta');
  ext('EXT-002', 'ACME certificate authorities (two CAs)', 'public CAs', 'certificate_authority', 'high', 'Rohan Mehta');
  ext('EXT-003', 'Payment gateway and GST e-invoicing', 'payment provider', 'payment_gateway', 'high', 'Arjun Das');
  ext('EXT-004', 'Upstream transit and IXP (BGP)', 'transit providers', 'transit', 'critical', 'Priya Nair');
  ext('EXT-005', 'PoP agents (edge fleet)', 'Sahayogi', 'platform', 'critical', 'Priya Nair');
  ext('EXT-006', 'Upstream DDoS scrubbing provider', 'scrubbing vendor', 'partner_api', 'high', 'Priya Nair');

  mk('PhaseBudget', 'BUD-001', { title: 'Phase 1 budget', for_phase: 1, planned_effort: 6, planned_cost: 4200000, approver: 'Anjali Rao', status: 'Approved' });

  mk('Decision', 'DEC-001', { title: 'Edge software stack: open-source cache plus own control plane', kind: 'architecture', chosen: 'open-source cache with own control plane', rationale: 'Building a custom cache would blow the 9-month schedule', decided_on: '2026-09-18', decider: 'Rohan Mehta', status: 'Approved' });
  mk('Decision', 'DEC-002', { title: 'Routing: anycast BGP primary, DNS steering fallback', kind: 'architecture', chosen: 'anycast primary', decider: 'Rohan Mehta', status: 'Proposed' });
  mk('Decision', 'DEC-003', { title: 'Pricing basis: 95th percentile, per-GB for small customers', kind: 'pricing', chosen: '95th percentile', decider: 'Arjun Das', status: 'Proposed' });
  mk('Decision', 'DEC-004', { title: 'Scope baseline', kind: 'product', chosen: 'Features FTR-001..012 in version 1', rationale: 'Waiting for the capacity check and the open ASN question', decider: 'Anjali Rao', status: 'Proposed' });
  lk('decides', 'DEC-001', 'ASM-005');

  // assemble and approve the intake document
  derive.run(S, 'assemble_artifact', { kind: 'intake_document' }, ACTOR);
  patch('ART-001', { status: 'Approved' });
  derive.run(S, 'link_questions_to_gates', {}, ACTOR);

  // Gate 0 decision
  clock('2026-09-12');
  gates.decide(S, 0, 'go_with_conditions', {
    rationale: 'Problem and sponsor are clear. Two items remain open and are carried as conditions: the meaning of CDN is only an assumption, and ASN ownership is unknown.',
    conditions: [
      { text: 'Rohan Mehta confirms in writing what CDN stands for and the product scope (closes ASM-001 and QST-001).', owner: 'Rohan Mehta', must_close_by_gate: 2, tracks: 'QST-001' },
      { text: 'Arjun Das answers who legally owns the ASN and whether transit contracts are fixed-term (QST-004).', owner: 'Arjun Das', must_close_by_gate: 2, tracks: 'QST-004' },
    ],
  }, 'Anjali Rao');

  // ===================================================================== PHASE 1
  clock('2026-09-21');
  mk('Segment', 'SEG-001', { title: 'OTT and video streaming platforms', definition: 'VOD and live-event platforms in India', primary: true, size_count: 120, status: 'Validated' });
  mk('Segment', 'SEG-002', { title: 'E-commerce and marketplaces', definition: 'Image-heavy sites with sale-day spikes', primary: false, status: 'Assumed' });
  const per = (id, title, kind, prim, goals, st = 'Assumed') => mk('Persona', id, { title, kind, primary: prim, goals, status: st, buying_role: kind === 'buyer' ? 'economic_buyer' : 'user' });
  per('PER-001', 'Customer platform / DevOps engineer', 'customer_user', true, 'Put traffic on the CDN in under an hour; purge fast', 'Validated');
  per('PER-002', 'Customer engineering head', 'buyer', true, 'Prove faster delivery to justify spend');
  per('PER-003', 'Customer finance / procurement', 'buyer', false, 'Predictable, itemised monthly charges');
  per('PER-004', 'Sahayogi NOC engineer', 'internal_user', false, 'One console to mitigate an attack within the reporting rule');
  many('member_of', 'PER-001', ['SEG-001']); lk('member_of', 'PER-002', 'SEG-001'); lk('member_of', 'PER-003', 'SEG-002');
  const job = (id, text, imp, rank, seg) => { mk('Job', id, { title: text.slice(0, 90), statement: text, importance: imp, satisfaction: 2, rank, status: rank <= 3 ? 'Validated' : 'Assumed' }); lk('occurs_in', id, seg); };
  job('JOB-001', 'When I launch a site or app I want traffic on the CDN in under an hour so I can ship on time', 5, 1, 'SEG-001');
  job('JOB-002', 'When users in tier-2 cities complain I want proof of faster delivery so I can justify the spend', 5, 2, 'SEG-001');
  job('JOB-003', 'When the monthly bill arrives I want predictable, itemised charges so I can forecast', 4, 3, 'SEG-002');
  job('JOB-004', 'When an attack starts I want one console to mitigate so I can meet the 6-hour reporting rule', 4, 4, 'SEG-001');
  lk('has_job', 'PER-001', 'JOB-001'); lk('has_job', 'PER-002', 'JOB-002'); lk('has_job', 'PER-003', 'JOB-003'); lk('has_job', 'PER-004', 'JOB-004');

  ev('SRC-008', 'Cloudflare pricing and docs pages (capture)', 'web_page', 'vendor_claim', '2026-03-30', { url_or_file: 'https://www.cloudflare.com/plans/', reliability: 'B', credibility: 2 }, { origin: 'agent' });
  ev('SRC-009', 'Akamai product and contract-pricing pages (capture)', 'web_page', 'vendor_claim', '2026-06-20', { url_or_file: 'https://www.akamai.com/', reliability: 'B', credibility: 2 }, { origin: 'agent' });
  ev('SRC-010', 'Fastly pricing and docs pages (capture)', 'web_page', 'vendor_claim', '2026-08-25', { url_or_file: 'https://www.fastly.com/pricing', reliability: 'B', credibility: 2 }, { origin: 'agent' });
  ev('SRC-011', 'Amazon CloudFront pricing page (capture)', 'web_page', 'vendor_claim', '2026-09-14', { url_or_file: 'https://aws.amazon.com/cloudfront/pricing/', reliability: 'A', credibility: 2 }, { origin: 'agent' });
  ev('SRC-012', 'Forum thread: slow video start on tier-2 mobile networks', 'web_page', 'secondary', '2026-09-16', { url_or_file: 'https://forum.example/thread/slow-start', reliability: 'C', credibility: 4 }, { origin: 'agent' });
  ev('SRC-013', 'Customer survey summary: what matters in a CDN (n=14)', 'survey', 'primary', '2026-08-30', { reliability: 'B', credibility: 3 });
  ev('SRC-014', 'Old competitor price list screenshot (2025)', 'price_list', 'vendor_claim', '2025-08-20', { reliability: 'D', credibility: 4 });
  for (const id of ['SRC-008', 'SRC-009', 'SRC-010', 'SRC-011', 'SRC-012']) patch(id, { verification: 'verified', verified_by: 'Research analyst', verified_on: '2026-09-20' });
  lk('supported_by', 'SEG-001', 'INS-001', { role: 'supports' }); lk('supported_by', 'SEG-001', 'SRC-013', { role: 'supports' });
  many('supported_by', 'PER-001', ['SRC-002', 'SRC-012']); many('supported_by', 'PER-002', ['INS-001', 'SRC-013']);
  many('supported_by', 'JOB-001', ['SRC-002', 'SRC-012']); many('supported_by', 'JOB-002', ['INS-001', 'SRC-003']); many('supported_by', 'JOB-003', ['INS-002', 'SRC-013']);

  const prb = (id, text, st, insight) => { mk('Problem', id, { title: text, statement: text, severity: 4, frequency: 'frequent', status: st }); lk('raises', insight, id); };
  prb('PRB-001', 'Slow page and video start on regional mobile networks', 'Approved', 'INS-001');
  prb('PRB-002', 'High egress cost for APAC traffic', 'Approved', 'INS-002');
  prb('PRB-003', 'Burden of proving in-country data handling to auditors', 'In review', 'INS-003');
  const opp = (id, text, ins, st) => { mk('Opportunity', id, { title: text.slice(0, 90), statement: text, value_hypothesis: 'Customers switch or add a regional CDN when speed, price and residency are better', status: st }); lk('raises', ins, id); };
  opp('OPP-001', 'Sub-60 ms cached TTFB for tier-2/3 mobile users via in-region PoPs and ISP-embedded caches', 'INS-001', 'Approved');
  opp('OPP-002', 'Predictable local-currency pricing with lower APAC egress', 'INS-002', 'In review');
  opp('OPP-003', 'In-country logs and compliance reporting (CERT-In ready)', 'INS-003', 'In review');
  lk('addresses', 'OPP-001', 'PRB-001'); lk('addresses', 'OPP-002', 'PRB-002'); lk('addresses', 'OPP-003', 'PRB-003');
  many('targets', 'OPP-001', ['SEG-001']); many('targets', 'OPP-002', ['SEG-002']);

  // competitors, cells and prices (invented approximations; GK-UNVERIFIED in the walkthrough)
  const cmp = (id, name, kind, tier, basis, pos, st = 'Reviewed', extra = {}) => mk('Competitor', id, { title: name, kind, tier, tier_basis: basis, positioning: pos, status: st, verified_by: 'Research analyst', ...extra });
  cmp('CMP-001', 'Cloudflare', 'direct', 'T1', 'customer_shortlist', 'Scale, free tier, security');
  cmp('CMP-002', 'Akamai', 'direct', 'T1', 'customer_shortlist', 'Largest edge, enterprise trust');
  cmp('CMP-003', 'Fastly', 'direct', 'T2', 'marketplace_compare', 'Instant purge and programmability');
  cmp('CMP-004', 'Amazon CloudFront', 'direct', 'T2', 'customer_shortlist', 'AWS ecosystem integration');
  cmp('CMP-005', 'Self-hosted Varnish/NGINX with multi-CDN', 'alternative', 'S', 'customer_shortlist', 'Control and low cost at scale', 'Reviewed', { pricing_na_reason: 'Own infrastructure cost; no list price exists' });
  const cell = (id, comp, tag, level, date, ev_, imp, basis = 'documented', note = '') => {
    mk('CompetitorCapability', id, { title: `${S.get(comp).title}: ${tag}`, capability_tag: tag, level, evidence_basis: basis, value_class: 'verified_fact', captured_on: date, importance: imp, capture_method: 'manual', note, status: 'Reviewed', verification: 'verified', verified_by: 'Research analyst', verified_on: '2026-09-20' });
    lk('contains', comp, id); lk('supported_by', id, ev_, { role: 'supports' });
  };
  cell('CCP-001', 'CMP-001', 'HTTP/3 (QUIC) support', 'strong', '2026-08-28', 'SRC-008', 3);
  cell('CCP-002', 'CMP-001', 'Purge propagation speed', 'strong', '2026-08-28', 'SRC-008', 4, 'documented', 'global purge in seconds (vendor claim)');
  cell('CCP-003', 'CMP-001', 'India PoP depth (tier-2/3 cities)', 'partial', '2026-03-30', 'SRC-008', 5, 'documented', 'metro PoPs only');
  cell('CCP-004', 'CMP-001', 'In-country log retention option', 'partial', '2026-03-30', 'SRC-008', 5, 'documented', 'log region selectable only on enterprise plans');
  cell('CCP-005', 'CMP-002', 'India PoP depth (tier-2/3 cities)', 'partial', '2026-06-20', 'SRC-009', 5, 'documented', 'large footprint but few embedded caches in tier-3');
  cell('CCP-006', 'CMP-002', 'In-country log retention option', 'parity', '2026-06-20', 'SRC-009', 5);
  cell('CCP-007', 'CMP-003', 'Purge propagation speed', 'strong', '2026-08-25', 'SRC-010', 4, 'hands_on', 'about 150 ms in the vendor docs');
  cell('CCP-008', 'CMP-003', 'India PoP depth (tier-2/3 cities)', 'absent', '2026-08-25', 'SRC-010', 5, 'documented', 'few India PoPs');
  cell('CCP-009', 'CMP-004', 'India PoP depth (tier-2/3 cities)', 'partial', '2026-09-14', 'SRC-011', 5);
  cell('CCP-010', 'CMP-005', 'Operational control', 'strong', '2026-07-01', 'SRC-001', 3, 'third_party', 'full control, high operations burden');
  const price = (id, comp, plan, amount, date, ev_, extra = {}) => {
    mk('PricePoint', id, { title: `${S.get(comp).title} ${plan}`, plan, value_metric: 'egress', unit: 'GB', amount, currency: 'USD', price_type: 'list', billing_model: 'usage', tax_basis: 'excl_gst', region: 'APAC', captured_on: date, source_grade: 'B', status: 'Reviewed', verification: 'verified', verified_by: 'Research analyst', verified_on: '2026-09-20', ...extra });
    lk('contains', comp, id); lk('supported_by', id, ev_, { role: 'supports' });
  };
  price('PPT-001', 'CMP-001', 'Standard egress (APAC)', 0.05, '2026-03-30', 'SRC-008');
  price('PPT-002', 'CMP-001', 'India-region add-on', 0.08, '2026-08-28', 'SRC-008');
  price('PPT-003', 'CMP-002', 'Committed-usage quote', 0.045, '2026-06-20', 'SRC-009', { price_type: 'quote' });
  price('PPT-004', 'CMP-003', 'Pay-as-you-go APAC', 0.12, '2026-08-25', 'SRC-010');
  price('PPT-005', 'CMP-004', 'APAC first-10TB tier', 0.109, '2026-09-14', 'SRC-011', { source_grade: 'A' });

  mk('TrackedSource', 'TSR-001', { title: 'Cloudflare pricing page', url_pattern: 'cloudflare.com/plans', source_type: 'pricing_page', default_grade: 'B', access_method: 'manual_only', login_required: false, tos_verdict: 'allows_manual', tos_checked_on: '2026-09-15', status: 'Active' });
  mk('TrackedSource', 'TSR-002', { title: 'Akamai product pages', url_pattern: 'akamai.com', source_type: 'competitor_site', default_grade: 'B', access_method: 'manual_only', login_required: false, tos_verdict: 'allows_manual', tos_checked_on: '2026-09-15', status: 'Cleared' });
  lk('observed_via', 'SRC-008', 'TSR-001'); lk('observed_via', 'SRC-009', 'TSR-002');

  const obl = (id, title, kind, instr, text, st = 'Approved') => mk('Obligation', id, { title, kind, instrument: instr, jurisdiction: 'India', obligation_text: text, applicability: 'applicable', owner: 'Meera Iyer', status: st }, { origin: 'document' });
  obl('OBL-001', 'CERT-In cyber-security directions', 'regulation', 'CERT-In directions (2022)', 'Keep logs in India for 180 days and report cyber incidents within 6 hours.');
  obl('OBL-002', 'Digital Personal Data Protection Act 2023', 'law', 'DPDP Act 2023', 'Process personal data lawfully with purpose, retention and consent records.');
  obl('OBL-003', 'IT Act section 69A blocking orders', 'law', 'IT Act 2000 s69A', 'Block content under a government blocking order within the legally required time.');
  obl('OBL-004', 'RFC 9111 HTTP caching', 'standard', 'RFC 9111', 'Cache behaviour must conform to HTTP caching semantics.');
  // obligations are applied to the features they bind (these features are created in Phase 2; links are added there)
  many('supported_by', 'OBL-001', ['SRC-006']); many('supported_by', 'OBL-002', ['SRC-007']);

  const exp = (id, hyp, method, owner, due, thr, asmId, st = 'Planned') => { mk('Experiment', id, { title: `Test ${asmId}`, hypothesis: hyp, method, owner, due_on: due, success_threshold: thr, result: 'pending', status: st }); lk('tests', id, asmId); };
  exp('EXP-001', 'At least two ISPs will host caches without a colocation fee', 'interview', 'Priya Nair', '2026-12-15', '2 signed LOIs', 'ASM-003');
  exp('EXP-002', 'Three anchor customers will sign within six months', 'interview', 'Vikram Shah', '2027-03-31', '3 signed LOIs', 'ASM-004');
  exp('EXP-003', '8 PoPs of 100 Gbps deliver p95 TTFB <= 60 ms', 'benchmark', 'Rohan Mehta', '2026-12-20', 'p95 <= 60 ms in lab', 'ASM-008');
  exp('EXP-004', 'The ASN and 2 racks can announce anycast prefixes', 'analysis', 'Priya Nair', '2026-11-20', 'upstream written confirmation', 'ASM-002');
  exp('EXP-005', 'Open-source cache software meets v1 needs', 'spike', 'Rohan Mehta', '2026-11-30', 'spike passes 10 acceptance checks', 'ASM-005', 'Running');

  many('threatens', 'RSK-003', ['CMP-001', 'CMP-002', 'OPP-002']); lk('threatens', 'RSK-005', 'SEG-001'); lk('threatens', 'RSK-001', 'ASM-003'); lk('threatens', 'RSK-004', 'OBL-002');
  many('exploits', 'OPP-001', ['CCP-003', 'CCP-005']); many('supported_by', 'OPP-001', ['INS-001']); many('benchmarks', 'DEC-003', ['PPT-001', 'PPT-004']);
  many('affects', 'ASM-003', ['OPP-001']); lk('affects', 'QST-004', 'EXT-004'); lk('affects', 'CON-002', 'PRJ-001'); lk('affects', 'RSK-001', 'EXT-004');

  // agent-proposed Bunny.net values: ingested, NOT yet verified (shows in the verification queue)
  clock('2026-10-05');
  agent.ingest(S, {
    request_id: 'DR-1-13', submitted_by: ACTOR,
    provenance: { agent: 'claude-research', retrieved_on: '2026-10-05', grade: 'C', confidence: 'moderate', source_url: 'https://bunny.net/pricing/' },
    items: [
      { tmp: 'c1', type: 'Competitor', fields: { title: 'Bunny.net', kind: 'direct', tier: 'T2', tier_basis: 'marketplace_compare', positioning: 'Simple, low per-GB price' } },
      { tmp: 'k1', type: 'CompetitorCapability', fields: { title: 'Bunny.net: HTTP/3 (QUIC) support', capability_tag: 'HTTP/3 (QUIC) support', level: 'parity', evidence_basis: 'documented', importance: 3 } },
      { tmp: 'k2', type: 'CompetitorCapability', fields: { title: 'Bunny.net: India PoP depth (tier-2/3 cities)', capability_tag: 'India PoP depth (tier-2/3 cities)', level: 'partial', evidence_basis: 'documented', importance: 5 } },
      { tmp: 'p1', type: 'PricePoint', fields: { title: 'Bunny.net standard egress (APAC)', plan: 'Standard', value_metric: 'egress', unit: 'GB', amount: 0.06, currency: 'USD', price_type: 'list', billing_model: 'usage', tax_basis: 'excl_gst', region: 'APAC' } },
    ],
    links: [{ type: 'contains', source: 'c1', target: 'k1' }, { type: 'contains', source: 'c1', target: 'k2' }, { type: 'contains', source: 'c1', target: 'p1' }],
  });

  clock('2026-10-02');
  derive.run(S, 'assemble_artifact', { kind: 'market_analysis' }, ACTOR);
  derive.run(S, 'assemble_artifact', { kind: 'competitor_analysis' }, ACTOR);
  patch('ART-002', { status: 'In review' }); patch('ART-003', { status: 'In review' });

  // ===================================================================== PHASE 2
  clock('2026-09-28');
  mk('Objective', 'OBJ-001', { title: 'Be the default delivery network for South Asian digital businesses', kind: 'vision', statement: 'Be the default delivery network for South Asian digital businesses: fast to the last mile, fair in price, compliant by design.', status: 'Approved', horizon: '3 years' });
  mk('Objective', 'OBJ-002', { title: 'Lowest-latency CDN for tier-2/3 India users', kind: 'objective', statement: 'Lowest-latency CDN for tier-2/3 India users', status: 'Approved', horizon: '12 months' });
  mk('Objective', 'OBJ-003', { title: 'Commercially viable and compliance-ready', kind: 'objective', statement: 'Reach a viable customer base with in-country data handling', status: 'In review', horizon: '12 months' });
  const met = (id, name, unit, bt, bv, target, cmpOp, owner, method, obj, extra = {}) => { mk('Metric', id, { title: name, definition: name, unit, use: 'key_result', baseline_type: bt, ...(bv !== null ? { baseline_value: bv } : {}), ...(bt === 'none_new_product' ? { baseline_reason: 'greenfield product, no baseline exists' } : {}), target_value: target, comparator: cmpOp, owner, cadence: 'monthly', measurement_method: method, status: 'In review', ...extra }); lk('measures', id, obj); };
  met('MET-001', 'p95 cached TTFB at probes in 10 tier-2/3 cities', 'ms', 'measured', 180, 60, '<=', 'Rohan Mehta', 'synthetic probes', 'OBJ-002');
  met('MET-002', 'Static cache hit ratio (by requests)', '%', 'none_new_product', null, 90, '>=', 'Rohan Mehta', 'edge logs', 'OBJ-002');
  met('MET-003', 'Paying customers', 'customers', 'none_new_product', null, 12, '>=', 'Vikram Shah', 'CRM', 'OBJ-003');
  met('MET-004', 'Gross margin', '%', 'none_new_product', null, 35, '>=', 'Arjun Das', 'finance close', 'OBJ-003');
  met('MET-005', 'Data-plane availability per month', '%', 'none_new_product', null, 99.95, '>=', 'Priya Nair', 'external synthetic probes', 'OBJ-002');
  const mod = (id, name, desc) => mk('Module', id, { title: name, boundary_description: desc, owner: 'Rohan Mehta', status: 'In review' });
  mod('MOD-001', 'Edge Delivery', 'Caching and delivery at the PoPs'); mod('MOD-002', 'Cache and Purge', 'Cache rules and invalidation'); mod('MOD-003', 'TLS and Traffic', 'Certificates, anycast, failover');
  mod('MOD-004', 'Security and NOC', 'DDoS mitigation and the NOC console'); mod('MOD-005', 'Analytics and Logs', 'Real-time analytics and log delivery'); mod('MOD-006', 'Portal and Billing', 'Customer portal, API and metered billing');
  mk('Release', 'RLS-001', { title: 'R1 MVP: Mumbai, Chennai and two ISP nodes', order: 1, is_mvp: true, window_start: '2027-01-01', window_end: '2027-06-30', status: 'Planned' });
  mk('Release', 'RLS-002', { title: 'R2: six more PoPs', order: 2, is_mvp: false, window_start: '2027-07-01', window_end: '2027-12-31', status: 'Planned' });
  const ftr = (id, name, mod_, pri, eff, sc, sup, extra = {}) => {
    mk('Feature', id, { title: name, level: 'feature', priority: pri, effort_pm: eff, effort_confidence: 'medium', scope_status: sc, status: 'Approved', ...extra });
    lk('belongs_to', id, mod_); many('supports', id, sup);
    if (sc === 'in') lk('planned_in', id, pri === 'Must' ? 'RLS-001' : 'RLS-002');
  };
  ftr('FTR-001', 'HTTP(S) edge delivery and caching with cache rules', 'MOD-001', 'Must', 14, 'in', ['MET-001', 'MET-002']);
  ftr('FTR-002', 'Origin pull, origin shield and stale-if-error', 'MOD-001', 'Must', 8, 'in', ['MET-002', 'MET-005']);
  ftr('FTR-003', 'Purge by URL, prefix or tag', 'MOD-002', 'Must', 5, 'in', ['MET-001']);
  ftr('FTR-004', 'Automated TLS (ACME) and custom certificates', 'MOD-003', 'Must', 6, 'in', ['MET-005']);
  ftr('FTR-005', 'Anycast routing and health-based failover', 'MOD-003', 'Must', 12, 'in', ['MET-005', 'MET-001']);
  ftr('FTR-006', 'Volumetric DDoS absorption and rate limiting', 'MOD-004', 'Must', 10, 'in', ['MET-005']);
  ftr('FTR-007', 'Real-time and historical analytics', 'MOD-005', 'Should', 7, 'in', ['MET-001']);
  ftr('FTR-008', 'Log delivery with in-country retention', 'MOD-005', 'Must', 6, 'in', ['OBL-001'], { mandatory: true });
  ftr('FTR-009', 'Customer portal and API with role-based access', 'MOD-006', 'Must', 12, 'in', ['MET-003']);
  ftr('FTR-010', 'Metered billing (95th percentile, INR, GST invoice)', 'MOD-006', 'Must', 8, 'in', ['MET-003', 'MET-004']);
  ftr('FTR-011', 'NOC console with CERT-In report helper', 'MOD-004', 'Must', 8, 'in', ['OBL-001'], { mandatory: true });
  ftr('FTR-012', 'ISP-embedded cache program tooling', 'MOD-003', 'Should', 6, 'in', ['MET-001']);
  ftr('FTR-013', 'Managed WAF', 'MOD-004', 'Could', 14, 'later', ['OPP-003']);
  ftr('FTR-014', 'Edge compute / serverless', 'MOD-001', 'Wont', 30, 'out', ['OBJ-001'], { status: 'Rejected' });
  many('realizes', 'FTR-001', ['OPP-001']); many('realizes', 'FTR-003', ['OPP-001']); many('realizes', 'FTR-008', ['OPP-003']); many('realizes', 'FTR-010', ['OPP-002']);
  many('addresses', 'FTR-001', ['PRB-001']); many('addresses', 'FTR-010', ['PRB-002']); many('addresses', 'FTR-008', ['PRB-003']);
  many('differentiates', 'FTR-001', ['CMP-001'], { rating: 'ahead' });
  many('assumes', 'FTR-005', ['ASM-002']); many('assumes', 'FTR-001', ['ASM-005']); many('assumes', 'OPP-002', ['ASM-004']); many('assumes', 'RLS-001', ['ASM-003']);

  mk('Capacity', 'CPC-001', { title: 'Core engineering team', kind: 'team', period_start: '2027-01-01', period_end: '2027-06-30', headcount: 10, availability_pct: 85, person_months: 74, status: 'Approved' });
  mk('Capacity', 'CPC-002', { title: 'NOC and operations loan', kind: 'team', period_start: '2027-01-01', period_end: '2027-06-30', headcount: 3, availability_pct: 60, person_months: 12, status: 'Approved' });
  many('staffed_by', 'RLS-001', ['CPC-001', 'CPC-002']); lk('bounded_by', 'CPC-001', 'CON-001');

  const sc2 = (id, text, disp, impact, why_, just, scopes?) => { mk('ScopeEntry', id, { title: text, kind: 'scope', subject_text: text, disposition: disp, rationale: why_, exclusion_impact: impact, decider: 'Anjali Rao', status: 'In review' }); lk('justified_by', id, just); if (scopes) lk('scopes', id, scopes); };
  many('applies_to', 'OBL-001', ['FTR-008', 'FTR-011']); many('applies_to', 'OBL-002', ['FTR-008', 'FTR-009']); lk('applies_to', 'OBL-003', 'FTR-011'); many('applies_to', 'OBL-004', ['FTR-001', 'FTR-002']);
  sc2('SCP-007', 'Edge compute / serverless', 'out', 'Developer-centric buyers are not served', 'Needs a sandbox runtime; cannot be built in 9 months', 'CON-001', 'FTR-014');
  sc2('SCP-008', 'Customer DNS hosting', 'out', 'Onboarding needs a CNAME change by the customer', 'Not core; customers keep their DNS', 'DEC-001');
  sc2('SCP-009', 'PoPs outside South Asia', 'out', 'Global customers are served only regionally', 'Capex ceiling', 'CON-001');
  sc2('SCP-010', 'Managed WAF', 'later', 'Regulated customers may ask for it earlier', 'Not a launch blocker; awaiting QST-005', 'CON-006', 'FTR-013');
  lk('refines', 'SCP-007', 'SCP-004'); lk('refines', 'SCP-008', 'SCP-003');
  derive.run(S, 'assemble_artifact', { kind: 'product_definition' }, ACTOR);
  derive.run(S, 'feature_scores', {}, ACTOR);

  // ===================================================================== PHASE 3
  clock('2026-10-01');
  const req = (id, sub, title, stmt, pri, st, extra = {}, o = {}) => mk('Requirement', id, { title, statement: stmt, priority: pri, status: st, flow_applicability: sub === 'functional' ? 'flow' : 'cross_cutting', ...(sub === 'functional' ? {} : { flow_reason: 'Cross-cutting: covered by scope and verification, not by a flow step' }), ...extra }, { subtype: sub, ...o });
  req('FR-001', 'functional', 'Create a property from an origin hostname', 'When a customer submits a valid origin hostname, the system shall create a property and return a CNAME target within 5 seconds.', 'Must', 'Approved');
  req('FR-002', 'functional', 'Serve cached objects without contacting the origin', 'When a request matches a cache rule and a fresh object exists, the edge node shall serve it without contacting the origin.', 'Must', 'Approved');
  req('FR-003', 'functional', 'Serve stale content when the origin fails', 'If the origin returns a 5xx error or times out, the edge node shall serve a stale object within the stale-if-error window.', 'Must', 'In review');
  req('FR-004', 'functional', 'Purge by URL, prefix or tag', 'When a customer issues a purge by URL, prefix or tag, the system shall invalidate matching objects in all PoPs.', 'Must', 'Approved');
  req('FR-005', 'functional', 'Issue and renew certificates automatically', 'While a property has HTTPS enabled, the system shall obtain and renew a certificate at least 15 days before expiry.', 'Must', 'Approved');
  req('FR-006', 'functional', 'Bill monthly by the 95th percentile', 'At month end the system shall compute billable bandwidth by the 95th percentile rule and issue a GST invoice in INR.', 'Must', 'In review');
  req('FR-007', 'functional', 'Apply a DDoS mitigation profile', 'When a NOC engineer applies a mitigation profile, the system shall enforce it on the affected PoPs within 60 seconds.', 'Must', 'In review');
  req('FR-008', 'functional', 'Enforce role permissions on every API call', 'The portal shall enforce the role permissions of the role matrix on every API call.', 'Must', 'Approved');
  req('FR-009', 'functional', 'Show hit ratio and TTFB per city', 'The portal shall display cache hit ratio and p95 TTFB per city per property.', 'Should', 'Draft');
  req('FR-010', 'functional', 'Deliver access logs to a customer destination', 'The system shall deliver access logs to the destination chosen by the customer within 5 minutes of the request.', 'Must', 'In review');
  const feat = { 'FR-001': ['FTR-001', 'FTR-009'], 'FR-002': ['FTR-001'], 'FR-003': ['FTR-002'], 'FR-004': ['FTR-003'], 'FR-005': ['FTR-004'], 'FR-006': ['FTR-010'], 'FR-007': ['FTR-006', 'FTR-011'], 'FR-008': ['FTR-009'], 'FR-009': ['FTR-007'], 'FR-010': ['FTR-008'] };
  for (const [r, fs_] of Object.entries(feat)) { many('derives_from', r, fs_); lk('belongs_to', r, S.get(fs_[0]) ? S.out(fs_[0], 'belongs_to')[0].target : 'MOD-001'); }
  patch('FR-009', { origin: 'derived' }); patch('FR-010', { origin: 'human' });

  const nfr = (id, title, cat, metric, cmpOp, target, unit, pct, cond, env, point, tool, basis, pri, st, extra0: any = {}) => {
    const { __strict, ...extra } = extra0;
    return req(id, 'non_functional', title, `The ${cat} target for ${metric} shall be ${cmpOp} ${target} ${unit}${pct ? ' (' + pct + ')' : ''}.`, pri, st, { category: cat, metric, comparator: cmpOp, target_value: target, unit, ...(pct ? { percentile: pct } : {}), window: 'monthly', condition: cond, environment: env, measurement_point: point, ...(tool ? { measurement_tool: tool } : {}), basis, contractual: false, ...extra }, __strict === false ? { strict: false } : {});
  };
  nfr('NFR-001', 'Data-plane availability', 'availability', 'non-5xx edge-originated responses per property per month', '>=', 99.95, '%', undefined, 'all PoPs, excluding customer origin failures', 'production', 'external synthetic probes in 10 cities', 'probe network', 'benchmarked', 'Must', 'Approved', { global: true, contractual: true });
  nfr('NFR-002', 'Cached time to first byte', 'latency', 'TTFB of cached responses', '<=', 60, 'ms', 'p95', '10 tier-2/3 city probes, 100 KB object, 4G', 'production', 'synthetic probes plus RUM', 'probe network', 'assumed', 'Must', 'Approved');
  nfr('NFR-003', 'Purge propagation time', 'latency', 'purge request to all PoPs', '<=', 5, 's', 'p95', '300 purges per second, all PoPs', 'production', 'purge probe', 'log pipeline', 'assumed', 'Must', 'Approved');
  nfr('NFR-004', 'Aggregate egress capacity', 'capacity', 'peak aggregate egress', '>=', 1, 'Tbps', undefined, 'peak day, month 12', 'production', 'capacity dashboard', undefined, 'invented', 'Must', 'In review', { __strict: false });
  nfr('NFR-005', 'Configuration push time', 'operability', 'configuration change reaches all PoPs', '<=', 60, 's', 'p95', 'any configuration push', 'production', 'control-plane metrics', 'metrics pipeline', 'assumed', 'Must', 'In review');
  nfr('NFR-006', 'Protocol conformance', 'security', 'PoPs supporting TLS 1.2/1.3 and HTTP/1.1, 2, 3 with TLS 1.0/1.1 disabled', '>=', 100, '% of PoPs', undefined, 'all PoPs', 'production', 'protocol scan', 'scanner', 'benchmarked', 'Must', 'Approved', { global: true });
  nfr('NFR-007', 'Log residency and retention', 'privacy', 'days access logs of Indian users are kept in India', '>=', 180, 'days', undefined, 'all customers', 'production', 'storage audit', 'audit script', 'measured', 'Must', 'Approved');
  nfr('NFR-008', 'DDoS absorption', 'availability', 'sustained volumetric attack absorbed', '>=', 300, 'Gbps', undefined, 'edge plus upstream scrubbing', 'production', 'drill', 'attack simulator', 'assumed', 'Must', 'In review');
  for (const id of ['NFR-001', 'NFR-002', 'NFR-003', 'NFR-004', 'NFR-005', 'NFR-006', 'NFR-007', 'NFR-008']) lk('derives_from', id, id === 'NFR-007' ? 'OBL-001' : 'OBJ-002');
  many('applies_to', 'NFR-002', ['FTR-001', 'FTR-005']); many('applies_to', 'NFR-003', ['FTR-003']); many('applies_to', 'NFR-004', ['PRJ-001']); many('applies_to', 'NFR-007', ['FTR-008']); many('applies_to', 'NFR-008', ['FTR-006']);
  many('assumes', 'NFR-002', ['ASM-003', 'ASM-008']); many('assumes', 'NFR-003', ['ASM-005']); many('assumes', 'NFR-005', ['ASM-005']); many('assumes', 'NFR-008', ['ASM-002']);

  req('IFR-001', 'interface', 'Pull content from customer origins', 'The edge shall pull from customer origins over HTTP/1.1 or HTTP/2 with TLS, using SNI and host-header override.', 'Must', 'Approved', { counterparty: 'Customer origin servers', direction: 'outbound', protocol: 'HTTP/1.1, HTTP/2, TLS', failure_handling: 'Serve stale; retry with backoff; open a circuit breaker after repeated failures' });
  req('IFR-002', 'interface', 'Obtain certificates from two ACME CAs', 'The system shall obtain certificates through the ACME protocol from two certificate authorities.', 'Must', 'Approved', { counterparty: 'ACME certificate authorities', direction: 'outbound', protocol: 'ACME (RFC 8555)', failure_handling: 'Retry hourly for 24 hours, alert the customer, fall back to the second CA' });
  lk('integrates_with', 'IFR-001', 'EXT-001'); lk('integrates_with', 'IFR-002', 'EXT-002'); many('derives_from', 'IFR-001', ['FTR-002']); many('derives_from', 'IFR-002', ['FTR-004']);
  req('DAR-001', 'data', 'Access-log record schema and retention', 'The system shall store each access-log record with timestamp, client IP, URL, status, bytes, cache status, PoP and TTFB for 180 days in India.', 'Must', 'Approved', { retention_days: 180, residency: 'India' });
  req('DAR-002', 'data', 'Billing samples retention', 'The system shall keep 5-minute billing samples for 13 months.', 'Must', 'In review', { retention_days: 395 });
  many('derives_from', 'DAR-001', ['FTR-008']); many('derives_from', 'DAR-002', ['FTR-010']);
  req('REG-001', 'regulatory', 'Retain logs in India and support 6-hour incident reports', 'The system shall retain logs in India for 180 days and shall let the NOC assemble a CERT-In incident report within 6 hours.', 'Must', 'In review');
  req('REG-002', 'regulatory', 'Record purpose and retention of personal data fields', 'The system shall record purpose and retention for each personal-data field it stores.', 'Must', 'In review');
  lk('satisfies', 'REG-001', 'OBL-001'); lk('satisfies', 'REG-002', 'OBL-002'); lk('derives_from', 'REG-001', 'OBL-001'); lk('derives_from', 'REG-002', 'OBL-002');

  const brl = (id, text, cat, kind, owner, applies, extra = {}) => { mk('BusinessRule', id, { title: text.slice(0, 80), statement: text, category: cat, kind, owner, enforcement: 'automated', effective_from: '2027-01-01', status: 'In review', ...extra }); many('applies', id, applies); };
  brl('BRL-001', 'Origin Cache-Control wins unless a customer override rule exists; default TTL 10 minutes; objects with Set-Cookie are not cached unless a rule allows it.', 'caching', 'constraint', 'Priya Nair', ['FR-002'], { parameters: ['default_ttl=10 min'] });
  brl('BRL-002', 'Billable bandwidth is the highest 5-minute sample left after discarding the top 5 percent of samples in the month.', 'billing', 'calculation', 'Arjun Das', ['FR-006'], { parameters: ['percentile=95', 'sample=5 min', 'free_tier=1 TB/month'] });
  brl('BRL-003', 'Standard plans may purge at most 100 times per minute.', 'operational', 'constraint', 'Product owner', ['FR-004'], { parameters: ['purge_limit=100 per minute'] });
  brl('BRL-004', 'Roles are Owner (all), Billing admin (billing, read), Developer (config, purge) and Viewer (read).', 'security', 'decision_table', 'Product owner', ['FR-008']);
  lk('derives_from', 'BRL-001', 'OBL-004'); lk('derives_from', 'BRL-002', 'DEC-003');

  const sty = (id, title, want, per_, reqs, pri, st, extra = {}) => { mk('Story', id, { title, want, benefit: 'so that I can get my job done without extra effort', priority: pri, status: st, estimate: 5, ...extra }); lk('for_persona', id, per_); many('elaborates', id, reqs); if (pri === 'Must') lk('planned_in', id, 'RLS-001'); };
  sty('STY-001', 'Onboard a site', 'to add my domain and origin and get a CNAME target', 'PER-001', ['FR-001'], 'Must', 'Approved');
  sty('STY-002', 'Control caching with rules', 'to define cache rules by path and header', 'PER-001', ['FR-002'], 'Must', 'Approved');
  sty('STY-003', 'Purge stale content', 'to purge by URL, prefix or tag', 'PER-001', ['FR-004'], 'Must', 'Approved');
  sty('STY-004', 'Get HTTPS without toil', 'to have certificates issued and renewed automatically', 'PER-001', ['FR-005'], 'Must', 'In review');
  sty('STY-005', 'Receive an itemised invoice', 'to receive a monthly INR invoice using the 95th percentile', 'PER-003', ['FR-006'], 'Must', 'Approved');
  sty('STY-006', 'Assign least-privilege roles', 'to assign roles in the portal', 'PER-001', ['FR-008'], 'Must', 'Approved');
  sty('STY-007', 'Keep logs in India', 'to have my logs retained in India', 'PER-002', ['FR-010'], 'Must', 'In review');
  sty('STY-008', 'Mitigate an attack quickly', 'to apply a rate-limit or null-route profile', 'PER-004', ['FR-007'], 'Must', 'Draft', { origin: 'derived' });
  sty('STY-009', 'See hit ratio and TTFB by city', 'to see hit ratio and TTFB by city', 'PER-002', ['FR-009'], 'Should', 'Draft', { origin: 'derived' });
  for (const id of ['STY-008', 'STY-009']) patch(id, { origin: 'derived' });

  const ac = (id, title, scen, kind, given, when, then, targets, st = 'Approved', extra = {}) => { mk('AcceptanceCriterion', id, { title, scenario_type: scen, kind, given, when, then, verification_method: 'Test', status: st, ...extra }); many('specifies', id, targets); };
  ac('AC-001', 'Onboard: valid origin', 'happy', 'behavioural', 'a valid origin hostname', 'the customer submits it', 'a CNAME target appears within 5 s and the property is in state Pending DNS', ['FR-001', 'STY-001']);
  ac('AC-002', 'Onboard: unreachable origin', 'negative', 'behavioural', 'an origin hostname that fails the reachability test', 'the customer submits it', 'an error shows the test result and no property is created', ['FR-001']);
  ac('AC-003', 'Cache hit', 'happy', 'behavioural', 'rule "cache /static/* for 1 h" and a warm object', '100 requests arrive', 'origin hits = 0 and responses carry an Age header', ['FR-002', 'STY-002', 'BRL-001']);
  ac('AC-004', 'TTL boundaries', 'boundary', 'behavioural', 'a cache rule with TTL set', 'TTL is 0, 1 s, the maximum, or the maximum plus 1', 'TTL 0 is not cached, 1 s is cached for 1 s, the maximum is accepted, the maximum plus 1 is rejected', ['FR-002']);
  ac('AC-005', 'Purge by tag', 'happy', 'behavioural', 'objects tagged T cached at all PoPs', 'the customer purges tag T', '100 percent of tagged objects are invalid at all PoPs within the time in NFR-003', ['FR-004', 'STY-003']);
  ac('AC-006', 'Purge refused for viewer role', 'negative', 'behavioural', 'a user with the Viewer role', 'they call the purge API', '403 is returned, nothing is purged and the attempt is logged', ['FR-004', 'STY-003', 'FR-008']);
  ac('AC-007', 'Purge rate limit', 'boundary', 'behavioural', 'a standard plan', 'the 100th and then the 101st purge arrive within a minute', 'the 100th is accepted and the 101st gets 429 with Retry-After', ['FR-004', 'BRL-003']);
  ac('AC-008', 'Certificate renewal', 'happy', 'behavioural', 'a certificate expiring in 14 days', 'the nightly job runs', 'a new certificate is issued and deployed and HTTPS stays on', ['FR-005'], 'In review');
  ac('AC-009', 'CA unavailable', 'edge', 'behavioural', 'the CA is unavailable for 7 days before expiry', 'the renewal job retries daily', 'the NOC is alerted and the existing certificate stays valid', ['FR-005'], 'In review');
  ac('AC-010', 'Owner assigns a role', 'happy', 'behavioural', 'a portal Owner', 'they assign Developer to a user', 'the user gains configuration and purge rights only', ['FR-008', 'STY-006', 'BRL-004']);
  ac('AC-011', 'Viewer cannot change config', 'negative', 'security', 'a Viewer', 'they call a configuration API', '403 is returned and the attempt is logged', ['FR-008', 'STY-006']);
  ac('AC-012', 'Availability threshold', 'happy', 'threshold', 'a month of probe data', 'availability is computed', 'availability is at least 99.95 percent with agreed maintenance excluded', ['NFR-001']);
  ac('AC-013', 'TTFB threshold', 'happy', 'performance', 'PoPs at 70 percent load', 'probes from 20 city vantage points fetch a 100 KB object', 'p95 TTFB of hits is at most 60 ms', ['NFR-002']);
  ac('AC-014', 'Purge time threshold', 'happy', 'performance', '300 purges per second', '100 purges are timed to all PoPs', 'p95 propagation is at most 5 s', ['NFR-003']);
  ac('AC-015', 'Capacity drill', 'happy', 'performance', 'month-12 deployment', 'a capacity test runs at peak', 'aggregate egress reaches at least 1 Tbps', ['NFR-004'], 'In review');
  ac('AC-016', 'Old TLS rejected', 'negative', 'security', 'any PoP', 'a TLS 1.1 handshake is attempted', 'the handshake is rejected and TLS 1.3 is accepted', ['NFR-006']);
  ac('AC-017', 'Log retention and residency', 'edge', 'compliance', 'logs of Indian users', 'a log is older than the retention period or a replica is requested', 'it is deleted after the period and never replicated outside India', ['NFR-007', 'REG-001']);
  ac('AC-018', 'Forbidden: deleted property cannot be reactivated', 'negative', 'behavioural', 'a Deleted property', 'someone tries to activate it', 'the request is refused and the state stays Deleted', ['FR-001'], 'Approved');
  ac('AC-019', 'Stale served during origin outage (draft)', 'happy', 'behavioural', 'origin returns 503 and a stale object exists within the window', 'a client requests it', 'the stale object is served with a stale indicator', ['FR-003'], 'Draft', { origin: 'derived' });
  ac('AC-020', 'Stale window expired (draft)', 'edge', 'behavioural', 'origin returns 503 and the stale object is older than the window', 'a client requests it', '502 or 503 is returned', ['FR-003'], 'Draft', { origin: 'derived' });
  ac('AC-021', 'Hit ratio shown (draft)', 'happy', 'behavioural', 'a property with traffic', 'the customer opens analytics', 'hit ratio and p95 TTFB per city are displayed', ['FR-009'], 'Draft', { origin: 'derived' });
  for (const id of ['AC-019', 'AC-020', 'AC-021']) patch(id, { origin: 'derived' });
  derive.run(S, 'assemble_artifact', { kind: 'prd' }, ACTOR);
  patch('ART-005', { status: 'In review' });

  mk('Waiver', 'WVR-001', { title: 'Waive G3-05 for NFR-004', kind: 'criterion_waiver', gate: 3, criterion_id: 'G3-05', subjects: ['NFR-004'], rationale: 'The 1 Tbps target is an ambition that no measurement can support yet; it is tracked as an assumption-to-be and re-checked at Gate 3 retest.', approver: 'Anjali Rao', approver_role: 'Sponsor', requested_by: 'Kanishk', expiry_on: '2026-12-31', linked_risk: 'RSK-001', status: 'Active' });
  lk('waives', 'WVR-001', 'NFR-004');

  // ===================================================================== PHASE 4
  clock('2026-10-06');
  mk('Actor', 'ACT-001', { title: 'Customer developer', kind: 'customer_user', status: 'Approved' });
  mk('Actor', 'ACT-002', { title: 'Sahayogi NOC engineer', kind: 'internal_user', status: 'Approved' });
  mk('Actor', 'ACT-003', { title: 'Control plane (system)', kind: 'system', status: 'Approved' });
  const flw = (id, title, goal, trig, actor) => { mk('Flow', id, { title, kind: 'workflow', level: 'L2_workflow', goal, trigger_summary: trig, priority: 'Must', status: 'In review' }); lk('actor_of', actor, id); };
  flw('FLW-001', 'Purge content', 'Stale content disappears from every PoP quickly', 'Purge API call or portal action', 'ACT-001');
  flw('FLW-002', 'DDoS incident response', 'Customers stay up and the regulator is informed in time', 'Alert: traffic above threshold', 'ACT-002');
  const stp = (id, flow, order, kind, title, extra = {}) => { mk('FlowStep', id, { title, kind, order, status: 'In review', ...extra }); lk('contains', flow, id); };
  const actorOf = { 'STP-002': 'ACT-003', 'STP-003': 'ACT-003', 'STP-004': 'ACT-003', 'STP-005': 'ACT-003', 'STP-006': 'ACT-003', 'STP-007': 'ACT-003', 'STP-008': 'ACT-003', 'STP-009': 'ACT-003', 'STP-014': 'ACT-002', 'STP-015': 'ACT-002', 'STP-016': 'ACT-002', 'STP-017': 'ACT-002', 'STP-018': 'ACT-002', 'STP-019': 'ACT-002', 'STP-020': 'ACT-002' };
  stp('STP-001', 'FLW-001', 1, 'start', 'Purge request received');
  stp('STP-002', 'FLW-001', 2, 'decision', 'Caller role allows purge?');
  stp('STP-003', 'FLW-001', 3, 'task', 'Return 403 and write an audit log');
  stp('STP-004', 'FLW-001', 4, 'decision', 'Within the plan purge limit?');
  stp('STP-005', 'FLW-001', 5, 'task', 'Return 429 with Retry-After');
  stp('STP-006', 'FLW-001', 6, 'task', 'Record the request in state Accepted', { time_bound_ms: 200 });
  stp('STP-007', 'FLW-001', 7, 'external', 'Fan out the purge to all PoP agents', { time_bound_ms: 5000 });
  stp('STP-008', 'FLW-001', 8, 'decision', 'All PoPs acknowledged within 30 s?');
  stp('STP-009', 'FLW-001', 9, 'task', 'Retry laggard PoPs and alert the NOC after 60 s');
  stp('STP-010', 'FLW-001', 10, 'end', 'Purge completed');
  stp('STP-011', 'FLW-001', 11, 'end', 'Request rejected');
  stp('STP-012', 'FLW-001', 12, 'end', 'Partially failed, NOC alerted');
  const nx = (a, b, kind, cond?) => lk('next', a, b, { kind, ...(cond ? { condition: cond } : {}) });
  nx('STP-001', 'STP-002', 'happy'); nx('STP-002', 'STP-003', 'failure', 'role not allowed'); nx('STP-002', 'STP-004', 'happy', 'role allowed');
  nx('STP-003', 'STP-011', 'happy'); nx('STP-004', 'STP-005', 'alternate', 'limit exceeded'); nx('STP-004', 'STP-006', 'happy', 'within the limit');
  nx('STP-005', 'STP-011', 'happy'); nx('STP-006', 'STP-007', 'happy'); nx('STP-007', 'STP-008', 'happy'); nx('STP-007', 'STP-009', 'failure', 'PoP agents unreachable');
  nx('STP-008', 'STP-010', 'happy', 'yes'); nx('STP-008', 'STP-009', 'failure', 'no'); nx('STP-009', 'STP-008', 'alternate', 'retry'); nx('STP-009', 'STP-012', 'failure', 'retries exhausted');
  lk('calls', 'STP-007', 'EXT-005');
  stp('STP-013', 'FLW-002', 1, 'start', 'Alert: traffic above threshold');
  stp('STP-014', 'FLW-002', 2, 'task', 'NOC confirms the attack');
  stp('STP-015', 'FLW-002', 3, 'decision', 'Capacity exceeded?');
  stp('STP-016', 'FLW-002', 4, 'task', 'Apply the rate-limit mitigation profile');
  stp('STP-017', 'FLW-002', 5, 'external', 'Request upstream scrubbing or null-route the target prefix');
  stp('STP-018', 'FLW-002', 6, 'decision', 'Mitigated within 10 minutes?');
  stp('STP-019', 'FLW-002', 7, 'task', 'Notify affected customers by portal and e-mail');
  stp('STP-020', 'FLW-002', 8, 'task', 'Legal files the CERT-In report within 6 hours');
  stp('STP-021', 'FLW-002', 9, 'end', 'Incident closed');
  nx('STP-013', 'STP-014', 'happy'); nx('STP-014', 'STP-015', 'happy'); nx('STP-015', 'STP-016', 'happy', 'no'); nx('STP-015', 'STP-017', 'alternate', 'yes');
  nx('STP-016', 'STP-018', 'happy'); nx('STP-018', 'STP-019', 'happy', 'yes'); nx('STP-018', 'STP-017', 'alternate', 'no, escalate');
  nx('STP-019', 'STP-020', 'alternate', 'reportable incident'); nx('STP-019', 'STP-021', 'happy', 'not reportable'); nx('STP-020', 'STP-021', 'happy');
  lk('calls', 'STP-017', 'EXT-006'); // STP-017 has NO outgoing edge: the dead end the gate must catch
  for (const [s, a] of Object.entries(actorOf)) lk('performed_by', s, a);
  lk('covers', 'STP-002', 'FR-008'); many('covers', 'STP-006', ['FR-004', 'STY-003']); many('covers', 'STP-016', ['FR-007', 'STY-008']); lk('covers', 'STP-020', 'REG-001');
  lk('applies', 'BRL-003', 'STP-004'); lk('applies', 'BRL-004', 'STP-002'); lk('annotates', 'NFR-003', 'FLW-001'); lk('applies_to', 'NFR-003', 'FLW-001');
  many('belongs_to', 'FLW-001', ['MOD-002']); many('belongs_to', 'FLW-002', ['MOD-004']);
  lk('integrates_with', 'FLW-002', 'EXT-006');

  mk('Entity', 'ENT-001', { title: 'Property', description: 'A customer site served by the CDN', has_lifecycle: true, status: 'In review' });
  mk('Entity', 'ENT-002', { title: 'AccessLogRecord', description: 'One access-log line', has_lifecycle: false, personal_data: true, retention_days: 180, datafields: ['timestamp', 'client_ip', 'url', 'status', 'bytes', 'cache_status', 'pop', 'ttfb'], status: 'In review' });
  lk('operates_on', 'DAR-001', 'ENT-002');
  const sta = (id, name, init, term) => { mk('State', id, { title: `Property: ${name}`, initial: init, terminal: term, status: 'In review' }); lk('of_entity', id, 'ENT-001'); };
  sta('STA-001', 'Pending DNS', true, false); sta('STA-002', 'Pending certificate', false, false); sta('STA-003', 'Active', false, false);
  sta('STA-004', 'Suspended', false, false); sta('STA-005', 'Deleted', false, true); sta('STA-006', 'Expired', false, true);
  const trn = (id, from, to, kind, trig) => { mk('Transition', id, { title: `Property: ${S.get(from).title.replace('Property: ', '')} to ${S.get(to).title.replace('Property: ', '')}`, kind, trigger_kind: trig, status: 'In review' }); lk('from_state', id, from); lk('to_state', id, to); };
  trn('TRN-001', 'STA-001', 'STA-002', 'allowed', 'system_event'); trn('TRN-002', 'STA-001', 'STA-006', 'allowed', 'timer'); trn('TRN-003', 'STA-002', 'STA-003', 'allowed', 'system_event');
  trn('TRN-004', 'STA-003', 'STA-004', 'allowed', 'system_event'); trn('TRN-005', 'STA-004', 'STA-003', 'allowed', 'user_action'); trn('TRN-006', 'STA-003', 'STA-005', 'allowed', 'user_action');
  trn('TRN-007', 'STA-005', 'STA-003', 'forbidden', 'user_action'); trn('TRN-008', 'STA-006', 'STA-003', 'forbidden', 'user_action');
  lk('exercises', 'AC-018', 'TRN-007');
  const edgeOf = (a, b) => S.out(a, 'next').find((l) => l.target === b).id;
  lk('exercises', 'AC-006', edgeOf('STP-002', 'STP-003'));
  
  // ===================================================================== CURATED LATE EVENTS (these become "recent activity")
  // constraint links first
  many('constrains', 'CON-003', ['NFR-007', 'REG-001', 'DAR-001', 'FTR-008']);
  many('constrains', 'CON-001', ['PRJ-001', 'NFR-004']); many('constrains', 'CON-004', ['REG-001']); many('constrains', 'CON-005', ['FTR-011']); many('constrains', 'CON-006', ['FTR-011']);
  clock('2026-10-07');
  // Legal amends the text of an APPROVED obligation: every item that depends on it is now suspect (and items two hops away stale)
  S.update('OBL-001', { obligation_text: 'Keep logs in India for 365 days (amended; was 180) and report cyber incidents within 6 hours.' }, { actor: 'Meera Iyer' });

  clock('2026-10-08');
  // make the request ledger tell the story: mark answered human/document requests that are already done
  const plan = requests.plan(S);
  for (const r of plan.requests) {
    if (['HUMAN', 'DOCUMENT'].includes(r.owner_kind) && r.done && !S.data.requestState[r.id]) S.data.requestState[r.id] = { status: 'answered', at: `2026-09-1${r.phase}T10:00:00.000Z`, by: ACTOR, created: [], updated: [], warnings: [] };
    if (r.owner_kind === 'DERIVED' && r.done && !S.data.requestState[r.id]) S.data.requestState[r.id] = { status: 'derived', at: `2026-09-2${r.phase}T10:00:00.000Z`, by: ACTOR, created: [], message: 'generated by the tool' };
  }
  S._clock = null;
  S.data.demo = { index: 0 };
  return S;
}

function writeSeed(outDir?) {
  const S = buildSeed();
  const dir = outDir || path.join(__dirname, '..', 'data');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'seed.json'), JSON.stringify(S.data));
  S.filePath = path.join(dir, 'store.json');
  S.save();
  return S;
}

if (require.main === module) {
  const S = writeSeed();
  const byType = {};
  for (const i of S.all()) byType[(i as any).type] = (byType[(i as any).type] || 0) + 1;
  console.log(`Seed written: ${S.all().length} items, ${S.links().length} links, ${S.data.audit.length} audit entries`);
  console.log(JSON.stringify(byType));
  // the whole portfolio: six products at different stages plus four ideas (see scripts/seed_portfolio.ts)
  setImmediate(() => { // after module.exports below is set, so seed_portfolio can require this file
    const root = path.join(__dirname, '..', 'data');
    const pf = seed_portfolioMod.seedPortfolio(root);
    for (const e of pf.list()) console.log(`  ${e.id} ${e.name.padEnd(28)} stage ${e.stage.padEnd(7)} ${pf.store(e.id).all().length} items`);
    console.log(`  ${pf.ideas().length} ideas; portfolio.json written to ${root}`);
  });
}

export { buildSeed, writeSeed, SEED_VERSION };
