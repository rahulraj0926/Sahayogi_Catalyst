import { createParamDecorator, ExecutionContext, SetMetadata, CanActivate, Injectable, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { adminActors, loadEnv } from '../../config/env';

/**
 * INTERIM identity (ENGINEERING_REVIEW step 2 replaces this with sessions): the person is named by the X-Actor header.
 * There is NO default name any more: mutating endpoints reject a request without an actor.
 */
export const actorOf = (req: Request): string | null => {
  const raw = req.headers['x-actor'];
  const v = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  return v ? v.slice(0, 80) : null;
};

export const Actor = createParamDecorator((_: unknown, ctx: ExecutionContext): string | null => actorOf(ctx.switchToHttp().getRequest<Request>()));

export type Role = 'admin' | 'member';
export const ROLES_KEY = 'roles';
/** Endpoint needs one of these roles (and therefore a named actor). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const rolesOf = (actor: string | null, env = loadEnv()): Role[] => {
  if (!actor) return [];
  const admins = adminActors(env);
  // development convenience: with no ADMIN_ACTORS configured everyone is admin. Production never does this.
  if (!admins.length && env.NODE_ENV !== 'production') return ['admin', 'member'];
  return admins.some((a) => a.toLowerCase() === actor.toLowerCase()) ? ['admin', 'member'] : ['member'];
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const need = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!need || !need.length) return true;
    const actor = actorOf(ctx.switchToHttp().getRequest<Request>());
    if (!actor) throw new UnauthorizedException({ code: 'actor_required', message: 'Say who you are (X-Actor header) before changing anything.' });
    const have = rolesOf(actor);
    if (!need.some((r) => have.includes(r))) throw new ForbiddenException({ code: 'role_required', message: `${actor} is not allowed to do this. It needs: ${need.join(' or ')}.` });
    return true;
  }
}
