/**
 * engine/scope.ts - the rules every lifecycle-engine route follows, in one place. The
 * typed controllers (engine/engine.interceptor.ts) use these functions:
 *  - a change needs a named person (X-Actor); some routes need the admin role
 *  - the product comes from ?product= or X-Product
 *  - after a change the product is saved to PostgreSQL; if that fails the product is reloaded from the database and the caller gets
 *    503 save_failed, so memory never keeps a change the database does not have
 */
import { Logger } from '@nestjs/common';
import type { Request } from 'express';
import { actorOf, rolesOf } from '../common/auth/actor';
import * as approvals from '../legacy/engine/approvals';
import * as selfcheck from '../legacy/engine/selfcheck';
import type { PersistenceService } from '../persistence.service';

const log = new Logger('legacy-api');

export const httpError = (status: number, message: string, code: string) => Object.assign(new Error(message), { status, code });

export interface ScopeOpts {
  /** the route changes data: it needs X-Actor and its changes are saved afterwards */
  mutating: boolean;
  /** a read that leaves an audit record (an export): saved afterwards, no X-Actor demanded */
  records?: boolean;
  admin?: boolean;
  /** portfolio-level route: no product, no store */
  noProduct?: boolean;
  /** the product is optional (the first non-archived one is used when none is named; none at all is allowed) */
  optionalProduct?: boolean;
}

export interface Scope { actor: string; portfolio: any; product: any; store: any }

/** Checks who is asking and which product, before the body is read. Throws the same errors the older routes always threw. */
export function openScope(persistence: PersistenceService, req: Request, o: ScopeOpts): Scope {
  const actor = actorOf(req) || '';
  if (o.mutating && !actor) throw httpError(401, 'Say who you are (X-Actor header) before changing anything.', 'actor_required');
  if (o.admin && !rolesOf(actor || null).includes('admin')) throw httpError(actor ? 403 : 401, actor ? `${actor} is not allowed to do this. It needs: admin.` : 'Say who you are (X-Actor header) before doing this.', actor ? 'role_required' : 'actor_required');
  const portfolio = persistence.portfolio;
  let product: any = null, store: any = null;
  if (!o.noProduct) {
    const q = (req.query as Record<string, string>).product;
    const wanted = (Array.isArray(q) ? q[0] : q) || (req.headers['x-product'] as string) || null;
    if (o.optionalProduct && !wanted && !portfolio.defaultProduct()) { product = null; store = null; }
    else { product = portfolio.resolve(wanted); store = portfolio.store(product.id); }
  }
  approvals.configure((portfolio.reg.settings = portfolio.reg.settings || {}));
  selfcheck.configure((a) => (portfolio.reg.settings as any).admins_check_own !== false && rolesOf(a).includes('admin'));
  return { actor, portfolio, product, store };
}

export const savesAfter = (o: ScopeOpts) => !!(o.mutating || o.records);

/** After a handler succeeded: write the product (and the portfolio record) to PostgreSQL. */
export async function commit(persistence: PersistenceService, s: Scope): Promise<void> {
  const { portfolio, product } = s;
  if (product) {
    portfolio.save(product.id);
    const before = JSON.stringify(product);
    portfolio.sync(product.id);
    if (JSON.stringify(product) !== before) portfolio.saveRegistry();
  }
  await saveOrRollback(persistence, product && product.id);
}

/**
 * The handler may have changed memory before it threw (the engine is not transactional): keep those changes only if they can be saved.
 * Returns the error to answer with: the original one, or the save failure.
 */
export async function commitAfterError(persistence: PersistenceService, s: Scope, e: any): Promise<any> {
  if (s.product && !e?.saveFailed) {
    try { s.portfolio.save(s.product.id); s.portfolio.sync(s.product.id); await saveOrRollback(persistence, s.product.id); }
    catch (e2: any) { return e2; }
  }
  return e;
}

/** Write pending changes; when that fails, put the product back as the database has it and tell the caller nothing was kept. */
export async function saveOrRollback(persistence: PersistenceService, productId: string | null) {
  try { await persistence.flush(); }
  catch (e: any) {
    log.error(`save failed${productId ? ` for ${productId}` : ''}: ${e.message}`);
    try { if (productId) await persistence.reloadProduct(productId); await persistence.reloadRegistry(); }
    catch (e2: any) { log.error(`could not reload after a failed save: ${e2.message}`); }
    throw Object.assign(httpError(503, 'Could not save your change, so nothing was kept. Try again in a moment.', 'save_failed'), { saveFailed: true });
  }
}
