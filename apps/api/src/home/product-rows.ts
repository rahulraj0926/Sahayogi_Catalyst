import { engine } from '../engine-port/legacy';
import type { PortfolioLike, ProductEntry, StageKey, StoreLike } from '../types/legacy';
import type { Health, HomeProductDto } from './dto/home.dto';

const PHASES = engine.lifecycle.PHASES;
const CAP = 5000;
const TTL_MS = 5 * 60_000;
const IDLE_DAYS = 14;

const SIGNED = ['Passed', 'Passed-with-conditions'];

/** The lifecycle phase (0 to 12) a product is in: the first phase whose sign-off has not happened yet (12 when all are signed). */
export function phaseOf(store: StoreLike) {
  let id = 0;
  while (id < PHASES.length - 1 && SIGNED.includes(store.data.gates[id]?.state || '')) id++;
  const ph = PHASES[id];
  return { id: ph.id, name: ph.name, short: ph.short };
}

export function healthOf(r: { blocker_count: number; days_since_activity: number | null; stale_values: number; due_values: number; suspect_items: number; open_must_questions: number }, active: boolean): Health {
  if (!active) return 'on_track';
  if (r.blocker_count > 0) return 'blocked';
  if (r.days_since_activity !== null && r.days_since_activity >= IDLE_DAYS) return 'idle';
  if (r.stale_values + r.suspect_items + r.open_must_questions > 0) return 'attention';
  return 'on_track';
}

export const isActive = (s: StageKey) => !['done', 'parked', 'idea'].includes(s);

/** Waiting approvals of a product (cheap: reads the approvals list only). */
export function waitingApprovals(store: StoreLike): number {
  const now = Date.parse(store.now());
  let n = 0;
  for (const a of store.data.approvals || []) if (a.status === 'waiting' && Date.parse(a.expires_at) >= now) n++;
  return n;
}

interface Entry { key: string; at: number; row: HomeProductDto }

/**
 * Memoises the (expensive) per-product summary. The key changes whenever the product is saved, so a row is recomputed only after
 * that product changed. Bounded: oldest rows drop out first. Safe to share across requests (rows are plain data).
 */
export class ProductRowCache {
  private readonly map = new Map<string, Entry>();
  hits = 0;
  misses = 0;

  private keyOf(pf: PortfolioLike, entry: ProductEntry, store: StoreLike): string {
    const a = store.data.audit;
    return [entry.slug, entry.stage, entry.owner, entry.name, entry.kind, store._saves || 0, a.length, a.length ? a[a.length - 1].at : '', store.all().length, store.links().length, pf.today()].join('|');
  }

  row(pf: PortfolioLike, entry: ProductEntry): HomeProductDto {
    const store = pf.store(entry.id);
    const key = this.keyOf(pf, entry, store);
    const hit = this.map.get(entry.id);
    const now = Date.now();
    const approvalsWaiting = waitingApprovals(store);
    if (hit && hit.key === key && now - hit.at < TTL_MS) { this.hits++; return { ...hit.row, approvalsWaiting }; }
    this.misses++;
    const r = engine.summary.portfolioRow(entry, store, { today: pf.today() });
    const row: HomeProductDto = {
      id: entry.id, slug: entry.slug || entry.id, name: entry.name, oneLiner: entry.one_liner || '', kind: entry.kind, owner: entry.owner || '',
      stage: entry.stage, stageLabel: r.stage_label, phase: phaseOf(store), readinessPercent: r.readiness_percent,
      health: healthOf(r, isActive(entry.stage)), blockers: r.blocker_count, openQuestions: r.open_must_questions, approvalsWaiting,
      staleValues: r.stale_values + r.due_values, minutesOwed: r.human_minutes_owed,
      daysInStage: r.days_in_stage, daysSinceActivity: r.days_since_activity, lastActivity: r.last_activity, nextStep: r.what_happens_next || '',
      documents: { approved: r.documents_approved, total: r.documents_total },
    };
    this.map.delete(entry.id);
    this.map.set(entry.id, { key, at: now, row });
    if (this.map.size > CAP) this.map.delete(this.map.keys().next().value as string);
    return row;
  }

  forget(id: string) { this.map.delete(id); }
  get size() { return this.map.size; }
}
