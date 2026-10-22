import type { NextFunction, Request, Response } from 'express';
import { loadEnv } from '../config/env';
import { isTypedRoute } from './registry';

/**
 * A route that moved into a typed controller lives at /api/v1/... only. The older address (/api/people) still works for old callers:
 * this rewrites it to the new address and adds the Deprecation / Sunset headers, exactly like the routes still in the older table.
 * Mounted at the root, before the /api/v1 middleware, so the rewritten request goes through the same JSON parser and checks.
 */
export function oldAddressFallback() {
  return (req: Request, res: Response, next: NextFunction) => {
    const url = req.url;
    if (!url.startsWith('/api/') || url.startsWith('/api/v1') || url.startsWith('/api/docs')) return next();
    const path = url.split('?')[0];
    if (!isTypedRoute(req.method, path)) return next();
    res.setHeader('Deprecation', 'true');
    res.setHeader('Sunset', loadEnv().LEGACY_SUNSET);
    res.setHeader('Link', '</api/docs>; rel="deprecation"; type="text/html", </api/v1>; rel="successor-version"');
    req.url = '/api/v1' + url.slice(4);
    next();
  };
}
