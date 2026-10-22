import { arr, bool, DocSet, int, obj, ref, str } from './types';

const open = { type: 'object', additionalProperties: true };
const DECISIONS = ['go', 'go_with_conditions', 'no_go', 'recycle', 'park'];

/** gates (Phase 0-12 sign-offs), stages (the plain-language view of Phases 0-4), approvals (requests that wait for another person), lifecycle */
export const gatesDocs: DocSet = {
  schemas: {
    GateResult: obj({
      id: str('Criterion id.'), gate: { description: 'Gate the criterion belongs to.' }, text: str(), severity: str(undefined, { enum: ['must', 'should'] }),
      status: str(undefined, { enum: ['PASS', 'FAIL', 'ATTEST_PENDING', 'WAIVED', 'NA'] }), message: str('Plain sentence on why.'),
      offenders: arr(open), offenderCount: int('How many records fail it (offenders lists at most 8).'),
    }, ['id', 'status'], { additionalProperties: true }),
    GateEvaluation: obj({
      gate: int('0-12.'), name: str(), sig: str('Short fingerprint of what the checks show. Send it back as expected_sig when deciding; a changed picture is refused with 409 stale_gate.'),
      depth: str(undefined, { enum: ['L1', 'L2', 'L3'] }), results: arr(ref('GateResult')), summary: { ...open, description: 'Counts: must/should by status, evaluated, passed, failed, pending, waived, readiness.' },
      eligible: arr(str('Decisions that may be made now.')), eligibleReason: str(), state: { description: 'Decision state of the gate.' }, live_state: { description: 'State the checks show now.' }, decision: { ...open, nullable: true, description: 'The decision taken, or null.' }, today: str(),
    }, ['gate', 'name', 'sig', 'results', 'summary'], { additionalProperties: true }),
    Approval: obj({
      id: str(), kind: str(undefined, { enum: ['stage_decision', 'sign_off', 'exception', 'document', 'story'] }), kind_word: str(), title: str(), statement: str(), stage: { description: 'Gate number or null.' },
      prepared_by: str(), approver: str(), status: str(undefined, { enum: ['waiting', 'approved', 'declined', 'expired', 'withdrawn'] }), status_word: str(),
      created_at: str(), expires_at: str(), decided_at: str(undefined, { nullable: true }), decided_by: str(undefined, { nullable: true }), decision_note: str(), opened: bool(),
      link: str('Link to send to the approver (only while waiting).'), audit: arr(open),
    }, ['id', 'status'], { additionalProperties: true }),
  },
  routes: {
    'GET /api/lifecycle': { summary: 'Overview of Phases 0-12', response: obj({}, [], { additionalProperties: true }) },
    'GET /api/lifecycle/framework': {
      summary: 'The 13 phases and 70 steps of the lifecycle framework, with weighted completion',
      description: 'Each step counts toward its phase by its level (biggest 8, big 5, medium 3, small 1 points by default) and is complete when the records it needs exist; the phase percent is the weighted sum. `phase` (product phase number) adds the full framework text and the evidence of that phase.',
      query: { phase: { description: 'Product phase number 0-12: include the full text and evidence of its steps.', schema: { type: 'integer', minimum: 0, maximum: 12 } } },
      response: obj({}, [], { additionalProperties: true }),
    },
    'POST /api/lifecycle/framework/weights': {
      summary: 'Change how much lifecycle steps count',
      description: 'Send step + tier (core, major, support, light) for one step, and/or points per level, or reset: true to go back to the framework defaults. Returns the framework with the new percentages.',
      body: obj({ step: str('Step id such as P5.3.'), tier: str('core, major, support or light.', { enum: ['core', 'major', 'support', 'light'] }), points: { type: 'object', additionalProperties: { type: 'number' }, description: 'Points per level, 1-100.' }, reset: bool('Put the framework defaults back.') }, []),
      response: obj({}, [], { additionalProperties: true }),
    },
    'GET /api/lifecycle/gates': {
      summary: 'All 13 gates evaluated', description: 'Each gate with its checks; at most 8 failing records are listed per check.',
      query: { depth: { description: 'Evaluate at this depth instead of the product setting.', schema: { type: 'string', enum: ['L1', 'L2', 'L3'] } } },
      response: arr(ref('GateEvaluation')),
    },
    'GET /api/criteria': { summary: 'The checks every gate runs', description: 'Configuration of the criteria and parameters.', response: open },
    'GET /api/gates': {
      summary: 'Gates 0-4 evaluated', description: 'The original five gates (Stages 0-4). Use /api/lifecycle/gates for all 13.',
      query: { depth: { description: 'Evaluate at this depth.', schema: { type: 'string', enum: ['L1', 'L2', 'L3'] } } }, response: arr(ref('GateEvaluation')),
    },
    'GET /api/gates/{n}': {
      summary: 'One gate with its checks, signatures, waivers and conditions', description: 'n is 0-12; anything else is 404.',
      query: { depth: { description: 'Evaluate at this depth.', schema: { type: 'string', enum: ['L1', 'L2', 'L3'] } } },
      response: { allOf: [ref('GateEvaluation'), obj({ eligibleReasonPlain: str(), depthEffect: { description: 'What each depth level (L1-L3) would change for this gate.' }, attestations: arr(open), waivers: arr(open), conditions: arr(open) }, [], { additionalProperties: true })] },
    },
    'POST /api/gates/{n}/attest': {
      summary: 'Sign a check that needs a person\'s signature',
      description: 'Signing for yourself saves at once; naming another person in `by` sends them an approval request instead. Send expected_sig to refuse if the checks changed.',
      body: obj({ criterion: str('Criterion id that takes a signature.'), by: str('Who signs (default: you).'), role: str('Role the signature is given in; must match the criterion.'), note: str(), evidence_ref: str(), expires_on: str(), depth_level: str(), expected_sig: str('sig you looked at.') }, ['criterion']),
      response: open, errors: { '409': 'stale_gate: the checks changed since expected_sig.', '422': 'The criterion takes no signature, or the role is wrong.' },
    },
    'POST /api/gates/{n}/waive': {
      summary: 'Ask to go ahead without a check (an exception)', description: 'Creates a waiver request that the named approver must agree to. Until then the check still counts as missing.',
      body: obj({ criterion_id: str(), rationale: str('Why it is acceptable.'), approver: str('Who must agree.'), approver_role: str(), expiry_on: str('Date it lapses, YYYY-MM-DD.'), expiry_gate: int(), linked_risk: str('Risk record id.'), subjects: arr(str()), gate: int('Defaults to n.') }, ['criterion_id', 'rationale', 'approver']),
      response: obj({ pending: bool(), waiver: open, approval: ref('Approval'), message: str() }, ['pending'], { additionalProperties: true }),
    },
    'POST /api/gates/{n}/decide': {
      summary: 'Decide a gate (go, go with conditions, no go, recycle, park)',
      description: 'go and go_with_conditions need a second person: name an approver and they receive an approval request; the decision is made when they agree. Send expected_sig; a changed picture is refused with 409 stale_gate and the new current_sig.',
      body: obj({ decision: str(undefined, { enum: DECISIONS }), approver: str('Needed for go / go_with_conditions.'), conditions: arr(open), recycle_to: int('Gate to go back to, for recycle.'), note: str(), expected_sig: str() }, ['decision']),
      response: open, errors: { '409': 'stale_gate, or self_approval (you prepared it, so someone else must approve).', '422': 'The decision is not allowed now (see eligible on the gate).' },
    },
    'POST /api/waivers/{id}/revoke': { summary: 'Withdraw a waiver', description: 'Sets the waiver to Revoked; the check counts again.', response: obj({ waiver: open }, ['waiver']) },
    'POST /api/conditions/{id}/close': { summary: 'Close a condition set by a go-with-conditions decision', response: obj({ condition: open }, ['condition']) },
    'GET /api/stages': { summary: 'Stages 0-4 in plain language', response: obj({ stages: arr(open) }, ['stages'], { additionalProperties: true }) },
    'GET /api/stages/{n}': {
      summary: 'One stage (0-4) in plain language', description: 'Anything outside 0-4 is 404.',
      response: obj({ stage: open, eligible: arr(str()), eligible_reason: str(), decision: { ...open, nullable: true }, today: str(), draft_warning: { description: 'Set when drafted records still wait for review.' } }, ['stage'], { additionalProperties: true }),
    },
    'GET /api/approvals': {
      summary: 'Approval requests of this product', description: 'Waiting requests (all, for you, asked by you), recent decisions and notices of decisions you have not seen.',
      response: obj({ base: obj({ url: str('Address used in links sent to approvers.'), source: str(), warning: str(undefined, { nullable: true }), explain: str() }, ['url'], { additionalProperties: true }), waiting: arr(ref('Approval')), for_you: arr(ref('Approval')), asked_by_you: arr(ref('Approval')), recent: arr(ref('Approval')), notices: arr(ref('Approval')), honesty: str() }, ['waiting', 'for_you', 'asked_by_you', 'recent', 'notices']),
    },
    'POST /api/approvals/{id}/resend': { summary: 'Send an approval request again', description: 'Renews the link and the expiry.', response: ref('Approval'), errors: { '404': 'No such approval request.' } },
    'POST /api/approvals/{id}/withdraw': { summary: 'Withdraw an approval request', response: ref('Approval') },
    'POST /api/approvals/{id}/confirm': { summary: 'Record that the approver agreed in person', body: obj({ note: str() }), response: ref('Approval') },
    'POST /api/approvals/{id}/decline': { summary: 'Record that the approver declined in person', body: obj({ note: str('Their reason.') }), response: ref('Approval') },
    'POST /api/approvals/seen': { summary: 'Mark decisions as seen by the requester', response: obj({ ok: bool() }, ['ok']) },
    'GET /api/approve/{token}': {
      summary: 'What the approver sees when they open their link', description: 'No sign-in: the link itself is the key. Too many wrong tries from one address are rate limited. The link proves who holds it, not who they are.',
      response: obj({ status: str(), status_word: str(), kind_word: str(), title: str(), statement: str(), product: str(), stage: { description: 'Gate number or null.' }, prepared_by: str(), approver: str(), created_at: str(), expires_at: str(), decided_at: str(undefined, { nullable: true }), decided_by: str(undefined, { nullable: true }), decision_note: str(), lines: arr(str()), warnings: arr(str()), has_document: bool(), document_url: str(undefined, { nullable: true }), explain: str(), honesty: str() }, ['status', 'title'], { additionalProperties: true }),
      errors: { '404': 'The link is not valid (mistyped, or replaced by a newer link).' },
    },
    'GET /api/approve/{token}/document': { summary: 'The document behind an approval link', description: 'Only for requests of kind document.', response: open, errors: { '404': 'Invalid link, or no document behind this request.' } },
    'POST /api/approve/{token}/decide': {
      summary: 'Approve or decline from the link', description: 'The approver types their name; it must match the name the request was sent to.',
      body: obj({ decision: str('approve (default) or decline.', { enum: ['approve', 'decline'] }), name: str('The approver\'s name.'), note: str('Reason, especially when declining.') }, ['name']),
      response: obj({ ok: bool(), status: str(), message: str() }, ['ok', 'status']), errors: { '403': 'wrong_name, preparer_blocked or name_required.' },
    },
    'POST /api/questions/{id}/resolve': {
      summary: 'Resolve an open question', description: 'How it is resolved depends on kind (answer, convert, drop...).',
      body: obj({ kind: str('How the question is resolved.'), note: str(), answer: str() }, ['kind'], { additionalProperties: true }), response: open,
    },
  },
};
