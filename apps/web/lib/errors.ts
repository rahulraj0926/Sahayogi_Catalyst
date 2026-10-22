import { toast } from 'sonner';

/** What the API sends for every failure: { code, message, details?, requestId, statusCode } (see apps/api/src/common/filters). */
export class ApiError extends Error {
  status: number;
  code: string;
  requestId?: string;
  details?: unknown;
  data: any;
  constructor(message: string, o: { status: number; code?: string; requestId?: string; details?: unknown; data?: any }) {
    super(message);
    this.name = 'ApiError';
    this.status = o.status;
    this.code = o.code || 'error';
    this.requestId = o.requestId;
    this.details = o.details;
    this.data = o.data || {};
  }
}

/** Plain wording for the codes a person can act on. A code that is not listed shows the server's own message. */
const BY_CODE: Record<string, string> = {
  network: 'Cannot reach the server. Check your connection and try again.',
  actor_required: 'Say who you are first (your name, top right), then try again.',
  role_required: 'Your role is not allowed to do this. Ask an administrator.',
  unauthenticated: 'Please sign in first.',
  forbidden: 'You are not allowed to do this.',
  stale_edit: 'Someone else changed this while you were editing. Reload it and make your change again.',
  stale_gate: 'The checks for this gate changed while you were looking at them. Reload and look again.',
  save_failed: 'The change could not be saved, so nothing was changed. Try again in a moment.',
  rate_limited: 'Too many changes too quickly. Wait a few seconds and try again.',
  payload_too_large: 'That is too large to send.',
  not_found: 'That could not be found. It may have been removed.',
  internal_error: 'Something went wrong on our side.',
};

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

/** The sentence to show a person for any caught error. */
export function errorMessage(e: unknown): string {
  if (isApiError(e)) {
    if (e.code === 'validation_failed' && Array.isArray(e.details) && e.details.length) return `${e.message} ${e.details.slice(0, 3).join('; ')}`;
    return BY_CODE[e.code] && e.code !== 'not_found' ? BY_CODE[e.code] : e.message || BY_CODE[e.code] || 'Something went wrong.';
  }
  return e instanceof Error && e.message ? e.message : 'Something went wrong.';
}

/** The code to quote when reporting a problem, or '' when there is none. */
export const requestIdOf = (e: unknown): string => (isApiError(e) && e.requestId) || (e as any)?.digest || '';

/** One way to tell the person a call failed: a toast, with the request id when the server had trouble. */
export function notifyError(e: unknown, prefix?: string) {
  const id = isApiError(e) && e.status >= 500 ? requestIdOf(e) : '';
  toast.error((prefix ? prefix + ' ' : '') + errorMessage(e), id ? { description: `Request id: ${id}` } : undefined);
}

let reported = 0;
const seen = new Set<string>();
/** Tell the server a screen crashed, so it reaches the server log with the request id. Never throws, sends at most 5 reports per page load. */
export function reportClientError(e: unknown, source: 'error-page' | 'global-error' | 'window' = 'error-page') {
  try {
    const err = e as { message?: string; stack?: string; digest?: string };
    const message = String(err?.message || e || 'unknown error').slice(0, 1000);
    if (reported >= 5 || seen.has(message)) return;
    reported++; seen.add(message);
    void fetch('/api/v1/client-errors', {
      method: 'POST', keepalive: true,
      headers: { 'content-type': 'application/json', 'x-actor': (() => { try { return localStorage.getItem('sd_actor') || ''; } catch { return ''; } })() },
      body: JSON.stringify({ message, stack: err?.stack?.slice(0, 6000), digest: err?.digest, url: location.pathname + location.search, request_id: requestIdOf(e) || undefined, source }),
    }).catch(() => undefined);
  } catch { /* reporting must never cause another error */ }
}
