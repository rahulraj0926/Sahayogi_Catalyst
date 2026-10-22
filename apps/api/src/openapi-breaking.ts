/**
 * npm run openapi:breaking -- <base.json> [head.json]      (head defaults to docs/api/openapi.v1.json)
 * /api/v1 is add-only (F15): lists changes that would break a caller written against the base file and exits 1 if there are any.
 * Breaking: an endpoint or 2xx answer removed; a new required parameter or request field; a field removed from, or retyped in, an answer
 * or a request; an allowed request value removed. Adding endpoints, optional fields and answer fields is fine. To make a deliberate
 * breaking change, add a new version (/api/v2) instead and keep v1 working.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

type J = any;
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

export function breakingChanges(base: J, head: J): string[] {
  const out: string[] = [];
  const deref = (doc: J, s: J, seen = new Set<string>()): J => {
    while (s && s.$ref) { if (seen.has(s.$ref)) return {}; seen.add(s.$ref); s = s.$ref.replace('#/', '').split('/').reduce((a: J, k: string) => a?.[k], doc); }
    return s || {};
  };
  const typeOf = (s: J) => (s.type || (s.properties ? 'object' : s.items ? 'array' : s.enum ? 'enum' : 'any'));

  // direction 'response': what the server sends - fields must not disappear. 'request': what callers send - nothing new may be required.
  function walk(where: string, b: J, h: J, dir: 'request' | 'response', depth = 0, seen = new Set<string>()) {
    const key = (b?.$ref || '') + '>' + (h?.$ref || '');
    if (depth > 8 || (key !== '>' && seen.has(key))) return;
    if (key !== '>') seen = new Set(seen).add(key);
    const bs = deref(base, b), hs = deref(head, h);
    if (typeOf(bs) !== 'any' && typeOf(hs) !== 'any' && typeOf(bs) !== typeOf(hs)) { out.push(`${where}: type changed from ${typeOf(bs)} to ${typeOf(hs)}`); return; }
    if (dir === 'request' && bs.enum && hs.enum) for (const v of bs.enum) if (!hs.enum.includes(v)) out.push(`${where}: value "${v}" is no longer accepted`);
    if (bs.items && hs.items) walk(`${where}[]`, bs.items, hs.items, dir, depth + 1, seen);
    const bp = bs.properties || {}, hp = hs.properties || {};
    for (const k of Object.keys(bp)) {
      if (!(k in hp)) { out.push(`${where}.${k}: field removed`); continue; }
      walk(`${where}.${k}`, bp[k], hp[k], dir, depth + 1, seen);
    }
    if (dir === 'request') for (const k of hs.required || []) if (!(bs.required || []).includes(k)) out.push(`${where}.${k}: is now required`);
  }

  const v1 = (doc: J) => Object.entries<J>(doc.paths || {}).filter(([p]) => p.startsWith('/api/v1'));
  const headPaths = Object.fromEntries(v1(head));
  for (const [p, item] of v1(base)) {
    for (const m of METHODS) {
      const bo = item[m]; if (!bo) continue;
      const ho = headPaths[p]?.[m];
      const id = `${m.toUpperCase()} ${p}`;
      if (!ho) { out.push(`${id}: endpoint removed`); continue; }
      const params = (o: J, doc: J) => (o.parameters || []).map((x: J) => deref(doc, x));
      const hparams = params(ho, head);
      for (const bp of params(bo, base)) if (!hparams.find((x: J) => x.name === bp.name && x.in === bp.in)) out.push(`${id}: parameter ${bp.name} removed`);
      for (const hp of hparams) if (hp.required && !params(bo, base).find((x: J) => x.name === hp.name && x.in === hp.in)) out.push(`${id}: new required parameter ${hp.name}`);
      const rb = (o: J) => o.requestBody?.content?.['application/json']?.schema;
      if (rb(bo) && rb(ho)) walk(`${id} request`, rb(bo), rb(ho), 'request');
      else if (!rb(bo) && rb(ho) && head.paths[p][m].requestBody?.required) out.push(`${id}: a request body is now required`);
      for (const [code, r] of Object.entries<J>(bo.responses || {})) {
        if (!/^2/.test(code)) continue;
        const hr = ho.responses?.[code];
        if (!hr) { out.push(`${id}: answer ${code} removed`); continue; }
        const bsch = r.content?.['application/json']?.schema, hsch = hr.content?.['application/json']?.schema;
        if (bsch && hsch) walk(`${id} ${code}`, bsch, hsch, 'response');
        else if (bsch && !hsch) out.push(`${id} ${code}: JSON body removed`);
      }
    }
  }
  return out;
}

if (require.main === module) {
  const [baseArg, headArg] = process.argv.slice(2);
  if (!baseArg) { console.error('usage: openapi:breaking <base.json> [head.json]'); process.exit(2); }
  const head = headArg || path.join(__dirname, '..', '..', '..', 'docs', 'api', 'openapi.v1.json');
  const found = breakingChanges(JSON.parse(fs.readFileSync(baseArg, 'utf8')), JSON.parse(fs.readFileSync(head, 'utf8')));
  if (!found.length) { console.log('No breaking changes in /api/v1.'); process.exit(0); }
  console.error(`Breaking changes in /api/v1 (${found.length}):\n` + found.map((f) => '  - ' + f).join('\n') + '\nv1 is add-only. Keep the old behaviour, or add the change under /api/v2.');
  process.exit(1);
}
