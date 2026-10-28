import { Injectable } from '@nestjs/common';
import * as dns from 'node:dns';
import * as http from 'node:http';
import * as https from 'node:https';
import * as net from 'node:net';

/**
 * Proves that a competitor's website exists, without ever letting the server be pointed at something private.
 * The real checker opens the address itself; tests bind a fake one.
 */
export type UrlCheckResult =
  | { ok: true; status: number; finalUrl: string; title: string | null }
  | { ok: false; reason: 'unsafe' | 'unreachable' };

/** Narrows a result to its failure. (The engine runs without strict null checks, where a plain `!result.ok` does not narrow.) */
export const failed = <T extends { ok: boolean }>(r: T): r is Extract<T, { ok: false }> => !r.ok;

export abstract class UrlChecker {
  abstract check(url: string): Promise<UrlCheckResult>;
}

// ---------------------------------------------------------------- which addresses are public

const v4Parts = (ip: string): number[] | null => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  return p.every((n) => n <= 255) ? p : null;
};

/** Public means a normal address on the internet: not this machine, not a private or shared network, not reserved or special-purpose. */
export function isPublicIPv4(ip: string): boolean {
  const p = v4Parts(ip);
  if (!p) return false;
  const [a, b, c] = p;
  if (a === 0 || a === 10 || a === 127) return false;                       // "this" network, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return false;                        // shared address space (carrier-grade NAT)
  if (a === 169 && b === 254) return false;                                  // link-local (cloud metadata lives here)
  if (a === 172 && b >= 16 && b <= 31) return false;                         // private
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;           // protocol assignments, documentation
  if (a === 192 && b === 88 && c === 99) return false;                       // old 6to4 relay
  if (a === 192 && b === 168) return false;                                  // private
  if (a === 198 && (b === 18 || b === 19)) return false;                     // benchmarking
  if (a === 198 && b === 51 && c === 100) return false;                      // documentation
  if (a === 203 && b === 0 && c === 113) return false;                       // documentation
  if (a >= 224) return false;                                                // multicast, reserved, broadcast
  return true;
}

/** The eight 16-bit groups of an IPv6 address, or null when the text is not one. */
function v6Groups(text: string): number[] | null {
  let s = text.toLowerCase();
  if (s.includes('%')) return null;                                          // zone ids mean a local interface
  let tail: number[] = [];
  const dotted = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(s);
  if (dotted) {
    const p = v4Parts(dotted[1]);
    if (!p) return null;
    tail = [(p[0] << 8) | p[1], (p[2] << 8) | p[3]];
    s = s.slice(0, s.length - dotted[1].length) + '0:0';
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const parse = (h: string) => (h === '' ? [] : h.split(':').map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN)));
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  let groups: number[];
  if (halves.length === 2) {
    const fill = 8 - head.length - rest.length;
    if (fill < 1) return null;
    groups = [...head, ...Array(fill).fill(0), ...rest];
  } else groups = head;
  if (groups.length !== 8 || groups.some((g) => Number.isNaN(g))) return null;
  if (tail.length) { groups[6] = tail[0]; groups[7] = tail[1]; }
  return groups;
}

const v4Of = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

/** IPv6 is public only when it is global unicast (2000::/3) and not a documentation or special-purpose block. */
export function isPublicIPv6(ip: string): boolean {
  const g = v6Groups(ip);
  if (!g) return false;
  const zeros5 = g.slice(0, 5).every((x) => x === 0);
  if (zeros5 && g[5] === 0xffff) return isPublicIPv4(v4Of(g[6], g[7]));  // IPv4-mapped: judge the IPv4 inside
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return isPublicIPv4(v4Of(g[6], g[7])); // NAT64
  if (g[0] === 0x2002) return isPublicIPv4(v4Of(g[1], g[2]));                // 6to4: judge the IPv4 inside
  if ((g[0] & 0xe000) !== 0x2000) return false;                              // not global unicast: loopback, unspecified, ULA, link-local, multicast ...
  if (g[0] === 0x2001 && g[1] < 0x200) return false;                         // 2001::/23 protocol assignments (Teredo, benchmarking, ORCHID ...)
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false;                      // documentation
  if (g[0] === 0x3fff && g[1] < 0x1000) return false;                        // documentation
  return true;
}

export function isPublicAddress(ip: string): boolean {
  const bare = ip.startsWith('[') && ip.endsWith(']') ? ip.slice(1, -1) : ip;
  if (net.isIPv4(bare)) return isPublicIPv4(bare);
  if (net.isIPv6(bare)) return isPublicIPv6(bare);
  return false;
}

// ---------------------------------------------------------------- what an address may look like

/** Names that point inside a network, never at a public business website. */
const INSIDE_SUFFIXES = ['.localhost', '.local', '.internal', '.intranet', '.lan', '.home', '.corp', '.private', '.home.arpa'];

export type Inspected = { ok: true; url: URL; host: string } | { ok: false; reason: 'bad' | 'unsafe' };

/** Is this an ordinary public web address? Same rules for what a person types and for every redirect the checker follows. */
export function inspectUrl(raw: string): Inspected {
  let url: URL;
  try { url = new URL(raw); } catch { return { ok: false, reason: 'bad' }; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, reason: 'unsafe' };
  if (url.username || url.password) return { ok: false, reason: 'unsafe' };
  if (url.port !== '') return { ok: false, reason: 'unsafe' };               // new URL() drops the default port, so any port left is a non-default one
  const host = url.hostname.replace(/\.$/, '').toLowerCase();
  if (!host) return { ok: false, reason: 'bad' };
  const bare = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  if (net.isIP(bare)) return { ok: false, reason: isPublicAddress(bare) ? 'bad' : 'unsafe' }; // a business website is reached by its name, not an IP number
  if (host === 'localhost' || INSIDE_SUFFIXES.some((s) => host.endsWith(s))) return { ok: false, reason: 'unsafe' };
  if (!host.includes('.')) return { ok: false, reason: 'unsafe' };           // one-word names only exist inside a network
  if (!/^[a-z0-9.-]+$/.test(host) || host.startsWith('-') || host.includes('..')) return { ok: false, reason: 'bad' }; // the URL parser has already turned international names into ASCII
  return { ok: true, url, host };
}

// ---------------------------------------------------------------- the real checker

const MAX_REDIRECTS = 3;
const TOTAL_MS = 6000;
const MAX_BYTES = 64 * 1024;
const USER_AGENT = 'SahayogiCatalyst-LinkCheck/1.0';
const REDIRECT = new Set([301, 302, 303, 307, 308]);

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ndash: '–', mdash: '—' };
/** The page title, with the common entities decoded, spaces tidied and cut to 200 characters. */
export function titleOf(html: string): string | null {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!m) return null;
  const decoded = m[1]
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(Number(d)))
    .replace(/&([a-z]+);/gi, (all, n) => ENTITIES[n.toLowerCase()] ?? all)
    .replace(/\s+/g, ' ').trim();
  return decoded ? decoded.slice(0, 200) : null;
}
const safeChar = (n: number) => (Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '');

/** Looks the name up and refuses any answer that is not a public address, at the moment of connecting, so a name that changes its answer cannot slip through. */
export const safeLookup = ((hostname: string, options: dns.LookupOptions, cb: (...a: unknown[]) => void) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err);
    const list = addresses as dns.LookupAddress[];
    if (!list.length || list.some((a) => !isPublicAddress(a.address))) {
      return cb(Object.assign(new Error('That name points at a private address.'), { code: 'UNSAFE_ADDRESS' }));
    }
    if (options.all) return cb(null, list);
    cb(null, list[0].address, list[0].family);
  });
}) as unknown as net.LookupFunction;

type Hop = { status: number; location?: string; body: string };

function fetchHop(url: URL, timeLeftMs: number): Promise<Hop> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    let settled = false;
    const finish = (fn: () => void) => { if (!settled) { settled = true; clearTimeout(timer); fn(); } };
    const req = lib.request(url, { method: 'GET', lookup: safeLookup, headers: { 'user-agent': USER_AGENT, accept: 'text/html,*/*;q=0.5', 'accept-encoding': 'identity' } }, (res) => {
      const status = res.statusCode || 0;
      const type = String(res.headers['content-type'] || '');
      const readable = (!type || /html/i.test(type)) && !res.headers['content-encoding'];
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (d: Buffer) => {
        if (!readable) { res.destroy(); return; }
        chunks.push(d); size += d.length;
        if (size >= MAX_BYTES) res.destroy();
      });
      const end = () => finish(() => resolve({ status, location: String(res.headers.location || '') || undefined, body: Buffer.concat(chunks).subarray(0, MAX_BYTES).toString('utf8') }));
      res.on('end', end); res.on('close', end);
      res.on('error', end);
    });
    const timer = setTimeout(() => { req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })); }, Math.max(1, timeLeftMs));
    req.on('error', (e) => finish(() => reject(e)));
    req.end();
  });
}

@Injectable()
export class SafeUrlChecker extends UrlChecker {
  async check(raw: string): Promise<UrlCheckResult> {
    const started = Date.now();
    let current = raw;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const seen = inspectUrl(current);
      if (failed(seen)) return { ok: false, reason: seen.reason === 'unsafe' ? 'unsafe' : 'unreachable' };
      const left = TOTAL_MS - (Date.now() - started);
      if (left <= 0) return { ok: false, reason: 'unreachable' };
      let res: Hop;
      try { res = await fetchHop(seen.url, left); } catch (e) {
        return { ok: false, reason: (e as { code?: string }).code === 'UNSAFE_ADDRESS' ? 'unsafe' : 'unreachable' };
      }
      if (REDIRECT.has(res.status) && res.location) {
        if (hop === MAX_REDIRECTS) return { ok: false, reason: 'unreachable' };
        try { current = new URL(res.location, seen.url).href; } catch { return { ok: false, reason: 'unreachable' }; }
        continue;
      }
      if (res.status < 100) return { ok: false, reason: 'unreachable' };
      const final = new URL(current); final.hash = '';
      return { ok: true, status: res.status, finalUrl: final.href, title: titleOf(res.body) };
    }
    return { ok: false, reason: 'unreachable' };
  }
}
