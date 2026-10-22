import { Body, Get, Param, Post } from '@nestjs/common';
import { Ctx, EngineController, EngineCtx, EngineRoute } from '../engine.decorators';
import * as feedback from '../../legacy/engine/feedback';
import { AddNoteDto, NoteDoneDto } from './dto/feedback.dto';

/** The "Something wrong here?" notes (one list per install, not per product). Leaving a note needs no name. */
@EngineController('feedback', 'Feedback')
export class FeedbackController {
  @Post() @EngineRoute({ noProduct: true, mutating: false, records: true })
  add(@Ctx() c: EngineCtx, @Body() dto: AddNoteDto) {
    const pf = c.portfolio;
    const entry = dto.product && pf.get(String(dto.product)) ? pf.get(String(dto.product)) : null;
    const note = feedback.add(pf, { ...dto, product: entry ? entry.id : '', product_name: entry ? entry.name : '' }, c.actor, pf.now());
    return { note, saved_in: 'database' };
  }

  @Get() @EngineRoute({ noProduct: true })
  list(@Ctx() c: EngineCtx) { return feedback.list(c.portfolio); }

  @Post(':id/done') @EngineRoute({ noProduct: true, mutating: false, records: true })
  done(@Ctx() c: EngineCtx, @Param('id') id: string, @Body() dto: NoteDoneDto) {
    return { note: feedback.setDone(c.portfolio, id, dto.done !== false, c.actor, c.portfolio.now()) };
  }
}
