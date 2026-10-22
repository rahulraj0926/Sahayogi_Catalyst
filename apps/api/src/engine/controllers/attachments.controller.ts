import { Body, Delete, Get, Param, Post, Query, Req } from '@nestjs/common';
import { Ctx, EngineController, EngineCtx, EngineRoute } from '../engine.decorators';
import * as attachments from '../../legacy/engine/attachments';
import * as assistant from '../../legacy/engine/assistant';
import * as usage from '../../legacy/engine/usage';
import { file } from '../../legacy/routes/http';
import { readBody } from '../body';
import { AcceptSuggestionsDto, PasteTextDto } from './dto/attachments.dto';
import { AssistDto } from './dto/assistant.dto';

const dirOf = (c: EngineCtx) => c.portfolio.uploadsDir(c.product.id);

/** Uploads, text extraction, suggestions and accept. The body of an upload is the raw file (max 25 MB). */
@EngineController('attachments', 'Files')
export class AttachmentsController {
  /** POST /attachments?target=ITEM_ID&name=FILENAME - the body is the file bytes; the type comes from the header or the extension. */
  @Post() @EngineRoute()
  async upload(@Ctx() c: EngineCtx, @Req() req: any, @Query() query: Record<string, string>) {
    const body = await readBody(req, true);
    return attachments.add(c.store, { target: query.target, phase: query.phase, name: query.name, mime: req.headers['content-type'], body, actor: c.actor, dir: dirOf(c) });
  }

  @Get() @EngineRoute()
  list(@Ctx() c: EngineCtx, @Query() query: Record<string, string>) { return attachments.list(c.store, query.target); }

  @Get(':id/download') @EngineRoute()
  download(@Ctx() c: EngineCtx, @Param('id') id: string) {
    const d = attachments.download(c.store, id, dirOf(c));
    // always as an attachment, never rendered by the browser; the stored type is informational only
    return file(d.buffer, d.mime && /^(image\/(png|jpeg|gif)|application\/pdf|text\/(plain|csv))$/.test(d.mime) ? d.mime : 'application/octet-stream', d.filename, 'attachment');
  }

  @Get(':id/text') @EngineRoute()
  text(@Ctx() c: EngineCtx, @Param('id') id: string) { return attachments.text(c.store, id, dirOf(c)); }

  @Post(':id/paste-text') @EngineRoute()
  pasteText(@Ctx() c: EngineCtx, @Param('id') id: string, @Body() dto: PasteTextDto) { return attachments.pasteText(c.store, id, dto || {}, c.actor, dirOf(c)); }

  @Delete(':id') @EngineRoute()
  remove(@Ctx() c: EngineCtx, @Param('id') id: string) { return attachments.remove(c.store, id, c.actor); }

  /** Drafts only: nothing is created until the person accepts. Needs no name. */
  @Post(':id/suggest') @EngineRoute({ mutating: false })
  suggest(@Ctx() c: EngineCtx, @Param('id') id: string) { return attachments.suggestFor(c.store, id, dirOf(c)); }

  @Post(':id/accept') @EngineRoute()
  accept(@Ctx() c: EngineCtx, @Param('id') id: string, @Body() dto: AcceptSuggestionsDto) { return attachments.accept(c.store, id, dto || {}, c.actor); }

  // ---- viewer
  @Get(':id/view') @EngineRoute()
  view(@Ctx() c: EngineCtx, @Param('id') id: string, @Query() query: Record<string, string>) { return attachments.view(c.store, id, dirOf(c), query); }

  @Get(':id/raw') @EngineRoute()
  raw(@Ctx() c: EngineCtx, @Param('id') id: string) {
    const r = attachments.raw(c.store, id, dirOf(c));
    const res = file(r.buffer, r.type, r.filename, 'inline');
    res.headers['Content-Security-Policy'] = "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:";
    return res;
  }

  @Get(':id/media') @EngineRoute()
  media(@Ctx() c: EngineCtx, @Param('id') id: string, @Query() query: Record<string, string>) {
    const r = attachments.media(c.store, id, dirOf(c), query.path);
    const res = file(r.buffer, r.type, r.filename, 'inline');
    res.headers['Content-Security-Policy'] = "sandbox; default-src 'none'";
    return res;
  }

  // ---- the assistant
  private cost(c: EngineCtx) { return { ledger: usage.ledgerOf(c.portfolio), save: () => c.portfolio.saveRegistry(), product: c.product && c.product.id }; }

  /** In live mode this costs money (see GET /assistant/usage); in simple and demo mode it costs nothing. Proposals go to the inbox for review. */
  @Post(':id/assist') @EngineRoute()
  assist(@Ctx() c: EngineCtx, @Param('id') id: string, @Body() dto: AssistDto) { return assistant.assist(c.store, id, dto || {}, c.actor, dirOf(c), this.cost(c)); }

  /** Live mode only: what this run would cost (nothing in simple or demo mode, and nothing is sent anywhere). */
  @Post(':id/assist/estimate') @EngineRoute({ mutating: false })
  estimate(@Ctx() c: EngineCtx, @Param('id') id: string, @Body() dto: AssistDto) { return assistant.costEstimate(c.store, id, dto || {}, dirOf(c), this.cost(c)); }
}
