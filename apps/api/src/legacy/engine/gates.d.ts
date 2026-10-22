import type { Store } from './store';
import type {
  DepthLevel,
  GateCriterionResult,
  GateEvaluation,
  GateDecisionRecord,
  GateDecisionKind,
  GateDecidePayload,
  GateAttestPayload,
  GateWaivePayload,
  Attestation,
  EligibleDecisions,
  DepthEffectRow,
  GateSummary,
  Baseline,
} from './types';

/** Evaluation context passed to query ops; built per gate by `evaluateGate`. */
export interface GateCtx {
  store: Store;
  gate: number;
  depth: DepthLevel;
  today: string;
  suspectMap(): Map<string, unknown[]>;
}

export declare function config(): unknown;
export declare function reloadConfig(): unknown;
export declare function criteria(): unknown[];
export declare const OPS: Record<string, (ctx: GateCtx, q: unknown) => unknown>;
export declare function evalQuery(ctx: GateCtx, q: unknown): unknown;
export declare function evaluateCriterion(
  store: Store,
  crit: unknown,
  gate: number,
  depth: DepthLevel,
  ctx: GateCtx,
): GateCriterionResult;
export declare function evaluateGate(store: Store, gate: number, opts?: { depth?: DepthLevel }): GateEvaluation;
export declare function evaluateAll(store: Store, opts?: { depth?: DepthLevel }): GateEvaluation[];
export declare function evaluateLifecycle(store: Store, opts?: { depth?: DepthLevel }): GateEvaluation[];
export declare const LAST_GATE: number;
export declare function depthEffect(store: Store, gate: number): DepthEffectRow[];
export declare function decide(
  store: Store,
  gate: number,
  decision: GateDecisionKind,
  payload?: GateDecidePayload,
  actor?: string,
): GateDecisionRecord | null;
export declare function attest(store: Store, p: GateAttestPayload, actor: string): Attestation;
export declare function waive(store: Store, p: GateWaivePayload, actor: string): unknown;
export declare function depthOf(store: Store): DepthLevel;
export declare function summarise(results: GateCriterionResult[]): GateSummary;
export declare function eligibleDecisions(results: GateCriterionResult[], store: Store, gate: number): EligibleDecisions;
export declare function createBaseline(store: Store, gate: number, purpose: string, actor?: string): Baseline;
export declare const GATE_NAMES: Record<number, string>;
export declare const LEVEL_ORDER: Record<DepthLevel, number>;
