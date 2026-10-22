import { Get, Param, Post } from '@nestjs/common';
import { Ctx, EngineController, EngineCtx, EngineRoute } from '../engine.decorators';
import * as existing from '../../legacy/engine/existing';

/** The existing-system view. Adding and editing records uses POST/PATCH /items. */
@EngineController('existing', 'Existing system')
export class ExistingController {
  @Get() @EngineRoute()
  overview(@Ctx() c: EngineCtx) { return existing.overview(c.store, c.product); }

  @Post(':id/confirm') @EngineRoute()
  confirm(@Ctx() c: EngineCtx, @Param('id') id: string) { return { item: existing.confirm(c.store, id, c.actor) }; }

  @Post(':id/feature') @EngineRoute()
  feature(@Ctx() c: EngineCtx, @Param('id') id: string) { return existing.makeFeature(c.store, id, c.actor); }
}
