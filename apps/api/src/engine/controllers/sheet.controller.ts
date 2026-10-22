import { Get, Query } from '@nestjs/common';
import { Ctx, EngineController, EngineCtx, EngineRoute } from '../engine.decorators';
import * as sheet from '../../legacy/engine/sheet';

/** The Product sheet of one product. */
@EngineController('sheet', 'Sheet')
export class SheetController {
  @Get() @EngineRoute()
  one(@Ctx() c: EngineCtx) { return sheet.sheet(c.store, c.product); }
}

/** Search across all products. */
@EngineController('search', 'Sheet')
export class SearchController {
  @Get() @EngineRoute({ noProduct: true })
  all(@Ctx() c: EngineCtx, @Query() query: Record<string, string>) {
    return sheet.searchAll(c.portfolio, String(query.q || '').trim(), { product: query.product || null });
  }
}
