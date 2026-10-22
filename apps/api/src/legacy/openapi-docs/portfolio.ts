import { arr, bool, DocSet, int, obj, ref, str } from './types';

const open = { type: 'object', additionalProperties: true };
const KINDS = ['software', 'hardware', 'service'];
const MODES = ['greenfield', 'existing_system', 'extend', 'replace'];
const DEPTH = ['L1', 'L2', 'L3'];

/** the portfolio (all products), ideas inbox, and the product-level pages: meta, dashboard, settings, audit, search, next actions */
export const portfolioDocs: DocSet = {
  schemas: {
    PortfolioProduct: obj({
      id: str('PRD-001 style id.'), slug: str('Name used in web addresses.'), name: str(), one_liner: str(), kind: str(undefined, { enum: KINDS }), owner: str(),
      stage: str('P0-P4, handoff, done or parked.'), stage_since: str(undefined, { format: 'date' }), depth_level: str(undefined, { enum: DEPTH }), mode: str(), archived: bool(),
    }, ['id', 'name'], { additionalProperties: true }),
    PortfolioIdea: obj({
      id: str('IDEA-001 style id.'), one_liner: str(), text: str(), requester: str(), created_on: str(), status: str(undefined, { enum: ['new', 'shortlisted', 'rejected', 'promoted'] }), kind: str(), product_id: str(undefined, { nullable: true }),
    }, ['id', 'one_liner', 'status'], { additionalProperties: true }),
  },
  routes: {
    'GET /api/meta': {
      summary: 'Everything a screen needs to know about the rules', description: 'Record types and their fields, link types, gate criteria, parameters, phase and gate names, the people who can act and who is signed in. Works without a product (then product is null).',
      response: obj({ schema: { description: 'Record types, their fields and enums.' }, links: { description: 'Link types and which record types each may join.' }, criteria: arr(open), params: { description: 'Gate parameters.' }, product: { description: 'The product record, or null.' }, asOf: str('Today for this product (may be set in settings).'), depth: str(undefined, { enum: DEPTH }), phases: { description: 'Phase names.' }, gateNames: { description: 'Gate names.' }, people: arr(open), actors: arr(str()), signed_in: { description: 'The person named in X-Actor, or null.' } }, ['schema', 'links', 'criteria'], { additionalProperties: true }),
    },
    'GET /api/dashboard': { summary: 'Counts and health of one product', description: 'Readiness, items per phase and type, flags and stale records.', response: open },
    'POST /api/settings': {
      summary: 'Change product settings',
      body: obj({ depth_level: str('How deep the checks go.', { enum: DEPTH }), asOf: str('Pretend today is this date (YYYY-MM-DD); empty goes back to real today.', { nullable: true }), suspectDepth: int('How many links upstream changes ripple (1-5).'), params: { type: 'object', additionalProperties: true, description: 'Gate parameters to override.' } }),
      response: obj({ depth: str(undefined, { enum: DEPTH }), asOf: str(), suspectDepth: int() }, ['depth', 'asOf', 'suspectDepth']), errors: { '422': 'depth_level is not L1, L2 or L3.' },
    },
    'GET /api/audit': {
      summary: 'Who did what, newest first', description: 'Every entry has a plain sentence (text) and a group. Filters combine.',
      query: { action: { description: 'A group id (see groups in the answer) or the start of an action name.' }, q: { description: 'Search in action, subject, summary, actor and the sentence.' }, limit: { description: 'Most entries (default 300).', schema: { type: 'integer', minimum: 1 } } },
      response: obj({ total: int(), groups: arr(obj({ id: str(), label: str() }, ['id', 'label'])), entries: arr(open) }, ['total', 'groups', 'entries']),
    },
    'GET /api/portfolio': {
      summary: 'All products with their stage, plus counts', description: 'Re-syncs every product first.',
      query: { archived: { description: '1 or true to include archived products.', schema: { type: 'string', enum: ['1', 'true', '0', 'false'] } } },
      response: obj({ as_of: str(), default_product: str(undefined, { nullable: true }), counts: obj({ products: int(), by_stage: { type: 'object', additionalProperties: { type: 'integer' } }, ideas: int() }, ['products', 'by_stage', 'ideas']), products: arr(open) }, ['as_of', 'counts', 'products']),
    },
    'POST /api/portfolio/products': {
      summary: 'Create a product', description: 'Starts at stage P0 with an empty record set. The name must not be used by another active product.',
      body: obj({ name: str('Unique among active products.'), one_liner: str(), kind: str(undefined, { enum: KINDS }), owner: str(), mode: str(undefined, { enum: MODES }), depth_level: str(undefined, { enum: DEPTH }), audience: str(undefined, { enum: ['sold', 'internal'] }), id: str('Only when you must choose the id.') }, ['name']),
      response: obj({ product: ref('PortfolioProduct'), next: obj({ summary: str(), first_session: str(), next_actions: str() }) }, ['product']), errors: { '409': 'A product with that name or id already exists.', '422': 'name missing or kind, mode or depth_level not allowed.' },
    },
    'PATCH /api/portfolio/products/{id}': {
      summary: 'Rename, archive or change the depth of a product',
      body: obj({ name: str(), archived: bool(), depth_level: str(undefined, { enum: DEPTH }), status: str() }), response: obj({ product: ref('PortfolioProduct') }, ['product']),
    },
    'GET /api/portfolio/ideas': { summary: 'Ideas inbox', query: { status: { description: 'Only ideas with this status.', schema: { type: 'string', enum: ['new', 'shortlisted', 'rejected', 'promoted'] } } }, response: obj({ total: int(), ideas: arr(ref('PortfolioIdea')) }, ['total', 'ideas']) },
    'POST /api/portfolio/ideas': { summary: 'Add an idea', body: obj({ one_liner: str('The idea in one line (title also works).'), text: str(), requester: str(), kind: str(), created_on: str() }, ['one_liner']), response: obj({ idea: ref('PortfolioIdea') }, ['idea']), errors: { '422': 'one_liner is required.' } },
    'PATCH /api/portfolio/ideas/{id}': { summary: 'Change an idea', description: 'Administrator only.', body: { type: 'object', additionalProperties: true, description: 'Fields of the idea to change (one_liner, text, kind, status...).' }, response: obj({ idea: ref('PortfolioIdea') }, ['idea']) },
    'DELETE /api/portfolio/ideas/{id}': { summary: 'Delete an idea', description: 'Administrator only.', response: obj({ deleted: { description: 'The idea that was deleted.' } }, ['deleted']) },
    'POST /api/portfolio/ideas/{id}/promote': {
      summary: 'Turn an idea into a product', description: 'Administrator only. The product starts at stage P0.',
      body: obj({ name: str(), owner: str(), kind: str(undefined, { enum: KINDS }), mode: str(undefined, { enum: MODES }), depth_level: str(undefined, { enum: DEPTH }) }),
      response: obj({ idea: ref('PortfolioIdea'), product: ref('PortfolioProduct'), next: obj({ summary: str(), first_session: str() }) }, ['idea', 'product']),
    },
    'GET /api/portfolio/next-actions': {
      summary: 'The best next actions across all products', description: 'Ranked by value per minute. Done and parked products are skipped.',
      query: { limit: { description: 'Most actions (default 20).', schema: { type: 'integer', minimum: 1 } } },
      response: obj({ as_of: str(), total: int(), products: arr(obj({ product_id: str(), name: str(), stage: str(), what_happens_next: { description: 'Plain sentence.' }, total_actions: int(), minutes_total: int() }, ['product_id'], { additionalProperties: true })), actions: arr(open) }, ['as_of', 'total', 'products', 'actions']),
    },
    'GET /api/portfolio/report': {
      summary: 'Portfolio report', description: 'JSON by default; format=csv or format=html answers with a file instead.',
      query: { format: { description: 'csv or html for a file; leave out for JSON.', schema: { type: 'string', enum: ['csv', 'html'] } }, stuck_days: { description: 'Days without movement before a product counts as stuck.', schema: { type: 'integer', minimum: 1 } }, download: { description: 'With html: 1 to download instead of showing.' } },
      response: open,
    },
    'GET /api/search': { summary: 'Search records, documents and products', description: 'Searches the whole portfolio, or one product when product is given. Does not need a product.', query: { q: { description: 'Text to find.' } }, response: open },
    'GET /api/next-actions': {
      summary: 'The best next actions in one product', query: { limit: { description: 'Most actions.', schema: { type: 'integer', minimum: 1 } }, kind: { description: 'Only this kind of action.' } },
      response: obj({ what_happens_next: { description: 'Plain sentence.' }, total: int(), minutes_total: int(), actions: arr(open) }, ['total', 'actions'], { additionalProperties: true }),
    },
  },
};
