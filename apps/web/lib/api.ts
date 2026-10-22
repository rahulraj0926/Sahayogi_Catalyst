'use client';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, errorMessage } from './errors';

export { ApiError, errorMessage, notifyError, isApiError } from './errors';

export type Json = any;

/** Last answer of every GET, so a page you have seen before opens at once and refreshes quietly in the background. */
const CACHE = new Map<string, any>();
const cacheKey = (path: string, pid?: string) => `${pid || ''}|${path}`;

/** The person using the app. Until real sign-in exists everyone in this build is this person; the old placeholder name is replaced. */
const ME = 'Dhruv Singla';
/** Older records were saved under the placeholder name "oo". Everything shown on screen uses the real name instead. */
export const showName = (s: string) => (/\boo\b/.test(s) ? s.replace(/\boo\b/g, ME) : s);
export function actor(): string {
  try {
    const v = (localStorage.getItem('sd_actor') || '').trim();
    if (!v || v === 'Reviewer' || /^oo$/i.test(v)) { localStorage.setItem('sd_actor', ME); return ME; }
    return v;
  } catch { return ME; }
}
export function setActor(name: string) { try { localStorage.setItem('sd_actor', name); } catch { /* storage blocked */ } }

/** Forget every remembered answer (after something was changed without going through api()). */
export function clearApiCache() { CACHE.clear(); }

export async function api<T = Json>(path: string, init?: { method?: string; body?: unknown; product?: string }): Promise<T> {
  // a call made from /products/<product>/... is about that product even when the caller did not say so
  const fromUrl = typeof window !== 'undefined' ? /^\/products\/([^/]+)/.exec(window.location.pathname)?.[1] : undefined;
  const product = init?.product || (fromUrl ? decodeURIComponent(fromUrl) : undefined);
  const url = product && !/[?&]product=/.test(path) ? path + (path.includes('?') ? '&' : '?') + 'product=' + encodeURIComponent(product) : path;
  let res: Response;
  try {
    res = await fetch('/api/v1' + url, {
      method: init?.method || 'GET',
      headers: { 'content-type': 'application/json', 'x-actor': actor() },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError('Cannot reach the server.', { status: 0, code: 'network' });
  }
  const data = await res.text().then((t) => JSON.parse(showName(t))).catch(() => ({}));
  if (res.ok && init?.method && init.method !== 'GET') CACHE.clear(); // something changed: do not show old answers
  if (!res.ok) throw new ApiError(data.message || data.error || `Request failed (${res.status})`, { status: res.status, code: data.code, requestId: data.requestId, details: data.details, data });
  return data as T;
}

/** GET a path (scoped to a product when `pid` is given). `reload()` fetches again. `keep` leaves the previous answer on screen while a changed path loads, so changing a filter does not blank the page. */
export function useApi<T = Json>(path: string | null, pid?: string, opts?: { keep?: boolean }) {
  const key = path ? cacheKey(path, pid) : '';
  const [data, setData] = useState<T | null>(() => (key && CACHE.has(key) ? CACHE.get(key) : null));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => !(key && CACHE.has(key)));
  const load = useCallback(() => {
    if (!path) return;
    const k = cacheKey(path, pid);
    if (!CACHE.has(k)) setLoading(true);
    api<T>(path, { product: pid }).then((d) => { CACHE.set(k, d); setData(d); setError(null); }).catch((e) => setError(errorMessage(e))).finally(() => setLoading(false));
  }, [path, pid]);
  useEffect(() => {
    const k = path ? cacheKey(path, pid) : '';
    if (k && CACHE.has(k)) { setData(CACHE.get(k)); setLoading(false); } else if (!opts?.keep) { setData(null); } // keep: the old answer stays on screen until the new one arrives
    load();
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error, loading, reload: load };
}

export const tone = (status: string): string => {
  const s = String(status || '').toLowerCase();
  if (/signed off|passed|pass|approved|complete|consistent|accepted|done|released|deployed/.test(s) && !/not|without/.test(s)) return 'ok';
  if (/hold|waived|conditions|pending|progress|review|draft|attest|proposed|planned/.test(s)) return 'warn';
  if (/fail|blocked|reject|open|risk|at_risk|critical/.test(s)) return 'bad';
  return '';
};

/** The server hands out prototype-style hash links ("#/p/PRD-1/work/S1-A", "#/gates/2"). Turn one into a platform path. */
export function go(pid: string, href?: string | null): string {
  if (!href) return `/products/${pid}`;
  const h = href.replace(/^#/, '').replace(/^\/p\//, '/products/');
  if (h === '/' || h === '') return '/';
  if (h.startsWith('/products/')) return h;
  if (h.startsWith('/go/')) return `/products/${pid}/${h.slice(4)}`;
  return `/products/${pid}${h.startsWith('/') ? h : '/' + h}`;
}
