import type { NextFunction, Request, RequestHandler, Response } from 'express';

export interface RateLimitOptions {
  /** Window length in ms. */
  windowMs?: number;
  /** Requests allowed per window for reads (GET, HEAD). */
  reads: number;
  /** Requests allowed per window for anything that changes data. */
  writes: number;
}

interface Bucket { count: number; resetAt: number }

/**
 * Small fixed-window limiter for the routes that Nest's own throttler cannot see (the /api bridge is plain Express middleware).
 * Counts per caller address, with separate allowances for reads and writes. In memory, so with several API instances each
 * instance counts on its own; move to a shared store (Redis) when the API runs on more than one instance.
 */
export function rateLimit(opts: RateLimitOptions): RequestHandler & { reset(): void } {
  const windowMs = opts.windowMs ?? 60_000;
  const buckets = new Map<string, Bucket>();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }, windowMs);
  sweep.unref();

  const handler = ((req: Request, res: Response, next: NextFunction) => {
    const isRead = req.method === 'GET' || req.method === 'HEAD';
    const limit = isRead ? opts.reads : opts.writes;
    const key = `${req.ip || 'unknown'}|${isRead ? 'r' : 'w'}`;
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || b.resetAt <= now) { b = { count: 0, resetAt: now + windowMs }; buckets.set(key, b); }
    b.count++;
    const left = Math.max(0, limit - b.count);
    res.setHeader('RateLimit-Limit', String(limit));
    res.setHeader('RateLimit-Remaining', String(left));
    res.setHeader('RateLimit-Reset', String(Math.ceil((b.resetAt - now) / 1000)));
    if (b.count > limit) {
      const retry = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retry));
      return res.status(429).json({ error: 'Too many requests. Slow down and try again shortly.', code: 'rate_limited', retryAfter: retry });
    }
    next();
  }) as RequestHandler & { reset(): void };
  handler.reset = () => buckets.clear();
  return handler;
}
