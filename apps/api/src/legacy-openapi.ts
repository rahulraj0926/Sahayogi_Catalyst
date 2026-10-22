/**
 * OpenAPI entries for the older /api routes, generated from the route table itself, so the API reference lists every route that exists
 * (and cannot drift from the code). These are the prototype's routes: they are marked deprecated, and their request and response bodies
 * are described only as JSON objects until each domain moves into a typed /api/v1 module (docs/ENGINEERING_REVIEW.md, F13).
 */
import { docSchemas, routeDocs } from './legacy/openapi-docs';
import { typedRoutes } from './engine/registry';

export interface LegacyRoute { method: string; pattern: string; mutating: boolean; noProduct: boolean; optionalProduct: boolean; raw: boolean; admin: boolean }

const TAG_NAMES: Record<string, string> = {
  items: 'Records', links: 'Records', gates: 'Gates', approvals: 'Approvals', portfolio: 'Portfolio',
  attachments: 'Files', files: 'Files', inbox: 'Files', assistant: 'Files', competitors: 'Competitors',
  documents: 'Documents', doc: 'Documents', handoff: 'Handover', sessions: 'Work', requests: 'Work',
  flows: 'Flows', flow: 'Flows', settings: 'Settings', demo: 'Demo',
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ');
const tagOf = (pattern: string) => { const seg = pattern.split('/')[2] || 'other'; return TAG_NAMES[seg] || cap(seg); };
const slug = (s: string) => s.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
/** the engine's /api/x route is served at /api/v1/x (and at /api/x until the sunset date) */
export const openApiPath = (pattern: string) => '/api/v1' + pattern.slice(4).replace(/:([a-zA-Z_]+)/g, '{$1}');
const oldAddress = (pattern: string) => pattern.replace(/:([a-zA-Z_]+)/g, '{$1}');

const errorResponses = (r: LegacyRoute) => {
  const out: Record<string, any> = {
    '404': { description: 'Unknown record, product or route.' },
    '422': { description: 'The input is not valid; the message says what to change.' },
    '429': { description: 'Too many requests (see the Retry-After header).' },
  };
  if (r.mutating) { out['401'] = { description: 'No name was sent in X-Actor (code actor_required).' }; out['409'] = { description: 'The change conflicts with the current state (for example stale_edit or stale_gate).' }; }
  if (r.admin) out['403'] = { description: 'Only an administrator may do this (code role_required).' };
  const err = { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponseDto' } } };
  for (const v of Object.values<any>(out)) v.content = err;
  out['500'] = { description: 'Unexpected server error; quote the requestId.', content: err };
  return out;
};

/** Puts a hand-written description (legacy/openapi-docs) on an operation. `keepBody`: the operation already has a typed request body (a DTO). */
function applyDoc(op: any, d: any, parameters: any[], keepBody = false) {
  op.summary = d.summary; op.description = `${d.description ? d.description + ' ' : ''}${(op.description || '').replace(/ Request and response bodies are not yet described in detail\.$/, '')}`.trim();
  for (const [name, q] of Object.entries<any>(d.query || {})) if (!parameters.some((x) => x.name === name && x.in === 'query')) parameters.push({ name, in: 'query', required: !!q.required, description: q.description, schema: q.schema || { type: 'string' } });
  if (d.body && op.requestBody && !keepBody) op.requestBody = { required: true, content: { 'application/json': { schema: d.body } } };
  if (d.file) op.responses['200'] = { description: d.file.description || 'The file.', content: { [d.file.type]: { schema: { type: 'string', format: 'binary' } } } };
  if (d.upload && op.requestBody) op.requestBody = { required: true, description: d.upload, content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } };
  if (d.response) op.responses['200'] = { description: 'Success.', content: { 'application/json': { schema: d.response } } };
  for (const [code, text] of Object.entries<any>(d.errors || {})) op.responses[code] = { ...(op.responses[code] || {}), description: text };
  op['x-documented'] = true;
}

export function legacyPaths(routes: LegacyRoute[]): Record<string, Record<string, any>> {
  const paths: Record<string, Record<string, any>> = {};
  for (const r of routes) {
    if (!r.pattern.startsWith('/api/')) continue;
    const method = r.method.toLowerCase();
    const path = openApiPath(r.pattern);
    const parameters: any[] = [...(r.pattern.match(/:([a-zA-Z_]+)/g) || []).map((k) => ({ name: k.slice(1), in: 'path', required: true, schema: { type: 'string' } }))];
    if (!r.noProduct) parameters.push({ name: 'product', in: 'query', required: false, schema: { type: 'string' }, description: `Product id such as PRD-001${r.optionalProduct ? '' : ' (the page URL decides it in the web app; the default product is used when it is left out)'}.` });
    const op: any = {
      tags: [tagOf(r.pattern)],
      summary: `${r.method} ${path}`,
      description: `Also answers at its old address ${oldAddress(r.pattern)}, which is deprecated and ends on the Sunset date. Errors use the same envelope as the rest of /api/v1. ${r.mutating ? 'Changes data and needs a person\'s name in the X-Actor header. ' : ''}${r.admin ? 'Administrator only. ' : ''}${r.raw ? 'The body is a raw file (up to 25 MB), not JSON. ' : 'Bodies larger than 8 MB are refused (413). '}Request and response bodies are not yet described in detail.`,
      operationId: `legacy_${method}_${slug(r.pattern)}`,
      parameters,
      responses: { '200': { description: 'Success. The body depends on the route.', content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } }, ...errorResponses(r) },
      'x-legacy': true,
    };
    if (r.mutating) op.security = [{ actor: [] }];
    if (['post', 'put', 'patch'].includes(method)) {
      op.requestBody = r.raw
        ? { required: false, content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } }
        : { required: false, content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } };
    }
    const d = routeDocs[`${r.method} ${oldAddress(r.pattern)}`];
    if (d) applyDoc(op, d, parameters);
    (paths[path] = paths[path] || {})[method] = op;
  }
  return paths;
}

/** Adds the older routes to an OpenAPI document (the typed /api/v1 paths win if both exist). */
export function addLegacyPaths(doc: any, routes: LegacyRoute[]): any {
  doc.components = doc.components || {}; doc.components.schemas = { ...(doc.components.schemas || {}), ...docSchemas };
  doc.components.schemas.ErrorResponseDto = doc.components.schemas.ErrorResponseDto?.properties ? doc.components.schemas.ErrorResponseDto : {
    type: 'object', required: ['code', 'message', 'requestId', 'statusCode'],
    properties: {
      code: { type: 'string', description: 'Machine-readable code, e.g. validation_failed, not_found, role_required, stale_edit.' },
      message: { type: 'string', description: 'Plain-language message for the person.' },
      details: { description: 'Extra detail, e.g. field errors for validation_failed.' },
      requestId: { type: 'string', description: 'Same value as the X-Request-Id response header; quote it when reporting a problem.' },
      statusCode: { type: 'integer' },
    },
  };
  // the older routes, plus the typed engine controllers' own operations described from the same hand-written notes
  const merged: Record<string, Record<string, any>> = {};
  for (const [p, item] of Object.entries(legacyPaths(routes))) merged[p] = { ...item };
  for (const [p, item] of Object.entries<any>(doc.paths)) merged[p] = { ...(merged[p] || {}), ...item };
  doc.paths = merged;
  for (const t of typedRoutes()) {
    const path = openApiPath(t.pattern); const method = t.method.toLowerCase(); const op = doc.paths[path]?.[method];
    if (!op) continue;
    const mutating = (t.opts.mutating as boolean | undefined) ?? !['GET', 'HEAD'].includes(t.method);
    op.responses = { ...errorResponses({ method: t.method, pattern: t.pattern, mutating, noProduct: !!t.opts.noProduct, optionalProduct: !!t.opts.optionalProduct, raw: false, admin: !!t.opts.admin }), ...op.responses };
    delete op.responses['201']; // typed engine routes answer 200 (HttpCode), like the older routes
    const d = routeDocs[`${t.method} ${oldAddress(t.pattern)}`];
    if (d) applyDoc(op, d, op.parameters = op.parameters || [], true);
    op.description = `${op.description ? op.description + ' ' : ''}Also answers at its old address ${oldAddress(t.pattern)}, which is deprecated and ends on the Sunset date. Errors use the same envelope as the rest of /api/v1.`.trim();
    op.tags = op.tags && op.tags.length ? op.tags : [tagOf(t.pattern)];
  }
  // a query parameter that has a default is never required (the compiler plugin marks every property without "?" as required)
  for (const item of Object.values<any>(doc.paths)) for (const op of Object.values<any>(item)) for (const prm of op.parameters || []) if (prm.in === 'query' && prm.schema?.default !== undefined) prm.required = false;
  const used = new Set<string>(); for (const p of Object.values<any>(doc.paths)) for (const o of Object.values<any>(p)) if (o['x-legacy'] || o['x-engine']) for (const t of o.tags || []) used.add(t);
  doc.tags = [...(doc.tags || []), ...[...used].sort().filter((t) => !(doc.tags || []).some((x: any) => x.name === t)).map((name) => ({ name, description: 'Lifecycle engine routes (served at /api/v1/... and at the old /api/... until the sunset date).' }))];
  return doc;
}
