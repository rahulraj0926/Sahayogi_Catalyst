/**
 * engine/freshness.ts - evidence age and competitor-value freshness (spec rule E1, competitor design section 6).
 * States: fresh -> due (past refresh interval) -> stale (past maximum age; excluded from outputs).
 */
import { ownerOf } from './competitor_owner';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { daysBetween } from './units';

interface Cadence { refresh: number; max: number }
interface Dims { evidenceMaxAgeDays: Record<string, number>; dimensions: Record<string, Record<string, Cadence>> }
export interface Freshness { state: 'fresh' | 'due' | 'stale' | 'unknown'; ageDays: number | null; maxDays?: number | null; refreshDays?: number; tier?: string; dimension?: string; reason: string | null }
/** The slice of the engine Store used here. */
interface StoreLike { inn(id: string, type: string): Array<{ source: string }>; get(id: string): { type: string; tier?: string } | undefined }

let DIMS: Dims | null = null;
export function dims(): Dims {
  if (!DIMS) DIMS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'dimensions.json'), 'utf8'));
  return DIMS as Dims;
}

/** Evidence freshness. Returns {state, ageDays, maxDays}. */
export function evidenceState(ev: any, today: string): Freshness {
  const ref = ev.retrieved_on || ev.published_on;
  if (ev.valid_until && ev.valid_until < today) return { state: 'stale', ageDays: ref ? daysBetween(ref, today) : null, maxDays: null, reason: `valid_until ${ev.valid_until} has passed` };
  if (!ref) return { state: 'unknown', ageDays: null, maxDays: null, reason: 'no retrieved_on or published_on date' };
  const max = dims().evidenceMaxAgeDays[ev.kind] || 730;
  const age = daysBetween(ref, today);
  const state = age > max ? 'stale' : age > max * 0.75 ? 'due' : 'fresh';
  return { state, ageDays: age, maxDays: max, reason: age > max ? `${age} days old, maximum for ${ev.kind} is ${max}` : null };
}

/** Competitor value (capability cell or price) freshness by tier and dimension. */
export function valueState(store: StoreLike, item: any, today: string): Freshness {
  if (!item.captured_on) return { state: 'unknown', ageDays: null, reason: 'no captured_on date' };
  const parent = ownerOf(store, item);
  const tier = (parent && parent.tier) || 'T2';
  const dim = item.type === 'PricePoint' ? (item.price_type === 'street' ? 'price_street' : 'price_list') : 'capability';
  const cad = dims().dimensions[dim][tier] || dims().dimensions[dim].T2;
  const age = daysBetween(item.captured_on, today);
  const state = age > cad.max ? 'stale' : age > cad.refresh ? 'due' : 'fresh';
  return { state, ageDays: age, refreshDays: cad.refresh, maxDays: cad.max, tier, dimension: dim, reason: state === 'stale' ? `${age} days old, ${tier} ${dim} maximum is ${cad.max}` : null };
}

/** Freshness for any item that has a freshness model; null otherwise. */
export function stateOf(store: StoreLike, item: any, today: string): Freshness | null {
  if (item.type === 'Evidence') return evidenceState(item, today);
  if (item.type === 'CompetitorCapability' || item.type === 'PricePoint') return valueState(store, item, today);
  return null;
}

