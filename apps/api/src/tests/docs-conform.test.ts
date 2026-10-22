/**
 * The written API descriptions (legacy/openapi-docs) tell the truth: real answers from the real handlers on the seeded demo portfolio
 * are checked against the schemas in docs/api/openapi.v1.json. No database needed. Run: npm run test:docs -w apps/api
 * When this fails, either the route changed (update its entry in legacy/openapi-docs, then npm run openapi:export -w apps/api)
 * or the entry was wrong.
 */
import 'reflect-metadata';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import Ajv from 'ajv';
import { engineApp } from './engine-app';
import { seedPortfolio } from '../legacy/scripts/seed_portfolio';
import * as router from '../legacy/router';
import { done, ok } from './helpers';

const spec = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', 'docs', 'api', 'openapi.v1.json'), 'utf8'));
const ajv = new Ajv({ strict: false, validateFormats: false, allErrors: false });
ajv.addSchema({ $id: 'spec', components: spec.components });
const ABS = (s: unknown) => JSON.parse(JSON.stringify(s).replace(/"#\/components\/schemas\//g, '"spec#/components/schemas/'));

async function main() {
  const portfolio: any = seedPortfolio(fs.mkdtempSync(path.join(os.tmpdir(), 'sd-docs-')));
  router.setPortfolio(portfolio);
  const p: any = { portfolio, async flush() {}, async reloadProduct() {}, async reloadRegistry() {} };
  const { base, close } = await engineApp(p);
  const pid = portfolio.list()[0].id;
  const call = async (method: string, url: string, body?: unknown) => {
    const r = await fetch(`${base}/api/v1${url.slice(4)}${url.includes('?') ? '&' : '?'}product=${pid}`, { method, headers: { 'content-type': 'application/json', 'x-actor': 'Asha' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, body: (await r.json()) as any };
  };
  /** the answer of `method path` (OpenAPI spelling) must match its documented 200 schema */
  const conforms = (method: string, openApiPath: string, res: { status: number; body: any }) => {
    const schema = spec.paths['/api/v1' + openApiPath.slice(4)]?.[method.toLowerCase()]?.responses?.['200']?.content?.['application/json']?.schema;
    if (!schema) throw new Error(`${method} ${openApiPath} has no documented answer`);
    if (res.status !== 200) throw new Error(`${method} ${openApiPath} answered ${res.status}: ${JSON.stringify(res.body).slice(0, 200)}`);
    const validate = ajv.compile(ABS(schema));
    if (!validate(res.body)) throw new Error(`${method} ${openApiPath} does not match its description: ${JSON.stringify(validate.errors?.[0])} in ${JSON.stringify(res.body).slice(0, 300)}`);
  };

  await ok('items: list, one record, create, change, set status, clear, delete match their written answers', async () => {
    const list = await call('GET', '/api/items?limit=5'); conforms('GET', '/api/items', list);
    const first = list.body.items[0].id;
    conforms('GET', '/api/items/{id}', await call('GET', `/api/items/${first}`));
    const made = await call('POST', '/api/items', { type: 'Assumption', fields: { title: 'Docs check', statement: 'Customers want this' } }); conforms('POST', '/api/items', made);
    const id = made.body.item.id;
    conforms('PATCH', '/api/items/{id}', await call('PATCH', `/api/items/${id}`, { fields: { statement: 'Customers really want this' }, expected_rev: made.body.item.rev }));
    const stale = await call('PATCH', `/api/items/${id}`, { fields: { statement: 'x' }, expected_rev: 1 });
    if (stale.status !== 409 || stale.body.code !== 'stale_edit') throw new Error(`stale edit answered ${stale.status}`);
    conforms('POST', '/api/items/{id}/status', await call('POST', `/api/items/${id}/status`, { status: 'Validated' }));
    conforms('POST', '/api/items/{id}/clear', await call('POST', `/api/items/${id}/clear`, { note: 'checked' }));
    const other = await call('POST', '/api/items', { type: 'Assumption', fields: { title: 'Second', statement: 'Another' } });
    const lk = await call('POST', '/api/links', { type: 'affects', source: id, target: other.body.item.id }); conforms('POST', '/api/links', lk);
    conforms('GET', '/api/links', await call('GET', `/api/links?item=${id}`));
    conforms('GET', '/api/links', await call('GET', '/api/links'));
    conforms('POST', '/api/links/{id}/clear', await call('POST', `/api/links/${lk.body.link.id}/clear`, { note: 'ok' }));
    conforms('DELETE', '/api/links/{id}', await call('DELETE', `/api/links/${lk.body.link.id}`));
    conforms('DELETE', '/api/items/{id}', await call('DELETE', `/api/items/${id}`));
    conforms('GET', '/api/review/{type}', await call('GET', '/api/review/Requirement'));
    conforms('POST', '/api/review', await call('POST', '/api/review', { ids: [other.body.item.id], status: 'Open' }));
  });

  await ok('gates, stages, lifecycle and approvals match their written answers', async () => {
    conforms('GET', '/api/lifecycle/gates', await call('GET', '/api/lifecycle/gates'));
    conforms('GET', '/api/gates', await call('GET', '/api/gates'));
    conforms('GET', '/api/gates/{n}', await call('GET', '/api/gates/0'));
    conforms('GET', '/api/gates/{n}', await call('GET', '/api/gates/12?depth=L3'));
    conforms('GET', '/api/criteria', await call('GET', '/api/criteria'));
    conforms('GET', '/api/lifecycle', await call('GET', '/api/lifecycle'));
    conforms('GET', '/api/stages', await call('GET', '/api/stages'));
    conforms('GET', '/api/stages/{n}', await call('GET', '/api/stages/2'));
    conforms('GET', '/api/approvals', await call('GET', '/api/approvals'));
    conforms('POST', '/api/approvals/seen', await call('POST', '/api/approvals/seen', {}));
    if ((await call('GET', '/api/gates/13')).status !== 404) throw new Error('gate 13 should be 404');
    if ((await call('GET', '/api/stages/5')).status !== 404) throw new Error('stage 5 should be 404');
  });

  await ok('meta, dashboard, audit, settings, portfolio, ideas, next actions and search match their written answers', async () => {
    conforms('GET', '/api/meta', await call('GET', '/api/meta'));
    conforms('GET', '/api/dashboard', await call('GET', '/api/dashboard'));
    conforms('GET', '/api/audit', await call('GET', '/api/audit?limit=5'));
    conforms('POST', '/api/settings', await call('POST', '/api/settings', { depth_level: 'L2' }));
    conforms('GET', '/api/next-actions', await call('GET', '/api/next-actions?limit=3'));
    conforms('GET', '/api/search', await call('GET', '/api/search?q=risk'));
    conforms('GET', '/api/portfolio', await call('GET', '/api/portfolio'));
    conforms('GET', '/api/portfolio/next-actions', await call('GET', '/api/portfolio/next-actions?limit=3'));
    conforms('GET', '/api/portfolio/report', await call('GET', '/api/portfolio/report'));
    conforms('GET', '/api/portfolio/ideas', await call('GET', '/api/portfolio/ideas'));
    const idea = await call('POST', '/api/portfolio/ideas', { one_liner: 'Docs check idea' }); conforms('POST', '/api/portfolio/ideas', idea);
    const made = await call('POST', '/api/portfolio/products', { name: 'Docs Check Product', kind: 'software' }); conforms('POST', '/api/portfolio/products', made);
    conforms('PATCH', '/api/portfolio/products/{id}', await call('PATCH', `/api/portfolio/products/${made.body.product.id}`, { name: 'Docs Check Product 2' }));
    if ((await call('POST', '/api/portfolio/products', { name: 'Docs Check Product 2' })).status !== 409) throw new Error('same name should be 409');
    if ((await call('POST', '/api/portfolio/ideas', {})).status !== 422) throw new Error('idea without one_liner should be 422');
  });

  await ok('files, inbox, documents, assistant and sharing match their written answers', async () => {
    conforms('GET', '/api/attachments', await call('GET', '/api/attachments'));
    const docs = await call('GET', '/api/documents'); conforms('GET', '/api/documents', docs);
    conforms('GET', '/api/documents/{key}', await call('GET', `/api/documents/${docs.body.documents[0].key}`));
    if ((await call('GET', `/api/documents/${docs.body.documents[0].key}?format=pdf`)).status !== 422) throw new Error('format=pdf should be 422');
    conforms('GET', '/api/sheet', await call('GET', '/api/sheet'));
    conforms('GET', '/api/inbox', await call('GET', '/api/inbox'));
    conforms('GET', '/api/assistant/usage', await call('GET', '/api/assistant/usage'));
    conforms('POST', '/api/assistant/chat', await call('POST', '/api/assistant/chat', { message: 'what is next' }));
    conforms('GET', '/api/sharing', await call('GET', '/api/sharing'));
    if ((await call('POST', '/api/sharing', { approval_expiry_days: 0 })).status !== 422) throw new Error('0 days should be 422');
    const ex = await fetch(`${base}/api/v1/export?product=${pid}`); if (ex.status !== 200 || !/json/.test(ex.headers.get('content-type') || '')) throw new Error('export should answer a JSON file');
  });

  await ok('traceability, flows, agent, competitors, journey and summaries match their written answers', async () => {
    for (const u of ['/api/agent/queue', '/api/agent/checked', '/api/agent/ingests', '/api/trace/matrix', '/api/trace/gaps', '/api/trace/funnel', '/api/trace/rules', '/api/flows', '/api/price-units', '/api/competitors/tiers', '/api/competitors/grid', '/api/competitors/prices', '/api/competitors/sources', '/api/competitors/effort', '/api/competitors/compare', '/api/pointers', '/api/journey', '/api/product/summary', '/api/reports/product']) conforms('GET', u, await call('GET', u));
    const fl = await call('GET', '/api/flows'); if (fl.body.flows.length) conforms('GET', '/api/flows/{id}', await call('GET', `/api/flows/${fl.body.flows[0].id}`));
    const dos = await fetch(`${base}/api/v1/dossier?product=${pid}`); if (dos.status !== 200 || !/html/.test(dos.headers.get('content-type') || '')) throw new Error('dossier should answer html');
    if ((await call('GET', '/api/dossier?format=pdf')).status !== 422) throw new Error('dossier format=pdf should be 422');
  });

  await ok('requests, stories, hand-over, people, flow editing and feedback match their written answers', async () => {
    for (const u of ['/api/requests', '/api/sessions', '/api/stories', '/api/handoff/stories', '/api/handoff/receiver', '/api/handoff/overview', '/api/existing', '/api/people', '/api/needed', '/api/flow-edit', '/api/feedback', '/api/demo']) conforms('GET', u, await call('GET', u));
    const rq = await call('GET', '/api/requests'); if (rq.body.requests.length) conforms('GET', '/api/requests/{id}', await call('GET', `/api/requests/${rq.body.requests[0].id}`));
    if ((await call('GET', '/api/requests/NOPE')).status !== 404) throw new Error('unknown request should be 404');
    const st = await call('GET', '/api/stories'); if (st.body.stories.length) conforms('GET', '/api/stories/{id}', await call('GET', `/api/stories/${st.body.stories[0].id}`));
    conforms('POST', '/api/feedback', await call('POST', '/api/feedback', { text: 'Docs check' }));
  });

  await close();
  done();
}
main().catch((e) => { console.error(e); process.exit(1); });
