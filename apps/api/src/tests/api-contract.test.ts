/**
 * API reference and web app stay in step with the backend. No database needed. Run: npm run test:contract -w apps/api
 *
 *  1. Every route the server has (the older route table) is listed in docs/api/openapi.v1.json, with the same method.
 *  2. Every API call the web app makes (api(...), useApi(...), fetch('/api/...')) matches a route in that file.
 *  3. The Swagger page docs/api/swagger.html carries the same description as the JSON.
 * A failure says what to do: regenerate the reference (npm run openapi:export -w apps/api), or fix the call / route that no longer matches.
 */
import 'reflect-metadata';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { routes as tableRoutes } from '../legacy/router';
import { typedRoutes } from '../engine/registry';
// the engine's routes: those still in the older table, plus those moved into typed controllers (F13)
const routes: any[] = [...(tableRoutes as any[]), ...typedRoutes()];

const repo = path.resolve(__dirname, '..', '..', '..', '..');
const specFile = path.join(repo, 'docs', 'api', 'openapi.v1.json');
const htmlFile = path.join(repo, 'docs', 'api', 'swagger.html');
let failed = 0;
const check = (ok: boolean, name: string, detail: string[] = []) => {
  console.log(`${ok ? '  ok ' : '  FAIL'} ${name}`);
  if (!ok) { failed++; for (const d of detail.slice(0, 25)) console.log(`       ${d}`); if (detail.length > 25) console.log(`       ... and ${detail.length - 25} more`); }
};

const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
const toRegex = (p: string) => new RegExp('^' + p.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[^}]+\}/g, '[^/]+') + '/?$');
const ops: { method: string; re: RegExp; path: string }[] = [];
for (const [p, item] of Object.entries<any>(spec.paths)) for (const m of Object.keys(item)) if (['get', 'post', 'put', 'patch', 'delete'].includes(m)) ops.push({ method: m.toUpperCase(), re: toRegex(p), path: p });

// 1. every server route is in the reference
const missing = (routes as any[]).filter((r) => r.pattern && r.pattern.startsWith('/api/') && !spec.paths['/api/v1' + r.pattern.slice(4).replace(/:([a-zA-Z_]+)/g, '{$1}')]?.[r.method.toLowerCase()]).map((r) => `${r.method} ${r.pattern}`);
const engineOps = Object.values<any>(spec.paths).flatMap((it) => Object.values<any>(it)).filter((o) => o && (o['x-legacy'] || o['x-engine'])).length;
check(engineOps === (routes as any[]).length, `the reference lists each of the ${(routes as any[]).length} engine routes once under /api/v1 (a typed endpoint with the same address would hide one)`, [`${engineOps} listed`]);
check(missing.length === 0, `all ${(routes as any[]).length} server routes are in the API reference`, [...missing, 'Run: npm run openapi:export -w apps/api, then commit docs/api']);

// 1b. every hand-written description (legacy/openapi-docs) is for a route that exists
import { routeDocs } from '../legacy/openapi-docs';
const have = new Set((routes as any[]).map((r) => `${r.method} ${String(r.pattern).replace(/:([a-zA-Z_]+)/g, '{$1}')}`)); // descriptions are keyed by the engine's own address
const orphan = Object.keys(routeDocs).filter((k) => !have.has(k));
check(orphan.length === 0, `all ${Object.keys(routeDocs).length} written route descriptions belong to a route that exists`, orphan.map((k) => `${k} has a description but no route; fix the key or delete the entry (legacy/openapi-docs)`));
const undescribed = [...have].filter((k) => !routeDocs[k]);
check(undescribed.length === 0, 'every route has a written description (parameters, body, answer)', [...undescribed.map((k) => `${k} has no description`), 'Add it to a file in apps/api/src/legacy/openapi-docs, then run npm run openapi:export -w apps/api']);

// 2. every call the web app makes matches a route
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', 'dist'].includes(e.name)) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out); else if (/\.(ts|tsx)$/.test(e.name)) out.push(f);
  }
  return out;
}
/** Replace each ${...} (braces may nest) by X; an expression that is a query-string helper ends the path there. */
function flatten(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '$' && text[i + 1] === '{') {
      let depth = 1, j = i + 2;
      while (j < text.length && depth) { if (text[j] === '{') depth++; else if (text[j] === '}') depth--; j++; }
      if (depth) return out; // an expression with a nested template string: what follows is a query string
      const expr = text.slice(i + 2, j - 1).trim();
      if (/^(qs\(|sep$|q$|query$|search$|params$)/.test(expr) || /^(sheet|opts?)\b/.test(expr) && out.endsWith('?')) return out.replace(/\?$/, '');
      out += 'X'; i = j - 1;
    } else out += text[i];
  }
  return out;
}
/** A call segment X (a variable) matches any route segment; a {param} route segment matches anything. */
function matches(callPath: string, routePath: string): boolean {
  const a = callPath.split('/').filter(Boolean), b = routePath.split('/').filter(Boolean);
  return a.length === b.length && a.every((seg, i) => /^\{[^}]+\}$/.test(b[i]) || seg === 'X' || seg === b[i] || (/X/.test(seg) && new RegExp('^' + seg.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/X/g, '.+') + '$').test(b[i])));
}
const CALL = /\b(api|useApi|fetch)(<[^()]*?>)?\(\s*(`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g;
const calls: { file: string; line: number; method: string; path: string; text: string }[] = [];
let dynamic = 0;
for (const file of walk(path.join(repo, 'apps', 'web'))) {
  if (file.endsWith(path.join('lib', 'api.ts'))) continue; // the helper itself, not a call
  const src = fs.readFileSync(file, 'utf8');
  CALL.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CALL.exec(src))) {
    const fn = m[1]; const lit = m[3]; const text = lit.slice(1, -1);
    if (fn === 'fetch' && !text.startsWith('/api')) continue;
    if (text.startsWith('${')) { dynamic++; continue; } // the whole path is a variable: cannot be checked here
    const after = src.slice(m.index + m[0].length, m.index + m[0].length + 500).split(/\b(?:api|useApi|fetch)(?:<[^()]*?>)?\(/)[0];
    const method = fn === 'useApi' ? 'GET' : ((/method:\s*['"`](\w+)['"`]/.exec(after) || [])[1] || 'GET').toUpperCase();
    let p = flatten(text).split('?')[0];
    if (fn !== 'fetch') p = '/api/v1' + p;
    if (/^\/api(\/v1)?\/?X/.test(p)) { dynamic++; continue; } // the first segment is a variable: cannot be checked here
    calls.push({ file: path.relative(repo, file), line: src.slice(0, m.index).split('\n').length, method, path: p, text });
  }
}
const bad = calls.filter((c) => !ops.some((o) => o.method === c.method && matches(c.path, o.path))).map((c) => `${c.method} ${c.text}   (${c.file}:${c.line})`);
check(bad.length === 0, `all ${calls.length} API calls in the web app match a route (${dynamic} fully dynamic paths not checked)`, bad);

// 3. the Swagger page carries the same description
const html = fs.readFileSync(htmlFile, 'utf8');
const embedded = /<script id="spec" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
let same = false;
try { same = !!embedded && JSON.stringify(JSON.parse(embedded[1])) === JSON.stringify(spec); } catch { same = false; }
check(same, 'docs/api/swagger.html carries the same description as openapi.v1.json', ['Run: npm run openapi:export -w apps/api, then commit docs/api']);

// 4. the description is complete: every $ref resolves and no typed schema is empty (an empty one means the export ran without the Swagger compiler plugin)
const refs = new Set<string>(); JSON.stringify(spec, (_k, v) => { if (typeof v === 'string' && v.startsWith('#/components/schemas/')) refs.add(v.slice(21)); return v; });
const schemas = spec.components?.schemas || {};
check([...refs].every((r) => schemas[r]), 'every schema the reference points to exists', [...refs].filter((r) => !schemas[r]).map((r) => `missing schema ${r}`));
const empty = Object.entries<any>(schemas).filter(([, sc]) => sc.type === 'object' && !Object.keys(sc.properties || {}).length && !sc.additionalProperties && !sc.allOf && !sc.oneOf).map(([n]) => n);
check(empty.length === 0, 'no typed schema is empty', [...empty.map((n) => `${n} has no fields`), 'Export with: npm run openapi:export -w apps/api (it runs the Swagger compiler plugin; plain ts-node does not)']);

if (failed) { console.error(`\n${failed} contract check(s) failed`); process.exit(1); }
console.log('\nAPI reference, server and web app agree');
