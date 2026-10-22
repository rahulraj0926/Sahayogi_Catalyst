/**
 * The typed engine routes (those moved from the older route table into controllers), listed from the controllers' own decorators.
 * Used by: the old-address fallback (/api/people -> /api/v1/people), the API reference check and the OpenAPI documents.
 */
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { ENGINE_ROUTES } from './engine.decorators';
import './controllers';

export interface TypedRoute {
  method: string;
  /** the engine's own spelling, e.g. /api/items/:id (served at /api/v1/items/:id and, until the sunset date, at /api/items/:id) */
  pattern: string;
  re: RegExp;
  opts: Record<string, unknown>;
}

const join = (a: string, b: string) => ('/' + [a, b].map((x) => x.replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/'));

let cache: TypedRoute[] | undefined;
export function typedRoutes(): TypedRoute[] {
  if (cache) return cache;
  cache = ENGINE_ROUTES.map(({ target, key, opts }) => {
    const ctor = (target as { constructor: Function }).constructor;
    const fn = (target as Record<string, Function>)[key];
    const base = Reflect.getMetadata(PATH_METADATA, ctor) || '';
    const own = Reflect.getMetadata(PATH_METADATA, fn) || '';
    const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, fn)];
    const pattern = '/api' + join(Array.isArray(base) ? base[0] : base, Array.isArray(own) ? own[0] : own);
    const re = new RegExp('^' + pattern.replace(/:([a-zA-Z_]+)/g, '([^/]+)') + '/?$');
    return { method, pattern, re, opts: opts as Record<string, unknown> };
  });
  return cache;
}

/** Is there a typed engine route for this method and old-style path (/api/people)? */
export const isTypedRoute = (method: string, pathname: string) => typedRoutes().some((r) => r.method === method && r.re.test(pathname));
