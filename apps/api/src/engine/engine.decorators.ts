/**
 * Typed controllers for the lifecycle engine. A route class is marked with @EngineController('items') and each handler with
 * @EngineRoute({...}); the EngineInterceptor then applies the engine rules (named person, admin, product scope, save with rollback,
 * rate limit) exactly as the older route table did, and @Ctx() hands the handler the product, its store and the actor.
 */
import { applyDecorators, Controller, createParamDecorator, ExecutionContext, HttpCode, SetMetadata, UseInterceptors } from '@nestjs/common';
import { ApiExtension, ApiHeader, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { ScopeOpts, Scope } from './scope';
import { EngineInterceptor } from './engine.interceptor';
import { ENGINE_KEY } from './engine.keys';

export type EngineRouteOpts = Partial<ScopeOpts> & { tag?: string };

/** every typed engine handler, filled in as the controller classes load: lets the contract test and the old-address fallback list them */
export const ENGINE_ROUTES: { target: object; key: string; opts: EngineRouteOpts }[] = [];

export function EngineController(path: string, tag?: string) {
  return applyDecorators(Controller(path), UseInterceptors(EngineInterceptor), ...(tag ? [ApiTags(tag)] : []));
}

export function EngineRoute(opts: EngineRouteOpts = {}): MethodDecorator {
  return (target, key, desc) => {
    ENGINE_ROUTES.push({ target, key: String(key), opts });
    const decorators: MethodDecorator[] = [SetMetadata(ENGINE_KEY, opts), HttpCode(200), ApiExtension('x-engine', true) as MethodDecorator];
    if (!opts.noProduct) decorators.push(ApiQuery({ name: 'product', required: false, description: 'Product id such as PRD-001 (or send X-Product).' }) as MethodDecorator);
    decorators.push(ApiHeader({ name: 'X-Actor', required: false, description: 'Who is acting. Required for every change.' }) as MethodDecorator);
    if (opts.mutating) decorators.push(ApiSecurity('actor') as MethodDecorator);
    for (const d of decorators) d(target, key, desc);
  };
}

/** The product, its store and the person, as the interceptor resolved them for this request. */
export const Ctx = createParamDecorator((_: unknown, ctx: ExecutionContext): Scope => ctx.switchToHttp().getRequest().engineScope);
export type EngineCtx = Scope;
