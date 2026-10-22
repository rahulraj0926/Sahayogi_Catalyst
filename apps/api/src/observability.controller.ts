import { Body, Controller, Get, Header, HttpCode, NotFoundException, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { loadEnv } from './config/env';
import { ClientErrorDto } from './client-errors.dto';
import { logEvent, oneLine } from './common/logging/json-logger';
import { metrics } from './common/metrics/metrics';
import { newestBackup } from './db/backup-age';
import { PersistenceService } from './persistence.service';
import { Logger } from '@nestjs/common';

const sameToken = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/** GET /metrics (Prometheus text) for dashboards and alerts. Outside /api so a scraper can reach it; protected by METRICS_TOKEN. */
@Controller('metrics')
@SkipThrottle()
export class MetricsController {
  private dbUp = 1;
  constructor(private readonly p: PersistenceService) {
    metrics.gauge('sahayogi_db_up', '1 when the database answers, 0 when it does not', () => this.dbUp);
    metrics.gauge('sahayogi_products', 'Products loaded in memory', () => this.p.portfolio?.list().length ?? 0);
    metrics.gauge('sahayogi_uptime_seconds', 'Seconds since the API started', () => Math.round(process.uptime()));
    metrics.gauge('sahayogi_memory_bytes', 'Memory used by the API process', () => { const m = process.memoryUsage(); return [{ labels: { kind: 'rss' }, value: m.rss }, { labels: { kind: 'heap_used' }, value: m.heapUsed }]; });
    metrics.gauge('sahayogi_last_backup_age_seconds', 'Age of the newest backup file; absent when there is none', () => { const b = newestBackup(); return b ? [{ value: Math.round(b.age_hours * 3600) }] : []; });
  }

  @ApiExcludeEndpoint()
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async scrape(@Req() req: Request) {
    const env = loadEnv();
    if (!env.METRICS_TOKEN) {
      if (env.NODE_ENV === 'production') throw new NotFoundException(); // off until a token is set
    } else {
      const given = /^Bearer (.+)$/.exec(String(req.headers.authorization || ''))?.[1] || '';
      if (!sameToken(given, env.METRICS_TOKEN)) throw new UnauthorizedException({ code: 'unauthenticated', message: 'A metrics token is needed.' });
    }
    try { await this.p.repo.ping(); this.dbUp = 1; } catch { this.dbUp = 0; }
    return metrics.render();
  }
}

/** The web app reports a screen that crashed, so browser errors reach the server log next to the API's own (with the request id when there is one). */
@ApiTags('Observability')
@Controller('client-errors')
export class ClientErrorsController {
  private readonly log = new Logger('web');

  @Post()
  @HttpCode(204)
  @ApiOperation({ summary: 'Report an error that happened in the browser (logged, nothing is stored)' })
  report(@Body() dto: ClientErrorDto, @Req() req: Request) {
    metrics.inc('sahayogi_client_errors_total', { source: dto.source || 'page' }, 1, 'Errors reported by the web app');
    logEvent(this.log, 'error', {
      msg: 'client error', requestId: req.id, reportedRequestId: oneLine(dto.request_id, 100) || undefined, source: dto.source || 'page',
      message: oneLine(dto.message, 500), digest: oneLine(dto.digest, 100) || undefined, url: oneLine(dto.url, 300) || undefined,
      stack: dto.stack ? String(dto.stack).slice(0, 4000) : undefined, actor: oneLine(req.headers['x-actor'], 80) || undefined,
    });
  }
}
