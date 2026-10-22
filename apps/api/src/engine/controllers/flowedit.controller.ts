import { Body, Get, Param, Post } from '@nestjs/common';
import { Ctx, EngineController, EngineCtx, EngineRoute } from '../engine.decorators';
import * as flowedit from '../../legacy/engine/flowedit';
import { SaveFlowDto } from './dto/flowedit.dto';

/** The plain flow editor. */
@EngineController('flow-edit', 'Flows')
export class FlowEditController {
  /** The flows of this product, each with what it still needs. */
  @Get() @EngineRoute()
  list(@Ctx() c: EngineCtx) { return { flows: flowedit.list(c.store) }; }

  /** One flow as the editor shows it (steps, who does them, what happens next, failure paths). */
  @Get(':id') @EngineRoute()
  model(@Ctx() c: EngineCtx, @Param('id') id: string) { return flowedit.model(c.store, id); }

  /** Save the whole list of steps. */
  @Post(':id') @EngineRoute()
  save(@Ctx() c: EngineCtx, @Param('id') id: string, @Body() dto: SaveFlowDto) { return flowedit.save(c.store, id, dto || {}, c.actor); }
}
