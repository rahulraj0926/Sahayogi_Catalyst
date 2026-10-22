import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logEvent, oneLine } from '../logging/json-logger';
import { metrics } from '../metrics/metrics';

declare module 'express-serve-static-core' {
  interface Request { id?: string }
}

const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;
const QUIET = /^\/(metrics|health(\/live|\/ready)?)$/;

/** A path with the ids taken out (/api/v1/items/:id), so logs group well and metrics keep a small, fixed set of routes. */
export function routeOf(req: Request): string {
  const matched = req.route?.path ? `${req.baseUrl || ''}${req.route.path}` : '';
  const raw = matched && typeof req.route.path === 'string' ? matched : req.originalUrl.split('?')[0];
  return raw.split('/').map((seg) => (/^(\d+|[0-9a-f]{8}-[0-9a-f-]{27}|[0-9a-f]{16,}|[A-Za-z]{1,8}-\d+(-[\w]+)*)$/i.test(seg) || seg.length > 40 ? ':id' : seg)).join('/') || '/';
}

/** Gives every request an id (or keeps a safe one sent by the caller), echoes it as X-Request-Id, logs one line per request and counts it for /metrics. */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  private readonly log = new Logger('http');

  use(req: Request, res: Response, next: NextFunction) {
    const incoming = req.headers['x-request-id'];
    req.id = typeof incoming === 'string' && SAFE_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', req.id);
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const secs = Number(process.hrtime.bigint() - started) / 1e9;
      const route = routeOf(req);
      const quiet = QUIET.test(req.originalUrl.split('?')[0]);
      metrics.inc('sahayogi_http_requests_total', { method: req.method, route, status: res.statusCode }, 1, 'HTTP requests by method, route and status');
      metrics.observe('sahayogi_http_request_duration_seconds', { method: req.method, route }, secs, 'HTTP request time in seconds');
      if (quiet && res.statusCode < 400) return;
      const actor = oneLine(req.headers['x-actor'], 80);
      logEvent(this.log, res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'log', { msg: 'request', requestId: req.id, method: req.method, route, status: res.statusCode, ms: Math.round(secs * 10000) / 10, actor: actor || undefined });
    });
    next();
  }
}
