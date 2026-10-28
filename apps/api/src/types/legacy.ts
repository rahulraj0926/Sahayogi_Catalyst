/** Typed view of the parts of the legacy (JavaScript) lifecycle engine that the new Nest modules use. Grow this as engine files are ported. */

export type StageKey = 'idea' | 'P0' | 'P1' | 'P2' | 'P3' | 'P4' | 'handoff' | 'done' | 'parked';
export type ProductKind = 'software' | 'hardware' | 'service';

export interface ProductEntry {
  id: string;
  /** URL name, e.g. sahayogi-cdn. Stable once given. */
  slug?: string;
  name: string;
  one_liner: string;
  kind: ProductKind;
  owner: string;
  mode: string;
  depth_level: string;
  stage: StageKey;
  stage_since: string | null;
  created_at: string;
  archived: boolean;
}

/** innovation = a draft the pitcher is still filling in (the CEO does not see it); new and shortlisted wait for the CEO. */
export type IdeaStatus = 'innovation' | 'new' | 'shortlisted' | 'rejected' | 'promoted';

/** A competitor the pitcher listed, with the result of the check that proved its website exists. */
export interface IdeaCompetitorRecord {
  id: string;
  name: string;
  website: string;
  note: string | null;
  demo_url: string | null;
  check: { status: 'verified' | 'responded'; http_status: number; title: string | null; final_url: string; checked_at: string };
}

export interface IdeaRecord {
  id: string;
  one_liner: string;
  text: string;
  requester: string;
  created_on: string;
  status: IdeaStatus;
  kind: ProductKind;
  product_id: string | null;
  origin: string;
  decided_by?: string;
  decided_at?: string;
  reject_reason?: string;
  problem?: string;
  who_for?: string;
  demo_url?: string;
  competitors?: IdeaCompetitorRecord[];
}

/** Subset of summary.portfolioRow() the Home screens read. */
export interface PortfolioRow {
  id: string;
  stage: StageKey;
  stage_label: string;
  days_in_stage: number | null;
  current_phase: number;
  readiness_percent: number;
  blocker_count: number;
  what_happens_next: string;
  open_must_questions: number;
  stale_values: number;
  due_values: number;
  suspect_items: number;
  human_minutes_owed: number;
  last_activity: string | null;
  days_since_activity: number | null;
  documents_approved: number;
  documents_total: number;
  items: number;
}

export interface AuditRecord { at: string; action: string; subject: string | null; summary: string; actor: string | null }

export interface ApprovalRecord { id: string; kind: string; title: string; approver: string; status: string; expires_at: string }

export interface GateRecord { decision?: string; decided_at?: string; decided_by?: string; state?: string }

/** The slice of a per-product engine Store used here. */
export interface StoreLike {
  _saves?: number;
  data: { audit: AuditRecord[]; approvals?: ApprovalRecord[]; gates: Record<string, GateRecord> };
  all(): Array<{ phase: number | string; type: string }>;
  links(): unknown[];
  today(): string;
  now(): string;
}

/** The slice of the engine Portfolio used here. */
export interface PortfolioLike {
  reg: { ideas: IdeaRecord[]; products: ProductEntry[] };
  cache: Map<string, StoreLike>;
  today(): string;
  now(): string;
  list(opts?: { includeArchived?: boolean }): ProductEntry[];
  /** By id or slug. */
  get(id: string): ProductEntry | null;
  store(id: string): StoreLike;
  ideas(): IdeaRecord[];
  idea(id: string): IdeaRecord;
  addIdea(f: Record<string, unknown>, actor: string): IdeaRecord;
  updateIdea(id: string, patch: Record<string, unknown>, actor?: string): IdeaRecord;
  promote(id: string, f: Record<string, unknown>, actor: string): { idea: IdeaRecord; product: ProductEntry };
  systemEvent(action: string, subject: string | null, actor: string | null | undefined, summary: string): void;
  saveRegistry(): boolean;
  syncAll(): void;
}
