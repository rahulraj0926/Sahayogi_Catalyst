import type { Request } from 'express';
import { routeOf } from '../common/middleware/request-id.middleware';
import { oneLine } from '../common/logging/json-logger';
import type { PersistenceService } from '../persistence.service';

/**
 * Refused attempts that matter for security or trust go into the system audit trail: someone without the admin role tried an admin
 * action, an admin action was tried with no name, or a change could not be saved. Ordinary refusals (a missing name on a normal change,
 * a stale edit, a duplicate) stay out: they are everyday and would drown the trail. To keep a flood of bad requests from filling the
 * database, the same person doing the same thing is recorded once a minute, and at most 30 records are written a minute.
 */
const lastSeen = new Map<string, number>();
let windowStart = 0, inWindow = 0;
const MAX_PER_MINUTE = 30, SAME_EVERY_MS = 60_000;

export function recordRefusal(persistence: PersistenceService, req: Request, err: any, admin: boolean, now = Date.now()) {
  try {
    const code = err?.code;
    let action: string | null = null;
    if (code === 'role_required') action = 'access.denied';
    else if (code === 'actor_required' && admin) action = 'access.denied';
    else if (code === 'save_failed') action = 'save.failed';
    if (!action) return false;
    const pf: any = persistence.portfolio;
    if (!pf || typeof pf.systemEvent !== 'function') return false;
    const actor = oneLine(req.headers['x-actor'], 80);
    const where = `${req.method} ${routeOf(req)}`;
    const key = `${action}|${actor}|${where}`;
    if (now - windowStart > 60_000) { windowStart = now; inWindow = 0; }
    if (inWindow >= MAX_PER_MINUTE || (lastSeen.get(key) ?? 0) > now - SAME_EVERY_MS) return false;
    inWindow++; lastSeen.set(key, now);
    if (lastSeen.size > 500) for (const [k, t] of lastSeen) if (t < now - SAME_EVERY_MS) lastSeen.delete(k);
    const summary = action === 'save.failed'
      ? `A change by ${actor || 'someone (no name given)'} could not be saved (${where}); nothing was kept`
      : `${actor || 'someone (no name given)'} was refused ${where}: ${code === 'role_required' ? 'the admin role is needed' : 'no name was given for an admin action'}`;
    pf.systemEvent(action, where, actor || null, summary);
    // written with the next save; try now so it is not left waiting (it fails quietly when the database is the problem, and is kept for the next save)
    void persistence.flush().catch(() => undefined);
    return true;
  } catch { return false; }
}

export const _resetRefusals = () => { lastSeen.clear(); windowStart = 0; inWindow = 0; };
