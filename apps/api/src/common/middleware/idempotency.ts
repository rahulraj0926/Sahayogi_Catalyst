import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Idempotency-Key for /api/v1 changes (F17). A client that is unsure whether a POST arrived (timeout, double click, retry) sends the same
 * key again and gets the first answer back (header `Idempotent-Replayed: true`) instead of doing the change twice.
 *  - same key + same request  -> the stored answer is replayed
 *  - same key + different request -> 422 idempotency_key_reuse
 *  - same key while the first request is still running -> 409 request_in_progress
 * Answers with status 5xx are not stored, so a retry can succeed. The store is in memory (one API instance, 24 hours, 5000 keys).
 * With several instances, replace `IdempotencyStore` by a table in PostgreSQL.
 */
export interface Stored { fingerprint: string; status?: number; body?: unknown; at: number }
export class IdempotencyStore {
  private m = new Map<string, Stored>();
  constructor(private ttlMs = 24 * 3600_000, private max = 5000) {}
  get(k: string): Stored | undefined { const s = this.m.get(k); if (s && Date.now() - s.at > this.ttlMs) { this.m.delete(k); return undefined; } return s; }
  set(k: string, v: Stored) { this.m.set(k, v); while (this.m.size > this.max) this.m.delete(this.m.keys().next().value as string); }
  delete(k: string) { this.m.delete(k); }
}

const fail = (res: Response, req: Request, statusCode: number, code: string, message: string) => res.status(statusCode).json({ code, message, requestId: req.id, statusCode });

export function idempotency(store = new IdempotencyStore()) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    const header = req.headers['idempotency-key'];
    if (header === undefined) return next();
    const key = Array.isArray(header) ? header[0] : header;
    if (!/^[A-Za-z0-9_.:-]{8,100}$/.test(key)) return fail(res, req, 400, 'invalid_idempotency_key', 'Idempotency-Key must be 8 to 100 letters, digits or _ . : -');
    const who = String(req.headers['x-actor'] || '');
    const id = `${who}|${req.method}|${req.originalUrl.split('?')[0]}|${key}`;
    const fingerprint = createHash('sha256').update(req.originalUrl + '\n' + JSON.stringify(req.body ?? null)).digest('hex');
    const seen = store.get(id);
    if (seen) {
      if (seen.fingerprint !== fingerprint) return fail(res, req, 422, 'idempotency_key_reuse', 'This Idempotency-Key was already used for a different request.');
      if (seen.status === undefined) return fail(res, req, 409, 'request_in_progress', 'The first request with this Idempotency-Key is still running. Try again shortly.');
      res.setHeader('Idempotent-Replayed', 'true');
      return void res.status(seen.status).json(seen.body);
    }
    store.set(id, { fingerprint, at: Date.now() });
    const json = res.json.bind(res);
    res.json = (body?: unknown) => {
      if (res.statusCode >= 500) store.delete(id); else store.set(id, { fingerprint, status: res.statusCode, body, at: Date.now() });
      return json(body);
    };
    res.on('close', () => { const s = store.get(id); if (s && s.status === undefined) store.delete(id); }); // client gone before an answer
    next();
  };
}
