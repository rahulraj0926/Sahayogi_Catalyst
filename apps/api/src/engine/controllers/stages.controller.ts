import { Get, Param } from '@nestjs/common';
import { Ctx, EngineController, EngineCtx, EngineRoute } from '../engine.decorators';
import * as gates from '../../legacy/engine/gates';
import * as plain from '../../legacy/engine/plain';
import * as stages from '../../legacy/engine/stages';
import * as storiesLib from '../../legacy/engine/stories';
import * as requestsLib from '../../legacy/engine/requests';

/** Every open blocker says what to press: the question that fixes it, or (for "needs a second look") the re-check. */
const fixFor = (item: any) => {
  if (item.done) return null;
  if (item.id === 'GC-04') return { type: 'recheck', label: 'Check them now' };
  const human = requestsLib.requests().filter((r: any) => r.owner_kind === 'HUMAN');
  const q = human.find((r: any) => r.done_when && r.done_when.criterion === item.id) || human.find((r: any) => ((r.why && r.why.criteria) || []).includes(item.id));
  return q ? { type: 'request', request: q.id, session: q.session, label: 'Go and do it' } : null;
};
const withFixes = (view: any) => ({ ...view, items: view.items.map((i: any) => ({ ...i, fix: fixFor(i) })) });
const head = (store: any) => ({
  rule: plain.STAGE_RULE, current: Math.min(4, stages.earliestOpen(store)), all_signed_off: stages.earliestOpen(store) >= 5, warnings: stages.outOfOrder(store),
  thoroughness: plain.THOROUGHNESS[gates.depthOf(store)] || gates.depthOf(store), thoroughness_code: gates.depthOf(store),
});

/** "What is blocking me": every stage in business words, with the one rule for what stage a product is in. */
@EngineController('stages', 'Stages')
export class StagesController {
  @Get() @EngineRoute()
  all(@Ctx() c: EngineCtx) { return { ...head(c.store), stages: [0, 1, 2, 3, 4].map((n) => withFixes(plain.stageView(gates.evaluateGate(c.store, n)))) }; }

  @Get(':n') @EngineRoute()
  one(@Ctx() c: EngineCtx, @Param('n') raw: string) {
    const n = Number(raw);
    if (!(n >= 0 && n <= 4)) throw Object.assign(new Error('Stages are numbered 0 to 4'), { status: 404 });
    const ev = gates.evaluateGate(c.store, n);
    return { ...head(c.store), draft_warning: storiesLib.draftWarning(c.store, n), stage: withFixes(plain.stageView(ev)), eligible: ev.eligible, eligible_reason: plain.eligibleText(ev), decision: ev.decision, today: c.store.today() };
  }
}
