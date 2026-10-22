/**
 * engine/framework.ts - the Sahayogi Sanchalak lifecycle framework (13 phases, 70 steps) as data (data/framework.json) and the
 * weighted completion of every phase.
 *
 *   step weight   = the points of its tier (core 8, major 5, support 3, light 1), one pattern for every phase
 *   step progress = how much of the evidence the step needs exists in the product's records (0..1); nothing is ticked by hand
 *   phase percent = sum(weight x progress) / sum(weight)
 *
 * Tiers per step and the points per tier are data: framework.json holds the defaults, a product can change both
 * (store.data.settings.frameworkTiers / frameworkPoints) from the Lifecycle screen.
 * A framework phase is attached to the product phase that holds its records (`engine`); the framework document numbers Flows 3 and
 * Requirements 4, the product signs Requirements off first, so those two keep their product order and show the framework numbers on their steps.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isPassed } from './stages';

const FW = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'framework.json'), 'utf8'));
export const FRAMEWORK = FW;
export const TIER_ORDER: string[] = ['core', 'major', 'support', 'light'];

/** A record in one of these states is not work done. */
const DEAD = new Set(['Rejected', 'Retired', 'Withdrawn', 'Superseded', 'Deprecated', 'Deleted', 'Left', 'Killed', 'Cancelled', 'Voided', 'Retracted', 'Invalidated', 'Reversed', 'Revoked', 'Expired', 'Failed', 'Lifted']);
/** A record in one of these states counts fully; any other live state (a draft) counts half. */
const DONE = new Set(['Approved', 'Accepted', 'Accepted with conditions', 'Validated', 'Confirmed', 'Reviewed', 'Active', 'Answered', 'Done', 'Released', 'Recorded', 'Closed', 'Concluded', 'Handed-off', 'Ready-for-handoff', 'Delivered', 'Acknowledged', 'Captured', 'Mitigating', 'Deployed', 'Shared', 'Resolved', 'Cleared', 'Passed']);

type Dict = Record<string, any>;

function settingsOf(store: Dict): Dict { const s = store.data && store.data.settings; return s || {}; }

/** Tier points and every step's tier, after this product's own changes. */
export function weights(store: Dict) {
  const s = settingsOf(store);
  const points: Record<string, number> = {};
  for (const t of TIER_ORDER) { const own = Number((s.frameworkPoints || {})[t]); points[t] = Number.isFinite(own) && own > 0 ? own : FW.tiers[t].points; }
  const tierOf = (step: Dict): string => { const own = (s.frameworkTiers || {})[step.id]; return TIER_ORDER.includes(own) ? own : step.tier; };
  return { points, tierOf };
}

const isEmpty = (x: any) => x === undefined || x === null || x === '' || (Array.isArray(x) && x.length === 0);

function matches(i: Dict, ev: Dict): boolean {
  if (!ev.types.includes(i.type)) return false;
  if (ev.subtype && i.subtype !== ev.subtype) return false;
  for (const [k, v] of Object.entries(ev.where || {})) { const ok = Array.isArray(v) ? v : [v]; if (!ok.includes(i[k])) return false; }
  for (const f of ev.has || []) if (isEmpty(i[f])) return false;
  return true;
}

/** How much one record is worth as evidence: 1 reviewed/approved, 0.5 draft, 0 for samples, unreviewed drafted records and dead states. */
function credit(i: Dict, ev: Dict): number {
  const asked = ev.where && ev.where.status;
  if (!(asked && (Array.isArray(asked) ? asked : [asked]).includes(i.status)) && DEAD.has(i.status)) return 0;
  if (i.origin === 'invented') return 0;
  if (i.origin === 'derived' && i.status === 'Draft') return 0;
  if (ev.live || (asked && (Array.isArray(asked) ? asked : [asked]).includes(i.status))) return 1;
  return DONE.has(i.status) ? 1 : 0.5;
}

function evidenceOf(store: Dict, items: Dict[], ev: Dict) {
  if (ev.gate !== undefined) { const ok = isPassed(store as any, ev.gate); return { label: ev.label, gate: ev.gate, have: ok ? 1 : 0, need: 1, fraction: ok ? 1 : 0 }; }
  let have = 0;
  for (const i of items) if (matches(i, ev)) have += credit(i, ev);
  const need = ev.min || 1;
  return { label: ev.label, have: Math.round(have * 10) / 10, need, fraction: Math.min(1, have / need) };
}

const round = (n: number) => Math.round(n);

/**
 * Weighted completion of every phase. `detail` (a product phase number) adds the framework text and the evidence of that phase's steps.
 */
export function evaluate(store: Dict, opts: { detail?: number } = {}) {
  const { points, tierOf } = weights(store);
  const items: Dict[] = store.all().filter((i: Dict) => i.type !== 'Product');
  const phases = FW.phases.map((p: Dict) => {
    const total = p.steps.reduce((a: number, s: Dict) => a + points[tierOf(s)], 0);
    const wide = opts.detail === p.engine;
    const steps = p.steps.map((s: Dict) => {
      const tier = tierOf(s);
      const ev = s.evidence.map((e: Dict) => evidenceOf(store, items, e));
      const fraction = ev.length ? ev.reduce((a: number, e: Dict) => a + e.fraction, 0) / ev.length : 0;
      const state = fraction >= 0.999 ? 'Done' : fraction > 0 ? 'In progress' : 'Not started';
      const row: Dict = { id: s.id, code: s.code, title: s.title, tier, tierLabel: FW.tiers[tier].label, weight: points[tier], share: round((points[tier] / total) * 100), state, fraction: Math.round(fraction * 1000) / 1000, pct: round(fraction * 100), earned: Math.round(points[tier] * fraction * 100) / 100 };
      if (wide) Object.assign(row, { what: s.what, whyHere: s.whyHere, whyNotElsewhere: s.whyNotElsewhere, output: s.output, notes: s.notes, evidence: ev, defaultTier: s.tier });
      return row;
    });
    const earned = steps.reduce((a: number, s: Dict) => a + s.earned, 0);
    const byTier = TIER_ORDER.map((t) => {
      const mine = steps.filter((s: Dict) => s.tier === t);
      const w = mine.reduce((a: number, s: Dict) => a + s.weight, 0);
      const e = mine.reduce((a: number, s: Dict) => a + s.earned, 0);
      return { tier: t, label: FW.tiers[t].label, points: points[t], steps: mine.length, share: total ? round((w / total) * 100) : 0, percent: w ? round((e / w) * 100) : 0 };
    }).filter((b) => b.steps > 0);
    const out: Dict = { n: p.n, engine: p.engine, title: p.title, percent: total ? round((earned / total) * 100) : 0, weightTotal: total, stepsDone: steps.filter((s: Dict) => s.state === 'Done').length, stepsTotal: steps.length, byTier, steps };
    if (wide) Object.assign(out, { objective: p.objective, perspectives: p.perspectives, exit: p.exit });
    return out;
  });
  const sumW = phases.reduce((a: number, p: Dict) => a + p.weightTotal, 0);
  const sumE = phases.reduce((a: number, p: Dict) => a + (p.percent * p.weightTotal) / 100, 0);
  return {
    version: FW.version,
    tiers: TIER_ORDER.map((t) => ({ tier: t, label: FW.tiers[t].label, meaning: FW.tiers[t].meaning, points: points[t], default_points: FW.tiers[t].points })),
    credit: FW.credit, overall: sumW ? round((sumE / sumW) * 100) : 0, phases,
  };
}

/** Phase number (product order) -> its row, for the lifecycle overview. */
export function percentByPhase(store: Dict): Record<number, { percent: number; stepsDone: number; stepsTotal: number; title: string; n: number }> {
  const out: Record<number, any> = {};
  for (const p of evaluate(store).phases) out[p.engine] = { percent: p.percent, stepsDone: p.stepsDone, stepsTotal: p.stepsTotal, title: p.title, n: p.n };
  return out;
}

/** Change how much a step counts, or the points of a tier. A tier equal to the default is stored as no change. */
export function setWeights(store: Dict, body: { step?: string; tier?: string; points?: Record<string, number>; reset?: boolean }) {
  const s = settingsOf(store);
  if (body.reset) { delete s.frameworkTiers; delete s.frameworkPoints; return; }
  if (body.step) {
    const step = FW.phases.flatMap((p: Dict) => p.steps).find((x: Dict) => x.id === body.step);
    if (!step) throw Object.assign(new Error(`There is no step ${body.step}.`), { status: 404 });
    if (!body.tier || !TIER_ORDER.includes(body.tier)) throw Object.assign(new Error('tier must be core, major, support or light'), { status: 422 });
    const own = { ...(s.frameworkTiers || {}) };
    if (body.tier === step.tier) delete own[step.id]; else own[step.id] = body.tier;
    s.frameworkTiers = own;
  }
  if (body.points) {
    const own = { ...(s.frameworkPoints || {}) };
    for (const [t, v] of Object.entries(body.points)) {
      if (!TIER_ORDER.includes(t)) throw Object.assign(new Error(`${t} is not a weight level`), { status: 422 });
      const n = Number(v);
      if (!Number.isFinite(n) || n < 1 || n > 100) throw Object.assign(new Error('points must be a number from 1 to 100'), { status: 422 });
      if (n === FW.tiers[t].points) delete own[t]; else own[t] = n;
    }
    s.frameworkPoints = own;
  }
}
