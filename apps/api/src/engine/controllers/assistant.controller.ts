import { Body, Post } from '@nestjs/common';
import { Ctx, EngineController, EngineCtx, EngineRoute } from '../engine.decorators';
import * as nextactions from '../../legacy/engine/nextactions';
import * as journey from '../../legacy/engine/journey';
import * as approvals from '../../legacy/engine/approvals';
import { ChatDto } from './dto/assistant.dto';

const has = (q: string, ...w: string[]) => w.some((x) => q.includes(x));

/** Answers only from the product's saved records (next actions, journey, approvals). Anything else gets an honest "I do not know" with what it can answer. */
@EngineController('assistant', 'Files')
export class AssistantChatController {
  @Post('chat') @EngineRoute({ mutating: false })
  chat(@Ctx() c: EngineCtx, @Body() dto: ChatDto) {
    const { store, product, portfolio, actor } = c;
    const q = String((dto && dto.message) || '').toLowerCase().trim();
    if (!q) return { reply: 'Ask me what to do next, where the product stands, or what is waiting for approval.', sources: [] };
    const name = (product && product.name) || 'this product';
    if (has(q, 'next', 'do now', 'todo', 'to do', 'task', 'action', 'start')) {
      const n = nextactions.forProduct(store, { limit: 5 });
      const list = (n.actions || []).slice(0, 5).map((a: any, i: number) => `${i + 1}. ${a.title}`).join('\n');
      return { reply: `${n.what_happens_next || ''}${list ? `\n\nTop of the list (${n.total} in all):\n${list}` : ''}`.trim(), sources: ['Next actions'] };
    }
    if (has(q, 'approv', 'waiting', 'sign off', 'sign-off', 'signoff', 'review')) {
      const o = approvals.overview(store, actor, { url: '' });
      const mine = (o.for_you || []).length, wait = (o.waiting || []).length;
      return { reply: `${mine} thing${mine === 1 ? '' : 's'} waiting for ${actor} to approve, and ${wait} waiting on other people.`, sources: ['Approvals'] };
    }
    if (has(q, 'stage', 'phase', 'where', 'status', 'progress', 'journey', 'gate', 'ready')) {
      const j = journey.build(store, portfolio.sync(product.id) || product, { actor, ctx: { kind: (product && product.kind) || 'software', audience: 'sold' } });
      const rows = (j.stages || []).map((s: any) => `Stage ${s.n} ${s.name}: ${s.status}${typeof s.progress === 'number' ? `, ${s.progress}%` : ''}`).join('\n');
      return { reply: `${name} is at stage ${j.current} (${j.current_name}).\n\n${rows}`, sources: ['Journey'] };
    }
    return { reply: 'I do not know that one. I can answer from the saved records about: what to do next, where the product stands (stages), and what is waiting for approval.', sources: [] };
  }
}
