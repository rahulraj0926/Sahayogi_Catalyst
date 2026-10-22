import { Body, Get, Param, Post, Query } from '@nestjs/common';
import { Ctx, EngineController, EngineCtx, EngineRoute } from '../engine.decorators';
import * as nextactions from '../../legacy/engine/nextactions';
import * as sessions from '../../legacy/engine/sessions';
import * as requests from '../../legacy/engine/requests';
import * as summary from '../../legacy/engine/summary';
import * as reports from '../../legacy/engine/reports';
import * as compare from '../../legacy/engine/compare';
import { file, slug, wantsDownload } from '../../legacy/routes/http';

/** The kind of product (software, hardware, service) lives in the portfolio entry; whether it is sold or internal lives on the Product item. */
const ctxOf = (product: any, store: any) => { const p = store.product() || {}; return { kind: (product && product.kind) || p.product_kind || 'software', audience: p.audience || 'sold' }; };

@EngineController('next-actions', 'Work')
export class NextActionsController {
  @Get() @EngineRoute()
  list(@Ctx() c: EngineCtx, @Query() query: Record<string, string>) { return nextactions.forProduct(c.store, { limit: query.limit, kind: query.kind }); }
}

@EngineController('sessions', 'Work')
export class SessionsController {
  @Get() @EngineRoute()
  list(@Ctx() c: EngineCtx, @Query() query: Record<string, string>) { return sessions.list(c.store, { forms: query.forms !== '0', ctx: ctxOf(c.product, c.store) }); }

  /** Run every step the tool does by itself, as far as its inputs allow. Cheap and safe to call when a Work screen opens. */
  @Post('auto') @EngineRoute()
  auto(@Ctx() c: EngineCtx) {
    if (c.product && c.product.seed) return { ran: [], skipped: 'demo products are never changed automatically' };
    return { ran: requests.autoDerive(c.store, c.actor).map((id: string) => { const r = requests.get(id); return { request_id: id, title: r ? r.title : id }; }) };
  }

  /** The answer to one step. The fields depend on the step (see the session's form), so the body is an open object: action, reason and the step's own answers. */
  @Post(':code/steps/:requestId') @EngineRoute()
  step(@Ctx() c: EngineCtx, @Param('code') code: string, @Param('requestId') requestId: string, @Body() body: Record<string, any>) {
    return sessions.postStep(c.store, code, requestId, body || {}, c.actor, ctxOf(c.product, c.store));
  }
}

@EngineController('product', 'Work')
export class ProductSummaryController {
  @Get('summary') @EngineRoute()
  summary(@Ctx() c: EngineCtx) { return summary.productSummary(c.portfolio.sync(c.product.id) || c.product, c.store); }
}

@EngineController('reports', 'Work')
export class ReportsController {
  @Get('product') @EngineRoute()
  product(@Ctx() c: EngineCtx, @Query() query: Record<string, string>) {
    const entry = c.portfolio.sync(c.product.id) || c.product;
    const rep = reports.productReport(entry, c.store);
    if (query.format === 'csv') return file(reports.productCsv(rep), 'text/csv; charset=utf-8', `${slug(c.product.name)}_status-report.csv`, 'attachment');
    if (query.format === 'html') return file(reports.productHtml(rep), 'text/html; charset=utf-8', `${slug(c.product.name)}_status-report.html`, wantsDownload(query) ? 'attachment' : 'inline');
    return rep;
  }
}

@EngineController('competitors', 'Competitors')
export class CompetitorCompareController {
  @Get('compare') @EngineRoute()
  compare(@Ctx() c: EngineCtx, @Query() query: Record<string, string>) {
    const res = compare.compare(c.store, query);
    if (query.format === 'csv') return file(compare.compareCsv(res), 'text/csv; charset=utf-8', `${slug(c.product.name)}_competitor-comparison.csv`, 'attachment');
    return res;
  }
}
