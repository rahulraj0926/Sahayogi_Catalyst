/**
 * db/tables.ts - every table of the platform database, as data (see db/spec.ts for what the pieces mean).
 *
 *   core tables      : fixed, written here
 *   item_<type>      : one table per lifecycle item type, GENERATED from legacy/engine/schema.ts (TYPES).
 *                      Add a type there, run `npm run db:generate`, and the table appears.
 *
 * Nothing in these tables is JSON. Lists are real arrays (TEXT[]), dates are DATE/TIMESTAMPTZ, numbers are numbers,
 * and the few free-form maps (audit details, link attributes, gate parameters) are key/value rows with a kind column.
 */
import { ColSpec, IndexSpec, SqlType, TableSpec, cascadeFk, table } from './spec';
import { TYPES } from '../legacy/engine/schema';

const c = (name: string, type: SqlType, notNull = false, doc?: string): ColSpec => ({ name, type, notNull, doc });
const text = (name: string, notNull = false) => c(name, 'TEXT', notNull);
const int = (name: string, notNull = false) => c(name, 'INTEGER', notNull);
const num = (name: string, notNull = false) => c(name, 'DOUBLE PRECISION', notNull);
const bool = (name: string, notNull = false) => c(name, 'BOOLEAN', notNull);
const ts = (name: string, notNull = false) => c(name, 'TIMESTAMPTZ(3)', notNull);
const arr = (name: string) => c(name, 'TEXT[]');
const ix = (name: string, cols: string[], unique = false): IndexSpec => ({ name, cols, unique });

/** Free-form key/value rows: a value is a string, number, boolean, null or list, told apart by `kind`. */
const kvCols = (): ColSpec[] => [text('key', true), text('kind', true), text('text_value'), arr('items')];

/** A position inside an uploaded file (page, slide, sheet cell, paragraph ...), flattened. */
const locatorCols = (): ColSpec[] => [text('locator_kind'), int('locator_index'), text('locator_sheet'), text('locator_cell'), text('locator_range'), int('locator_paragraph'), int('locator_table'), int('locator_row'), int('locator_col'), int('locator_offset'), int('locator_length')];

export const snake = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2').toLowerCase();
const pascal = (s: string) => s.replace(/(^|_)([a-z0-9])/g, (_, __, ch) => ch.toUpperCase());

// ---------------------------------------------------------------- core tables
export const CORE_TABLES: TableSpec[] = [
  table('portfolio', 'Portfolio', 'Portfolio-wide record. Exactly one row (id = 1).', [
    int('id', true), int('version', true), text('as_of'), num('usage_cap_inr'),
  ], ['id']),
  table('portfolio_counters', 'PortfolioCounter', 'Next-number counters for product and idea ids.', [text('name', true), int('value', true)], ['name']),
  table('portfolio_extra_fields', 'PortfolioExtraField', 'Portfolio-level fields that have no column of their own.', kvCols(), ['key']),
  table('portfolio_settings', 'PortfolioSetting', 'Portfolio settings such as the public address used in approval links.', kvCols(), ['key']),

  table('products', 'Product', 'One row per product: the registry entry plus the settings of its lifecycle store.', [
    text('id', true), text('slug', true), int('position', true),
    text('name', true), text('one_liner'), text('kind'), text('owner'), text('stage'), c('stage_since', 'DATE'), text('depth_level'), text('mode'),
    ts('created_at'), bool('archived', true), bool('stage_override', true), text('seed'), text('parked_from'),
    text('idea_who_for'), text('idea_why_now'), text('idea_asked_by'), text('idea_filled_on'),
    int('store_version', true), text('meta_product_id'), ts('meta_created_at'), text('meta_seed_version'),
    text('as_of'), int('suspect_depth'), text('fx_date'), text('fx_source'), int('demo_index', true),
  ], ['id'], { indexes: [ix('products_slug_key', ['slug'], true), ix('products_position_idx', ['position'])] }),
  table('product_extra_fields', 'ProductExtraField', 'Registry fields of a product that have no column of their own.', [text('product_id', true), ...kvCols()], ['product_id', 'key'],
    { fks: [cascadeFk('product_extra_fields', ['product_id'], 'products', ['id'])] }),
  table('product_counters', 'ProductCounter', 'Next-number counters per id prefix (FR, NFR, LNK ...), one set per product.', [text('product_id', true), text('prefix', true), int('value', true)], ['product_id', 'prefix'],
    { fks: [cascadeFk('product_counters', ['product_id'], 'products', ['id'])] }),
  table('product_params', 'ProductParam', 'Gate parameter overrides the leader set for one product.', [text('product_id', true), ...kvCols()], ['product_id', 'key'],
    { fks: [cascadeFk('product_params', ['product_id'], 'products', ['id'])] }),
  table('product_setting_extras', 'ProductSettingExtra', 'Product settings that have no column of their own.', [text('product_id', true), ...kvCols()], ['product_id', 'key'],
    { fks: [cascadeFk('product_setting_extras', ['product_id'], 'products', ['id'])] }),
  table('product_fx', 'ProductFx', 'Exchange rates (rupees per unit of currency) used for price comparison.', [text('product_id', true), text('currency', true), num('rate', true)], ['product_id', 'currency'],
    { fks: [cascadeFk('product_fx', ['product_id'], 'products', ['id'])] }),

  table('gate_decisions', 'GateDecision', 'The decision taken at each stage gate (0 to 12), with the readiness snapshot taken at that moment.', [
    text('product_id', true), int('gate', true), text('decision'), text('state'), ts('decided_at'), text('decided_by'), text('rationale'), text('depth'),
    num('snapshot_readiness'), int('snapshot_must_ok'), int('snapshot_must_total'), arr('snapshot_failed'), arr('snapshot_waived'), arr('snapshot_pending_should'),
    arr('conditions'), text('baseline_id'), text('approved_by'), text('submitted_by'), text('hold_review_by'), int('recycle_to'),
  ], ['product_id', 'gate'], { fks: [cascadeFk('gate_decisions', ['product_id'], 'products', ['id'])] }),
  table('baselines', 'Baseline', 'Frozen snapshots of the approved items at each gate.', [
    text('product_id', true), text('id', true), int('position', true), int('gate'), text('purpose'), ts('created_at'), text('created_by'), int('item_count'), int('approved_count'), text('hash'), text('parent'),
  ], ['product_id', 'id'], { fks: [cascadeFk('baselines', ['product_id'], 'products', ['id'])] }),
  table('attestations', 'Attestation', 'A named person signing that a criterion is met (or overriding it).', [
    text('product_id', true), text('id', true), int('position', true), text('criterion'), int('gate'), text('role'), text('by'), ts('at'), text('note'), text('evidence_ref'), text('expires_on'),
  ], ['product_id', 'id'], { fks: [cascadeFk('attestations', ['product_id'], 'products', ['id'])] }),
  table('request_states', 'RequestState', 'Progress of each data request of the collection plan (answered, derived, skipped ...).', [
    text('product_id', true), text('request_id', true), text('status'), ts('at'), text('by'), arr('created'), arr('updated'), arr('warnings'), text('message'), text('route'), text('reason'), text('auto_sig'), bool('auto'),
  ], ['product_id', 'request_id'], { fks: [cascadeFk('request_states', ['product_id'], 'products', ['id'])] }),
  table('ingests', 'Ingest', 'Batches of records an agent or assistant submitted from a document.', [
    text('product_id', true), text('id', true), int('position', true), ts('at'), text('agent'), text('submitted_by'), text('request_id'), arr('source_urls'), arr('items'), arr('links'), text('retrieved_on'), text('grade'),
  ], ['product_id', 'id'], { fks: [cascadeFk('ingests', ['product_id'], 'products', ['id'])] }),

  table('items', 'Item', 'Every lifecycle record, whatever its type: the columns all types share. Type-specific columns are in item_<type>.', [
    text('product_id', true), text('id', true), int('position', true), text('type', true), text('subtype'), text('status'), text('phase', true), text('title'), text('owner_name'),
    text('origin'), text('verification'), text('proposed_by'), int('rev', true), ts('created_at'), ts('updated_at'), text('created_by'),
    text('verified_by'), text('verified_on'), text('verified_note'), text('requested_by'), text('agent'), text('note'), text('invented_note'), text('fp'), text('request_id'),
    text('drafted_text'), bool('kept_as_drafted'), text('kept_by'), text('kept_on'), text('edited_by'), text('edited_on'), text('approved_by'), text('completed_by'), text('completed_on'),
    text('prov_source_url'), text('prov_retrieved_on'), text('prov_grade'), text('prov_confidence'), text('prov_agent'),
  ], ['product_id', 'id'], {
    fks: [cascadeFk('items', ['product_id'], 'products', ['id'])],
    indexes: [ix('items_product_id_type_idx', ['product_id', 'type']), ix('items_product_id_phase_idx', ['product_id', 'phase']), ix('items_product_id_status_idx', ['product_id', 'status']), ix('items_product_id_position_idx', ['product_id', 'position'])],
  }),
  table('item_extra_fields', 'ItemExtraField', 'Fields of an item that have no column of their own (kept so nothing is ever lost).', [text('product_id', true), text('item_id', true), ...kvCols()], ['product_id', 'item_id', 'key'],
    { fks: [cascadeFk('item_extra_fields', ['product_id', 'item_id'], 'items', ['product_id', 'id'])] }),

  table('links', 'Link', 'Typed trace links between items (supports, covers, constrains ...). A target can also be a gate such as GATE-2, so source and target are not foreign keys.', [
    text('product_id', true), text('id', true), int('position', true), text('type', true), text('source', true), text('target', true), text('state', true),
    ts('created_at'), text('created_by'), ts('suspect_since'), text('cause_item'), arr('cause_fields'), ts('cause_at'), text('cause_by'),
  ], ['product_id', 'id'], {
    fks: [cascadeFk('links', ['product_id'], 'products', ['id'])],
    indexes: [ix('links_product_id_source_idx', ['product_id', 'source']), ix('links_product_id_target_idx', ['product_id', 'target']), ix('links_product_id_type_idx', ['product_id', 'type']), ix('links_product_id_position_idx', ['product_id', 'position'])],
  }),
  table('link_attrs', 'LinkAttr', 'Attributes of a link (role, rating, condition ...).', [text('product_id', true), text('link_id', true), ...kvCols()], ['product_id', 'link_id', 'key'],
    { fks: [cascadeFk('link_attrs', ['product_id', 'link_id'], 'links', ['product_id', 'id'])] }),
  table('link_fingerprints', 'LinkFingerprint', 'The fingerprint of each linked item at the moment the link was made or last cleared (how a change is noticed).', [text('product_id', true), text('link_id', true), text('item_id', true), text('fp', true)], ['product_id', 'link_id', 'item_id'],
    { fks: [cascadeFk('link_fingerprints', ['product_id', 'link_id'], 'links', ['product_id', 'id'])] }),

  // ---- documents (compose): status and sign-off of each generated document
  table('document_records', 'DocumentRecord', 'The review status of each generated document (PRD, flow pack ...) and who signed it off.', [
    text('product_id', true), text('doc_key', true), text('status'), ts('approved_at'), text('approved_by'),
    text('waiver_reason'), text('waiver_approver'), num('waiver_completeness'), num('waiver_threshold'),
  ], ['product_id', 'doc_key'], { fks: [cascadeFk('document_records', ['product_id'], 'products', ['id'])] }),
  table('document_history', 'DocumentHistory', 'Every status change of a document, oldest first.', [
    text('product_id', true), text('doc_key', true), int('position', true), text('status'), text('role'), text('by'), ts('at'), text('note'), num('completeness'),
    text('waiver_reason'), text('waiver_approver'), num('waiver_completeness'), num('waiver_threshold'),
  ], ['product_id', 'doc_key', 'position'], { fks: [cascadeFk('document_history', ['product_id', 'doc_key'], 'document_records', ['product_id', 'doc_key'])] }),

  // ---- approvals: requests that wait for a named person to say yes or no
  table('approvals', 'Approval', 'A request for a named person to approve something (a gate decision, an exception, an attestation, a story, a document).', [
    text('product_id', true), text('id', true), int('position', true), text('token', true), text('kind', true), text('subject'), text('title'), text('statement'), text('product_name'), text('stage'),
    text('prepared_by'), text('approver'), text('approver_email'), text('approver_phone'), text('status', true), ts('created_at'), ts('expires_at'), int('expiry_days'),
    ts('decided_at'), text('decided_by'), text('decision_note'), text('decision_via'), bool('seen_by_requester'),
    int('payload_gate'), text('payload_decision'), text('payload_rationale'), int('payload_recycle_to'), text('payload_request'), text('payload_waiver'), text('payload_criterion'), text('payload_role'), text('payload_note'), text('payload_story'),
  ], ['product_id', 'id'], { fks: [cascadeFk('approvals', ['product_id'], 'products', ['id'])], indexes: [ix('approvals_token_key', ['token'], true), ix('approvals_product_id_status_idx', ['product_id', 'status'])] }),
  table('approval_conditions', 'ApprovalCondition', 'The follow-up conditions that come with a "go with conditions" request.', [
    text('product_id', true), text('approval_id', true), int('position', true), text('title'), text('text'), text('owner'), int('must_close_by_gate'), text('tracks'),
  ], ['product_id', 'approval_id', 'position'], { fks: [cascadeFk('approval_conditions', ['product_id', 'approval_id'], 'approvals', ['product_id', 'id'])] }),
  table('approval_events', 'ApprovalEvent', 'What happened to an approval request (asked, opened, approved, resent ...), oldest first.', [
    text('product_id', true), text('approval_id', true), int('position', true), ts('at'), text('event'), text('by'), text('via'), text('ua'), text('note'),
  ], ['product_id', 'approval_id', 'position'], { fks: [cascadeFk('approval_events', ['product_id', 'approval_id'], 'approvals', ['product_id', 'id'])] }),

  // ---- assistant review inbox
  table('inbox_proposals', 'InboxProposal', 'A fact the assistant found in an uploaded file, waiting for a person to accept or reject it.', [
    text('product_id', true), text('id', true), int('position', true), text('attachment'), text('goal'), text('status', true), text('kind'), text('competitor_id'), text('item_type'), text('item_subtype'),
    text('where_text'), text('quote'), ...locatorCols(), num('confidence'), text('reason'), text('source'), text('proposed_by'), ts('proposed_at'), text('from_pasted_by'), ts('from_pasted_at'),
    arr('flags'), text('reviewed_by'), ts('reviewed_at'), text('reject_reason'), text('edited_by'), ts('edited_at'),
    text('result_item'), arr('result_created'), text('result_pointer'), text('result_verification'),
  ], ['product_id', 'id'], { fks: [cascadeFk('inbox_proposals', ['product_id'], 'products', ['id'])], indexes: [ix('inbox_proposals_product_id_status_idx', ['product_id', 'status'])] }),
  table('inbox_item_fields', 'InboxItemField', 'The field values the assistant proposes for the new or updated record.', [text('product_id', true), text('proposal_id', true), ...kvCols()], ['product_id', 'proposal_id', 'key'],
    { fks: [cascadeFk('inbox_item_fields', ['product_id', 'proposal_id'], 'inbox_proposals', ['product_id', 'id'])] }),
  table('inbox_also_seen', 'InboxAlsoSeen', 'Other places in the file where the same fact was found and merged.', [text('product_id', true), text('proposal_id', true), int('position', true), text('where_text'), text('quote')], ['product_id', 'proposal_id', 'position'],
    { fks: [cascadeFk('inbox_also_seen', ['product_id', 'proposal_id'], 'inbox_proposals', ['product_id', 'id'])] }),
  table('inbox_edits', 'InboxEdit', 'Edits a person made to a proposal before accepting it.', [text('product_id', true), text('proposal_id', true), int('position', true), text('by'), ts('at'), arr('changed')], ['product_id', 'proposal_id', 'position'],
    { fks: [cascadeFk('inbox_edits', ['product_id', 'proposal_id'], 'inbox_proposals', ['product_id', 'id'])] }),
  table('hallucinations', 'Hallucination', 'Quotes the assistant gave that are not in the file (kept so they can be reviewed).', [
    text('product_id', true), int('position', true), ts('at'), text('attachment'), text('goal'), text('source'), text('quote'), ...locatorCols(), text('reason'),
  ], ['product_id', 'position'], { fks: [cascadeFk('hallucinations', ['product_id'], 'products', ['id'])] }),

  table('audit_log', 'AuditLog', 'Append-only record of every change.', [
    { name: 'seq', type: 'BIGINT', notNull: true, serial: true }, text('product_id', true), ts('at', true), text('action', true), text('subject'), text('actor'), text('summary', true),
  ], ['seq'], { fks: [cascadeFk('audit_log', ['product_id'], 'products', ['id'])], indexes: [ix('audit_log_product_id_seq_idx', ['product_id', 'seq']), ix('audit_log_at_idx', ['at'])] }),
  table('system_audit_log', 'SystemAuditLog', 'Append-only record of events that belong to no single product: ideas, exports, backups, restores, archiving.', [
    { name: 'seq', type: 'BIGINT', notNull: true, serial: true }, ts('at', true), text('action', true), text('subject'), text('actor'), text('summary', true),
  ], ['seq'], { indexes: [ix('system_audit_log_at_idx', ['at']), ix('system_audit_log_action_idx', ['action'])] }),
  table('audit_details', 'AuditDetail', 'Extra facts recorded with an audit entry (who, which links, which fields).', [c('seq', 'BIGINT', true), ...kvCols()], ['seq', 'key'],
    { fks: [cascadeFk('audit_details', ['seq'], 'audit_log', ['seq'])] }),

  table('ideas', 'Idea', 'The ideas inbox, before an idea becomes a product.', [
    text('id', true), int('position', true), text('one_liner', true), text('text'), text('requester'), text('created_on'), text('kind'), text('status', true), text('product_id'), text('origin'),
  ], ['id'], { indexes: [ix('ideas_status_idx', ['status'])] }),
  table('feedback_notes', 'FeedbackNote', 'The "Something wrong here?" notes people leave on screens (one list per install, not per product).', [
    text('id', true), int('position', true), text('text', true), arr('categories'), text('route'), text('product'), text('product_name'), text('actor'), text('at'),
    int('width'), int('words'), bool('done', true), text('done_at'), text('done_by'),
  ], ['id'], { indexes: [ix('feedback_notes_done_idx', ['done'])] }),
  table('members', 'Member', 'Who is on the team, and how widely: the whole platform, one project, or one phase of a project (one list per install).', [
    text('id', true), int('position', true), text('name', true), text('email'), text('role', true), text('scope', true), text('product_id'), text('product_name'), int('phase'), text('added_by'), text('added_at'),
  ], ['id'], { indexes: [ix('members_product_idx', ['product_id'])] }),
  table('ai_usage_log', 'AiUsageLog', 'What the paid assistant cost, one row per run (used for the monthly limit).', [
    int('position', true), c('date', 'DATE'), ts('at'), text('file'), text('attachment'), text('product'), text('goal'), text('by'), text('status'),
    int('estimated_tokens_in'), int('estimated_tokens_out'), num('estimated_cost_inr'), int('actual_tokens_in'), int('actual_tokens_out'), num('actual_cost_inr'), text('note'),
  ], ['position']),
];

// ---------------------------------------------------------------- one table per item type
/** Names every item has in table `items`; a type's own table never repeats them. */
export const ITEM_COMMON_FIELDS = new Set(CORE_TABLES.find((t) => t.table === 'items')!.cols.map((x) => x.name));

export interface TypeTableInfo {
  type: string;
  spec: TableSpec;
  /** field name -> column (only the type's own columns) */
  fields: Map<string, ColSpec>;
}

function sqlTypeOf(f: any): SqlType {
  switch (f.kind) {
    case 'number': return f.integer ? 'INTEGER' : 'DOUBLE PRECISION';
    case 'bool': return 'BOOLEAN';
    case 'date': return 'DATE';
    case 'list': case 'refs': return 'TEXT[]';
    case 'enum': return Array.isArray(f.values) && f.values.length && f.values.every((v: unknown) => typeof v === 'number') ? 'INTEGER' : 'TEXT';
    default: return 'TEXT'; // text, longtext, ref
  }
}

export function buildTypeTables(types: Record<string, any> = TYPES as any): TypeTableInfo[] {
  const out: TypeTableInfo[] = [];
  for (const [type, def] of Object.entries<any>(types)) {
    const tname = `item_${snake(type)}`;
    const cols: ColSpec[] = [text('product_id', true), text('id', true)];
    const fields = new Map<string, ColSpec>();
    for (const f of def.fields || []) {
      if (ITEM_COMMON_FIELDS.has(f.name) || fields.has(f.name)) continue; // title, status ... live in `items`
      if (f.name === 'product_id') throw new Error(`${type}.${f.name}: a field can not be called product_id`);
      const col = c(f.name, sqlTypeOf(f));
      cols.push(col);
      fields.set(f.name, col);
    }
    const spec = table(tname, `Item${pascal(snake(type))}`, `Item type ${type} (id prefix ${def.prefix}): the fields only this type has.`, cols, ['product_id', 'id'],
      { fks: [cascadeFk(tname, ['product_id', 'id'], 'items', ['product_id', 'id'])] });
    if (spec.fks.some((fk) => fk.name.length > 63)) throw new Error(`constraint name too long for ${tname}`);
    out.push({ type, spec, fields });
  }
  return out;
}

export const TYPE_TABLES = buildTypeTables();
export const ALL_TABLES: TableSpec[] = [...CORE_TABLES, ...TYPE_TABLES.map((t) => t.spec)];
export const TABLE_BY_NAME = new Map(ALL_TABLES.map((t) => [t.table, t]));
