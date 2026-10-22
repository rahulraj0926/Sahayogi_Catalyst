/**
 * engine/stages.ts - ONE definition of "which stage is this product in", used by the portfolio, the overview, the reports and
 * the next-action text so that every screen shows the same answer.
 *
 *   The stage of a product is the EARLIEST stage whose sign-off (gate) has not been passed.
 *   If a later sign-off was passed while an earlier one is still open, that is allowed but flagged for the human lead:
 *   "Stage 2 was passed before Stage 1 was finished".
 */
/** The slice of the engine Store this module reads. */
interface StoreLike { data: { gates?: Record<string, { state?: string }> }; list(type: string, pred?: (x: any) => boolean): unknown[] }

export const STAGE_NAMES = ['Intake', 'Market', 'Scope', 'Requirements', 'Flows'];
export const PASSED = ['Passed', 'Passed-with-conditions'];

export const isPassed = (store: StoreLike, n: number): boolean => !!(store.data.gates && store.data.gates[n] && PASSED.includes(store.data.gates[n].state as string));

/** 0..4 = the earliest stage not yet signed off; 5 = every stage is signed off. */
export function earliestOpen(store: StoreLike): number {
  let g = 0;
  while (g < 5 && isPassed(store, g)) g++;
  return g;
}

/** Later sign-offs passed ahead of an unfinished earlier stage. [{passed, unfinished, text}] */
export function outOfOrder(store: StoreLike) {
  const e = earliestOpen(store);
  const out: Array<{ passed: number; unfinished: number; text: string; detail: string }> = [];
  for (let p = e + 1; p <= 4; p++) {
    if (isPassed(store, p)) out.push({ passed: p, unfinished: e, text: `Stage ${p} was passed before Stage ${e} was finished.`, detail: `Stage ${p} (${STAGE_NAMES[p]}) was signed off while Stage ${e} (${STAGE_NAMES[e]}) is still open. This is allowed, but the human lead should confirm it is intended.` });
  }
  return out;
}

export const hasHandoff = (store: StoreLike): boolean => store.list('Handoff', (h: { status: string }) => !['Superseded', 'Failed', 'Rejected'].includes(h.status)).length > 0;
/** P0..P4 while a sign-off is missing; 'handoff' = all five signed off but nothing handed over; 'done' = a handoff package really exists. */
export const stageCode = (store: StoreLike): string => { const e = earliestOpen(store); return e >= 5 ? (hasHandoff(store) ? 'done' : 'handoff') : `P${e}`; };

