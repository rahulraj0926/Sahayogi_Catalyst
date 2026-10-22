import { Get, Query } from '@nestjs/common';
import { Ctx, EngineController, EngineCtx, EngineRoute } from '../engine.decorators';
import * as journey from '../../legacy/engine/journey';
import * as gates from '../../legacy/engine/gates';
import * as stagesLib from '../../legacy/engine/stages';

/** All five stages are signed off, but something one of them rests on has changed since: the next step is the re-check, not "all done". */
function withRecheck(j: any, store: any) {
  if (!j || stagesLib.earliestOpen(store) < 5) return j;
  for (let n = 0; n <= 4; n++) {
    const ev = gates.evaluateGate(store, n);
    if (ev.live_state === 'at_risk') return { ...j, next: { kind: 'recheck', phrase: `Next: re-check what changed after the Stage ${n} sign-off`, title: `Re-check what changed after the Stage ${n} sign-off`, minutes: 5, who: 'you', href: `#/gates/${n}`, button: 'Re-check' } };
  }
  return j;
}

/** The whole journey of the chosen product in one answer. */
@EngineController('journey', 'Journey')
export class JourneyController {
  /** The kind of product (software, hardware, service) lives in the portfolio entry; whether it is sold or internal lives on the Product item. */
  private ctxOf(product: any, store: any) { const p = store.product() || {}; return { kind: (product && product.kind) || p.product_kind || 'software', audience: p.audience || 'sold' }; }

  @Get() @EngineRoute()
  build(@Ctx() c: EngineCtx, @Query() query: Record<string, string>) {
    const stage = query && query.stage !== undefined && query.stage !== '' ? Number(query.stage) : null;
    return withRecheck(journey.build(c.store, c.portfolio.sync(c.product.id) || c.product, { actor: c.actor, stage, ctx: this.ctxOf(c.product, c.store) }), c.store);
  }
}
