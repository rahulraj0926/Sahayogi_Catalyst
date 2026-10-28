import { Body, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Ctx, EngineController, EngineCtx, EngineRoute } from '../engine.decorators';
import * as summary from '../../legacy/engine/summary';
import * as nextactions from '../../legacy/engine/nextactions';
import * as reports from '../../legacy/engine/reports';
import { STAGES } from '../../legacy/engine/portfolio';
import { file, wantsDownload } from '../../legacy/routes/http';
import { AddIdeaDto, CreateProductDto, PatchIdeaDto, PatchProductDto, PromoteIdeaDto } from './dto/portfolio.dto';

/** Products, the ideas inbox, cross-product next actions and the portfolio report. None of these belongs to one product. */
@EngineController('portfolio', 'Portfolio')
export class PortfolioController {
  @Get() @EngineRoute({ noProduct: true })
  overview(@Ctx() c: EngineCtx, @Query() query: Record<string, string>) {
    const pf = c.portfolio;
    pf.syncAll();
    const today = pf.today();
    const products = pf.list({ includeArchived: ['1', 'true'].includes(String(query.archived)) }).map((e: any) => summary.portfolioRow(e, pf.store(e.id), { today }));
    const byStage: Record<string, number> = Object.fromEntries(STAGES.map((s: string) => [s, 0]));
    for (const p of products) byStage[p.stage] = (byStage[p.stage] || 0) + 1;
    byStage.idea = pf.ideas().filter((i: any) => ['new', 'shortlisted'].includes(i.status)).length; // a draft still in innovation is not waiting for the CEO
    pf.saveRegistry();
    return { as_of: today, default_product: pf.defaultProduct() ? pf.defaultProduct().id : null, counts: { products: products.length, by_stage: byStage, ideas: pf.ideas().length }, products };
  }

  /** The product's id is always chosen by the tool (PRD-001, PRD-002 ...), never by the caller. */
  @Post('products') @EngineRoute({ noProduct: true })
  create(@Ctx() c: EngineCtx, @Body() dto: CreateProductDto) {
    const entry = c.portfolio.create(dto || {}, { actor: c.actor });
    return { product: entry, next: { summary: `GET /api/product/summary?product=${entry.id}`, first_session: `GET /api/sessions?product=${entry.id}`, next_actions: `GET /api/next-actions?product=${entry.id}` } };
  }

  @Patch('products/:id') @EngineRoute({ noProduct: true })
  update(@Ctx() c: EngineCtx, @Param('id') id: string, @Body() dto: PatchProductDto) { return { product: c.portfolio.update(id, dto || {}, c.actor) }; }

  // ---- ideas inbox
  @Get('ideas') @EngineRoute({ noProduct: true })
  ideas(@Ctx() c: EngineCtx, @Query() query: Record<string, string>) {
    const ideas = c.portfolio.ideas().filter((i: any) => (query.status ? i.status === query.status : i.status !== 'innovation')); // drafts only when asked for
    return { total: ideas.length, ideas };
  }

  @Post('ideas') @EngineRoute({ noProduct: true })
  addIdea(@Ctx() c: EngineCtx, @Body() dto: AddIdeaDto) { return { idea: c.portfolio.addIdea(dto || {}, c.actor) }; }

  @Patch('ideas/:id') @EngineRoute({ noProduct: true, admin: true })
  updateIdea(@Ctx() c: EngineCtx, @Param('id') id: string, @Body() dto: PatchIdeaDto) { return { idea: c.portfolio.updateIdea(id, dto || {}, c.actor) }; }

  @Delete('ideas/:id') @EngineRoute({ noProduct: true, admin: true })
  deleteIdea(@Ctx() c: EngineCtx, @Param('id') id: string) { return { deleted: c.portfolio.deleteIdea(id, c.actor) }; }

  @Post('ideas/:id/promote') @EngineRoute({ noProduct: true, admin: true })
  promote(@Ctx() c: EngineCtx, @Param('id') id: string, @Body() dto: PromoteIdeaDto) {
    const r = c.portfolio.promote(id, dto || {}, c.actor);
    return { idea: r.idea, product: r.product, next: { summary: `GET /api/product/summary?product=${r.product.id}`, first_session: `GET /api/sessions?product=${r.product.id}` } };
  }

  // ---- cross-product next actions and report
  @Get('next-actions') @EngineRoute({ noProduct: true })
  nextActions(@Ctx() c: EngineCtx, @Query() query: Record<string, string>) {
    const pf = c.portfolio;
    pf.syncAll();
    const limit = Number(query.limit) || 20;
    const all: any[] = []; const perProduct: any[] = [];
    for (const e of pf.list()) {
      if (['done', 'parked'].includes(e.stage)) continue;
      const store = pf.store(e.id);
      const r = nextactions.forProduct(store, {});
      perProduct.push({ product_id: e.id, name: e.name, stage: e.stage, what_happens_next: r.what_happens_next, total_actions: r.total, minutes_total: r.minutes_total });
      for (const a of r.actions) all.push({ ...a, product: { id: e.id, name: e.name, stage: e.stage } });
    }
    all.sort((a, b) => b.value_per_minute - a.value_per_minute || b.value - a.value || a.minutes - b.minutes || a.id.localeCompare(b.id));
    all.forEach((a, i) => { a.rank = i + 1; });
    return { as_of: pf.today(), total: all.length, products: perProduct, actions: all.slice(0, limit) };
  }

  @Get('report') @EngineRoute({ noProduct: true })
  report(@Ctx() c: EngineCtx, @Query() query: Record<string, string>) {
    const rep = reports.portfolioReport(c.portfolio, { stuckDays: query.stuck_days });
    if (query.format === 'csv') return file(reports.portfolioCsv(rep), 'text/csv; charset=utf-8', `portfolio-report-${rep.as_of}.csv`, 'attachment');
    if (query.format === 'html') return file(reports.portfolioHtml(rep), 'text/html; charset=utf-8', `portfolio-report-${rep.as_of}.html`, wantsDownload(query) ? 'attachment' : 'inline');
    return rep;
  }
}
