import { Body, Get, Param, Post } from '@nestjs/common';
import { Ctx, EngineController, EngineCtx, EngineRoute } from '../engine.decorators';
import * as stories from '../../legacy/engine/stories';
import * as handoff from '../../legacy/engine/handoff';
import * as Q from '../../legacy/engine/query';
import * as plainLib from '../../legacy/engine/plain';
import * as deliverLib from '../../legacy/engine/deliver';
import { CompleteStoryDto, DeliverDto, SubmitStoryDto } from './dto/stories.dto';

/** The "Complete this story" screen and the list of stories with what each still needs. */
@EngineController('stories', 'Stories')
export class StoriesController {
  @Get() @EngineRoute()
  list(@Ctx() c: EngineCtx) {
    const list = stories.listStories(c.store);
    const count = (k: string) => list.filter((s: any) => s.state === k).length;
    return { stories: list, counts: { total: list.length, draft: count('draft'), complete: count('complete'), waiting: count('waiting'), approved: count('approved'), handed_off: count('handed_off') }, drafts: stories.draftSummary(c.store) };
  }

  @Get(':id') @EngineRoute()
  form(@Ctx() c: EngineCtx, @Param('id') id: string) { return stories.storyForm(c.store, id); }

  @Post(':id/complete') @EngineRoute()
  complete(@Ctx() c: EngineCtx, @Param('id') id: string, @Body() dto: CompleteStoryDto) { return stories.completeStory(c.store, id, dto || {}, c.actor); }

  @Post(':id/submit') @EngineRoute()
  submit(@Ctx() c: EngineCtx, @Param('id') id: string, @Body() dto: SubmitStoryDto) { return stories.submitStory(c.store, id, (dto || {}).approver, c.actor); }
}

/** The newest hand-over record of a story, with where it went and what came back (null when no package exists). */
const deliveryOf = (store: any, storyId: string) => {
  const h = store.out(storyId, 'handed_off_as').map((l: any) => store.get(l.target)).filter((x: any) => x && x.status !== 'Superseded').pop();
  return h ? { id: h.id, status: h.status, receipt_id: h.receipt_id || '', delivered_to: h.delivered_to || '', delivered_on: h.delivered_on || '', error: h.delivery_error || '' } : null;
};

/** The Hand over page: the honest status, every story with what it needs, and which ones can get a package now. */
@EngineController('handoff', 'Handover')
export class HandoffController {
  @Get('receiver') @EngineRoute()
  receiver() { return deliverLib.receiverInfo(); }

  @Post('deliver') @EngineRoute()
  deliver(@Ctx() c: EngineCtx, @Body() dto: DeliverDto) { return deliverLib.deliver(c.store, (dto || {}).story, c.actor); }

  @Get('overview') @EngineRoute()
  overview(@Ctx() c: EngineCtx) {
    const ready = handoff.readiness(new Q.Ctx(c.store, { gate: 4 }));
    const byId = Object.fromEntries(ready.stories.map((s: any) => [s.id, s]));
    const list = stories.listStories(c.store).map((s: any) => {
      const r: any = byId[s.id];
      return { ...s, ready: !!(r && r.ready), reasons: r ? r.reasons.map((x: string) => plainLib.clean(x.replace(/^[a-z_.]+:\s*/, ''))) : [], package_created: s.handed_off.length > 0, delivery: deliveryOf(c.store, s.id) };
    });
    return { status: handoff.status(c.store), stories: list, receiver: deliverLib.receiverInfo() };
  }
}
