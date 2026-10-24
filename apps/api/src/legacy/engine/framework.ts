/**
 * engine/framework.ts - the Sahayogi Sanchalak lifecycle framework (13 phases, 70 steps) as data (data/framework.json) and the
 * completion of every phase.
 *
 *   step progress = how much of the evidence the step needs exists in the product's records (0..1); nothing is ticked by hand
 *   phase percent = the plain average of its steps' progress. Every step counts the same; there are no weights anywhere.
 *   overall       = the plain average of the 13 phase percents
 *
 * A framework phase is attached to the product phase that holds its records (`engine`); the framework document numbers Flows 3 and
 * Requirements 4, the product signs Requirements off first, so those two keep their product order and show the framework numbers on their steps.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isPassed } from './stages';

const FW = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'framework.json'), 'utf8'));
export const FRAMEWORK = FW;

/** A record in one of these states is not work done. */
const DEAD = new Set(['Rejected', 'Retired', 'Withdrawn', 'Superseded', 'Deprecated', 'Deleted', 'Left', 'Killed', 'Cancelled', 'Voided', 'Retracted', 'Invalidated', 'Reversed', 'Revoked', 'Expired', 'Failed', 'Lifted']);
/** A record in one of these states counts fully; any other live state (a draft) counts half. */
const DONE = new Set(['Approved', 'Accepted', 'Accepted with conditions', 'Validated', 'Confirmed', 'Reviewed', 'Active', 'Answered', 'Done', 'Released', 'Recorded', 'Closed', 'Concluded', 'Handed-off', 'Ready-for-handoff', 'Delivered', 'Acknowledged', 'Captured', 'Mitigating', 'Deployed', 'Shared', 'Resolved', 'Cleared', 'Passed']);

type Dict = Record<string, any>;


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
 * Completion of every phase. `detail` (a product phase number) adds the framework text and the evidence of that phase's steps.
 */
export function evaluate(store: Dict, opts: { detail?: number } = {}) {
  const items: Dict[] = store.all().filter((i: Dict) => i.type !== 'Product');
  const phases = FW.phases.map((p: Dict) => {
    const wide = opts.detail === p.engine;
    const steps = p.steps.map((s: Dict) => {
      const ev = s.evidence.map((e: Dict) => evidenceOf(store, items, e));
      const fraction = ev.length ? ev.reduce((a: number, e: Dict) => a + e.fraction, 0) / ev.length : 0;
      const state = fraction >= 0.999 ? 'Done' : fraction > 0 ? 'In progress' : 'Not started';
      const row: Dict = { id: s.id, code: s.code, title: s.title, state, fraction: Math.round(fraction * 1000) / 1000, pct: round(fraction * 100) };
      if (wide) Object.assign(row, { what: s.what, whyHere: s.whyHere, whyNotElsewhere: s.whyNotElsewhere, output: s.output, notes: s.notes, evidence: ev });
      return row;
    });
    const sum = steps.reduce((a: number, s: Dict) => a + s.fraction, 0);
    const out: Dict = { n: p.n, engine: p.engine, title: p.title, percent: steps.length ? round((sum / steps.length) * 100) : 0, stepsDone: steps.filter((s: Dict) => s.state === 'Done').length, stepsInProgress: steps.filter((s: Dict) => s.state === 'In progress').length, stepsTotal: steps.length, steps };
    if (wide) Object.assign(out, { objective: p.objective, perspectives: p.perspectives, exit: p.exit });
    return out;
  });
  return {
    version: FW.version,
    credit: FW.credit, overall: phases.length ? round(phases.reduce((a: number, p: Dict) => a + p.percent, 0) / phases.length) : 0, phases,
  };
}

/** Phase number (product order) -> its row, for the lifecycle overview. */
export function percentByPhase(store: Dict): Record<number, { percent: number; stepsDone: number; stepsTotal: number; title: string; n: number }> {
  const out: Record<number, any> = {};
  for (const p of evaluate(store).phases) out[p.engine] = { percent: p.percent, stepsDone: p.stepsDone, stepsTotal: p.stepsTotal, title: p.title, n: p.n };
  return out;
}
