import * as summaryMod from '../legacy/engine/summary';
import * as plainMod from '../legacy/engine/plain';
import * as lifecycleMod from '../legacy/engine/lifecycle';
import type { PortfolioLike, PortfolioRow, ProductEntry, StoreLike } from '../types/legacy';

/** Single place where the typed code reaches into the untyped engine. Remove entries here as the engine is ported to TypeScript. */
const summary = summaryMod as unknown as {
  portfolioRow(entry: ProductEntry, store: StoreLike, opts?: { today?: string }): PortfolioRow;
};
const plain = plainMod as unknown as { activity(text: string, store: StoreLike | undefined): string; stageLabel(stage: string): string };
const lifecycle = lifecycleMod as unknown as { PHASES: Array<{ id: number; name: string; short: string }> };

export const engine = { summary, plain, lifecycle };
export type { PortfolioLike };
