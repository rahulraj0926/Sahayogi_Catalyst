/*
 * Hostile input: every typed engine route gets awkward ids, product names and bodies. The server must never answer 500, never show a stack
 * trace or a file path, never change Object.prototype, and must stay up. No database needed. Run: npx ts-node --transpile-only src/tests/hostile.test.ts
 */
import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { typedRoutes } from '../engine/registry';
import * as router from '../legacy/router';
import { seedPortfolio } from '../legacy/scripts/seed_portfolio';
import { engineApp } from './engine-app';
import { done, ok } from './helpers';

const PATH_VALUES = [
  '../../../etc/passwd', '..\\..\\windows\\win.ini', '%2e%2e%2f%2e%2e%2fsecret', 'a\u0000b', '__proto__', 'constructor', 'toString',
  'x'.repeat(5000), '<script>alert(1)</script>', "'; DROP TABLE products; --", '𝒳🙂‮', '   ', 'NaN', '-1', '1e999',
];
const BODIES: Array<[string, string]> = [
  ['empty object', '{}'],
  ['proto pollution', '{"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"polluted2":"yes"}}}'],
  ['wrong types', '{"text":123,"name":["a"],"fields":"nope","ids":{"a":1},"status":null,"depth_level":{},"steps":"x","category":true}'],
  ['array body', '[1,2,3]'],
  ['long strings', JSON.stringify({ text: 'y'.repeat(900_000), name: 'n'.repeat(100_000), one_liner: 'o'.repeat(50_000) })],
  ['deep nesting', '{"a":'.repeat(500) + '1' + '}'.repeat(500)],
  ['not json', '{"unclosed":'],
  ['null', 'null'],
];

async function main() {
  delete process.env.ANTHROPIC_API_KEY; // nothing may reach a paid service from a test
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-hostile-'));
  const portfolio: any = seedPortfolio(root);
  router.setPortfolio(portfolio);
  const p: any = { portfolio, async flush() { /* memory only */ }, async reloadProduct() { /* nothing */ }, async reloadRegistry() { /* nothing */ } };
  const { base, close } = await engineApp(p);
  const protoBefore = Object.getOwnPropertyNames(Object.prototype).sort().join(',');
  const pid = portfolio.list()[0].id;
  const problems: string[] = [];
  let sent = 0;

  const send = async (method: string, url: string, body?: string) => {
    sent++;
    try {
      const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', 'x-actor': 'Fuzzer' }, body: method === 'GET' || method === 'HEAD' ? undefined : body, signal: AbortSignal.timeout(20_000) });
      const text = await r.text();
      const label = `${method} ${url.slice(0, 90)}${body ? ' [' + body.slice(0, 40) + ']' : ''}`;
      if (r.status >= 500) problems.push(`${r.status} ${label}: ${text.slice(0, 160)}`);
      else if (r.status >= 400 && /\n\s+at [^\n]*\(|node_modules|\.ts:\d+|[A-Za-z]:\\\\Users|\/home\/|\/sessions\//.test(text.slice(0, 20_000)) && r.headers.get('content-type')?.includes('json')) problems.push(`leaks internals ${r.status} ${label}: ${text.slice(0, 160)}`);
    } catch (e: any) { problems.push(`no answer (${e.name}) ${method} ${url.slice(0, 90)}`); }
  };
  const fill = (pattern: string, v: string) => pattern.replace(/:([a-zA-Z_]+)/g, () => encodeURIComponent(v));
  const routes = typedRoutes().map((r) => ({ ...r, url: (v: string) => '/api/v1' + fill(r.pattern, v).slice(4) }));

  await ok(`awkward ids in every path (${routes.length} routes x ${PATH_VALUES.length} values): never a 500, never a stack trace`, async () => {
    for (const r of routes) for (const v of PATH_VALUES) await send(r.method, r.url(v) + (r.opts.noProduct ? '' : `?product=${pid}`), '{}');
    assert.deepEqual(problems, []);
  });

  await ok('awkward product names on every route that reads a product', async () => {
    for (const r of routes.filter((x) => !x.opts.noProduct && x.method === 'GET')) for (const v of PATH_VALUES) await send('GET', r.url('FR-0001') + `?product=${encodeURIComponent(v)}`);
    assert.deepEqual(problems, []);
  });

  await ok('awkward bodies on every route that takes one (wrong types, huge, nested, not JSON, __proto__)', async () => {
    for (const r of routes.filter((x) => x.method !== 'GET')) for (const [, b] of BODIES) await send(r.method, r.url('FR-0001') + (r.opts.noProduct ? '' : `?product=${pid}`), b);
    assert.deepEqual(problems, []);
  });

  await ok('awkward query strings (repeated keys, huge limit, injected operators) on every read', async () => {
    const qs = ['?limit=99999999999', '?limit=-5&q[]=a&q[]=b', '?q=' + encodeURIComponent('x'.repeat(10_000)), '?format=../../x&depth=%00', '?__proto__[polluted]=1&constructor[prototype][polluted]=1', '?status[$ne]=1'];
    for (const r of routes.filter((x) => x.method === 'GET')) for (const q of qs) await send('GET', r.url('FR-0001') + q + (r.opts.noProduct || q.includes('product') ? '' : `&product=${pid}`));
    assert.deepEqual(problems, []);
  });

  await ok('nothing polluted Object.prototype, and the server still answers', async () => {
    assert.equal(({} as any).polluted, undefined); assert.equal(({} as any).polluted2, undefined);
    assert.equal(Object.getOwnPropertyNames(Object.prototype).sort().join(','), protoBefore);
    const r = await fetch(base + '/api/v1/portfolio'); assert.equal(r.status, 200);
  });
  await ok('uploads with hostile file names stay inside the uploads folder and download only as attachments', async () => {
    const before = new Set<string>();
    const walk = (d: string, out: string[] = []) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const full = path.join(d, f.name); if (f.isDirectory()) walk(full, out); else out.push(full); } return out; };
    const names = ['../../evil.txt', '..\\..\\evil.txt', 'a/b/../../../evil.txt', '/etc/cron.d/evil', 'evil.html', 'x'.repeat(600) + '.txt', 'con.txt', '%2e%2e%2fevil.txt', 'a\u0000.png', ''];
    const parent = path.dirname(root);
    const outsideBefore = new Set(fs.readdirSync(parent));
    for (const f of walk(root)) before.add(f);
    const ids: string[] = [];
    const target = portfolio.store(pid).all()[0].id;
    let k = 0;
    for (const n of names) {
      const r = await fetch(`${base}/api/v1/attachments?product=${pid}&target=${target}&name=${encodeURIComponent(n)}`, { method: 'POST', headers: { 'content-type': 'text/html', 'x-actor': 'Fuzzer' }, body: `<script>alert(${++k})</script>` });
      assert.ok(r.status < 500, `upload "${n.slice(0, 30)}" gave ${r.status}`);
      const b: any = await r.json().catch(() => ({}));
      const att = b.attachment || b;
      if (r.status === 200 && att.id) { ids.push(att.id); assert.ok(!/[\\/]/.test(att.filename || att.name || ''), `stored name keeps no folder part: ${att.filename || att.name}`); }
    }
    assert.ok(ids.length >= 3, `most uploads should be accepted under a cleaned name (got ${ids.length})`);
    for (const f of walk(root)) if (!before.has(f)) assert.ok(path.resolve(f).startsWith(path.resolve(root) + path.sep), `new file outside the uploads folder: ${f}`);
    assert.deepEqual([...fs.readdirSync(parent)].filter((x) => !outsideBefore.has(x)), [], 'nothing was created beside the uploads folder');
    for (const id of ids) {
      const d = await fetch(`${base}/api/v1/attachments/${id}/download?product=${pid}`);
      assert.match(d.headers.get('content-disposition') || '', /^attachment/);
      const rawView = await fetch(`${base}/api/v1/attachments/${id}/raw?product=${pid}`);
      if (rawView.status === 200) assert.match(rawView.headers.get('content-security-policy') || '', /sandbox/);
    }
  });
  console.log(`  (${sent} hostile requests sent)`);
  await close();
  done();
}
main().catch((e) => { console.error(e); process.exit(1); });
