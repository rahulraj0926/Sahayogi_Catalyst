import { Body, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Ctx, EngineController, EngineCtx, EngineRoute } from '../engine.decorators';
import * as pointers from '../../legacy/engine/pointers';
import { CreatePointerDto, PatchPointerDto } from './dto/pointers.dto';

/** Pointers: evidence anchors into a file. */
@EngineController('pointers', 'Evidence')
export class PointersController {
  @Post() @EngineRoute()
  create(@Ctx() c: EngineCtx, @Body() dto: CreatePointerDto) { return pointers.create(c.store, dto || {}, c.actor, c.portfolio.uploadsDir(c.product.id)); }

  @Get() @EngineRoute()
  list(@Ctx() c: EngineCtx, @Query() query: Record<string, string>) { return pointers.list(c.store, query); }

  @Patch(':id') @EngineRoute()
  patch(@Ctx() c: EngineCtx, @Param('id') id: string, @Body() dto: PatchPointerDto) { return pointers.patch(c.store, id, dto || {}, c.actor); }

  @Delete(':id') @EngineRoute()
  remove(@Ctx() c: EngineCtx, @Param('id') id: string) { return pointers.remove(c.store, id, c.actor); }
}
