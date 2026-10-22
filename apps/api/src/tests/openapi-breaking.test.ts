import assert from 'node:assert/strict';
import { breakingChanges } from '../openapi-breaking';

const doc = (over: any = {}) => ({
  paths: { '/api/v1/x': { post: {
    parameters: [{ name: 'q', in: 'query', required: false, schema: { type: 'string' } }],
    requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['a'], properties: { a: { type: 'string', enum: ['p', 'q'] }, b: { type: 'number' } } } } } },
    responses: { '201': { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/R' } } } } },
  } }, '/api/old': { get: { responses: { '200': { description: 'ok' } } } } },
  components: { schemas: { R: { type: 'object', properties: { id: { type: 'string' }, n: { type: 'number' } } } } },
  ...over,
});
const clone = () => JSON.parse(JSON.stringify(doc()));
let failed = 0;
const t = (name: string, fn: () => void) => { try { fn(); console.log('  ok  ' + name); } catch (e: any) { failed++; console.log('  FAIL ' + name + ': ' + e.message); } };

t('the same file has no breaking changes', () => assert.deepEqual(breakingChanges(doc(), clone()), []));
t('adding an endpoint, an optional request field and a response field is allowed', () => {
  const h = clone(); h.paths['/api/v1/y'] = { get: { responses: { '200': { description: 'ok' } } } };
  h.paths['/api/v1/x'].post.requestBody.content['application/json'].schema.properties.c = { type: 'string' };
  h.components.schemas.R.properties.extra = { type: 'string' };
  assert.deepEqual(breakingChanges(doc(), h), []);
});
t('removing an endpoint is breaking', () => { const h = clone(); delete h.paths['/api/v1/x']; assert.match(breakingChanges(doc(), h)[0], /endpoint removed/); });
t('removing a response field is breaking', () => { const h = clone(); delete h.components.schemas.R.properties.n; assert.match(breakingChanges(doc(), h).join(), /R?.*\.n: field removed|\.n: field removed/); });
t('retyping a response field is breaking', () => { const h = clone(); h.components.schemas.R.properties.n = { type: 'string' }; assert.match(breakingChanges(doc(), h).join(), /type changed/); });
t('a new required request field is breaking', () => { const h = clone(); h.paths['/api/v1/x'].post.requestBody.content['application/json'].schema.required.push('b'); assert.match(breakingChanges(doc(), h).join(), /b: is now required/); });
t('a new required parameter is breaking', () => { const h = clone(); h.paths['/api/v1/x'].post.parameters.push({ name: 'z', in: 'query', required: true, schema: { type: 'string' } }); assert.match(breakingChanges(doc(), h).join(), /new required parameter z/); });
t('an accepted value removed from a request enum is breaking', () => { const h = clone(); h.paths['/api/v1/x'].post.requestBody.content['application/json'].schema.properties.a.enum = ['p']; assert.match(breakingChanges(doc(), h).join(), /"q" is no longer accepted/); });
t('older /api routes are not checked', () => { const h = clone(); delete h.paths['/api/old']; assert.deepEqual(breakingChanges(doc(), h), []); });
if (failed) { console.error(failed + ' check(s) failed'); process.exit(1); }
