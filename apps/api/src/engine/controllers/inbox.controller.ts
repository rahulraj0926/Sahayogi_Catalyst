import { Body, Get, Param, Post, Query } from '@nestjs/common';
import { Ctx, EngineController, EngineCtx, EngineRoute } from '../engine.decorators';
import * as assistant from '../../legacy/engine/assistant';
import * as usage from '../../legacy/engine/usage';
import { AcceptProposalDto, EditProposalDto, RejectProposalDto, SetCapDto } from './dto/assistant.dto';

/** The review inbox: what the assistant proposed, waiting for a person to accept, change or reject. */
@EngineController('inbox', 'Files')
export class InboxController {
  @Get() @EngineRoute()
  list(@Ctx() c: EngineCtx, @Query() query: Record<string, string>) { return assistant.listInbox(c.store, query); }

  @Post('accept-all') @EngineRoute()
  acceptAll(@Ctx() c: EngineCtx, @Query() query: Record<string, string>, @Body() dto: AcceptProposalDto) { return assistant.acceptAll(c.store, query, dto, c.actor, c.portfolio.uploadsDir(c.product.id)); }

  @Post(':id/accept') @EngineRoute()
  accept(@Ctx() c: EngineCtx, @Param('id') id: string, @Body() dto: AcceptProposalDto) { return assistant.accept(c.store, id, dto || {}, c.actor, c.portfolio.uploadsDir(c.product.id)); }

  @Post(':id/edit') @EngineRoute()
  edit(@Ctx() c: EngineCtx, @Param('id') id: string, @Body() dto: EditProposalDto) { return assistant.edit(c.store, id, dto || {}, c.actor); }

  @Post(':id/reject') @EngineRoute()
  reject(@Ctx() c: EngineCtx, @Param('id') id: string, @Body() dto: RejectProposalDto) { return assistant.reject(c.store, id, dto || {}, c.actor); }
}

/** The cost guard lives in the portfolio (one ledger for the leader's whole spend), not in a product. */
@EngineController('assistant', 'Files')
export class AssistantUsageController {
  @Get('usage') @EngineRoute({ noProduct: true })
  summary(@Ctx() c: EngineCtx) { return usage.summary(usage.ledgerOf(c.portfolio)); }

  @Post('usage') @EngineRoute({ noProduct: true, admin: true })
  setCap(@Ctx() c: EngineCtx, @Body() dto: SetCapDto) {
    const led = usage.ledgerOf(c.portfolio);
    usage.setCap(led, (dto || {}).cap_inr); c.portfolio.saveRegistry();
    return usage.summary(led);
  }
}
