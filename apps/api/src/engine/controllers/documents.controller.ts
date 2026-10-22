import { Body, Get, Param, Post, Query } from '@nestjs/common';
import { Ctx, EngineController, EngineCtx, EngineRoute } from '../engine.decorators';
import * as compose from '../../legacy/engine/compose';
import { file, slug, wantsDownload } from '../../legacy/routes/http';
import { DocumentStatusDto } from './dto/documents.dto';

/** The 30 composed documents and their status. */
@EngineController('documents', 'Documents')
export class DocumentsController {
  @Get() @EngineRoute()
  list(@Ctx() c: EngineCtx) {
    const docs = compose.list(c.store);
    return {
      product: { id: c.product.id, name: c.product.name }, total: docs.length, approved: docs.filter((d: any) => d.status === 'approved').length, approval_threshold_percent: compose.threshold(c.store),
      by_status: docs.reduce((m: Record<string, number>, d: any) => { m[d.status] = (m[d.status] || 0) + 1; return m; }, {}), documents: docs,
    };
  }

  @Get(':key') @EngineRoute()
  one(@Ctx() c: EngineCtx, @Param('key') key: string, @Query() query: Record<string, string>) {
    const format = query.format || 'json';
    if (!['json', 'html', 'md'].includes(format)) throw Object.assign(new Error('format must be json, html or md'), { status: 422 });
    const r = compose.render1(c.store, key, format);
    if (format === 'json') return r.model;
    return file(r.body, r.type, `${slug(c.product.name)}_${key}.${r.ext}`, wantsDownload(query) ? 'attachment' : 'inline');
  }

  @Post(':key/status') @EngineRoute()
  status(@Ctx() c: EngineCtx, @Param('key') key: string, @Body() dto: DocumentStatusDto) { return compose.setStatus(c.store, key, dto || {}, c.actor); }
}

/** Every document in one file. */
@EngineController('dossier', 'Documents')
export class DossierController {
  @Get() @EngineRoute()
  dossier(@Ctx() c: EngineCtx, @Query() query: Record<string, string>) {
    const format = query.format || 'html';
    if (!['html', 'md'].includes(format)) throw Object.assign(new Error('format must be html or md'), { status: 422 });
    const d = compose.dossier(c.store, format, { phase: query.phase });
    return file(d.body, d.type, `${slug(c.product.name)}_dossier.${d.ext}`, wantsDownload(query) ? 'attachment' : 'inline');
  }
}
