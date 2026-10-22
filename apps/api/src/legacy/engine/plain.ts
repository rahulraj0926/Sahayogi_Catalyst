/**
 * engine/plain.ts - business words for what the rules engine says.
 *
 * The engine thinks in gates, criteria, depth levels and record codes. A product leader thinks in stages, things still needed,
 * how thorough to be and the names of people and papers. Every sentence that reaches the screen, a report or an exported
 * document is written (or rewritten) here, in one place, so the same idea always has the same words.
 *
 *   Gate N                  -> "the Stage N sign-off"
 *   criterion / check       -> "a thing still needed" (blocking) or "recommended" (advice)
 *   depth L1 / L2 / L3      -> Light / Standard / Thorough
 *   attestation             -> "sign-off by <role>"
 *   suspect                 -> "needs a second look" (something it depends on changed)
 *   T1 / T2 / T3 / S        -> main competitor / smaller competitor / watch list / customer alternative
 */
import * as stages from './stages';
import * as units from './units';
import * as words from './words';

const STAGE_NAMES = stages.STAGE_NAMES;
const THOROUGHNESS = { L1: 'Light', L2: 'Standard', L3: 'Thorough' };
const TIER_WORDS = { T1: 'Main competitor', T2: 'Smaller competitor', T3: 'Watch list', S: 'Customer alternative' };
const TIER_PLURAL = { T1: 'main competitors', T2: 'smaller competitors', T3: 'on the watch list', S: 'customer alternatives' };

/** Roles as a person would write them. */
const ROLE_WORDS = { sponsor: 'Sponsor', ops: 'Operations head', ba: 'Business analyst', cto: 'CTO', cfo: 'CFO', 'tech lead': 'Tech lead', qa: 'QA lead', 'qa lead': 'QA lead', 'sales head': 'Sales head', legal: 'Legal', 'head of ops': 'Head of Operations', 'product leader': 'Product leader', 'product owner': 'Product Owner', 'it head': 'IT head', 'service head': 'Service head' };
function roleName(s) {
  const t = String(s || '').trim();
  if (!t) return '';
  return ROLE_WORDS[t.toLowerCase()] || (t === t.toLowerCase() ? t.charAt(0).toUpperCase() + t.slice(1) : t);
}
/** "Product leader + BA + ops" -> "Product leader, Business analyst and Operations head" */
function whoText(who) {
  const parts = String(who || '').split('+').map(roleName).filter(Boolean);
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** What is needed (need) and what to do about it (todo), for every check the engine has, in business words. */
const CRIT = {
  'GC-02': ['Every follow-up promised at an earlier sign-off is closed', 'Close the follow-ups you accepted when you moved on (they are listed under "Follow-ups to close").'],
  'GC-03': ['No agreed exception has run past its end date', 'Renew or end the exceptions that have expired.'],
  'GC-04': ['Nothing approved is waiting for a second look', 'Re-check the approved items that depend on something that changed after approval, and confirm they are still true.'],
  'GC-05': ['No must-have rests on invented or guessed numbers', 'Replace invented figures with real evidence, or record them as assumptions that have an owner.'],
  'G0-01': ['The intake summary and the Product Intake Document are approved', 'Finish the intake summary and the Product Intake Document, then approve them.'],
  'G0-02': ['The problem is described without already naming the solution', 'Rewrite the problem as the pain people feel, not as the thing you will build. The Product Owner then confirms it.'],
  'G0-03': ['A sponsor is named', 'Say who sponsors this product (the person who owns the budget).'],
  'G0-04': ['Every kind of person who matters is on the people list', 'Add at least one person for each missing kind (sponsor, delivery, customer, the person who uses it).'],
  'G0-05': ['The biggest guesses are written down, each with an owner and a date to check it', 'List the top assumptions, who owns each one and by when it will be tested.'],
  'G0-06': ['The limits are written down: a budget, a deadline, and who can change each', 'Record the budget and the date limit, each with an owner and how flexible it is.'],
  'G0-07': ['Effort and cost for the next stage are agreed', 'Get the budget for the next stage approved.'],
  'G0-08': ['No must-answer question is still open for this stage', 'Answer each must-answer question, assume an answer (with an owner and a date to re-check), or set it aside with an approval.'],
  'G0-09': ['A first scope line is drawn, and every "not sure yet" line is tied to a question', 'Say what is in, what is out and what comes later, and tie each "not sure yet" line to the question that will settle it.'],
  'G0-12': ['Enough checked evidence is on file', 'Add more evidence (interviews, reports, files) and have someone check it.'],
  'G1-02': ['The main customer group is described and backed by at least two customer quotes that a second person has checked', 'Describe the main customer group, then add at least two things real customers said (name the group in the "Which customer group" box) and have a second person check each quote.'],
  'G1-02b': ['Each of the top three jobs is backed by checked customer words (Thorough only)', 'Add at least two checked customer quotes for each of the top three jobs.'],
  'G1-04': ['Enough competitors are studied, with checked abilities and prices (or a reason for none)', 'Add the competitors, fill in what they can do and what they charge, and have someone else check it.'],
  'G1-04b': ['Competitor facts are recent enough', 'Refresh the competitor prices and abilities that are out of date.'],
  'G1-06': ['The riskiest guesses are ranked, and each has a plan to test it', 'Rank the top assumptions and say how each one will be tested.'],
  'G1-07': ['The legal and rules check is done and signed by Legal', 'Have the Legal person review the laws and standards that apply and sign it off.'],
  'G1-08': ['Market risks are written down, each with an owner', 'Record the market risks and name an owner for each.'],
  'G1-09': ['No must-answer question is still open for this stage', 'Answer each must-answer question, assume an answer (with an owner and a date to re-check), or set it aside with an approval.'],
  'G1-10': ['The evidence behind this stage is real, not invented or missing', 'Replace invented or missing evidence with real sources.'],
  'G1-14': ['What makes us different is backed by a gap you have checked in a competitor', 'Link each opportunity to a competitor gap that someone has checked.'],
  'G1-20': ['Every competitor fact marked as checked was checked by a different person, who noted the source', 'Ask someone other than the person who entered it to check it and write down where they checked.'],
  'G2-02': ['Scope is explicit: something is clearly out, and every "later" or "out" line says why', 'Add at least one out-of-scope line, and give a reason and an impact for every "later" or "out" line.'],
  'G2-04': ['Every feature in scope connects to a goal or a need', 'Link each feature to the goal or customer need it serves.'],
  'G2-05': ['Success measures are specific: a unit, an owner, how often, a target and a starting point', 'Complete each success measure with a unit, an owner, how often it is checked, a target and where it starts today.'],
  'G2-06': ['Every must-have feature has an effort estimate and a release', 'Estimate each must-have feature and put it in a release.'],
  'G2-07': ['The must-have work fits the team capacity', 'Cut what is must-have, add people, or move work to a later release.'],
  'G2-10': ['Confirmed limits are reviewed, and every big guess is tested or tied to a later stage', 'Review the confirmed limits and give each high-impact assumption a test or a later stage.'],
  'G2-13': ['The scope decision is recorded and approved', 'Have the sponsor record and approve the decision that fixes the scope.'],
  'G2-14': ['No must-answer question is still open for this stage', 'Answer each must-answer question, assume an answer (with an owner and a date to re-check), or set it aside with an approval.'],
  'G3-02': ['Every must-have requirement and story is clear (no vague words, nothing "to be decided")', 'Rewrite vague wording so it is specific and testable.'],
  'G3-04': ['Every must-have quality target has a number and a way to measure it', 'Give each quality target a number, a unit and how it will be measured.'],
  'G3-05': ['Each quality target says where its number came from; guessed numbers are tied to an assumption', 'Say where each number came from, tie guessed numbers to an assumption, and remove invented ones.'],
  'G3-08': ['Every requirement comes from a feature, a finding, a rule or a limit', 'Link each requirement to the feature, finding, rule or limit it comes from.'],
  'G3-08b': ['Every requirement has at least one checked test of how it should behave', 'Write and review a test for each requirement that describes behaviour.'],
  'G3-09': ['Every must-have function has a normal-case test and a failure or edge-case test', 'Add the missing normal-case and failure-case tests.'],
  'G3-10': ['Every must-have quality target says where it applies and can be tested against a limit', 'Say whether each target applies to the whole product or to certain parts, and add a test with a limit.'],
  'G3-12': ['Every main type of user has a story, and every story is complete', 'Write a story for each main type of user and finish the unfinished stories.'],
  'G3-19': ['No must-answer question is still open for this stage', 'Answer each must-answer question, assume an answer (with an owner and a date to re-check), or set it aside with an approval.'],
  'G3-21': ['It is decided which requirements appear in a flow, and every quality target says where it applies', 'Mark which requirements show up in a flow, and say where each quality target applies.'],
  'G4-02': ['Every must-have function appears as a step in a flow', 'Add the missing steps to your flows.'],
  'G4-03': ['Every quality target is covered by saying where it applies, not by flow steps', 'Say where each quality target applies (the whole product or certain parts).'],
  'G4-05': ['Each thing we keep records of has a complete life cycle', 'Complete the states, and the allowed moves between them, for each thing that has a life cycle.'],
  'G4-06': ['Each must-have flow is complete: it starts, it ends, it has no dead end and it shows what happens when a step fails', 'Fix the flows that are missing a start, an end, a decision rule or a failure path.'],
  'G4-08': ['Every failure path and every forbidden change has a test', 'Write a test for what must NOT happen.'],
  'G4-12': ['Every must-have flow has been walked through with someone who did not write it', 'Walk someone else through each must-have flow, and have the Product Owner sign it off.'],
  'G4-14': ['Every approved story has everything developers need', 'Complete each story so it carries everything developers need before handoff.'],
  'G4-17': ['No must-answer question is still open for this stage', 'Answer each must-answer question, assume an answer (with an owner and a date to re-check), or set it aside with an approval.'],
};

/** "P1" -> "Stage 1: Market"; the other portfolio stages in plain words. */
const STAGE_LABELS = { idea: 'Ideas', handoff: 'All stages signed off, not handed over yet', done: 'Handed off', parked: 'On hold' };
const stageLabel = (code) => (/^P([0-4])$/.test(String(code)) ? `Stage ${String(code)[1]}: ${STAGE_NAMES[Number(String(code)[1])]}` : STAGE_LABELS[code] || String(code));
/** The one rule behind every stage shown anywhere. */
const STAGE_RULE = 'A product is in the earliest stage whose sign-off has not passed yet.';

const lowerFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const needOf = (id, fallback?) => (CRIT[id] ? CRIT[id][0] : fallback || 'A requirement of this stage');
const todoOf = (id) => (CRIT[id] ? CRIT[id][1] : 'Open the details and fix what is listed.');
const stageName = (n) => `Stage ${n} (${STAGE_NAMES[n]})`;

/** Strip rules-engine codes and words from a sentence that must be shown to a person. */
function clean(text) {
  return String(text === undefined || text === null ? '' : text)
    .replace(/\bGC-\d+[a-z]?\b/g, 'the checks every stage has')
    .replace(/\bG([0-4])-\d+[a-z]?\b/g, 'the Stage $1 sign-off')
    .replace(/\bGate ([0-4])\b/g, 'the Stage $1 sign-off')
    .replace(/\bgate ([0-4])\b/g, 'the Stage $1 sign-off')
    .replace(/\bPhase ([0-4])\b/g, 'Stage $1')
    .replace(/\bphase ([0-4])\b/g, 'stage $1')
    .replace(/\bblocking criteria\b/gi, 'required items').replace(/\bcriteria\b/gi, 'checks').replace(/\bcriterion\b/gi, 'check')
    .replace(/\bapplies_to\b/g, 'applies to').replace(/\bderives_from\b/g, 'comes from')
    .replace(/\bIntakeBrief\b/g, 'intake summary').replace(/\bNFRs\b/g, 'quality targets').replace(/\bNFR\b/g, 'quality target')
    .replace(/\bsuspect flags?\b/gi, 'items needing a second look').replace(/\bsuspect\b/gi, 'needing a second look')
    .replace(/\bingest(ed|ing)?\b/gi, (m, s) => (s === 'ed' ? 'imported' : s === 'ing' ? 'importing' : 'import'))
    .replace(/\bprovenance\b/gi, 'where it came from').replace(/\battestation\b/gi, 'sign-off')
    .replace(/\bdisposition\b/gi, 'decision').replace(/\bbaseline\b/gi, 'saved snapshot').replace(/\bpercentile\b/gi, 'share of the time')
    .replace(/\bMust question(s?)\b/g, 'must-answer question$1').replace(/\bMust set\b/g, 'must-have work');
}

// ---------------------------------------------------------------------------------------------- stored codes as plain words
const WORDS = {
  price_type: { list: 'List price', mrp: 'MRP', street: 'Street price', dealer: 'Dealer price', distributor: 'Distributor price', oem: 'OEM price', quote: 'Quote', tender_award: 'Tender award', promo: 'Promotion' },
  billing_model: { one_time: 'One-time purchase', subscription: 'Subscription', usage: 'Pay per use', hybrid: 'Mixed', lease: 'Lease' },
  tax_basis: { incl_gst: 'Includes GST', excl_gst: 'Excludes GST', not_applicable: 'No tax' },
  billing_period: { one_time: 'One-time', month: 'per month', quarter: 'per quarter', year: 'per year' },
  baseline_type: { measured: 'measured today', estimated: 'estimated', proxy: 'a stand-in measure', none_new_product: 'none (new product)', unknown_pending: 'not known yet' },
  cadence: { realtime: 'Live', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly' },
  disposition: { in: 'In', later: 'Later', out: 'Out', unknown: 'Not sure yet' },
  level: { unknown: 'Not known', absent: 'Not offered', partial: 'Partly', parity: 'Same as us', strong: 'Better than us' },
  evidence_basis: { documented: 'Documented', hands_on: 'Tried hands-on', third_party: 'Third-party report', review: 'Review', not_claimed: 'Not claimed' },
  competitor_kind: { direct: 'Direct competitor', indirect: 'Indirect competitor', alternative: 'Customer alternative', in_house: 'Built in-house', adjacent_entrant: 'Could enter our market', open_source: 'Open source', aspirational: 'Role model' },
  tier_basis: { deal_frequency: 'how often we meet them in deals', customer_shortlist: "on customers' shortlists", dealer_poll: 'dealer poll', marketplace_compare: 'marketplace comparison', tender_result: 'tender results', analyst_judgement: 'our own judgement' },
  flow_kind: { journey: 'User journey', process: 'Business process', workflow: 'Workflow', exception: 'Exception', cross_module: 'Across parts of the product' },
  step_kind: { start: 'Start', end: 'End', decision: 'Decision', external: 'Other system', wait: 'Wait', task: 'Task' },
  transition_kind: { allowed: 'Allowed', forbidden: 'Not allowed' },
  trigger_kind: { user_action: 'A person acts', system_event: 'The system does something', timer: 'A timer', flow_step: 'Another step', api: 'Another system calls' },
  edge_kind: { happy: 'Normal path', alternate: 'Other path', failure: 'When it fails', forbidden: 'Not allowed' },
  persona_kind: { customer_user: 'Customer who uses it', buyer: 'Buyer', beneficiary: 'Beneficiary', internal_user: 'Our own staff' },
  buying_role: { user: 'Uses it', influencer: 'Influences the buyer', economic_buyer: 'Pays for it', admin: 'Administers it', none: 'None' },
  evidence_kind: { interview: 'Interview', survey: 'Survey', document: 'Document', web_page: 'Web page', data_file: 'Data file', regulation: 'Regulation', price_list: 'Price list', screenshot: 'Screenshot', datasheet: 'Datasheet', other: 'Other' },
  source_class: { primary: 'First-hand', secondary: 'Second-hand', internal: 'Our own records', vendor_claim: 'Claim by the vendor' },
  flexibility: { hard: 'Cannot move', soft: 'Can flex' },
  subtype: { functional: 'Function', non_functional: 'Quality target', interface: 'Link to another system', data: 'Data', regulatory: 'Rule or law' },
  scenario: { happy: 'Normal case', negative: 'Failure case', boundary: 'Edge of the limits', edge: 'Unusual case', threshold: 'Limit test' },
  freshness: { fresh: 'Up to date', due: 'Due for a refresh', stale: 'Out of date', unknown: 'No date' },
  priority: { Must: 'Must have', Should: 'Should have', Could: 'Could have', Wont: 'Not this time' },
  origin: { human: 'Entered by a person', invented: 'Example, not real evidence', document: 'Read from a file', agent: 'Found by an assistant', assistant: 'Suggested by the assistant', derived: 'Worked out by the tool' },
};
/** A stored code as a plain word: word('price_type', 'mrp') -> "MRP". Unknown codes become readable text. */
function word(kind, value) {
  if (value === undefined || value === null || value === '') return '';
  const m = WORDS[kind];
  if (m && m[value] !== undefined) return m[value];
  const t = String(value).replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}
const TIER_PLURAL_FORM = { T1: 'main competitors', T2: 'smaller competitors', T3: 'on the watch list', S: 'customer alternatives' };
/** "2 main competitors, 1 customer alternative" from items with a tier. */
function tierCounts(items, tierOf = (x) => x.tier) {
  const counts = {};
  for (const it of items) { const t = TIER_WORDS[tierOf(it)] ? tierOf(it) : 'none'; counts[t] = (counts[t] || 0) + 1; }
  const parts = ['T1', 'T2', 'T3', 'S', 'none'].filter((t) => counts[t]).map((t) => `${counts[t]} ${t === 'none' ? 'not yet sorted' : counts[t] === 1 ? TIER_WORDS[t].toLowerCase() : TIER_PLURAL_FORM[t]}`);
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
/** Money as a person writes it: Rs 18,500 (Indian digit grouping), USD 0.05. */
function money(amount, currency) {
  if (amount === undefined || amount === null || amount === '') return '';
  const n = Number(amount);
  const txt = Number.isFinite(n) ? n.toLocaleString('en-IN', { maximumFractionDigits: 4 }) : String(amount);
  return `${!currency || currency === 'INR' ? 'Rs' : currency} ${txt}`;
}
/** "per user per month" without doubled words: unit "user/month" -> "per user per month"; unit "unit" -> "per unit". */
function perUnit(unit) {
  const u = String(unit || '').trim();
  if (!u) return '';
  return `per ${u.split('/').map((x) => x.trim()).filter(Boolean).join(' per ')}`;
}

// ---------------------------------------------------------------------------------------------- the "what is blocking me" view
const STATUS_WORDS = { FAIL: 'Still needed', ATTEST_PENDING: 'Waiting for a sign-off', WAIVED: 'Set aside by an approved exception', PASS: 'Done', NA: 'Not needed at this level of thoroughness' };

/**
 * One stage, in business words: what is still needed, what is done, in one list. `ev` is gates.evaluateGate(store, n).
 * Nothing here is invented: every row is a check the engine ran; `expert` carries the engine's own wording for the details panel.
 */
function stageView(ev) {
  const rows = ev.results.filter((r) => r.status !== 'NA').map((r) => {
    const sign = r.attest_required && r.status === 'ATTEST_PENDING' ? `Waiting for a sign-off by ${roleName(r.attest_required.role)}` : STATUS_WORDS[r.status];
    return {
      id: r.id, kind: r.severity === 'must' ? 'required' : 'recommended', status: r.status, status_text: sign, done: r.status === 'PASS' || r.status === 'WAIVED',
      need: needOf(r.id, clean(r.text)), todo: todoOf(r.id), affected: (r.offenders || []).slice(0, 6).map((o) => ({ id: o.id, title: clean(o.title || o.id), reason: clean(o.reason || '') })), affected_count: r.offenderCount !== undefined ? r.offenderCount : (r.offenders || []).length,
      signer: r.attest_required ? roleName(r.attest_required.role) : null, attest_role: r.attest_required ? r.attest_required.role : null, statement: r.attest_required ? clean(r.attest_required.statement) : null, waivable: r.waivable, waiver: r.waiver || null, attested: r.attested ? { by: r.attested.by, at: r.attested.at, note: r.attested.note } : null,
      expert: { code: r.id, type: r.type === 'AUTO' ? 'computed by the tool' : r.type === 'ATTEST' ? 'needs a person to sign' : 'computed, then confirmed by a person', depth: THOROUGHNESS[r.depth_level] || r.depth_level, engine_text: r.text, engine_message: r.message },
    };
  });
  const open = rows.filter((r) => !r.done);
  return {
    stage: ev.gate, name: STAGE_NAMES[ev.gate], title: stageName(ev.gate), signed_off: stages.PASSED.includes(ev.state), state_text: stateText(ev),
    thoroughness: THOROUGHNESS[ev.depth] || ev.depth, required_open: open.filter((r) => r.kind === 'required').length, recommended_open: open.filter((r) => r.kind === 'recommended').length,
    required_total: rows.filter((r) => r.kind === 'required').length, required_done: rows.filter((r) => r.kind === 'required' && r.done).length,
    readiness: ev.summary.readiness, nothing_written: !ev.summary.written, items: rows,
  };
}

function stateText(ev) {
  const st = ev.state; const n = ev.blockers.length;
  const ex = (ev.results || []).filter((r) => r.status === 'WAIVED').length;
  const exw = ex ? ` with ${ex} ${ex === 1 ? 'exception' : 'exceptions'}` : '';
  if (st === 'Passed') return ev.live_state === 'at_risk' ? 'Signed off, but something has changed since and it needs a re-check' : `Signed off${exw}`;
  if (st === 'Passed-with-conditions') return ex && ev.live_state !== 'at_risk' ? `Signed off${exw}, with follow-ups to close` :  ev.live_state === 'at_risk' ? 'Signed off with follow-ups, but something has changed since and it needs a re-check' : 'Signed off, with follow-ups to close';
  if (st === 'Held') return 'On hold';
  if (st === 'Recycled') return 'Sent back for more work';
  if (st === 'Killed') return 'Stopped';
  if (st === 'Reopened') return 'Reopened for changes';
  return n > 0 ? `${n} ${n === 1 ? 'thing' : 'things'} still needed` : 'Ready for the sign-off decision';
}

const ORIGIN_NOTE = { agent: ' (found by an assistant)', assistant: ' (suggested by the assistant)', document: ' (read from a file)', derived: ' (worked out by the tool)' };
/** An audit sentence as a line of recent activity: record names instead of codes, no engine words. */
function activity(text, store) {
  let t = String(text === undefined || text === null ? '' : text);
  const made = /^(.+?) created ([A-Z]{2,4}-\d+) "(.*)" \(origin (\w+)\)$/.exec(t);
  if (made) return `${made[1]} added "${made[3]}"${ORIGIN_NOTE[made[4]] || ''}`;
  t = t.replace(/\b([A-Z]{2,4}-\d{1,5})\b(?:\s+"[^"]*")?/g, (m, id) => { const it = store && store.get ? store.get(id) : null; return it ? `"${it.title || id}"` : m; });
  return clean(t);
}

// ---------------------------------------------------------------------------------------------- the History page (audit trail)
/** Plain groups for the History filter. Each audit action name belongs to exactly one. */
const AUDIT_GROUPS = [
  ['approvals', 'Approvals'], ['answers', 'Answers'], ['files', 'Files'], ['signoffs', 'Stage sign-offs'], ['documents', 'Documents'],
  ['changes', 'Added, edited or removed'], ['connections', 'Connections and second looks'], ['settings', 'Settings and data'],
];
const AUDIT_GROUP_OF = [
  [/^approval\./, 'approvals'], [/^(request|session)\./, 'answers'], [/^(attachment|pointer|inbox|assistant|agent)\./, 'files'], [/^gate\./, 'signoffs'], [/^document\./, 'documents'],
  [/^(item|people|portfolio)\./, 'changes'], [/^(link|suspect)\./, 'connections'], [/^(settings|import|reset|demo)/, 'settings'],
];
function auditGroup(action) { const a = String(action || ''); const g = AUDIT_GROUP_OF.find(([re]) => (re as any).test(a)); return g ? g[1] : 'changes'; }
const DECISION_WORDS = { go: 'signed off', go_with_conditions: 'signed off with follow-ups to close', hold: 'put on hold', recycle: 'sent back for more work', stop: 'stopped the product', kill: 'stopped the product', reopen: 'reopened' };

/**
 * One audit entry as a sentence a manager understands: "Alice approved the Intake document", "Kanishk added a competitor Northwind".
 * No record codes, item type names or engine words. The raw entry stays available to experts (the caller keeps action, subject, summary).
 */
function auditLine(e, store) {
  
  const s = String(e.summary === undefined || e.summary === null ? '' : e.summary); const a = String(e.action || '');
  const actor = e.actor || 'Someone';
  const nameOf = (id) => { const it = store && store.get ? store.get(id) : null; return it ? `"${words.clip(it.title || it.name || id, 60)}"` : null; };
  const quote = (t) => `"${t}"`;
  let m;
  // a record code that is left over (for example inside a title someone typed) is dropped: a sentence never shows STK-001 style codes
  const out = (t) => units.datesInText(clean(t)).replace(/\s*\b[A-Z]{2,5}-\d{1,5}[a-z]?\b/g, '').replace(/\s{2,}/g, ' ').trim();
  switch (a) {
    case 'item.create': {
      m = /^(.+?) created \S+ "(.*)" \(origin (\w+)\)$/.exec(s);
      const noun = words.typeWord(e.details && e.details.type);
      if (m) return out(`${m[1]} added ${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun} ${m[2]}${ORIGIN_NOTE[m[3]] || ''}`);
      break;
    }
    case 'item.update': { m = /^(.+?) edited (\S+) /.exec(s); if (m) return out(`${m[1]} edited ${nameOf(m[2]) || 'an entry'}`); break; }
    case 'item.status': { m = /^(.+?) moved (\S+) (.+?) -> (.+)$/.exec(s); if (m) return out(`${m[1]} changed the status of ${nameOf(m[2]) || 'an entry'} from ${word('', m[3]).toLowerCase()} to ${word('', m[4]).toLowerCase()}`); break; }
    case 'item.delete': { m = /^(.+?) deleted \S+ "(.*)" and (\d+) link/.exec(s); if (m) return out(`${m[1]} deleted ${quote(m[2])}`); break; }
    case 'link.create': { m = /^(.+?) linked (\S+) -.+?-> (\S+)$/.exec(s); if (m) return out(`${m[1]} connected ${nameOf(m[2]) || 'one entry'} to ${nameOf(m[3]) || 'another'}`); break; }
    case 'link.delete': { m = /^(.+?) removed link (\S+) -.+?-> (\S+)$/.exec(s); if (m) return out(`${m[1]} disconnected ${nameOf(m[2]) || 'one entry'} from ${nameOf(m[3]) || 'another'}`); break; }
    case 'suspect.raised': { m = /^(\S+) changed \(.*\); (\d+) link/.exec(s); if (m) return out(`${nameOf(m[1]) || 'An entry'} changed, so ${m[2]} connected ${Number(m[2]) === 1 ? 'entry needs' : 'entries need'} a second look`); break; }
    case 'suspect.cleared': { m = /^(.+?) confirmed (\S+) -.+?-> (\S+) still valid(?:: (.*))?$/.exec(s); if (m) return out(`${m[1]} confirmed that ${nameOf(m[2]) || 'an entry'} and ${nameOf(m[3]) || 'another'} still fit together${m[4] ? '. ' + m[4] : ''}`); break; }
    case 'gate.decided': {
      m = /^(.+?) decided Gate (\d): (.+?) \(\d+\/\d+ blocking criteria ok\)(.*)$/.exec(s);
      if (m) return out(`${m[1]} ${DECISION_WORDS[m[3].replace(/ /g, '_')] || m[3]} at the Stage ${m[2]} sign-off${m[4] ? m[4].replace(/^, approved by/, ', approved by').replace(/^\. Warning: /, '. Note: ') : ''}`);
      break;
    }
    case 'gate.attested': { m = /^(.+?) attested (\S+) as (.+)$/.exec(s); if (m) return out(`${m[1]} signed off as ${roleName(m[3])}: ${lowerFirst(needOf(m[2], 'a requirement'))}`); break; }
    case 'gate.waived': { m = /^(.+?) (?:waived|confirmed the exception) (\S+)(?: until (.+))?$/.exec(s); if (m && CRIT[m[2]]) return out(`${m[1]} set aside "${lowerFirst(needOf(m[2]))}"${m[3] ? ' until ' + m[3] : ''}`); if (m) return out(`${m[1]} approved an exception${m[3] ? ' until ' + m[3] : ''}`); break; }
    case 'request.answered': { m = /^(.+?) (answered|re-saved) \S+: (\d+) item\(s\) created, (\d+) updated$/.exec(s); if (m) return out(`${m[1]} ${m[2] === 'answered' ? 'answered a question' : 'saved an answer again'} (${m[3]} added, ${m[4]} updated)`); break; }
    case 'request.na': { m = /^(.+?) marked \S+ not applicable: (.*)$/.exec(s); if (m) return out(`${m[1]} marked a question as not applicable: ${m[2]}`); break; }
    case 'request.na_undone': { m = /^(.+?) reopened /.exec(s); if (m) return out(`${m[1]} reopened a question that was marked not applicable`); break; }
    case 'request.derived': return out(s.replace(/^\S+ (was prepared automatically|generated):/, (x, y) => `A draft was ${y === 'generated' ? 'generated' : 'prepared automatically'}:`));
    case 'session.step': { m = /^(.+?) completed step \S+ of session \S+: (\d+) created, (\d+) updated$/.exec(s); if (m) return out(`${m[1]} completed a step in a guided session (${m[2]} added, ${m[3]} updated)`); break; }
    case 'session.skip': { m = /^(.+?) skipped step \S+ of session \S+: (.*)$/.exec(s); if (m) return out(`${m[1]} skipped a step in a guided session: ${m[2]}`); break; }
    case 'session.ask_agent': { m = /^(.+?) asked/.exec(s); if (m) return out(`${m[1]} asked the assistant for a draft answer in a guided session`); break; }
    case 'attachment.upload': { m = /^(.+?) uploaded "(.*)" \(\d+ bytes\)/.exec(s); if (m) return out(`${m[1]} added the file "${m[2]}"`); break; }
    case 'attachment.delete': { m = /^(.+?) deleted attachment \S+ "(.*)"/.exec(s); if (m) return out(`${m[1]} removed the file "${m[2]}" (it is kept in history)`); break; }
    case 'attachment.accept': { m = /^(.+?) accepted (\d+) suggestion\(s\) from (.+?): (\d+) item\(s\) created, (\d+) competitor/.exec(s); if (m) return out(`${m[1]} accepted ${m[2]} suggestion${m[2] === '1' ? '' : 's'} from the file "${m[3]}" (${m[4]} added, ${m[5]} competitor${m[5] === '1' ? '' : 's'} updated)`); break; }
    case 'pointer.create': { m = /^(.+?) created \w+ pointer \S+ into (.+?) \((.*?)\)/.exec(s); if (m) return out(`${m[1]} marked a passage in the file "${m[2]}" (${m[3]})`); break; }
    case 'pointer.update': { m = /^(.+?) updated pointer/.exec(s); if (m) return out(`${m[1]} changed a marked passage in a file`); break; }
    case 'inbox.accept': { m = /^(.+?) accepted \S+ \((\w+)(?: \S+)?\) from (.+?);/.exec(s); if (m) return out(`${m[1]} accepted a suggested ${words.typeWord(m[2])} found in the file "${m[3]}"`); break; }
    case 'inbox.reject': { m = /^(.+?) rejected \S+(?:: (.*))?$/.exec(s); if (m) return out(`${m[1]} turned down a suggestion${m[2] ? ': ' + m[2] : ''}`); break; }
    case 'assistant.run': { m = /^(.+?) ran the assistant \(.*?\) on (.+?) for "(.*?)": (\d+) proposal/.exec(s); if (m) return out(`${m[1]} asked the assistant to read the file "${m[2]}": ${m[4]} suggestion${m[4] === '1' ? '' : 's'} found`); break; }
    case 'assistant.hallucination_rejected': return out('The assistant suggested a quote that is not in the file, so it was dropped');
    case 'agent.ingest': { m = /^(.+?) ingested (\d+) item/.exec(s); if (m) return out(`${m[1]} imported ${m[2]} finding${m[2] === '1' ? '' : 's'} from an assistant (all waiting to be checked)`); break; }
    case 'agent.verified': { m = /^(.+?) verified /.exec(s); if (m) return out(`${m[1]} checked an assistant finding and noted the source`); break; }
    case 'agent.rejected': { m = /^(.+?) rejected \S+: (.*)$/.exec(s); if (m) return out(`${m[1]} rejected an assistant finding: ${m[2]}`); break; }
    case 'document.status': return out(s.replace(/^(.+?) \((.+?)\) set "(.*?)" to /, (x, who, role, title) => `${who} set the ${title} document to `).replace(/ at (\d+)% complete/, ' ($1% complete)'));
    case 'portfolio.update': { m = /^(.+?) updated product /.exec(s); if (m) return out(`${m[1]} updated the product details`); break; }
    case 'settings': { m = /^(.+?) changed settings/.exec(s); if (m) return out(`${m[1]} changed the settings`); break; }
    case 'import': { m = /^(.+?) imported a data set \((\d+) items\)/.exec(s); if (m) return out(`${m[1]} loaded a saved data file (${m[2]} entries), replacing everything`); break; }
    case 'reset': { m = /^(.+?) reset /.exec(s); if (m) return out(`${m[1]} reset the product back to the demonstration data`); break; }
    default: break;
  }
  if (/^approval\./.test(a)) return out(s);
  void actor;
  return out(activity(s, store));
}

/** Why the sign-off options are what they are, in one plain sentence. ev = gates.evaluateGate(). */
function eligibleText(ev) {
  const n = ev.blockers.length;
  if (n) return `${n} required ${n === 1 ? 'item is' : 'items are'} still missing, so this stage cannot be signed off yet. You can hold it, send it back or stop the product.`;
  if (ev.eligible.includes('go')) return 'Everything required and everything recommended is done. The stage can be signed off.';
  return 'Everything required is done, but some recommended items or earlier follow-ups are still open. You can sign off with follow-ups to close later.';
}

/** Warning text for stages signed off ahead of an earlier unfinished stage. */
function orderWarnings(store) { return stages.outOfOrder(store); }

export { auditLine, auditGroup, AUDIT_GROUPS, eligibleText, activity, stageLabel, STAGE_LABELS, STAGE_RULE, WORDS, word, tierCounts, money, perUnit, STAGE_NAMES, THOROUGHNESS, TIER_WORDS, TIER_PLURAL, CRIT, roleName, whoText, needOf, todoOf, lowerFirst, stageName, clean, stageView, stateText, orderWarnings, STATUS_WORDS };
