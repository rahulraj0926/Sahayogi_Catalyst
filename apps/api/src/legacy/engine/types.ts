/**
 * Shared TypeScript types for the legacy lifecycle engine (schema, links, Store, gates).
 * Type-only module: nothing here is imported at runtime by the still-CommonJS engine files.
 * Paired `*.d.ts` files next to the JS engine modules (schema.d.ts, links.d.ts, store.d.ts,
 * gates.d.ts) use these so new TypeScript code gets real types without converting the JS yet.
 */

export type ItemOrigin = 'human' | 'document' | 'agent' | 'assistant' | 'derived' | 'invented';
export type VerificationState = 'unverified' | 'verified' | 'rejected';
export type DepthLevel = 'L1' | 'L2' | 'L3';
export type Grade = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type Phase = number | 'X';

/** A lifecycle item (Product, Requirement, Story, ...). Type-specific fields are schema-driven. */
export interface Item {
  id: string;
  type: string;
  subtype?: string;
  title?: string;
  status: string;
  phase: Phase;
  origin: ItemOrigin;
  verification?: VerificationState | null;
  proposed_by?: string | null;
  verified_by?: string | null;
  verified_on?: string | null;
  verified_note?: string | null;
  requested_by?: string | null;
  agent?: string | null;
  provenance?: unknown;
  suspect?: unknown;
  rev: number;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  note?: string;
  v2Ref?: string[];
  invented_note?: string;
  fp?: string;
  request_id?: string;
  seed?: unknown;
  drafted_text?: string;
  kept_as_drafted?: boolean;
  kept_by?: string;
  kept_on?: string;
  edited_by?: string;
  edited_on?: string;
  approved_by?: string;
  completed_by?: string;
  completed_on?: string;
  // schema-driven, type-specific fields:
  [field: string]: unknown;
}

export type FieldKind = 'text' | 'longtext' | 'enum' | 'number' | 'date' | 'bool' | 'ref' | 'refs' | 'list';

export interface FieldDef {
  name: string;
  kind: FieldKind;
  label: string;
  required?: boolean;
  help?: string;
  values?: readonly (string | number)[];
  to?: readonly string[];
  unit?: string | null;
  integer?: boolean;
  min?: number;
  max?: number;
  derived?: boolean;
  subtypes?: readonly string[];
  hidden?: boolean;
}

export interface ItemSubtypeDef {
  prefix: string;
}

export interface ItemTypeDef {
  name: string;
  prefix: string | null;
  phase: Phase;
  v2Ref: string[];
  statuses: readonly string[];
  fields: FieldDef[];
  fieldMap: Record<string, FieldDef>;
  suspectFields: string[];
  initialStatus: string;
  countedStatuses: string[];
  uiAlias?: string;
  subtypes?: Record<string, ItemSubtypeDef>;
  subtypeRequired?: Record<string, string[]>;
}

export interface SchemaDescribeTypeDef {
  name: string;
  prefix: string | null;
  phase: Phase;
  statuses: readonly string[];
  v2Ref: string[];
  uiAlias: string | null;
  subtypes: Record<string, { prefix: string; required: string[] }> | null;
  fields: FieldDef[];
  countedStatuses: string[];
}

export interface SchemaDescribe {
  types: Record<string, SchemaDescribeTypeDef>;
  enums: Record<string, readonly (string | number)[]>;
  terminal: string[];
  approvedLike: string[];
}

export interface LinkAttrDef {
  name: string;
  kind: 'enum' | 'text';
  values?: string[];
  default?: string;
  required?: boolean;
}

export type LinkPropagation = 'TS' | 'ST' | 'BOTH' | 'INFO';
export type LinkCardinality = 'N:M' | 'N:1' | '1:N' | '1:1';

export interface LinkDef {
  name: string;
  inverse: string;
  pairs: Array<[readonly string[], readonly string[]]>;
  card: LinkCardinality;
  propagation: LinkPropagation;
  attrs: LinkAttrDef[];
  v2Ref: string[];
  v2Note?: string;
  description?: string;
  coverage?: string[];
  longRange?: boolean;
  sameType?: boolean;
  edgeKey?: string;
}

export interface LinkDescribe {
  name: string;
  inverse: string;
  card: LinkCardinality;
  propagation: LinkPropagation;
  v2Ref: string[];
  v2Note: string | null;
  pairs: Array<{ sources: readonly string[]; targets: readonly string[] }>;
  attrs: LinkAttrDef[];
  coverage: string[];
  longRange: boolean;
  description?: string;
}

/** A stored link between two items (or a virtual Gate / FlowEdge id). */
export interface Link {
  id: string;
  type: string;
  source: string;
  target: string;
  attrs: Record<string, unknown>;
  state: 'valid' | string;
  created_at: string;
  created_by?: string | null;
}

export interface AuditEntry {
  at: string;
  action: string;
  subject: string | null;
  summary: string;
  actor: string | null;
  details: Record<string, unknown>;
}

export interface StoreSettings {
  asOf: string | null;
  suspectDepth: number;
  params: Record<string, unknown>;
  fx: Record<string, number>;
  utilisation: unknown;
  [extra: string]: unknown;
}

export interface Baseline {
  id: string;
  gate: number;
  purpose: string;
  created_at: string;
  created_by: string | null;
  item_count: number;
  approved_count: number;
  hash: string;
  parent: string | null;
}

export interface Attestation {
  id: string;
  criterion: string;
  gate: number;
  role: string;
  by: string;
  at: string;
  note: string;
  evidence_ref: string | null;
  expires_on: string | null;
}

/** Shape of `Store.data` (also what gets persisted to Postgres, column by column). */
export interface StoreData {
  version: number;
  meta: { productId: string | null; createdAt: string; seedVersion: string | null };
  settings: StoreSettings;
  counters: Record<string, number>;
  items: Record<string, Item>;
  linkList: Link[];
  gates: Record<number, GateDecisionRecord>;
  baselines: Baseline[];
  attestations: Attestation[];
  requestState: Record<string, unknown>;
  ingests: unknown[];
  audit: AuditEntry[];
  demo: { index: number };
  approvals?: unknown[];
}

export type GateDecisionKind = 'go' | 'go_with_conditions' | 'hold' | 'recycle' | 'stop';
export type GateState = 'Open' | 'Passed' | 'Passed-with-conditions' | 'Held' | 'Recycled' | 'Killed' | 'Reopened';

export interface GateDecisionRecord {
  gate: number;
  decision: GateDecisionKind;
  state: GateState | null;
  decided_at: string;
  decided_by: string;
  rationale: string;
  depth: DepthLevel;
  snapshot: Record<string, unknown>;
  conditions: string[];
  baseline_id: string | null;
  approved_by?: string;
  submitted_by?: string;
  warning?: string;
  recycle_to?: number;
  hold_review_by?: string;
}

export type CriterionStatus = 'PASS' | 'FAIL' | 'ATTEST_PENDING' | 'WAIVED' | 'NA';
export type CriterionSeverity = 'must' | 'should';

export interface GateOffender {
  id: string;
  title: string;
  type: string;
  reason: string;
  left?: number;
  right?: number;
}

export interface GateCriterionResult {
  id: string;
  gate: number | 'C';
  text: string;
  type: string;
  severity: CriterionSeverity;
  depth_level: DepthLevel;
  v2Ref: string[];
  waivable: boolean;
  offenders: GateOffender[];
  status: CriterionStatus;
  message: string;
  value?: number | null;
  threshold?: number | null;
  na_reason?: string;
  error?: boolean;
  attest_required?: unknown;
  attested?: Attestation | null;
  waiver?: { id: string; approver: string; expiry_on?: string; rationale: string; subjects: string[] };
  override?: boolean;
  extra?: Record<string, unknown>;
  parts?: Array<{ pass: boolean; message: string }>;
}

export interface GateSummary {
  must: Record<CriterionStatus, number>;
  should: Record<CriterionStatus, number>;
  total: number;
  evaluated: number;
  notEvaluated: number;
  passed: number;
  failed: number;
  pending: number;
  waived: number;
  readiness: number;
  readiness_raw?: number;
  written?: number;
  mustTotal: number;
  mustOk: number;
}

export interface GateBlocker {
  id: string;
  text: string;
  status: CriterionStatus;
  message: string;
  offenders: number;
}

export interface GateEvaluation {
  gate: number;
  name: string;
  depth: DepthLevel;
  results: GateCriterionResult[];
  summary: GateSummary;
  eligible: GateDecisionKind[];
  eligibleReason: string;
  state: GateState;
  live_state: 'at_risk' | 'consistent' | null;
  decision: GateDecisionRecord | null;
  today: string;
  blockers: GateBlocker[];
}

export interface EligibleDecisions {
  decisions: GateDecisionKind[];
  reason: string;
}

export interface DepthEffectRow {
  depth: DepthLevel;
  evaluated: number;
  mustOk: number;
  mustTotal: number;
  failed: number;
  pending: number;
  waived: number;
  readiness: number;
  blockers: string[];
}

/** Payload accepted by `gates.decide`. */
export interface GateDecidePayload {
  rationale?: string;
  conditions?: Array<{ title?: string; text: string; owner?: string; must_close_by_gate?: number; tracks?: string }>;
  recycle_to?: number;
  approver?: string;
  submitted_by?: string;
  enforce_second_person?: boolean;
  dry_run?: boolean;
}

export interface GateAttestPayload {
  criterion: string;
  by?: string;
  role: string;
  note?: string;
  evidence_ref?: string;
  expires_on?: string;
  gate?: number;
}

export interface GateWaivePayload {
  criterion_id: string;
  approver: string;
  approver_role?: string;
  rationale: string;
  requested_by?: string;
  subjects?: string[];
  expiry_on?: string;
  expiry_gate?: number;
  linked_risk?: string;
  gate?: number;
  pending?: boolean;
}
