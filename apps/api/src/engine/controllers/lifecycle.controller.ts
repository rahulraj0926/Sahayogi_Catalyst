import { Body, Delete, Get, Headers, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Ctx, EngineController, EngineCtx, EngineRoute } from '../engine.decorators';
import { ValidationError, Store } from '../../legacy/engine/store';
import * as schema from '../../legacy/engine/schema';
import * as links from '../../legacy/engine/links';
import * as suspectLib from '../../legacy/engine/suspect';
import * as Q from '../../legacy/engine/query';
import * as gates from '../../legacy/engine/gates';
import * as dashboard from '../../legacy/engine/dashboard';
import * as people from '../../legacy/engine/people';
import * as stories from '../../legacy/engine/stories';
import * as questions from '../../legacy/engine/questions';
import * as lifecycleMod from '../../legacy/engine/lifecycle';
import * as framework from '../../legacy/engine/framework';
import * as freshness from '../../legacy/engine/freshness';
import * as plain from '../../legacy/engine/plain';
import { localDate } from '../../legacy/engine/units';
import { resetToSeed } from '../../legacy/router';
import { CreateItemDto, FrameworkWeightsDto, ImportDto, ItemStatusDto, NoteDto, PatchItemDto, ReviewDto, SettingsDto, CreateLinkDto } from './dto/lifecycle.dto';

export const brief = (i: any) => ({ id: i.id, type: i.type, subtype: i.subtype || null, title: i.title, status: i.status, phase: i.phase, origin: i.origin, verification: i.verification || null, priority: i.priority || null });

function annotate(ctx: any, i: any) {
  const sm = ctx.suspectMap().get(i.id);
  const st = ctx.staleMap().get(i.id);
  const fr = freshness.stateOf(ctx.store, i, ctx.today);
  return { ...i, _suspect: !!sm, _suspectCauses: sm ? sm.map((e: any) => `${e.driver} changed${e.cause && e.cause.fields ? ' (' + e.cause.fields.join(', ') + ')' : ''}`) : [], _stale: !!st, _counted: Q.isCounted(i), _freshness: fr ? fr.state : null, _links: ctx.store.linksOf(i.id).length };
}
const shortOffenders = (evs: any[]) => evs.map((e) => ({ ...e, results: e.results.map((r: any) => ({ ...r, offenders: r.offenders.slice(0, 8), offenderCount: r.offenders.length })) }));

/** Product facts that are not about one area: meta, dashboard, settings, the audit trail, export, import and reset. */
@EngineController('', 'Product')
export class ProductBasicsController {
  @Get('meta') @EngineRoute({ optionalProduct: true })
  meta(@Ctx() c: EngineCtx, @Req() req: any) {
    const { store, actor } = c;
    return {
      schema: schema.describe(), links: links.describe(), criteria: gates.criteria().map((x: any) => ({ id: x.id, gate: x.gate, text: x.text, type: x.type, severity: x.severity, depth_level: x.depth_level, v2Ref: x.v2Ref, waivable: x.waivable !== false, attest: x.attest || null })),
      params: gates.config().params, product: store ? store.product() : null, asOf: store ? store.today() : localDate(), depth: store ? gates.depthOf(store) : 'L2', phases: dashboard.PHASE_NAMES, gateNames: gates.GATE_NAMES,
      // the people who can act come from this product's own Stakeholder records plus the person signed in; there is no demo cast
      people: people.list(store, actor, req.headers['x-me']), actors: people.names(store, actor, req.headers['x-me']), signed_in: actor,
    };
  }

  @Get('dashboard') @EngineRoute()
  dashboard(@Ctx() c: EngineCtx) { return dashboard.dashboard(c.store); }

  @Post('settings') @EngineRoute()
  settings(@Ctx() c: EngineCtx, @Body() body: SettingsDto) {
    const { store, actor } = c;
    if (body.depth_level) { if (!schema.ENUMS.depth.includes(body.depth_level)) throw Object.assign(new Error('depth_level must be L1, L2 or L3'), { status: 422 }); store.update(store.product().id, { depth_level: body.depth_level }, { actor }); }
    if (body.asOf !== undefined) store.data.settings.asOf = body.asOf || null;
    if (body.suspectDepth) store.data.settings.suspectDepth = Math.max(1, Math.min(5, Number(body.suspectDepth)));
    if (body.params) store.data.settings.params = { ...store.data.settings.params, ...body.params };
    store.audit('settings', null, `${actor} changed settings ${JSON.stringify(body)}`, { actor });
    return { depth: gates.depthOf(store), asOf: store.today(), suspectDepth: store.data.settings.suspectDepth };
  }

  @Get('lifecycle') @EngineRoute()
  lifecycle(@Ctx() c: EngineCtx) { return lifecycleMod.overview(c.store, gates); }

  /** The 13 phases and 70 steps of the framework with each phase's weighted completion. `phase` (product phase number) adds the full text and evidence of that phase's steps. */
  @Get('lifecycle/framework') @EngineRoute()
  lifecycleFramework(@Ctx() c: EngineCtx, @Query() query: Record<string, string>) {
    const n = query.phase === undefined || query.phase === '' ? undefined : Number(query.phase);
    return framework.evaluate(c.store, { detail: n !== undefined && Number.isInteger(n) ? n : undefined });
  }

  /** Change how much one step counts (tier) or the points of a level; reset puts the framework defaults back. */
  @Post('lifecycle/framework/weights') @EngineRoute()
  lifecycleFrameworkWeights(@Ctx() c: EngineCtx, @Body() body: FrameworkWeightsDto) {
    const { store, actor } = c;
    framework.setWeights(store, body);
    store.audit('settings', null, `${actor} changed how much lifecycle steps count ${JSON.stringify(body)}`, { actor });
    return framework.evaluate(store);
  }

  @Get('lifecycle/gates') @EngineRoute()
  lifecycleGates(@Ctx() c: EngineCtx, @Query() query: Record<string, string>) { return shortOffenders(gates.evaluateLifecycle(c.store, query.depth ? { depth: query.depth } : {})); }

  @Get('audit') @EngineRoute()
  audit(@Ctx() c: EngineCtx, @Query() query: Record<string, string>) {
    const store = c.store;
    let a = store.data.audit.slice().reverse();
    const groupKeys = plain.AUDIT_GROUPS.map((g: any) => g[0]);
    if (query.action) a = a.filter((x: any) => (groupKeys.includes(query.action) ? plain.auditGroup(x.action) === query.action : x.action.startsWith(query.action)));
    const sentence = new Map(); // x -> plain sentence, worked out only when needed
    const textOf = (x: any) => { if (!sentence.has(x)) sentence.set(x, plain.auditLine(x, store)); return sentence.get(x); };
    if (query.q) { const q = query.q.toLowerCase(); a = a.filter((x: any) => `${x.action} ${x.subject} ${x.summary} ${x.actor} ${textOf(x)}`.toLowerCase().includes(q)); }
    // every entry carries a plain sentence (text) and a plain group; action, subject, summary and details stay for experts
    const group_label = Object.fromEntries(plain.AUDIT_GROUPS);
    return { total: a.length, groups: plain.AUDIT_GROUPS.map(([id, label]: any) => ({ id, label })), entries: a.slice(0, Number(query.limit) || 300).map((x: any) => { const g = plain.auditGroup(x.action); return { ...x, text: textOf(x), group: g, group_label: group_label[g as any] }; }) };
  }

  /** Everything of this product as one JSON file. The export is recorded in the audit trail, so it is saved even though it is a read. */
  @Get('export') @EngineRoute({ records: true })
  export(@Ctx() c: EngineCtx) {
    const { store, actor } = c;
    store.audit('data.exported', null, `${actor || 'someone (no name given)'} exported all data of this product`, { actor: actor || undefined });
    return { __raw: JSON.stringify(store.exportData(), null, 1), headers: { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="sahayogi-developer-export.json"' } };
  }

  @Post('import') @EngineRoute()
  import(@Ctx() c: EngineCtx, @Body() body: ImportDto) {
    const { store, actor } = c;
    const errors = Store.validateData(body.data);
    if (errors.length) throw new ValidationError(errors.slice(0, 30), `import rejected: ${errors.length} problem(s)`);
    store.replaceData(body.data);
    store.audit('import', null, `${actor} imported a data set (${Object.keys(body.data.items).length} items)`, { actor });
    return { items: Object.keys(body.data.items).length, links: body.data.linkList.length };
  }

  @Post('reset') @EngineRoute()
  reset(@Ctx() c: EngineCtx) {
    const { store, product, actor } = c;
    resetToSeed(product.id); store.audit('reset', null, `${actor} reset the store to the seed`, { actor });
    return { items: store.all().length, links: store.links().length };
  }
}

@EngineController('items', 'Items')
export class ItemsController {
  @Get() @EngineRoute()
  list(@Ctx() c: EngineCtx, @Query() query: Record<string, string>) {
    const store = c.store;
    const ctx = new Q.Ctx(store, {});
    let items = store.all();
    if (query.type) items = items.filter((i: any) => i.type === query.type);
    if (query.subtype) items = items.filter((i: any) => i.subtype === query.subtype);
    if (query.phase !== undefined && query.phase !== '') items = items.filter((i: any) => String(i.phase) === String(query.phase));
    if (query.status) items = items.filter((i: any) => i.status === query.status);
    if (query.origin) items = items.filter((i: any) => i.origin === query.origin);
    if (query.q) { const q = query.q.toLowerCase(); items = items.filter((i: any) => `${i.id} ${i.title} ${i.statement || ''}`.toLowerCase().includes(q)); }
    if (query.flag === 'suspect') items = items.filter((i: any) => ctx.isSuspect(i.id));
    items.sort((a: any, b: any) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    return { total: items.length, items: items.slice(0, Number(query.limit) || 1000).map((i: any) => annotate(ctx, i)) };
  }

  @Get(':id') @EngineRoute()
  one(@Ctx() c: EngineCtx, @Param('id') id: string) { return dashboard.itemDetail(c.store, id); }

  @Post() @EngineRoute()
  create(@Ctx() c: EngineCtx, @Body() body: CreateItemDto) {
    const origin = ['human', 'document'].includes(body.origin as string) ? body.origin : 'human';
    return { item: c.store.create(body.type, body.fields || {}, { actor: c.actor, origin, subtype: body.subtype }) };
  }

  @Patch(':id') @EngineRoute()
  change(@Ctx() c: EngineCtx, @Param('id') id: string, @Body() body: PatchItemDto, @Headers('if-match') ifMatch?: string) {
    const { store, actor } = c;
    const before = JSON.parse(JSON.stringify(store.get(id) || {}));
    // Stale-edit guard: a caller that says which revision it was looking at (expected_rev or an If-Match header) is refused when someone else changed the item since.
    const said = body.expected_rev !== undefined ? body.expected_rev : String(ifMatch || '').replace(/^W\//, '').replace(/"/g, '');
    if (said !== '' && said !== undefined && before.id && Number(said) !== (before.rev || 1)) {
      throw Object.assign(new Error(`${id} was changed by someone else (now at revision ${before.rev || 1}, you were looking at ${said}). Reload it and make your change again.`), { status: 409, code: 'stale_edit', current: store.get(id) });
    }
    store.update(id, body.fields || {}, { actor, reviewed: !!body.reviewed });
    if (before.id) stories.noteEdited(store, before, actor); // a draft the person rewrote now counts
    return { item: store.get(id) };
  }

  @Post(':id/status') @EngineRoute()
  status(@Ctx() c: EngineCtx, @Param('id') id: string, @Body() body: ItemStatusDto) { return { item: c.store.setStatus(id, body.status, { actor: c.actor }) }; }

  @Delete(':id') @EngineRoute()
  remove(@Ctx() c: EngineCtx, @Param('id') id: string) { return { removedLinks: c.store.remove(id, { actor: c.actor }) }; }

  @Post(':id/clear') @EngineRoute()
  clear(@Ctx() c: EngineCtx, @Param('id') id: string, @Body() body: NoteDto) { return { cleared: suspectLib.clearItem(c.store, id, c.actor, body && body.note) }; }
}

@EngineController('review', 'Items')
export class ReviewController {
  @Post() @EngineRoute()
  accept(@Ctx() c: EngineCtx, @Body() body: ReviewDto) {
    const { store, actor } = c;
    const done: string[] = [];
    for (const id of body.ids || []) { store.update(id, { status: body.status || 'In review' }, { actor }); if ((body.status || 'In review') === 'In review') stories.noteAccepted(store, id, actor); done.push(id); }
    return { updated: done };
  }

  @Get(':type') @EngineRoute()
  drafts(@Ctx() c: EngineCtx, @Param('type') type: string) {
    const ctx = new Q.Ctx(c.store, {});
    return { type, items: c.store.list(type, (i: any) => i.origin === 'derived' && i.status === 'Draft').map((i: any) => annotate(ctx, i)) };
  }
}

@EngineController('links', 'Items')
export class LinksController {
  @Get() @EngineRoute()
  list(@Ctx() c: EngineCtx, @Query() query: Record<string, string>) { return query.item ? c.store.linksOf(query.item) : c.store.links(); }

  @Post() @EngineRoute()
  create(@Ctx() c: EngineCtx, @Body() body: CreateLinkDto) { return { link: c.store.link(body.type, body.source, body.target, body.attrs || {}, { actor: c.actor }) }; }

  @Delete(':id') @EngineRoute()
  remove(@Ctx() c: EngineCtx, @Param('id') id: string) { return { removed: c.store.unlink(id, { actor: c.actor }) }; }

  @Post(':id/clear') @EngineRoute()
  clear(@Ctx() c: EngineCtx, @Param('id') id: string, @Body() body: NoteDto) { return { link: suspectLib.clearLink(c.store, id, c.actor, body && body.note) }; }
}

@EngineController('questions', 'Items')
export class QuestionsController {
  @Post(':id/resolve') @EngineRoute()
  resolve(@Ctx() c: EngineCtx, @Param('id') id: string, @Body() body: Record<string, any>) { return questions.resolve(c.store, id, body.kind, body, c.actor); }
}
