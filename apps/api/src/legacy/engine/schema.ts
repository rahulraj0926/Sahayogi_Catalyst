/**
 * engine/schema.ts - item types, fields, statuses, ID prefixes and validation.
 *
 * Every element carries a `v2Ref` that points at the section of the corrected
 * specification ("Sahayogi Developer specification v2", pre-amendment) that it
 * implements, e.g. '3.3.E/Requirement'. The competitor module design report is
 * referenced as 'COMP-6/...'.
 *
 * Field kinds: text, longtext, enum, number (optional unit), date, bool,
 * ref (one item id), refs (list of item ids), list (list of strings).
 *
 * This file is DATA first: to add an item type, add one entry to TYPES below.
 */

import * as phases_5_12Mod from './phases_5_12';
const ENUMS = {
  priority: ['Must', 'Should', 'Could', 'Wont'],
  qpriority: ['Must', 'Should', 'Could'],
  origin: ['human', 'document', 'agent', 'assistant', 'derived', 'invented'],
  verification: ['unverified', 'verified', 'rejected'],
  depth: ['L1', 'L2', 'L3'],
  grade: ['A', 'B', 'C', 'D', 'E', 'F'],
  scale5: [1, 2, 3, 4, 5],
};

const DOC_STATUSES = ['Draft', 'In review', 'Approved', 'Changed', 'Deprecated', 'Rejected'];
const ASSUMED_STATUSES = ['Assumed', 'Validated', 'Retired'];
const VALUE_STATUSES = ['Draft', 'Reviewed', 'Disputed', 'Retired'];

/** Statuses that take an item out of scope (default query filter). */
const TERMINAL_STATUSES = new Set([
  'Deprecated', 'Rejected', 'Withdrawn', 'Retired', 'Superseded', 'Retracted',
  'Lifted', 'Killed', 'Expired', 'Revoked', 'Cancelled', 'Left', 'Reversed', 'Deleted', 'rejected',
]);
/** Statuses that mean "someone approved this"; edits to such items raise suspect flags (spec 3.11). */
const APPROVED_LIKE = new Set([
  'Approved', 'Validated', 'Confirmed', 'Reviewed', 'Answered', 'Ready-for-handoff',
  'Handed-off', 'Active', 'Captured', 'Cleared', 'Concluded', 'Applied',
]);

// ---- field helpers -------------------------------------------------------
const f = (name, kind, o: any = {}) => ({ name, kind, label: o.label || name.replace(/_/g, ' '), ...o });
const T = (name, o?) => f(name, 'text', o);
const LT = (name, o?) => f(name, 'longtext', o);
const E = (name, values, o?) => f(name, 'enum', { values, ...o });
const N = (name, unit, o?) => f(name, 'number', { unit, ...o });
const D = (name, o?) => f(name, 'date', o);
const B = (name, o?) => f(name, 'bool', o);
const R = (name, to, o?) => f(name, 'ref', { to, ...o });
const RS = (name, to, o?) => f(name, 'refs', { to, ...o });
const L = (name, o?) => f(name, 'list', o);
const req = (field) => ({ ...field, required: true });

// ---- type catalogue ------------------------------------------------------
const TYPES = {
  // ===================== Governance / delivery control =====================
  Product: {
    prefix: 'PRJ', phase: 0, v2Ref: ['3.3.A/Product'], statuses: ['Active', 'On hold', 'Killed', 'Handed off'],
    fields: [
      req(T('name')), E('mode', ['greenfield', 'extend', 'replace'], { required: true }),
      E('track', ['quick', 'full']), E('risk_class', ['standard', 'high']),
      E('depth_level', ENUMS.depth, { required: true, help: 'L1 minimum viable pack, L2 standard, L3 full. Gates evaluate only criteria at or below this level.' }),
      N('current_phase', 'phase', { integer: true, min: 0, max: 12 }), T('default_currency'), T('sponsor'),
      E('product_kind', ['software', 'hardware', 'service'], { help: 'What type of product it is. Used to choose examples that fit.' }),
      E('audience', ['sold', 'internal'], { help: 'Sold to customers, or used inside the company. Used to choose examples that fit and to skip questions about selling.' }),
      E('structure', ['single', 'modules'], { help: 'One product with its own competitors (single), or a suite of modules where each module has different competitors (modules).' }),
    ],
    suspectFields: ['mode', 'track', 'risk_class'],
  },
  IntakeBrief: {
    prefix: 'INT', phase: 0, v2Ref: ['3.3.A/IntakeBrief'], statuses: DOC_STATUSES,
    fields: [
      LT('idea'), T('requester'), req(LT('problem_statement', { help: 'Solution-free: describe the pain, not the product.' })), LT('requested_solution'),
      LT('desired_outcome'), E('urgency', ['low', 'medium', 'high', 'critical']), D('needed_by'), LT('purpose'),
      L('existing_assets'), L('reference_products'), L('data_categories'), B('personal_data'), L('jurisdictions'),
      E('criticality', ['none', 'business', 'safety', 'security']), N('strategic_fit_rating', '1-5', { integer: true, min: 1, max: 5 }),
    ],
    suspectFields: ['problem_statement', 'data_categories', 'personal_data', 'jurisdictions', 'criticality'],
  },
  Artifact: {
    prefix: 'ART', phase: 'X', v2Ref: ['3.3.A/Artifact', '3.4.1'], statuses: DOC_STATUSES,
    fields: [
      E('kind', ['intake_document', 'market_analysis', 'competitor_analysis', 'product_definition', 'scope_statement', 'prd', 'flow_pack', 'ci_policy'], { required: true }),
      N('gate', 'gate', { integer: true, min: 0, max: 12 }), N('open_clarification_count', 'count', { integer: true, min: 0 }), T('owner'),
    ],
    suspectFields: ['kind'],
  },
  Decision: {
    prefix: 'DEC', phase: 0, v2Ref: ['3.3.D/Decision'], statuses: ['Proposed', 'Approved', 'Superseded', 'Reversed', 'Withdrawn'],
    fields: [
      E('kind', ['product', 'disposition', 'gate', 'pricing', 'architecture'], { required: true }), LT('context'), L('options'),
      T('chosen'), LT('rationale'), D('decided_on'), T('decider'),
    ],
    suspectFields: ['chosen', 'rationale', 'status'],
  },
  Waiver: {
    prefix: 'WVR', phase: 'X', v2Ref: ['3.3.A/Waiver', '4.7'], statuses: ['Requested', 'Active', 'Expired', 'Revoked', 'Rejected'],
    fields: [
      E('kind', ['criterion_waiver', 'question_waiver', 'risk_acceptance'], { required: true }), N('gate', 'gate', { integer: true, min: 0, max: 12 }),
      T('criterion_id'), RS('subjects', ['ANY'], { help: 'Items covered; empty means the whole criterion.' }),
      req(LT('rationale')), T('approver_role'), T('approver'), T('requested_by'),
      D('expiry_on'), N('expiry_gate', 'gate', { integer: true, min: 0, max: 12 }), R('linked_risk', ['Risk']),
    ],
    suspectFields: ['rationale', 'expiry_on'],
  },
  Condition: {
    prefix: 'CND', phase: 'X', v2Ref: ['3.3.A/Condition', '4.5'], statuses: ['Open', 'Closed', 'Waived'],
    fields: [LT('text', { required: true }), T('owner'), N('must_close_by_gate', 'gate', { integer: true, min: 0, max: 12, required: true }), N('created_by_gate', 'gate', { integer: true, min: 0, max: 12 }), D('closed_on'), R('tracks_item', ['ANY'])],
    suspectFields: ['text', 'must_close_by_gate'],
  },
  ChangeRequest: {
    prefix: 'CHG', phase: 'X', v2Ref: ['3.3.A/ChangeRequest', '5.1'], statuses: ['Draft', 'Submitted', 'Approved', 'Rejected', 'Applied', 'Closed'],
    fields: [LT('reason', { required: true }), E('kind', ['scope', 'requirement', 'correction', 'external_change', 'feedback']), E('class', ['minor', 'major']), T('requester'), RS('amends', ['ANY']), N('impacted_items', 'items', { integer: true, min: 0 })],
    suspectFields: ['reason'],
  },
  Handoff: {
    prefix: 'HND', phase: 'X', v2Ref: ['3.3.A/Handoff', '8.2'], statuses: ['Ready', 'Queued', 'Sent', 'Acknowledged', 'Delivered', 'Returned', 'Rejected', 'Failed', 'Superseded'],
    fields: [E('scope', ['story', 'product'], { required: true }), R('story', ['Story']), N('package_version', 'version', { integer: true, min: 1 }), T('idempotency_key'), T('baseline_id'), T('content_hash'), E('dry_run_result', ['valid', 'invalid', 'not_run']), T('receipt_id'), T('delivered_to'), D('delivered_on'), LT('delivery_error')],
    suspectFields: ['content_hash'],
  },
  Release: {
    prefix: 'RLS', phase: 2, v2Ref: ['3.3.A/Release'], statuses: ['Planned', 'Active', 'Released', 'Cancelled'],
    fields: [N('order', 'order', { integer: true }), B('is_mvp'), D('window_start'), D('window_end')],
    suspectFields: ['window_start', 'window_end', 'is_mvp'],
  },
  Pointer: {
    prefix: 'PTR', phase: 'X', v2Ref: ['PORTFOLIO/Pointer'], statuses: ['proposed', 'confirmed', 'rejected'],
    fields: [
      req(R('attachment', ['Attachment'])), req(E('locator_kind', ['slide', 'page', 'sheet_cell', 'sheet_range', 'paragraph', 'table_cell', 'text_offset'])),
      N('locator_index', 'index', { integer: true, min: 1, help: 'Slide number, page number, document section or table-bearing unit (1-based).' }), T('locator_sheet'), T('locator_cell'), T('locator_range'),
      N('locator_paragraph', 'line', { integer: true, min: 1 }), N('locator_table', 'table', { integer: true, min: 1 }), N('locator_row', 'row', { integer: true, min: 1 }), N('locator_col', 'column', { integer: true, min: 1 }),
      N('locator_offset', 'chars', { integer: true, min: 0 }), N('locator_length', 'chars', { integer: true, min: 0 }),
      req(LT('quote')), T('created_by'), E('pointer_origin', ['human', 'assistant']), N('confidence', 'confidence', { min: 0, max: 1 }), LT('reason'),
    ],
    suspectFields: [],
  },
  Attachment: {
    prefix: 'ATT', phase: 'X', v2Ref: ['PORTFOLIO/Attachment'], statuses: ['Active', 'Deleted'],
    fields: [
      req(T('filename')), T('mime'), N('size_bytes', 'bytes', { integer: true, min: 0 }), T('sha256'), N('phase', 'phase', { integer: true, min: 0, max: 12 }), T('stored_path'), T('uploaded_by'), D('uploaded_on'),
      E('extracted_text_status', ['ok', 'partial', 'unsupported', 'failed']), N('extracted_chars', 'chars', { integer: true, min: 0 }), N('pages', 'pages', { integer: true, min: 0 }), LT('extract_warnings'), T('pasted_by'), D('pasted_on'), N('pasted_chars', 'chars', { integer: true, min: 0 }), N('pasted_times', null, { integer: true, min: 0 }),
    ],
    suspectFields: [],
  },

  // ===================== Phase 0: discovery and registers =====================
  Stakeholder: {
    prefix: 'STK', phase: 0, v2Ref: ['3.3.B/Stakeholder'], statuses: ['Active', 'Left'],
    fields: [
      req(E('category', ['Sponsor', 'Delivery', 'Customer', 'End-user', 'Partner', 'Regulator/Legal', 'Security/Privacy', 'Operations', 'Finance', 'Commercial'])),
      T('role_title'), T('email'), T('phone'), B('is_sponsor'), N('influence', '1-5', { integer: true, min: 1, max: 5 }), N('interest', '1-5', { integer: true, min: 1, max: 5 }), LT('needs_summary'),
    ],
    suspectFields: ['category', 'status'],
  },
  Evidence: {
    prefix: 'SRC', phase: 0, v2Ref: ['3.3.B/Evidence', 'COMP-6/Evidence'], statuses: ['Captured', 'Superseded', 'Retracted'], uiAlias: 'Source',
    fields: [
      E('kind', ['interview', 'survey', 'document', 'web_page', 'data_file', 'regulation', 'price_list', 'screenshot', 'datasheet', 'other'], { required: true }),
      E('source_class', ['primary', 'secondary', 'internal', 'vendor_claim']), D('published_on'), D('retrieved_on'),
      T('url_or_file'), E('reliability', ENUMS.grade, { help: 'Source reliability grade A-F (Admiralty approach).' }),
      N('credibility', '1-6', { integer: true, min: 1, max: 6 }), B('captured'), D('valid_until'), LT('content'),
    ],
    suspectFields: ['title', 'url_or_file', 'retrieved_on', 'reliability', 'content', 'status'],
    countedStatuses: ['Captured'],
  },
  Insight: {
    prefix: 'INS', phase: 0, v2Ref: ['3.3.B/Insight'], statuses: ['Raw', 'Validated', 'Challenged', 'Retracted'],
    fields: [req(LT('statement')), E('confidence', ['Verified', 'Reported', 'Inferred', 'Unverified'])],
    suspectFields: ['statement', 'status'], countedStatuses: ['Raw', 'Validated'],
  },
  Assumption: {
    prefix: 'ASM', phase: 0, v2Ref: ['3.3.B/Assumption'], statuses: ['Open', 'Validated', 'Invalidated', 'Converted', 'Retired'],
    fields: [
      req(LT('statement')), E('category', ['market', 'commercial', 'technical', 'legal', 'operational', 'other']), LT('impact_if_false'),
      N('uncertainty', '1-5', { integer: true, min: 1, max: 5 }), N('impact', '1-5', { integer: true, min: 1, max: 5 }), N('risk_score', 'score', { derived: true }),
      N('validate_by_gate', 'gate', { integer: true, min: 0, max: 12 }), T('validation_method'), T('owner'), D('due_on'), D('reconfirm_by'),
      E('basis', ['measured', 'benchmarked', 'assumed', 'invented']), N('rank', 'rank', { integer: true, derived: true }),
    ],
    suspectFields: ['statement', 'status'], countedStatuses: ['Open', 'Validated'],
  },
  Constraint: {
    prefix: 'CON', phase: 0, v2Ref: ['3.3.B/Constraint'], statuses: ['Proposed', 'Confirmed', 'Lifted'],
    fields: [
      req(E('kind', ['budget', 'date', 'regulatory', 'technology', 'organisation', 'resource', 'commercial', 'other'])), req(LT('statement')),
      N('amount', null), T('unit'), E('flexibility', ['hard', 'soft']), T('owner'), D('reviewed_at'),
    ],
    suspectFields: ['amount', 'unit', 'flexibility', 'status'], countedStatuses: ['Proposed', 'Confirmed'],
  },
  Question: {
    prefix: 'QST', phase: 0, v2Ref: ['3.3.B/Question', '3.4.4', '4.8'], statuses: ['Open', 'Provisional', 'Answered', 'Deferred', 'Withdrawn', 'Waived'],
    fields: [
      E('priority', ENUMS.qpriority, { required: true }), E('category', ['scope', 'legal', 'technical', 'commercial', 'data', 'ux', 'other']),
      N('needed_by_gate', 'gate', { integer: true, min: 0, max: 12, required: true }), T('asked_of'), T('owner'), D('due_on'), LT('answer'),
      E('resolution', ['answered', 'assumed', 'waived'], { help: 'How the question was resolved. Assumed requires a linked Assumption; waived requires a Waiver.' }),
    ],
    suspectFields: ['answer', 'status'],
  },
  Risk: {
    prefix: 'RSK', phase: 0, v2Ref: ['3.3.B/Risk'], statuses: ['Open', 'Mitigating', 'Occurred', 'Closed', 'Accepted'],
    fields: [
      LT('cause'), LT('event'), LT('effect'), E('category', ['market', 'regulatory', 'technical', 'operational', 'financial', 'partner', 'legal', 'security', 'privacy']),
      N('probability', '1-5', { integer: true, min: 1, max: 5 }), N('impact', '1-5', { integer: true, min: 1, max: 5 }), N('score', 'score', { derived: true }),
      T('response'), T('owner'), D('review_date'), T('early_warning_indicator'),
    ],
    suspectFields: ['probability', 'impact', 'status'],
  },
  ScopeEntry: {
    prefix: 'SCP', phase: 0, v2Ref: ['3.3.B/ScopeEntry'], statuses: ['Draft', 'In review', 'Approved', 'Superseded'],
    fields: [
      E('kind', ['initial_boundary', 'scope'], { required: true }), req(T('subject_text')), E('disposition', ['in', 'later', 'out', 'unknown'], { required: true }),
      LT('rationale', { help: 'Mandatory unless the line is in scope.' }), LT('exclusion_impact'), T('decider'),
    ],
    suspectFields: ['disposition', 'rationale'],
  },
  ExternalSystem: {
    prefix: 'EXT', phase: 0, v2Ref: ['3.3.B/ExternalSystem'], statuses: ['Draft', 'Reviewed', 'Active', 'Retired'],
    fields: [T('provider'), E('kind', ['certificate_authority', 'payment_gateway', 'transit', 'origin', 'identity', 'platform', 'partner_api', 'other']), E('criticality', ['critical', 'high', 'medium', 'low']), T('owner'), T('terms_version'), D('review_by')],
    suspectFields: ['terms_version', 'status'],
  },
  PhaseBudget: {
    prefix: 'BUD', phase: 0, v2Ref: ['3.3.B/PhaseBudget'], statuses: ['Draft', 'Approved', 'Closed'],
    fields: [N('for_phase', 'phase', { integer: true, min: 0, max: 4, required: true }), N('planned_effort', 'person-months', { required: true }), N('planned_cost', 'INR'), T('approver')],
    suspectFields: ['planned_effort', 'planned_cost'],
  },

  // ===================== Phase 1: customer, market, competitors =====================
  Segment: {
    prefix: 'SEG', phase: 1, v2Ref: ['3.3.C/Segment'], statuses: ASSUMED_STATUSES,
    fields: [LT('definition'), B('primary'), N('size_count', 'accounts'), N('arpa', 'INR/month'), N('willingness_to_pay', 'INR/GB')],
    suspectFields: ['definition', 'size_count', 'arpa'], countedStatuses: ['Assumed', 'Validated'],
  },
  Persona: {
    prefix: 'PER', phase: 1, v2Ref: ['3.3.C/Persona'], statuses: ASSUMED_STATUSES,
    fields: [E('kind', ['customer_user', 'buyer', 'beneficiary', 'internal_user']), E('buying_role', ['user', 'influencer', 'economic_buyer', 'admin', 'none']), B('primary'), LT('goals'), LT('frustrations')],
    suspectFields: ['goals', 'buying_role'], countedStatuses: ['Assumed', 'Validated'],
  },
  Job: {
    prefix: 'JOB', phase: 1, v2Ref: ['3.3.C/Job'], statuses: ASSUMED_STATUSES,
    fields: [req(LT('statement', { help: 'When ... I want ... so I can ...' })), N('importance', '1-5', { integer: true, min: 1, max: 5 }), N('satisfaction', '1-5', { integer: true, min: 1, max: 5 }), N('rank', 'rank', { integer: true, min: 1 }), B('parked'), T('parked_reason')],
    suspectFields: ['statement', 'importance', 'rank'], countedStatuses: ['Assumed', 'Validated'],
  },
  Problem: {
    prefix: 'PRB', phase: 1, v2Ref: ['3.3.B/Problem'], statuses: DOC_STATUSES,
    fields: [req(LT('statement')), N('severity', '1-5', { integer: true, min: 1, max: 5 }), E('frequency', ['rare', 'occasional', 'frequent', 'continuous']), LT('current_workaround'), B('parked'), T('parked_reason')],
    suspectFields: ['statement', 'severity'],
  },
  Opportunity: {
    prefix: 'OPP', phase: 1, v2Ref: ['3.3.C/Opportunity'], statuses: DOC_STATUSES,
    fields: [req(LT('statement')), LT('value_hypothesis')],
    suspectFields: ['statement'],
  },
  Competitor: {
    prefix: 'CMP', phase: 1, v2Ref: ['3.3.C/Competitor', 'COMP-6/Competitor'], statuses: ['Candidate', 'Draft', 'Reviewed', 'Retired'],
    fields: [
      req(E('kind', ['direct', 'indirect', 'alternative', 'in_house', 'adjacent_entrant', 'open_source', 'aspirational'])),
      E('tier', ['T1', 'T2', 'T3', 'S'], { help: 'T1 deep, T2 shallow, T3 watchlist, S customer alternative.' }),
      E('tier_basis', ['deal_frequency', 'customer_shortlist', 'dealer_poll', 'marketplace_compare', 'tender_result', 'analyst_judgement']),
      LT('positioning'), LT('pricing_na_reason'), T('website'),
      // ---- rich profile (all optional). `tier` (T1/T2/T3/S) drives gates and freshness; `tier_class` is the portfolio-facing label.
      T('legal_name'), N('founded_year', 'year', { integer: true, min: 1800, max: 2100 }), T('hq_country'),
      E('size_band', ['1-10', '11-50', '51-200', '201-1000', '1001-5000', '5000+']), T('headcount_note'), E('ownership', ['public', 'private', 'pe_vc', 'subsidiary', 'unknown']),
      LT('funding_summary'), LT('target_customers'), LT('strengths'), LT('weaknesses'), L('gtm_channels'), LT('technology_notes'), L('certifications'), L('key_customers'),
      E('tier_class', ['tier1', 'tier2', 'watchlist', 'alternative', 'in_house']), E('segment_overlap', ['high', 'medium', 'low', 'none']),
      D('last_reviewed_on'), D('review_by'),
      L('todo_done', { help: 'To-do items a person ticked off by hand on the competitor page.' }),
      L('scopes', { help: 'Which part of our product this competitor competes with (a module, or any area name). Empty means the whole product.' }),
    ],
    suspectFields: ['positioning', 'kind', 'tier'], countedStatuses: ['Reviewed'],
  },
  Capability: {
    prefix: 'CAP', phase: 1, v2Ref: ['COMP-6/Capability'], statuses: ['Active', 'Retired'],
    fields: [
      T('category', { help: 'Group it belongs to, e.g. Accounting, Inventory, Compliance.' }),
      LT('description', { help: 'What the feature means in our words, so everyone rates the same thing.' }),
      L('aliases', { help: 'Other names competitors use for it.' }),
    ],
    suspectFields: [],
  },
  CompetitorCapability: {
    prefix: 'CCP', phase: 1, v2Ref: ['3.3.C/CompetitorCapability', 'COMP-6/CompetitorCapability'], statuses: VALUE_STATUSES,
    fields: [
      req(T('capability_tag', { help: 'What this competitor calls the feature. Link it to our common feature list so differently named features line up.' })), req(E('level', ['unknown', 'absent', 'partial', 'parity', 'strong'])),
      E('evidence_basis', ['documented', 'hands_on', 'third_party', 'review', 'not_claimed']), E('value_class', ['verified_fact', 'estimate', 'signal', 'unknown']),
      D('captured_on'), N('importance', '1-5', { integer: true, min: 1, max: 5 }), E('capture_method', ['manual', 'monitor', 'api', 'ai_proposed', 'field_signal']), LT('note'),
      D('valid_from'), D('valid_to'), E('source_grade', ENUMS.grade), E('analyst_confidence', ['high', 'moderate', 'low']), E('kano_class', ['must_be', 'performance', 'delighter', 'indifferent', 'unknown']), LT('disconfirming_note'),
    ],
    suspectFields: ['level', 'capability_tag', 'status'], countedStatuses: ['Reviewed'],
  },
  CompetitorNote: {
    prefix: 'CNT', phase: 1, v2Ref: ['PORTFOLIO/CompetitorNote', 'COMP-6/CompetitorEvent'], statuses: ['Active', 'Retired'],
    fields: [req(D('date')), req(LT('text')), T('source'), T('author'), E('importance', ['low', 'medium', 'high'])],
    suspectFields: [],
  },
  CompetitorProductLine: {
    prefix: 'CPL', phase: 1, v2Ref: ['COMP-6/CompetitorProductLine'], statuses: VALUE_STATUSES,
    fields: [
      req(T('product_name', { help: 'Name of the product line, e.g. Zoho Books, Tally Prime, Busy Standard.' })),
      LT('description', { help: 'What this product line does.' }),
      T('url', { help: 'URL of the product or pricing page.' }),
      E('product_type', ['saas', 'desktop', 'hybrid', 'api_service', 'marketplace', 'open_source', 'other'], { help: 'Deployment model of this product line.' }),
      L('target_segments', { help: 'Who this product line targets, e.g. SMB, Enterprise, Freelancer.' }),
      B('is_primary', { help: 'True if this is the main product line we compete against.' }),
    ],
    suspectFields: ['product_name'], countedStatuses: ['Reviewed'],
  },
  PricePoint: {
    prefix: 'PPT', phase: 1, v2Ref: ['3.3.C/PricePoint', 'COMP-6/PricePoint'], statuses: VALUE_STATUSES,
    fields: [
      T('plan'), req(E('value_metric', ['storage', 'egress', 'requests', 'commit', 'seat', 'flat', 'device', 'user', 'unit', 'transaction', 'hour', 'project', 'dealer', 'site', 'plan', 'other'])),
      req(T('unit', { help: 'Pricing unit, e.g. GB, TB, month.' })), req(N('amount', null)), req(T('currency')),
      req(E('price_type', ['list', 'mrp', 'street', 'dealer', 'distributor', 'oem', 'quote', 'tender_award', 'promo'])),
      req(E('billing_model', ['one_time', 'subscription', 'usage', 'hybrid', 'lease'])), req(E('tax_basis', ['incl_gst', 'excl_gst', 'not_applicable'])),
      T('channel_level'), T('region'), D('captured_on'), E('source_grade', ENUMS.grade), N('normalised_amount', 'INR/GB', { derived: true }),
      // ---- generalised pricing (competitor design report sections 2 and 6): hardware channel prices, validity, extras
      E('billing_period', ['one_time', 'month', 'quarter', 'year']), N('gst_rate_pct', '%', { min: 0, max: 100 }), LT('included', { help: 'What the price includes, e.g. 100 GB, 5 users, 1 year warranty.' }),
      N('included_quantity', null, { min: 0 }), N('min_quantity', null, { min: 0 }), N('setup_fee', null, { min: 0 }), L('mandatory_extras'),
      N('warranty_months', 'months', { integer: true, min: 0 }), E('observed_basis', ['published', 'observed_marketplace', 'quoted_to_us', 'tender_award', 'dealer_reported']),
      N('mrp', null, { min: 0, help: 'Printed maximum retail price (hardware).' }), N('street_price', null, { min: 0, help: 'Observed street / marketplace price.' }),
      N('dealer_margin_pct', '%', { min: 0, max: 100, help: 'Dealer margin on selling price (not markup).' }), D('valid_from'), D('valid_to'),
      E('seat_model', ['single_user', 'multi_user', 'per_user', 'unlimited_users'], { help: 'Who the licence covers. single_user: one user or PC per licence. multi_user: one licence shared by several users. per_user: priced for each user. unlimited_users: no user limit.' }),
      N('max_users', 'users', { integer: true, min: 1, help: 'Most users one licence covers (multi_user), if the vendor says.' }),
      E('tier_tag', ['free', 'entry', 'mid', 'top', 'enterprise'], { help: 'Plan tier for cross-competitor comparison. free: no cost; entry: cheapest paid; mid: typical plan; top: most featured; enterprise: custom/quote.' }),
    ],
    suspectFields: ['amount', 'unit', 'currency', 'price_type', 'status'], countedStatuses: ['Reviewed'],
  },
  TrackedSource: {
    prefix: 'TSR', phase: 1, v2Ref: ['COMP-6/TrackedSource'], statuses: ['Proposed', 'Cleared', 'Active', 'Paused', 'Broken', 'Retired'],
    fields: [
      T('url_pattern'), E('source_type', ['competitor_site', 'pricing_page', 'docs', 'changelog', 'datasheet', 'marketplace_listing', 'review_site', 'registry', 'filing', 'tender_portal', 'api', 'other']),
      E('default_grade', ENUMS.grade), E('access_method', ['manual_only', 'monitor', 'official_api', 'rss', 'licensed_data']), B('login_required'),
      D('tos_checked_on'), E('tos_verdict', ['allows_manual', 'allows_automation', 'api_terms_ok', 'forbids_automation', 'unknown']),
    ],
    suspectFields: ['tos_verdict', 'access_method', 'login_required', 'status'], countedStatuses: ['Cleared', 'Active'],
  },
  Obligation: {
    prefix: 'OBL', phase: 1, v2Ref: ['3.3.B/Obligation'], statuses: ['Draft', 'In review', 'Approved', 'Changed', 'Retired'],
    fields: [
      E('kind', ['law', 'regulation', 'standard', 'policy', 'contractual'], { required: true }), T('instrument'), T('jurisdiction'), LT('obligation_text'),
      E('applicability', ['applicable', 'not_applicable', 'unscanned'], { required: true }), T('owner'),
    ],
    suspectFields: ['obligation_text', 'applicability', 'status'],
  },
  Experiment: {
    prefix: 'EXP', phase: 1, v2Ref: ['3.3.B/Experiment'], statuses: ['Planned', 'Running', 'Concluded', 'Cancelled'],
    fields: [req(LT('hypothesis')), E('method', ['interview', 'prototype', 'smoke_test', 'spike', 'benchmark', 'survey', 'analysis']), T('success_threshold'), T('owner'), D('due_on'), E('result', ['pending', 'supported', 'refuted', 'inconclusive'])],
    suspectFields: ['success_threshold', 'result'],
  },

  // ===================== Phase 2: definition and scope =====================
  Objective: {
    prefix: 'OBJ', phase: 2, v2Ref: ['3.3.D/Objective'], statuses: DOC_STATUSES,
    fields: [E('kind', ['vision', 'objective'], { required: true }), req(LT('statement')), T('horizon')],
    suspectFields: ['statement'],
  },
  Metric: {
    prefix: 'MET', phase: 2, v2Ref: ['3.3.D/Metric', '3.4.3'], statuses: DOC_STATUSES,
    fields: [
      LT('definition'), T('unit'), E('use', ['success_metric', 'key_result', 'sli', 'slo']), T('owner'), E('cadence', ['realtime', 'daily', 'weekly', 'monthly', 'quarterly']),
      T('measurement_method'), E('baseline_type', ['measured', 'estimated', 'proxy', 'none_new_product', 'unknown_pending']), N('baseline_value', null), T('baseline_reason'),
      N('target_value', null), E('comparator', ['<=', '>=', '=', 'between']),
    ],
    suspectFields: ['definition', 'unit', 'target_value', 'comparator'],
  },
  Module: {
    prefix: 'MOD', phase: 2, v2Ref: ['3.3.D/Module'], statuses: DOC_STATUSES,
    fields: [LT('boundary_description'), T('owner')], suspectFields: ['boundary_description', 'owner'],
  },
  Feature: {
    prefix: 'FTR', phase: 2, v2Ref: ['3.3.D/Feature'], statuses: DOC_STATUSES,
    fields: [
      E('level', ['capability', 'feature', 'sub_feature']), LT('description'), E('priority', ENUMS.priority, { required: true }),
      N('effort_pm', 'person-months', { min: 0, help: 'Effort estimate; summed against Capacity at Gate 2.' }), E('effort_confidence', ['low', 'medium', 'high']),
      B('mandatory'), E('scope_status', ['in', 'later', 'out']), N('score', 'weighted score', { min: 0, max: 5 }),
    ],
    suspectFields: ['description', 'priority', 'mandatory', 'effort_pm'],
  },
  SystemFunction: {
    prefix: 'SYF', phase: 0, v2Ref: ['3.3.A/ExistingSystem'], statuses: ASSUMED_STATUSES,
    fields: [
      T('area', { help: 'The part of the old system, for example a module or menu.' }),
      LT('how_it_works', { help: 'How it works today, in plain words.' }), LT('whats_wrong', { help: 'What is wrong or missing today.' }),
      E('decision', ['keep', 'fix', 'drop', 'add', 'confirm_first'], { help: 'keep as is, fix, drop, add something new, or confirm first.' }),
      LT('target_behaviour', { help: 'How it should work in the new system.' }), T('owner', { help: 'Who can confirm how it works today.' }), T('evidence_note'),
    ],
    suspectFields: ['how_it_works', 'decision', 'target_behaviour'], countedStatuses: ['Validated'],
  },
  PricingPlan: {
    prefix: 'PLN', phase: 2, v2Ref: ['3.3.D/PricingPlan'], statuses: DOC_STATUSES,
    fields: [
      N('amount', 'price', { min: 0, help: 'The price of this plan. Leave empty if the price is on request.' }), T('currency'),
      E('billing_period', ['one_time', 'monthly', 'quarterly', 'yearly', 'per_unit', 'custom']), T('unit'),
      LT('includes'), LT('limits'), T('audience'), B('is_free'),
      E('tier_tag', ['free', 'entry', 'mid', 'top', 'enterprise'], { help: 'Which competitor plan level this plan is meant to sit at. Used to compare our features with what competitors give at that level.' }),
    ],
    suspectFields: ['amount', 'includes'], countedStatuses: ['Approved'],
  },
  Capacity: {
    prefix: 'CPC', phase: 2, v2Ref: ['3.3.B/Capacity'], statuses: ['Draft', 'Approved', 'Closed'],
    fields: [E('kind', ['team', 'infrastructure', 'budget'], { required: true }), D('period_start'), D('period_end'), N('headcount', 'FTE'), N('availability_pct', '%', { min: 0, max: 100 }), N('person_months', 'person-months', { required: true }), N('budget_amount', 'INR')],
    suspectFields: ['person_months', 'budget_amount'],
  },

  // ===================== Phase 3: requirements =====================
  Requirement: {
    prefix: null, phase: 3, v2Ref: ['3.3.E/Requirement', '3.4.2', '3.4.8'], statuses: DOC_STATUSES,
    subtypes: {
      functional: { prefix: 'FR', v2Ref: ['3.3.E/Requirement[functional]'] },
      non_functional: { prefix: 'NFR', v2Ref: ['3.4.2'] },
      interface: { prefix: 'IFR', v2Ref: ['3.4.8'] },
      data: { prefix: 'DAR', v2Ref: ['3.4.8'] },
      regulatory: { prefix: 'REG', v2Ref: ['3.4.8'] },
    },
    fields: [
      req(LT('statement')), E('priority', ENUMS.priority, { required: true }), LT('rationale'),
      E('flow_applicability', ['flow', 'cross_cutting', 'not_applicable'], { help: 'Cross-cutting requirements (NFR, data, regulatory) are covered by scope and verification, not by flow steps.' }),
      LT('flow_reason'), B('global', { help: 'NFR applies to the whole product (alternative to an applies_to link).' }),
      E('verification_method', ['Test', 'Inspection', 'Analysis', 'Demonstration', 'Audit', 'Drill']),
      // NFR measurement block (3.4.2)
      E('category', ['availability', 'latency', 'throughput', 'capacity', 'durability_DR', 'security', 'privacy', 'observability', 'operability', 'deployability', 'supportability', 'compliance', 'cost'], { subtypes: ['non_functional'] }),
      T('metric', { subtypes: ['non_functional'] }), E('comparator', ['<=', '>=', '=', 'between'], { subtypes: ['non_functional'] }),
      N('target_value', null, { subtypes: ['non_functional'] }), T('unit', { subtypes: ['non_functional'] }),
      E('percentile', ['mean', 'p50', 'p90', 'p95', 'p99', 'max', 'rate'], { subtypes: ['non_functional'] }),
      T('window', { subtypes: ['non_functional'] }), T('condition', { subtypes: ['non_functional'], help: 'Load profile or condition under which the target holds.' }),
      E('environment', ['production', 'staging', 'test_env'], { subtypes: ['non_functional'] }), T('measurement_point', { subtypes: ['non_functional'] }),
      T('measurement_tool', { subtypes: ['non_functional'] }), B('contractual', { subtypes: ['non_functional'] }),
      E('basis', ['measured', 'benchmarked', 'assumed', 'invented'], { subtypes: ['non_functional'] }),
      // interface block
      T('counterparty', { subtypes: ['interface'] }), E('direction', ['inbound', 'outbound', 'bidirectional'], { subtypes: ['interface'] }),
      T('protocol', { subtypes: ['interface'] }), LT('failure_handling', { subtypes: ['interface'] }),
      // data block
      N('retention_days', 'days', { subtypes: ['data'] }), T('residency', { subtypes: ['data'] }),
    ],
    // subtype-specific required fields (spec 3.13 G3-03/G3-04)
    subtypeRequired: {
      non_functional: ['category', 'metric', 'comparator', 'target_value', 'unit', 'condition', 'environment', 'measurement_point', 'measurement_tool'],
      interface: ['counterparty', 'direction', 'failure_handling'],
      data: ['retention_days'],
    },
    suspectFields: ['statement', 'priority', 'target_value', 'comparator', 'unit', 'percentile', 'window', 'condition', 'environment', 'flow_applicability', 'global'],
  },
  Story: {
    prefix: 'STY', phase: 3, v2Ref: ['3.3.E/Story', 'MG-001'], statuses: ['Draft', 'In review', 'Approved', 'Ready-for-handoff', 'Handed-off', 'Changed', 'Deprecated', 'Rejected', 'Withdrawn'],
    fields: [req(LT('want')), LT('benefit'), E('priority', ENUMS.priority, { required: true }), N('estimate', 'points', { min: 0 })],
    suspectFields: ['want', 'benefit', 'priority', 'estimate'], countedStatuses: ['In review', 'Approved', 'Ready-for-handoff', 'Handed-off'],
  },
  BusinessRule: {
    prefix: 'BRL', phase: 3, v2Ref: ['3.3.E/BusinessRule'], statuses: DOC_STATUSES,
    fields: [req(LT('statement')), E('kind', ['constraint', 'derivation', 'decision_table', 'calculation']), E('category', ['pricing', 'sla', 'legal', 'billing', 'security', 'operational', 'external', 'caching']), E('enforcement', ['mandatory', 'advisory', 'automated']), L('parameters'), T('owner'), D('effective_from')],
    suspectFields: ['statement', 'parameters', 'effective_from'],
  },
  AcceptanceCriterion: {
    prefix: 'AC', phase: 3, v2Ref: ['3.3.E/AcceptanceCriterion', '3.4.5'], statuses: DOC_STATUSES,
    fields: [
      LT('given'), LT('when'), req(LT('then')), req(E('scenario_type', ['happy', 'negative', 'boundary', 'edge'])),
      E('kind', ['behavioural', 'threshold', 'performance', 'security', 'compliance', 'checklist']), E('verification_method', ['Test', 'Inspection', 'Analysis', 'Demonstration', 'Audit', 'Drill']),
    ],
    suspectFields: ['given', 'when', 'then', 'scenario_type'],
  },

  // ===================== Phase 4: flows, states =====================
  Actor: {
    prefix: 'ACT', phase: 4, v2Ref: ['3.3.F/Actor'], statuses: DOC_STATUSES,
    fields: [E('kind', ['customer_user', 'internal_user', 'system', 'external_system', 'scheduler'], { required: true }), LT('description')],
    suspectFields: ['kind'],
  },
  Flow: {
    prefix: 'FLW', phase: 4, v2Ref: ['3.3.F/Flow'], statuses: DOC_STATUSES,
    fields: [E('kind', ['journey', 'process', 'workflow', 'exception', 'cross_module'], { required: true }), E('level', ['L1_process', 'L2_workflow', 'L3_technical']), LT('goal'), LT('trigger_summary'), LT('preconditions'), E('priority', ['Must', 'Should', 'Could'])],
    suspectFields: ['goal', 'trigger_summary'],
  },
  FlowStep: {
    prefix: 'STP', phase: 4, v2Ref: ['3.3.F/FlowStep', '3.4.6'], statuses: DOC_STATUSES,
    fields: [
      req(E('kind', ['start', 'task', 'decision', 'end', 'external', 'wait'])), N('order', 'order', { integer: true }), LT('system_response'), LT('pre_checks'),
      N('time_bound_ms', 'ms', { min: 0 }),
    ],
    suspectFields: ['kind', 'system_response', 'time_bound_ms'],
  },
  Entity: {
    prefix: 'ENT', phase: 4, v2Ref: ['3.3.E/Entity', '3.4.10'], statuses: DOC_STATUSES,
    fields: [LT('description'), B('has_lifecycle'), L('datafields'), B('personal_data'), N('retention_days', 'days')],
    suspectFields: ['datafields', 'has_lifecycle'],
  },
  State: {
    prefix: 'STA', phase: 4, v2Ref: ['3.3.F/State', '3.4.10'], statuses: DOC_STATUSES,
    fields: [B('initial'), B('terminal'), LT('entry_condition'), T('observable_signal')],
    suspectFields: ['entry_condition', 'terminal', 'initial'],
  },
  Transition: {
    prefix: 'TRN', phase: 4, v2Ref: ['3.3.F/Transition', '3.4.10'], statuses: DOC_STATUSES,
    fields: [E('kind', ['allowed', 'forbidden'], { required: true }), E('trigger_kind', ['user_action', 'system_event', 'timer', 'flow_step', 'api']), LT('notes')],
    suspectFields: ['kind', 'trigger_kind'],
  },
};

// ---- Phases 5-12 (engine/phases_5_12.ts) -----------------------------------
phases_5_12Mod.extendTypes(TYPES, { T, LT, E, N, D, B, R, RS, L, req, DOC_STATUSES });

// ---- derived lookups ------------------------------------------------------
const COMMON_FIELDS = [
  f('title', 'text', { required: true, label: 'title' }),
  f('owner_name', 'text', { label: 'owner', hidden: true }),
];

for (const [name, def] of Object.entries(TYPES)) {
  (def as any).name = name;
  (def as any).initialStatus = def.statuses[0];
  (def as any).countedStatuses = (def as any).countedStatuses || (def.statuses === DOC_STATUSES || def.statuses.includes('In review') ? ['In review', 'Approved'] : def.statuses.filter((s) => !TERMINAL_STATUSES.has(s) && !['Draft', 'Candidate', 'Disputed', 'Proposed', 'Requested', 'Planned', 'Open'].includes(s)));
  (def as any).fieldMap = Object.fromEntries(def.fields.map((x) => [x.name, x]));
}

const PREFIX_TO_TYPE = {};
for (const def of Object.values(TYPES)) {
  if (def.prefix) PREFIX_TO_TYPE[def.prefix] = (def as any).name;
  if ((def as any).subtypes) for (const st of Object.values((def as any).subtypes)) PREFIX_TO_TYPE[(st as any).prefix] = (def as any).name;
}

/** ID prefix for a type (+ subtype for Requirement). */
function idPrefix(type, subtype) {
  const def = TYPES[type];
  if (!def) throw new Error(`Unknown item type ${type}`);
  if (def.subtypes) {
    const st = def.subtypes[subtype];
    if (!st) throw new Error(`${type} needs a subtype, one of ${Object.keys(def.subtypes).join(', ')}`);
    return st.prefix;
  }
  return def.prefix;
}

/** Type name from an item id such as 'SRC-012' or 'FR-003'. Returns null when unknown. */
function typeOfId(id) {
  const m = /^([A-Z]+)-\d+$/.exec(id || '');
  if (!m) return null;
  return PREFIX_TO_TYPE[m[1]] || null;
}

/** Fields applicable to a type (and subtype). */
function fieldsFor(type, subtype?) {
  const def = TYPES[type];
  return def.fields.filter((x) => !x.subtypes || x.subtypes.includes(subtype));
}

function requiredFor(type, subtype) {
  const def = TYPES[type];
  const base = fieldsFor(type, subtype).filter((x) => x.required).map((x) => x.name);
  const extra = (def.subtypeRequired && def.subtypeRequired[subtype]) || [];
  return ['title', ...new Set([...base, ...extra])];
}

function isEmpty(v) {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

/**
 * Validate an item (full object incl. common fields). Returns list of error strings.
 * `opts.strictRequired` (default true) enforces required fields.
 */
function validateItem(item, opts: any = {}) {
  const errors = [];
  const def = TYPES[item.type];
  if (!def) return [`Unknown item type "${item.type}"`];
  if (def.subtypes && !def.subtypes[item.subtype]) errors.push(`${item.type} needs subtype (${Object.keys(def.subtypes).join('/')})`);
  if (!def.subtypes && item.subtype) errors.push(`${item.type} has no subtypes`);
  if (!def.statuses.includes(item.status)) errors.push(`status "${item.status}" is not valid for ${item.type} (${def.statuses.join('/')})`);
  if (!ENUMS.origin.includes(item.origin)) errors.push(`origin "${item.origin}" invalid`);
  const known = new Set(['id', 'type', 'subtype', 'title', 'status', 'phase', 'origin', 'verification', 'proposed_by', 'verified_by', 'verified_on', 'verified_note', 'requested_by', 'agent', 'provenance',
    'suspect', 'rev', 'created_at', 'updated_at', 'created_by', 'note', 'v2Ref', 'invented_note', 'fp', 'request_id', 'seed', 'drafted_text', 'kept_as_drafted', 'kept_by', 'kept_on', 'edited_by', 'edited_on', 'approved_by', 'completed_by', 'completed_on']);
  const fields = fieldsFor(item.type, item.subtype);
  const byName = Object.fromEntries(fields.map((x) => [x.name, x]));
  for (const k of Object.keys(item)) {
    if (!known.has(k) && !byName[k]) errors.push(`unknown field "${k}" on ${item.type}${item.subtype ? '/' + item.subtype : ''}`);
  }
  for (const fd of fields) {
    const v = item[fd.name];
    if (isEmpty(v)) continue;
    switch (fd.kind) {
      case 'enum': if (!fd.values.includes(v)) errors.push(`${fd.name}: "${v}" not in [${fd.values.join(', ')}]`); break;
      case 'number':
        if (typeof v !== 'number' || Number.isNaN(v)) errors.push(`${fd.name}: must be a number`);
        else {
          if (fd.integer && !Number.isInteger(v)) errors.push(`${fd.name}: must be an integer`);
          if (fd.min !== undefined && v < fd.min) errors.push(`${fd.name}: must be >= ${fd.min}`);
          if (fd.max !== undefined && v > fd.max) errors.push(`${fd.name}: must be <= ${fd.max}`);
        } break;
      case 'date': if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) errors.push(`${fd.name}: must be YYYY-MM-DD`); break;
      case 'bool': if (typeof v !== 'boolean') errors.push(`${fd.name}: must be true or false`); break;
      case 'list': case 'refs': if (!Array.isArray(v)) errors.push(`${fd.name}: must be a list`); break;
      case 'ref': if (typeof v !== 'string') errors.push(`${fd.name}: must be an item id`); break;
      default: if (typeof v !== 'string') errors.push(`${fd.name}: must be text`);
    }
  }
  if (opts.strictRequired !== false) {
    for (const name of requiredFor(item.type, item.subtype)) {
      if (isEmpty(item[name]) && item[name] !== false) errors.push(`${name} is required`);
    }
  }
  return errors;
}

/** Everything the browser needs to build schema-driven forms. */
function describe() {
  const types = {};
  for (const [name, def] of Object.entries(TYPES)) {
    types[name] = {
      name, prefix: def.prefix, phase: def.phase, statuses: def.statuses, v2Ref: def.v2Ref, uiAlias: (def as any).uiAlias || null,
      subtypes: (def as any).subtypes ? Object.fromEntries(Object.entries((def as any).subtypes).map(([k, v]) => [k, { prefix: (v as any).prefix, required: ((def as any).subtypeRequired || {})[k] || [] }])) : null,
      fields: [COMMON_FIELDS[0], ...def.fields],
      countedStatuses: (def as any).countedStatuses,
    };
  }
  return { types, enums: ENUMS, terminal: [...TERMINAL_STATUSES], approvedLike: [...APPROVED_LIKE] };
}

export { ENUMS, TYPES, TERMINAL_STATUSES, APPROVED_LIKE, DOC_STATUSES, idPrefix, typeOfId, fieldsFor, requiredFor, validateItem, describe, isEmpty, PREFIX_TO_TYPE };
