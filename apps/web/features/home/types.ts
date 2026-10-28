/** Shapes returned by /api/v1/home/* and /api/v1/ideas (see docs/api/openapi.v1.json). Replace with generated types in hardening step 5. */
export type KpiStatus = 'healthy' | 'warning' | 'critical' | 'info' | 'neutral';
export type Health = 'on_track' | 'attention' | 'blocked' | 'idle';
export type Kind = 'software' | 'hardware' | 'service';

export interface Kpi { key: string; label: string; value: number; unit: 'count' | 'percent' | 'minutes'; status: KpiStatus; note: string; href?: string; group: 'primary' | 'secondary' }
export interface Kpis { asOf: string; kpis: Kpi[] }

export interface HomeProduct {
  id: string; slug: string; name: string; oneLiner: string; kind: Kind; owner: string; stage: string; stageLabel: string;
  phase: { id: number; name: string; short: string }; readinessPercent: number; health: Health;
  blockers: number; openQuestions: number; approvalsWaiting: number; staleValues: number; minutesOwed: number;
  daysInStage: number | null; daysSinceActivity: number | null; lastActivity: string | null; nextStep: string;
  documents: { approved: number; total: number };
}
export interface ProductsPage { data: HomeProduct[]; meta: { page: number; limit: number; total: number; totalPages: number }; owners: string[] }

export type SortKey = 'name' | 'stage' | 'phase' | 'readiness' | 'owner' | 'activity';
export interface ProductFilters { q: string; stage: string; kind: string; health: string; owner: string; /** comma list of phase numbers, filtered in the browser */ phase: string; /** readiness band 0-25 | 25-50 | 50-75 | 75-100, filtered in the browser */ ready: string; sort: SortKey; order: 'asc' | 'desc'; page: number }

export type EventKind = 'approval_expires' | 'gate_decision' | 'stage_entered' | 'idea_submitted' | 'product_created';
export interface CalendarEvent { id: string; date: string; kind: EventKind; title: string; productId?: string; productSlug?: string; productName?: string; href?: string }
export interface Calendar { from: string; to: string; events: CalendarEvent[]; truncated: boolean }

export interface Activity { id: string; at: string; actor: string | null; action: string; text: string; productId: string; productSlug: string; productName: string }
export interface ActivityPage { data: Activity[]; next: string | null }

/** A rival the pitcher added in the Innovation step. The server opened its website before it was saved. */
export interface IdeaCompetitor {
  id: string; name: string; website: string; note: string | null; demo_url: string | null;
  check: { status: 'verified' | 'responded'; http_status: number; title: string | null; final_url: string; checked_at: string };
}
/** What an idea still needs before it can go to the CEO (only while it is in the Innovation step). */
export interface IdeaDoor { problem: boolean; who_for: boolean; competitors: { have: number; need: number }; ready: boolean }
export interface Idea {
  id: string; one_liner: string; text: string; requester: string; created_on: string; kind: Kind; product_id: string | null; decided_by?: string; reject_reason?: string;
  /** innovation = still being prepared by the person who pitched it; the CEO sees an idea only after it is sent (new). */
  status: 'innovation' | 'new' | 'shortlisted' | 'rejected' | 'promoted';
  problem?: string | null; who_for?: string | null; demo_url?: string | null; competitors?: IdeaCompetitor[]; door?: IdeaDoor | null;
}
export interface IdeaList { total: number; data: Idea[] }
export interface Me { actor: string | null; roles: string[]; canDecideIdeas: boolean }
