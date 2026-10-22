/**
 * db/mapper.ts - turns one product's engine data (the in-memory Store) into table rows and back. Pure functions, no database.
 *
 * A "TableSet" is { tableName -> { rowKey -> row } }. Rows use the column names of db/tables.ts, with plain JS values
 * (strings, numbers, booleans, null, string arrays). db/repository.ts compares two TableSets to find what to write.
 */
import { ColSpec, TableSpec } from './spec';
import { TABLE_BY_NAME, TYPE_TABLES, ITEM_COMMON_FIELDS } from './tables';

export type Row = Record<string, any>;
export type TableSet = Map<string, Map<string, Row>>;

const SEP = '\u0001';
export const keyOf = (spec: TableSpec, row: Row) => spec.pk.map((c) => String(row[c])).join(SEP);

export function put(set: TableSet, table: string, row: Row) {
  const spec = TABLE_BY_NAME.get(table);
  if (!spec) throw new Error(`unknown table ${table}`);
  let m = set.get(table);
  if (!m) set.set(table, (m = new Map()));
  const k = keyOf(spec, row);
  if (m.has(k)) throw new Error(`${table}: duplicate row ${k.split(SEP).join(' / ')}`);
  m.set(k, row);
}
export const rowsOf = (set: TableSet, table: string): Row[] => [...(set.get(table)?.values() || [])];

// ---------------------------------------------------------------- small value helpers
const nn = (v: any) => (v === undefined ? null : v);
const isObj = (v: any) => v !== null && typeof v === 'object' && !Array.isArray(v);
function strList(v: any, what: string): string[] | null {
  if (v === undefined || v === null) return null;
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) throw new Error(`${what}: expected a list of text, got ${JSON.stringify(v).slice(0, 80)}`);
  return v;
}
function unknownKeys(what: string, obj: Row, known: Set<string>) {
  const bad = Object.keys(obj).filter((k) => !known.has(k) && obj[k] !== undefined);
  if (bad.length) throw new Error(`${what}: no column for field(s) ${bad.join(', ')} - add them to src/db/tables.ts`);
}

// ---------------------------------------------------------------- key/value rows (free-form scalar data)
export interface Kv { key: string; kind: string; text_value: string | null; items: string[] | null }
export function toKv(key: string, v: any, what: string): Kv {
  if (v === null) return { key, kind: 'null', text_value: null, items: null };
  if (typeof v === 'string') return { key, kind: 'text', text_value: v, items: null };
  if (typeof v === 'number') return { key, kind: 'number', text_value: String(v), items: null };
  if (typeof v === 'boolean') return { key, kind: 'boolean', text_value: String(v), items: null };
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return { key, kind: 'list', text_value: null, items: v };
  throw new Error(`${what}.${key}: only text, numbers, true/false, null and lists of text can be stored, got ${JSON.stringify(v).slice(0, 80)}`);
}
export function fromKv(r: Row): any {
  switch (r.kind) {
    case 'null': return null;
    case 'number': return Number(r.text_value);
    case 'boolean': return r.text_value === 'true';
    case 'list': return r.items || [];
    default: return r.text_value;
  }
}
const kvRows = (obj: Row | undefined, what: string, extra: Row): Row[] =>
  Object.entries(obj || {}).filter(([, v]) => v !== undefined).map(([k, v]) => ({ ...extra, ...toKv(k, v, what) }));
const kvObject = (rows: Row[]): Row => Object.fromEntries(rows.map((r) => [r.key, fromKv(r)]));

// ---------------------------------------------------------------- products
const ENTRY_KNOWN = new Set(['id', 'slug', 'name', 'one_liner', 'kind', 'owner', 'stage', 'stage_since', 'depth_level', 'mode', 'created_at', 'archived', 'stage_override', 'seed', 'parked_from', 'idea']);
const IDEA_KNOWN = new Set(['who_for', 'why_now', 'asked_by', 'filled_on']);
const META_KNOWN = new Set(['productId', 'createdAt', 'seedVersion']);
const SETTINGS_KNOWN = new Set(['asOf', 'suspectDepth', 'params', 'fx']);
const DATA_KNOWN = new Set(['version', 'meta', 'settings', 'counters', 'items', 'linkList', 'gates', 'baselines', 'attestations', 'requestState', 'ingests', 'audit', 'demo', 'documents', 'approvals', 'inbox', 'hallucinations']);
const GATE_KNOWN = new Set(['gate', 'decision', 'state', 'decided_at', 'decided_by', 'rationale', 'depth', 'snapshot', 'conditions', 'baseline_id', 'approved_by', 'submitted_by', 'hold_review_by', 'recycle_to']);
const SNAP_KNOWN = new Set(['readiness', 'mustOk', 'mustTotal', 'failed', 'waived', 'pendingShould']);
const BASELINE_KNOWN = new Set(['id', 'gate', 'purpose', 'created_at', 'created_by', 'item_count', 'approved_count', 'hash', 'parent']);
const ATTEST_KNOWN = new Set(['id', 'criterion', 'gate', 'role', 'by', 'at', 'note', 'evidence_ref', 'expires_on']);
const REQ_KNOWN = new Set(['status', 'at', 'by', 'created', 'updated', 'warnings', 'message', 'route', 'reason', 'auto_sig', 'auto', 'report']);
const INGEST_KNOWN = new Set(['id', 'at', 'agent', 'submitted_by', 'request_id', 'source_urls', 'items', 'links', 'retrieved_on', 'grade']);
const LINK_KNOWN = new Set(['id', 'type', 'source', 'target', 'attrs', 'state', 'created_at', 'created_by', 'fp_at_link', 'suspect_since', 'cause']);
const CAUSE_KNOWN = new Set(['item', 'fields', 'at', 'by']);
const AUDIT_KNOWN = new Set(['at', 'action', 'subject', 'summary', 'actor', 'details']);


const HIST_KNOWN = new Set(['status', 'role', 'by', 'at', 'note', 'completeness', 'waiver']);
const APPROVAL_KNOWN = new Set(['id', 'token', 'kind', 'subject', 'title', 'statement', 'product_name', 'stage', 'prepared_by', 'approver', 'approver_contact', 'status', 'created_at', 'expires_at', 'expiry_days', 'payload', 'audit', 'decided_at', 'decided_by', 'decision_note', 'decision_via', 'seen_by_requester']);
const PAYLOAD_KNOWN = new Set(['gate', 'decision', 'rationale', 'conditions', 'recycle_to', 'request', 'waiver', 'criterion', 'role', 'note', 'story']);
const PROP_KNOWN = new Set(['id', 'attachment', 'goal', 'status', 'kind', 'competitor_id', 'item', 'pointer', 'where', 'confidence', 'reason', 'source', 'proposed_by', 'proposed_at', 'from_pasted', 'also_seen', 'conflicts', 'flags', 'reviewed_by', 'reviewed_at', 'result', 'edited_by', 'edited_at', 'edits', 'reject_reason']);

/** A document exception (waiver) as columns, and back. */
function waiverCols(w: Row | null | undefined, what: string): Row {
  if (!w) return { waiver_reason: null, waiver_approver: null, waiver_completeness: null, waiver_threshold: null };
  unknownKeys(`${what} waiver`, w, new Set(['reason', 'approver', 'completeness', 'threshold']));
  return { waiver_reason: nn(w.reason), waiver_approver: nn(w.approver), waiver_completeness: nn(w.completeness), waiver_threshold: nn(w.threshold) };
}
const waiverOf = (r: Row): Row | null =>
  r.waiver_reason === null && r.waiver_approver === null ? null : { reason: r.waiver_reason, approver: r.waiver_approver, completeness: r.waiver_completeness, threshold: r.waiver_threshold };

/** A position in an uploaded file ({ kind, index, sheet, ... }) as columns, and back. */
const LOCATOR_MAP: Record<string, string> = { kind: 'locator_kind', index: 'locator_index', sheet: 'locator_sheet', cell: 'locator_cell', range: 'locator_range', paragraph: 'locator_paragraph', table: 'locator_table', row: 'locator_row', col: 'locator_col', offset: 'locator_offset', length: 'locator_length' };
function locatorCols(loc: Row | null | undefined, what: string): Row {
  const out: Row = Object.fromEntries(Object.values(LOCATOR_MAP).map((c) => [c, null]));
  if (!loc) return out;
  unknownKeys(`${what} locator`, loc, new Set(Object.keys(LOCATOR_MAP)));
  for (const [k, col] of Object.entries(LOCATOR_MAP)) if (loc[k] !== undefined) out[col] = loc[k];
  return out;
}
function locatorOf(r: Row): Row | undefined {
  if (Object.values(LOCATOR_MAP).every((c) => r[c] === null)) return undefined;
  const loc: Row = {};
  for (const [k, col] of Object.entries(LOCATOR_MAP)) if (r[col] !== null) loc[k] = r[col];
  return loc;
}

/** The item columns that come from the nested `provenance` object. */
const PROV_FIELDS: Record<string, string> = { prov_source_url: 'source_url', prov_retrieved_on: 'retrieved_on', prov_grade: 'grade', prov_confidence: 'confidence', prov_agent: 'agent' };
const ITEM_FLAT = [...ITEM_COMMON_FIELDS].filter((c) => !(c in PROV_FIELDS) && !['product_id', 'position'].includes(c));
const KEEP_NULL_ITEM = new Set(['verification']);
const TYPE_TABLE = new Map(TYPE_TABLES.map((t) => [t.type, t]));

export interface ProductBundle {
  /** registry entry of the product (name, stage, owner ...) */
  entry: Row;
  /** the Store data of the product */
  data: Row;
  /** how many audit entries the product has ever had (Store._auditTotal); lets the writer find the new ones even when the in-memory list was cut */
  auditTotal?: number;
}

/** Item/link/audit rows count: audit entries are written separately (append only), see repository. */
export function productToRows(position: number, b: ProductBundle): { rows: TableSet; audit: Row[] } {
  const { entry, data: d } = b;
  const id: string = entry.id;
  const set: TableSet = new Map();
  unknownKeys('product entry', entry, ENTRY_KNOWN);
  unknownKeys(`product ${id} store`, d, DATA_KNOWN);
  const idea = entry.idea || {};
  unknownKeys('product idea', idea, IDEA_KNOWN);
  const meta = d.meta || {}, settings = d.settings || {};
  // unknown meta fields and unknown entry fields have no column of their own, but are kept in the key/value table
  const settingsExtra = Object.fromEntries(Object.entries(settings).filter(([k]) => !SETTINGS_KNOWN.has(k)));
  const fx = settings.fx || {};
  put(set, 'products', {
    id, slug: nn(entry.slug), position, name: nn(entry.name), one_liner: nn(entry.one_liner), kind: nn(entry.kind), owner: nn(entry.owner), stage: nn(entry.stage),
    stage_since: nn(entry.stage_since), depth_level: nn(entry.depth_level), mode: nn(entry.mode), created_at: nn(entry.created_at), archived: !!entry.archived, stage_override: !!entry.stage_override,
    seed: nn(entry.seed), parked_from: nn(entry.parked_from), idea_who_for: nn(idea.who_for), idea_why_now: nn(idea.why_now), idea_asked_by: nn(idea.asked_by), idea_filled_on: nn(idea.filled_on),
    store_version: d.version ?? 1, meta_product_id: nn(meta.productId), meta_created_at: nn(meta.createdAt), meta_seed_version: nn(meta.seedVersion),
    as_of: nn(settings.asOf), suspect_depth: nn(settings.suspectDepth), fx_date: nn(fx.date), fx_source: nn(fx.source), demo_index: d.demo?.index ?? 0,
  });
  for (const r of kvRows(Object.fromEntries(Object.entries(meta).filter(([k]) => !META_KNOWN.has(k)).map(([k, v]) => ['meta.' + k, v])), 'meta', { product_id: id })) put(set, 'product_extra_fields', r);
  for (const r of kvRows(Object.fromEntries(Object.entries(entry).filter(([k]) => !ENTRY_KNOWN.has(k))), 'product entry', { product_id: id })) put(set, 'product_extra_fields', r);
  for (const r of kvRows(settingsExtra, 'settings', { product_id: id })) put(set, 'product_setting_extras', r);
  for (const r of kvRows(settings.params, 'params', { product_id: id })) put(set, 'product_params', r);
  for (const [currency, rate] of Object.entries<any>(fx)) {
    if (currency === 'date' || currency === 'source') continue;
    if (typeof rate !== 'number') throw new Error(`fx.${currency}: a rate must be a number`);
    put(set, 'product_fx', { product_id: id, currency, rate });
  }
  for (const [prefix, value] of Object.entries<any>(d.counters || {})) put(set, 'product_counters', { product_id: id, prefix, value });

  // gates, baselines, attestations, request states, ingests
  for (const [k, g] of Object.entries<any>(d.gates || {})) {
    unknownKeys(`gate ${k}`, g, GATE_KNOWN);
    const s = g.snapshot;
    if (s) unknownKeys(`gate ${k} snapshot`, s, SNAP_KNOWN);
    put(set, 'gate_decisions', {
      product_id: id, gate: Number(g.gate ?? k), decision: nn(g.decision), state: nn(g.state), decided_at: nn(g.decided_at), decided_by: nn(g.decided_by), rationale: nn(g.rationale), depth: nn(g.depth),
      snapshot_readiness: s ? nn(s.readiness) : null, snapshot_must_ok: s ? nn(s.mustOk) : null, snapshot_must_total: s ? nn(s.mustTotal) : null,
      snapshot_failed: s ? strList(s.failed, 'snapshot.failed') : null, snapshot_waived: s ? strList(s.waived, 'snapshot.waived') : null, snapshot_pending_should: s ? strList(s.pendingShould, 'snapshot.pendingShould') : null,
      conditions: strList(g.conditions, 'conditions'), baseline_id: nn(g.baseline_id), approved_by: nn(g.approved_by), submitted_by: nn(g.submitted_by), hold_review_by: nn(g.hold_review_by), recycle_to: nn(g.recycle_to),
    });
  }
  (d.baselines || []).forEach((x: Row, i: number) => { unknownKeys('baseline', x, BASELINE_KNOWN); put(set, 'baselines', { product_id: id, position: i, ...Object.fromEntries([...BASELINE_KNOWN].map((c) => [c, nn(x[c])])) }); });
  (d.attestations || []).forEach((x: Row, i: number) => { unknownKeys('attestation', x, ATTEST_KNOWN); put(set, 'attestations', { product_id: id, position: i, ...Object.fromEntries([...ATTEST_KNOWN].map((c) => [c, nn(x[c])])) }); });
  for (const [rid, x] of Object.entries<any>(d.requestState || {})) {
    unknownKeys(`request ${rid}`, x, REQ_KNOWN); // `report` is allowed but not stored: it is a computed result that is rebuilt when the request is run again
    put(set, 'request_states', {
      product_id: id, request_id: rid, status: nn(x.status), at: nn(x.at), by: nn(x.by), created: strList(x.created, 'created'), updated: strList(x.updated, 'updated'), warnings: strList(x.warnings, 'warnings'),
      message: nn(x.message), route: nn(x.route), reason: nn(x.reason), auto_sig: nn(x.auto_sig), auto: x.auto === undefined ? null : !!x.auto,
    });
  }
  (d.ingests || []).forEach((x: Row, i: number) => {
    unknownKeys('ingest', x, INGEST_KNOWN);
    put(set, 'ingests', { product_id: id, position: i, id: x.id, at: nn(x.at), agent: nn(x.agent), submitted_by: nn(x.submitted_by), request_id: nn(x.request_id), source_urls: strList(x.source_urls, 'source_urls'), items: strList(x.items, 'items'), links: strList(x.links, 'links'), retrieved_on: nn(x.retrieved_on), grade: nn(x.grade) });
  });

  // items
  Object.values<any>(d.items || {}).forEach((it, i) => {
    const tt = TYPE_TABLE.get(it.type);
    if (!tt) throw new Error(`item ${it.id}: unknown type ${it.type}`);
    const row: Row = { product_id: id, position: i };
    for (const c of ITEM_FLAT) row[c] = nn(it[c]);
    row.phase = String(it.phase);
    row.rev = it.rev ?? 1;
    const pv = it.provenance;
    if (pv) unknownKeys(`item ${it.id} provenance`, pv, new Set(Object.values(PROV_FIELDS)));
    for (const [col, key] of Object.entries(PROV_FIELDS)) row[col] = pv ? nn(pv[key]) : null;
    put(set, 'items', row);
    const typed: Row = { product_id: id, id: it.id };
    for (const [name, col] of tt.fields) typed[name] = encodeField(col, it[name], `${it.id}.${name}`);
    put(set, tt.spec.table, typed);
    const extra: Row = {};
    for (const [k, v] of Object.entries(it)) if (!ITEM_COMMON_FIELDS.has(k) && !tt.fields.has(k) && !['provenance', 'id', 'type'].includes(k) && v !== undefined) extra[k] = v;
    for (const r of kvRows(extra, `item ${it.id}`, { product_id: id, item_id: it.id })) put(set, 'item_extra_fields', r);
  });

  // links
  (d.linkList || []).forEach((l: Row, i: number) => {
    unknownKeys(`link ${l.id}`, l, LINK_KNOWN);
    const c = l.cause;
    if (c) unknownKeys(`link ${l.id} cause`, c, CAUSE_KNOWN);
    put(set, 'links', {
      product_id: id, id: l.id, position: i, type: l.type, source: l.source, target: l.target, state: l.state || 'valid', created_at: nn(l.created_at), created_by: nn(l.created_by), suspect_since: nn(l.suspect_since),
      cause_item: c ? nn(c.item) : null, cause_fields: c ? strList(c.fields, 'cause.fields') : null, cause_at: c ? nn(c.at) : null, cause_by: c ? nn(c.by) : null,
    });
    for (const r of kvRows(l.attrs, `link ${l.id} attrs`, { product_id: id, link_id: l.id })) put(set, 'link_attrs', r);
    for (const [item_id, fp] of Object.entries<any>(l.fp_at_link || {})) put(set, 'link_fingerprints', { product_id: id, link_id: l.id, item_id, fp });
  });

  // documents
  for (const [key, rec] of Object.entries<any>(d.documents || {})) {
    unknownKeys(`document ${key}`, rec, new Set(['status', 'history', 'approved_at', 'approved_by', 'waiver']));
    put(set, 'document_records', { product_id: id, doc_key: key, status: nn(rec.status), approved_at: nn(rec.approved_at), approved_by: nn(rec.approved_by), ...waiverCols(rec.waiver, `document ${key}`) });
    (rec.history || []).forEach((h: Row, i: number) => {
      unknownKeys(`document ${key} history`, h, HIST_KNOWN);
      put(set, 'document_history', { product_id: id, doc_key: key, position: i, status: nn(h.status), role: nn(h.role), by: nn(h.by), at: nn(h.at), note: nn(h.note), completeness: nn(h.completeness), ...waiverCols(h.waiver, `document ${key} history`) });
    });
  }

  // approvals
  (d.approvals || []).forEach((a: Row, i: number) => {
    unknownKeys(`approval ${a.id}`, a, APPROVAL_KNOWN);
    const pl = a.payload || {}, ct = a.approver_contact || {};
    unknownKeys(`approval ${a.id} payload`, pl, PAYLOAD_KNOWN);
    unknownKeys(`approval ${a.id} contact`, ct, new Set(['email', 'phone']));
    put(set, 'approvals', {
      product_id: id, id: a.id, position: i, token: a.token, kind: a.kind, subject: nn(a.subject), title: nn(a.title), statement: nn(a.statement), product_name: nn(a.product_name), stage: a.stage === undefined || a.stage === null ? null : String(a.stage),
      prepared_by: nn(a.prepared_by), approver: nn(a.approver), approver_email: nn(ct.email), approver_phone: nn(ct.phone), status: a.status, created_at: nn(a.created_at), expires_at: nn(a.expires_at), expiry_days: nn(a.expiry_days),
      decided_at: nn(a.decided_at), decided_by: nn(a.decided_by), decision_note: nn(a.decision_note), decision_via: nn(a.decision_via), seen_by_requester: a.seen_by_requester === undefined ? null : !!a.seen_by_requester,
      payload_gate: nn(pl.gate), payload_decision: nn(pl.decision), payload_rationale: nn(pl.rationale), payload_recycle_to: nn(pl.recycle_to), payload_request: nn(pl.request), payload_waiver: nn(pl.waiver),
      payload_criterion: nn(pl.criterion), payload_role: nn(pl.role), payload_note: nn(pl.note), payload_story: nn(pl.story),
    });
    (pl.conditions || []).forEach((cd: Row, n: number) => {
      if (!isObj(cd)) throw new Error(`approval ${a.id}: a condition must be a record`);
      unknownKeys(`approval ${a.id} condition`, cd, new Set(['title', 'text', 'owner', 'must_close_by_gate', 'tracks']));
      put(set, 'approval_conditions', { product_id: id, approval_id: a.id, position: n, title: nn(cd.title), text: nn(cd.text), owner: nn(cd.owner), must_close_by_gate: nn(cd.must_close_by_gate), tracks: nn(cd.tracks) });
    });
    (a.audit || []).forEach((ev: Row, n: number) => {
      unknownKeys(`approval ${a.id} event`, ev, new Set(['at', 'event', 'by', 'via', 'ua', 'note']));
      put(set, 'approval_events', { product_id: id, approval_id: a.id, position: n, at: nn(ev.at), event: nn(ev.event), by: nn(ev.by), via: nn(ev.via), ua: nn(ev.ua), note: nn(ev.note) });
    });
  });

  // assistant inbox and flagged answers
  (d.inbox || []).forEach((p: Row, i: number) => {
    unknownKeys(`proposal ${p.id}`, p, PROP_KNOWN); // `conflicts` is accepted but not stored: it is worked out again from the items when proposals are made
    const item = p.item || {}, ptr = p.pointer || {}, res = p.result;
    unknownKeys(`proposal ${p.id} item`, item, new Set(['type', 'subtype', 'fields']));
    unknownKeys(`proposal ${p.id} pointer`, ptr, new Set(['locator', 'quote']));
    if (res) unknownKeys(`proposal ${p.id} result`, res, new Set(['item', 'created', 'pointer', 'verification']));
    if (p.from_pasted) unknownKeys(`proposal ${p.id} from_pasted`, p.from_pasted, new Set(['by', 'at']));
    put(set, 'inbox_proposals', {
      product_id: id, id: p.id, position: i, attachment: nn(p.attachment), goal: nn(p.goal), status: p.status, kind: nn(p.kind), competitor_id: nn(p.competitor_id), item_type: nn(item.type), item_subtype: nn(item.subtype),
      where_text: nn(p.where), quote: nn(ptr.quote), ...locatorCols(ptr.locator, `proposal ${p.id}`), confidence: nn(p.confidence), reason: nn(p.reason), source: nn(p.source), proposed_by: nn(p.proposed_by), proposed_at: nn(p.proposed_at),
      from_pasted_by: p.from_pasted ? nn(p.from_pasted.by) : null, from_pasted_at: p.from_pasted ? nn(p.from_pasted.at) : null, flags: strList(p.flags, 'flags'), reviewed_by: nn(p.reviewed_by), reviewed_at: nn(p.reviewed_at),
      reject_reason: nn(p.reject_reason), edited_by: nn(p.edited_by), edited_at: nn(p.edited_at),
      result_item: res ? nn(res.item) : null, result_created: res ? strList(res.created, 'result.created') : null, result_pointer: res ? nn(res.pointer) : null, result_verification: res ? nn(res.verification) : null,
    });
    for (const r of kvRows(item.fields, `proposal ${p.id} fields`, { product_id: id, proposal_id: p.id })) put(set, 'inbox_item_fields', r);
    (p.also_seen || []).forEach((x: Row, n: number) => { unknownKeys('also_seen', x, new Set(['where', 'quote'])); put(set, 'inbox_also_seen', { product_id: id, proposal_id: p.id, position: n, where_text: nn(x.where), quote: nn(x.quote) }); });
    (p.edits || []).forEach((x: Row, n: number) => { unknownKeys('proposal edit', x, new Set(['by', 'at', 'changed'])); put(set, 'inbox_edits', { product_id: id, proposal_id: p.id, position: n, by: nn(x.by), at: nn(x.at), changed: strList(x.changed, 'changed') }); });
  });
  (d.hallucinations || []).forEach((h: Row, i: number) => {
    unknownKeys('flagged answer', h, new Set(['at', 'attachment', 'goal', 'source', 'quote', 'locator', 'reason']));
    put(set, 'hallucinations', { product_id: id, position: i, at: nn(h.at), attachment: nn(h.attachment), goal: nn(h.goal), source: nn(h.source), quote: nn(h.quote), ...locatorCols(h.locator, 'flagged answer'), reason: nn(h.reason) });
  });

  const audit = (d.audit || []).map((a: Row) => {
    unknownKeys('audit entry', a, AUDIT_KNOWN);
    return { product_id: id, at: a.at, action: a.action, subject: nn(a.subject), actor: nn(a.actor), summary: a.summary ?? '', details: a.details || {} };
  });
  return { rows: set, audit };
}

function encodeField(col: ColSpec, v: any, what: string) {
  if (v === undefined || v === null) return null;
  if (col.type === 'TEXT[]') return strList(v, what);
  return v;
}

// ---------------------------------------------------------------- rows -> product
const byPos = (a: Row, b: Row) => a.position - b.position;
const omitNull = (o: Row) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));

export function rowsToProduct(set: TableSet, auditRows: { row: Row; details: Row[] }[]): ProductBundle {
  const p = rowsOf(set, 'products')[0];
  if (!p) throw new Error('product row missing');
  const id: string = p.id;
  const extras = rowsOf(set, 'product_extra_fields');
  const entryExtra = kvObject(extras.filter((r) => !r.key.startsWith('meta.')));
  const metaExtra = Object.fromEntries(extras.filter((r) => r.key.startsWith('meta.')).map((r) => [r.key.slice(5), fromKv(r)]));
  const entry: Row = {
    id, slug: p.slug, name: p.name, one_liner: p.one_liner, kind: p.kind, owner: p.owner, stage: p.stage, stage_since: p.stage_since, depth_level: p.depth_level, mode: p.mode,
    created_at: p.created_at, archived: p.archived, stage_override: p.stage_override, seed: p.seed,
    ...omitNull({ parked_from: p.parked_from }),
    ...entryExtra,
  };
  const idea = omitNull({ who_for: p.idea_who_for, why_now: p.idea_why_now, asked_by: p.idea_asked_by, filled_on: p.idea_filled_on });
  if (Object.keys(idea).length) entry.idea = idea;

  const fx: Row = {};
  for (const r of rowsOf(set, 'product_fx')) fx[r.currency] = r.rate;
  if (p.fx_date !== null) fx.date = p.fx_date;
  if (p.fx_source !== null) fx.source = p.fx_source;
  const settings: Row = {
    ...omitNull({ asOf: p.as_of, suspectDepth: p.suspect_depth }),
    params: kvObject(rowsOf(set, 'product_params')),
    ...(Object.keys(fx).length ? { fx } : {}),
    ...kvObject(rowsOf(set, 'product_setting_extras')),
  };
  const counters = Object.fromEntries(rowsOf(set, 'product_counters').map((r) => [r.prefix, r.value]));

  const gates: Row = {};
  for (const g of rowsOf(set, 'gate_decisions').sort((a, b) => a.gate - b.gate)) {
    const rec: Row = { gate: g.gate, decision: g.decision, state: g.state, decided_at: g.decided_at, decided_by: g.decided_by, rationale: g.rationale, depth: g.depth };
    if (g.snapshot_readiness !== null || g.snapshot_failed !== null) {
      rec.snapshot = { readiness: g.snapshot_readiness, mustOk: g.snapshot_must_ok, mustTotal: g.snapshot_must_total, failed: g.snapshot_failed || [], waived: g.snapshot_waived || [], pendingShould: g.snapshot_pending_should || [] };
    }
    rec.conditions = g.conditions || [];
    rec.baseline_id = g.baseline_id;
    Object.assign(rec, omitNull({ approved_by: g.approved_by, submitted_by: g.submitted_by, hold_review_by: g.hold_review_by, recycle_to: g.recycle_to }));
    gates[String(g.gate)] = rec;
  }
  const strip = (r: Row, drop: string[]) => Object.fromEntries(Object.entries(r).filter(([k]) => !drop.includes(k)));
  const baselines = rowsOf(set, 'baselines').sort(byPos).map((r) => strip(r, ['product_id', 'position']));
  const attestations = rowsOf(set, 'attestations').sort(byPos).map((r) => strip(r, ['product_id', 'position']));
  const ingests = rowsOf(set, 'ingests').sort(byPos).map((r) => ({ ...strip(r, ['product_id', 'position']), source_urls: r.source_urls || [], items: r.items || [], links: r.links || [] }));
  const requestState: Row = {};
  for (const r of rowsOf(set, 'request_states')) {
    const o = omitNull(strip(r, ['product_id', 'request_id']));
    requestState[r.request_id] = o;
  }

  // items: common columns + the type's own table + extras
  const typedRows = new Map<string, Row>();
  for (const tt of TYPE_TABLES) for (const r of rowsOf(set, tt.spec.table)) typedRows.set(r.id, r);
  const extraByItem = new Map<string, Row[]>();
  for (const r of rowsOf(set, 'item_extra_fields')) (extraByItem.get(r.item_id) || extraByItem.set(r.item_id, []).get(r.item_id)!).push(r);
  const items: Row = {};
  for (const r of rowsOf(set, 'items').sort(byPos)) {
    const it: Row = { id: r.id, type: r.type };
    for (const c of ITEM_FLAT) if (r[c] !== null || KEEP_NULL_ITEM.has(c)) it[c] = r[c]; // the engine sets `verification` to an explicit null
    it.phase = /^\d+$/.test(r.phase) ? Number(r.phase) : r.phase;
    const prov = omitNull(Object.fromEntries(Object.entries(PROV_FIELDS).map(([col, key]) => [key, r[col]])));
    if (Object.keys(prov).length) it.provenance = prov;
    const tt = TYPE_TABLE.get(r.type)!;
    const tr = typedRows.get(r.id);
    if (tr) for (const name of tt.fields.keys()) if (tr[name] !== null && tr[name] !== undefined) it[name] = tr[name];
    Object.assign(it, kvObject(extraByItem.get(r.id) || []));
    items[r.id] = it;
  }

  // links
  const attrsBy = new Map<string, Row[]>(), fpBy = new Map<string, Row[]>();
  for (const r of rowsOf(set, 'link_attrs')) (attrsBy.get(r.link_id) || attrsBy.set(r.link_id, []).get(r.link_id)!).push(r);
  for (const r of rowsOf(set, 'link_fingerprints')) (fpBy.get(r.link_id) || fpBy.set(r.link_id, []).get(r.link_id)!).push(r);
  const linkList = rowsOf(set, 'links').sort(byPos).map((r) => {
    const l: Row = { id: r.id, type: r.type, source: r.source, target: r.target, attrs: kvObject(attrsBy.get(r.id) || []), state: r.state, created_at: r.created_at, created_by: r.created_by };
    l.fp_at_link = Object.fromEntries((fpBy.get(r.id) || []).map((x) => [x.item_id, x.fp]));
    if (r.suspect_since !== null) l.suspect_since = r.suspect_since;
    if (r.cause_item !== null || r.cause_at !== null) l.cause = { item: r.cause_item, fields: r.cause_fields || [], at: r.cause_at, by: r.cause_by };
    return l;
  });

  // documents
  const histBy = new Map<string, Row[]>();
  for (const r of rowsOf(set, 'document_history').sort(byPos)) (histBy.get(r.doc_key) || histBy.set(r.doc_key, []).get(r.doc_key)!).push(r);
  const documents: Row = {};
  for (const r of rowsOf(set, 'document_records')) {
    const rec: Row = { history: (histBy.get(r.doc_key) || []).map((h) => ({ ...omitNull({ status: h.status, role: h.role, by: h.by, at: h.at, note: h.note, completeness: h.completeness }), waiver: waiverOf(h) })) };
    if (r.status !== null) rec.status = r.status;
    if (r.approved_at !== null) rec.approved_at = r.approved_at;
    if (r.approved_by !== null) rec.approved_by = r.approved_by;
    const w = waiverOf(r); if (w) rec.waiver = w;
    documents[r.doc_key] = rec;
  }

  // approvals
  const condBy = new Map<string, Row[]>(), evBy = new Map<string, Row[]>();
  for (const r of rowsOf(set, 'approval_conditions').sort(byPos)) (condBy.get(r.approval_id) || condBy.set(r.approval_id, []).get(r.approval_id)!).push(r);
  for (const r of rowsOf(set, 'approval_events').sort(byPos)) (evBy.get(r.approval_id) || evBy.set(r.approval_id, []).get(r.approval_id)!).push(r);
  const approvals = rowsOf(set, 'approvals').sort(byPos).map((r) => {
    const payload: Row = omitNull({ gate: r.payload_gate, decision: r.payload_decision, rationale: r.payload_rationale, recycle_to: r.payload_recycle_to, request: r.payload_request, waiver: r.payload_waiver, criterion: r.payload_criterion, role: r.payload_role, note: r.payload_note, story: r.payload_story });
    if (r.payload_decision !== null) payload.conditions = (condBy.get(r.id) || []).map((c) => omitNull(strip(c, ['product_id', 'approval_id', 'position'])));
    return {
      id: r.id, token: r.token, kind: r.kind, subject: r.subject, title: r.title, statement: r.statement, product_name: r.product_name, stage: r.stage !== null && /^\d+$/.test(r.stage) ? Number(r.stage) : r.stage,
      prepared_by: r.prepared_by, approver: r.approver, approver_contact: { email: r.approver_email, phone: r.approver_phone }, status: r.status, created_at: r.created_at, expires_at: r.expires_at, expiry_days: r.expiry_days,
      ...omitNull({ decided_at: r.decided_at, decided_by: r.decided_by, decision_note: r.decision_note, decision_via: r.decision_via, seen_by_requester: r.seen_by_requester }),
      payload, audit: (evBy.get(r.id) || []).map((e) => omitNull(strip(e, ['product_id', 'approval_id', 'position']))),
    };
  });

  // assistant inbox and flagged answers
  const fieldsBy = new Map<string, Row[]>(), seenBy = new Map<string, Row[]>(), editsBy = new Map<string, Row[]>();
  for (const r of rowsOf(set, 'inbox_item_fields')) (fieldsBy.get(r.proposal_id) || fieldsBy.set(r.proposal_id, []).get(r.proposal_id)!).push(r);
  for (const r of rowsOf(set, 'inbox_also_seen').sort(byPos)) (seenBy.get(r.proposal_id) || seenBy.set(r.proposal_id, []).get(r.proposal_id)!).push(r);
  for (const r of rowsOf(set, 'inbox_edits').sort(byPos)) (editsBy.get(r.proposal_id) || editsBy.set(r.proposal_id, []).get(r.proposal_id)!).push(r);
  const inbox = rowsOf(set, 'inbox_proposals').sort(byPos).map((r) => {
    const p: Row = {
      id: r.id, attachment: r.attachment, goal: r.goal, status: r.status, kind: r.kind, competitor_id: r.competitor_id,
      item: { type: r.item_type, ...omitNull({ subtype: r.item_subtype }), fields: kvObject(fieldsBy.get(r.id) || []) },
      pointer: { locator: locatorOf(r), quote: r.quote }, where: r.where_text, confidence: r.confidence, reason: r.reason, source: r.source, proposed_by: r.proposed_by, proposed_at: r.proposed_at,
    };
    if (r.from_pasted_by !== null || r.from_pasted_at !== null) p.from_pasted = { by: r.from_pasted_by, at: r.from_pasted_at };
    if (seenBy.has(r.id)) p.also_seen = seenBy.get(r.id)!.map((x) => ({ where: x.where_text, quote: x.quote }));
    if (r.flags !== null) p.flags = r.flags;
    Object.assign(p, omitNull({ reviewed_by: r.reviewed_by, reviewed_at: r.reviewed_at, reject_reason: r.reject_reason, edited_by: r.edited_by, edited_at: r.edited_at }));
    if (r.result_item !== null || r.result_created !== null || r.result_pointer !== null) p.result = { item: r.result_item, created: r.result_created || [], pointer: r.result_pointer, verification: r.result_verification };
    if (editsBy.has(r.id)) p.edits = editsBy.get(r.id)!.map((x) => ({ by: x.by, at: x.at, changed: x.changed || [] }));
    return p;
  });
  const hallucinations = rowsOf(set, 'hallucinations').sort(byPos).map((r) => ({ at: r.at, attachment: r.attachment, goal: r.goal, source: r.source, quote: r.quote, locator: locatorOf(r), reason: r.reason }));

  const audit = auditRows.map(({ row, details }) => ({ at: row.at, action: row.action, subject: row.subject, summary: row.summary, actor: row.actor, details: kvObject(details) }));
  const data: Row = {
    version: p.store_version,
    meta: omitNull({ productId: p.meta_product_id, createdAt: p.meta_created_at, seedVersion: p.meta_seed_version, ...metaExtra }),
    settings, counters, items, linkList, gates, baselines, attestations, requestState, ingests, demo: { index: p.demo_index }, audit,
  };
  if (Object.keys(documents).length) data.documents = documents;
  if (approvals.length) data.approvals = approvals;
  if (inbox.length) data.inbox = inbox;
  if (hallucinations.length) data.hallucinations = hallucinations;
  return { entry, data };
}
