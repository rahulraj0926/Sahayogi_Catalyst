import { Body, Get, Post, Req } from '@nestjs/common';
import { Ctx, EngineController, EngineCtx, EngineRoute } from '../engine.decorators';
import * as needed from '../../legacy/engine/needed';
import * as approvals from '../../legacy/engine/approvals';
import { NeededSendDto } from './dto/needed.dto';

/** "Who you need": the people the process needs, by stage, and what is needed from each. */
@EngineController('needed', 'Who you need')
export class NeededController {
  private baseFor(c: EngineCtx, req: { socket?: { localPort?: number } }) {
    const pf = c.portfolio; pf.reg.settings = pf.reg.settings || {}; approvals.configure(pf.reg.settings);
    return approvals.baseUrl(pf.reg.settings, req?.socket?.localPort || Number(process.env.PORT) || 4317);
  }

  @Get() @EngineRoute()
  list(@Ctx() c: EngineCtx, @Req() req: any) {
    return needed.build(c.store, c.portfolio.sync(c.product.id) || c.product, { actor: c.actor, base: this.baseFor(c, req) });
  }

  @Post('send') @EngineRoute()
  send(@Ctx() c: EngineCtx, @Req() req: any, @Body() dto: NeededSendDto) {
    return needed.send(c.store, c.portfolio.sync(c.product.id) || c.product, { actor: c.actor, base: this.baseFor(c, req), stage: dto.stage, row: dto.row });
  }
}
