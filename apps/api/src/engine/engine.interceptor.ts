import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { from, Observable, throwError } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { PersistenceService } from '../persistence.service';
import type { EngineRouteOpts } from './engine.decorators';
import { ENGINE_KEY } from './engine.keys';
import { engineLimit } from './limit';
import { recordRefusal } from './refusals';
import { commit, commitAfterError, openScope, savesAfter, ScopeOpts } from './scope';

/** Applies the lifecycle engine's rules to a typed controller route; see engine.decorators.ts. */
@Injectable()
export class EngineInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector, private readonly persistence: PersistenceService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = ctx.switchToHttp();
    const req = http.getRequest<Request & { engineScope?: unknown }>();
    const res = http.getResponse<Response>();
    const route = this.reflector.get<EngineRouteOpts | undefined>(ENGINE_KEY, ctx.getHandler()) || {};
    const opts: ScopeOpts = { ...route, mutating: route.mutating ?? !['GET', 'HEAD'].includes(req.method) };
    return from((async () => {
      // the shared per-address allowance; when it is used up the caller gets the single error envelope (429 rate_limited)
      let blocked: { status: number; body: { error?: string; retryAfter?: number } } | undefined;
      let code = 200;
      const stand: any = { setHeader: (k: string, v: string) => res.setHeader(k, v), status(c: number) { code = c; return stand; }, json(b: any) { blocked = { status: code, body: b }; return stand; } };
      engineLimit()(req, stand, () => undefined);
      if (blocked) throw Object.assign(new Error(blocked.body.error || 'Too many requests.'), { status: 429, code: 'rate_limited', retryAfter: blocked.body.retryAfter });
      // older callers put `actor` in the body; it was never trusted (the X-Actor header is), so drop it before the body is checked
      const b = (req as { body?: Record<string, unknown> }).body; if (b && typeof b === 'object' && 'actor' in b) delete b.actor;
      const scope = openScope(this.persistence, req, opts);
      req.engineScope = scope;
      if (scope.product) res.setHeader('X-Product', scope.product.id);
      return { scope };
    })()).pipe(mergeMap((first) => {
      return from((async () => {
        try {
          const result = await new Promise<unknown>((resolve, reject) => next.handle().subscribe({ next: (v) => resolve(v), error: reject, complete: () => resolve(undefined) }));
          if (savesAfter(opts)) await commit(this.persistence, first.scope);
          // a file answer ({ __raw, headers }): sent as it is, with the headers the route chose
          if (result && typeof result === 'object' && '__raw' in result) {
            const f = result as { __raw: string | Buffer; headers?: Record<string, string>; status?: number };
            res.set(f.headers || {}); res.status(f.status || 200);
            return new StreamableFile(Buffer.isBuffer(f.__raw) ? f.__raw : Buffer.from(String(f.__raw)));
          }
          return result === undefined ? { ok: true } : result;
        } catch (e) {
          throw opts.mutating ? await commitAfterError(this.persistence, first.scope, e) : e;
        }
      })());
    }), catchError((e) => { recordRefusal(this.persistence, req, e, !!opts.admin); return throwError(() => e); }));
  }
}
