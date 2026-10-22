import { arr, bool, DocSet, int, obj, str } from './types';

const open = { type: 'object', additionalProperties: true };

/** traceability, flows, competitors, agent drafts, pointers (quotes in files), reports, journey, dossier, help */
export const analysisDocs: DocSet = {
  routes: {
    'POST /api/agent/ingest': { summary: 'Hand drafted records from an outside agent to the review queue', description: 'Records arrive as unverified drafts; a person verifies or rejects each one.', body: { type: 'object', additionalProperties: true, description: 'The agent\'s batch (submitted_by is set from X-Actor).' }, response: open },
    'GET /api/agent/queue': { summary: 'Agent drafts waiting for a person to verify', response: obj({ items: arr(open) }, ['items']) },
    'GET /api/agent/checked': { summary: 'Agent drafts a person already verified or rejected', response: obj({ items: arr(open) }, ['items']) },
    'GET /api/agent/ingests': { summary: 'History of batches received from agents', response: obj({ ingests: arr(open) }, ['ingests']) },
    'POST /api/agent/verify/{id}': { summary: 'Verify an agent draft', body: obj({ note: str() }), response: obj({ verified: open }, ['verified']) },
    'POST /api/agent/reject/{id}': { summary: 'Reject an agent draft', body: obj({ note: str('Why.') }), response: obj({ rejected: open }, ['rejected']) },
    'GET /api/price-units': { summary: 'What a competitor price can be per', description: 'For example per dealer or per site; per GB only for products that sell usage.', response: open },
    'GET /api/trace/matrix': { summary: 'Traceability matrix', description: 'Each requirement with what covers it.', response: obj({ rows: arr(open) }, ['rows']) },
    'GET /api/trace/gaps': { summary: 'What is not traced yet', response: open },
    'GET /api/trace/funnel': { summary: 'How many records survive each step from need to test', response: obj({ stages: arr(open) }, ['stages']) },
    'GET /api/trace/rules': { summary: 'Coverage rules with how much of the population meets each', response: obj({ rules: arr(obj({ id: str(), name: str(), population: int(), met: int(), pct: { type: 'number' } }, ['id'], { additionalProperties: true })) }, ['rules']) },
    'GET /api/flows': { summary: 'Flows with step counts and a health check', response: obj({ flows: arr(open) }, ['flows']) },
    'GET /api/flows/{id}': { summary: 'One flow with its steps, what each covers, who does it and what it calls', response: open, errors: { '404': 'No such flow.' } },
    'GET /api/entities/{id}': { summary: 'Check one data entity', description: 'Where it is created, read, changed and removed.', response: open },
    'GET /api/competitors/tiers': { summary: 'Competitors grouped by tier', query: { scope: { description: 'Only competitors that matter for this part of our product (a module or area name). Competitors with no scope count everywhere.' } }, response: open },
    'GET /api/competitors/grid': { summary: 'Competitors against capabilities', response: open },
    'GET /api/competitors/prices': { summary: 'Competitor prices', response: open },
    'GET /api/competitors/sources': { summary: 'Where competitor facts came from', response: open },
    'GET /api/competitors/effort': { summary: 'Effort spent on competitor research', response: open },
    'GET /api/competitors/product-lines': { summary: 'Products and plans of each competitor', description: 'Per competitor: its product lines (each with plans, tier tags and capability counts) and how many prices sit outside any product line.', response: open },
    'GET /api/competitors/completeness': { summary: 'How complete each competitor profile is', description: 'Per competitor: a weighted 0-100 score and the list of checks that pass or still need doing.', response: open },
    'GET /api/competitors/normalized-prices': {
      summary: 'Competitor plans compared by plan level',
      description: 'Plans tagged free, entry, mid, top or enterprise, costed over 12 months in INR excluding GST for one usage scenario. A plan sold for several terms is one row: its cheapest recurring term per year, and its one-time (lifetime) price. Single-user licences are bought once per user; multi-user licences cover up to max_users.',
      query: { users: { description: 'Users in the scenario. Default 10.' }, units: { description: 'Units in the scenario.' }, gb: { description: 'GB per month in the scenario.' } }, response: open,
    },
    'POST /api/competitors/catalog/common': {
      summary: 'Add common features for every competitor',
      description: 'Puts each feature on our list (if it is not there) and gives every active competitor an unrated row for it (level unknown). Nothing is rated. Features and rows that already exist are skipped. At most 60 features per call.',
      body: obj({ features: { type: 'array', description: 'The features to add.', items: obj({ name: str('Our name for the feature.'), category: str('Group, e.g. Compliance.'), description: str('What counts as having it.') }, ['name']) } }, ['features']),
      response: open, errors: { '422': 'No feature names, too many, or no competitors yet.' },
    },
    'GET /api/competitors/plans': {
      summary: 'A competitor\'s plans and the features each plan includes',
      description: 'Without competitor: the list of competitors with how many plans each has. With competitor: its plans (each with its terms, licence type and feature keys), our common features as rows with the plans that include them, and a summary.',
      query: { competitor: { description: 'Competitor id.' } }, response: open, errors: { '404': 'Competitor not found or retired.' },
    },
    'POST /api/competitors/plans/features': {
      summary: 'Say a competitor plan includes (or no longer includes) a feature',
      description: 'Applies to every term of the plan (price_ids). Give capability_id (a feature on our list) or rating_id. If the competitor has no row for the feature yet, an unrated one is created.',
      body: obj({ competitor: str('Competitor id.'), price_ids: { type: 'array', items: str('Price id.'), description: 'Every price (term) of the plan.' }, capability_id: str('A feature on our list.'), rating_id: str('The competitor\'s own rating row.'), included: { type: 'boolean', description: 'true to include, false to remove.' } }, ['competitor', 'price_ids', 'included']),
      response: open, errors: { '422': 'A price or rating does not belong to the competitor, or no feature was given.' },
    },
    'GET /api/competitors/plan-level-features': { summary: 'Which features competitors include at each plan level', description: 'For each level (free, entry, mid, top, enterprise): how many plans list their features and, per feature, how many of them include it.', response: open },
    'GET /api/competitors/recommended': {
      summary: 'Recommended plan for each level, from the competitors\' plans',
      description: 'For each plan level (free, entry, mid, top, enterprise) with competitor plans: the average yearly price in INR excluding GST for the given number of users, and the features that at least the given share of those plans include. new_features is what the level adds over the one below it.',
      query: { threshold: { description: 'Share of plans that must include a feature, 1 to 100. Default 60.' }, users: { description: 'Users in the price scenario. Default 1.' }, scope: { description: 'Only competitors that matter for this part of our product (a module or area name). Competitors with no scope count everywhere.' } }, response: open, errors: { '422': 'users is not a number of 1 or more.' },
    },
    'POST /api/competitors/our-plans/from-recommendation': {
      summary: 'Create one of our plans from the recommendation for a level',
      description: 'Creates a draft plan at the level, priced at the average yearly price, with the recommended features switched on. Features still in a competitor\'s own wording (not matched to our feature list) are reported, not added.',
      body: obj({ tier_tag: str('free, entry, mid, top or enterprise.'), threshold: { type: 'integer', description: 'Share of plans, 1 to 100. Default 60.' }, users: { type: 'integer', description: 'Users in the price scenario. Default 1.' }, title: str('Name for the plan. Default "<Level> (recommended)".') }, ['tier_tag']),
      response: open, errors: { '422': 'Unknown level, or no competitor plan is tagged with that level.' },
    },
    'GET /api/competitors/compare-plans': {
      summary: 'Compare competitors\' plans at one level',
      description: 'One column per competitor plan at the level (for example everyone\'s Entry plan), with its yearly price and the features it includes, plus the competitors that have no plan at that level.',
      query: { level: { description: 'free, entry, mid, top or enterprise.' }, users: { description: 'Users in the price scenario. Default 1.' }, fallback: { description: 'A level to show instead for a competitor that has no plan at the asked level, for example entry when asking for free. Left out when it has neither.' } }, response: open, errors: { '422': 'Unknown level, or users is not a number of 1 or more.' },
    },
    'GET /api/competitors/our-plans': { summary: 'Our plans and the features each includes', description: 'Our plans, our common features as rows with the plans that include them and what competitors give at each level, and per plan the features the market gives at its level that it lacks.', response: open },
    'POST /api/competitors/our-plans/features': {
      summary: 'Say one of our plans includes (or no longer includes) a feature', body: obj({ plan_id: str('Our plan id.'), capability_id: str('A feature on our list.'), included: { type: 'boolean', description: 'true to include, false to remove.' } }, ['plan_id', 'capability_id', 'included']), response: open,
    },
    'GET /api/competitors/catalog': { summary: 'Our common feature list and the competitor ratings that still use only their own name', description: 'Per common feature: which competitors offer it and what each calls it. Also the names not yet mapped, with a suggested match.', response: open },
    'GET /api/competitors/plan-capabilities': { summary: 'Which capabilities each plan includes', description: 'Per competitor: each plan with the capabilities linked to it, and how many plans have no capabilities mapped yet.', response: open },
    'GET /api/competitors/must-have': { summary: 'Capabilities most competitors offer', description: 'Our features ordered by how many active competitors offer them (rated strong, parity or partial), with the competitors that do not. Only features offered by at least the given share are listed.', query: { threshold: { description: 'Share of competitors, 1 to 100. Default 80. 1 lists every feature at least one competitor offers.', schema: { type: 'integer', minimum: 1, maximum: 100 } }, scope: { description: 'Only competitors that matter for this part of our product (a module or area name). Competitors with no scope count everywhere.' } }, response: open },
    'GET /api/competitors/scopes': { summary: 'Parts of our product competitors are set against', description: 'Every scope name in use: modules of the product and any area name typed on a competitor, with how many competitors carry it.', response: open },
    'GET /api/competitors/overview': {
      summary: 'The competitor dashboard in one answer',
      description: 'How many competitors are analysed and how complete they are; the competitors by tier; plans by level; every feature at least one competitor offers with the share of competitors that offer it (and who does not); the recommended features (offered by at least threshold percent); the average price per plan level; and the typical yearly price of a plan that holds most of the recommended features (coverage percent). Nothing is stored.',
      query: { threshold: { description: 'Share of competitors that must offer a feature for it to be recommended, 1 to 100. Default 60.' }, users: { description: 'Users in the price scenario. Default 1.' }, must: { description: 'Share of competitors that offer a feature for it to count as a must-have, 2 to 100. Default 80.' }, common: { description: 'Share for a feature to count as common, below the must-have share. Default 50.' }, compare_users: { description: 'Comma-separated team sizes to show the recommended price for side by side. Default 1,5,10,25.' }, coverage: { description: 'Share of the recommended features a plan must include to count in the typical price, 10 to 100. Default 70.' }, scope: { description: 'Only competitors that matter for this part of our product (a module or area name). Competitors with no scope count everywhere.' } },
      response: open,
    },
    'POST /api/competitors/import': {
      summary: 'Check or save competitors, plans and plan features from a CSV or Excel file',
      description: 'The body is the file itself (.csv or .xlsx, up to 25 MB), not JSON. Columns are matched by meaning (Competitor, Tier, Module, Product, Plan, Level, Licence, Max users, Monthly / Yearly / Lifetime price, Currency, GST included, Features, Feature, Included), so most exported sheets work as they are. With commit=0 nothing is saved and the answer lists what would be created, what already exists, what was assumed and which rows were skipped. With commit=1 it is saved. Names are matched to existing ones ignoring case and punctuation, so importing twice adds nothing twice. Existing values are only filled in when blank, unless overwrite=1. Title lines above the column names are skipped; a plan name ending in a term ("Silver - 3 Month", "Gold - Lifetime") becomes one plan with several prices; a CSV saved by Excel on Windows (Windows-1252) is read correctly; a table with Tier 1/2/3 headings and a Modules column records which module each competitor competes in.',
      query: { name: { description: 'File name with its extension, e.g. competitors.xlsx.', required: true }, commit: { description: '1 to save, 0 (default) to only check.' }, overwrite: { description: '1 to replace values that are already filled in.' }, create_features: { description: '0 to leave out features that are not on our feature list yet. Default: they are added to it.' }, competitor: { description: 'The competitor\'s name, for a file about one competitor that has no Competitor column. Without it the name is taken from the title line above the table.' }, tier: { description: 'Tier 1, Tier 2, Tier 3 or Substitute, given to competitors in a plans file that have none of their own.' }, scope: { description: 'The module (or area) of our product that the competitors in a plans file compete in, e.g. Finance & Accounting.' } },
      upload: 'The file bytes.',
      response: open, errors: { '413': 'Larger than 25 MB.', '422': 'Not a .csv or .xlsx file, or nothing in it names a competitor.' },
    },
    'POST /api/competitors/sample': {
      summary: 'Fill this product with fictional demo competitors',
      description: 'Saves nine invented companies (three per tier) with three plans each and 17 product-management features, so the competitor dashboard has something to show in every group. It uses the same importer as a file, so saving it twice changes nothing.',
      response: open,
    },
    'POST /api/competitors/bulk': {
      summary: 'Check or save competitors and their plans typed in as rows',
      description: 'Same rules as the file import. Each row is an object whose keys are column names such as Competitor, Tier, Plan, Level, Monthly price, Yearly price, Features.',
      body: obj({ rows: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'The rows.' }, commit: { type: 'boolean', description: 'true to save. Default false: only check.' }, overwrite: { type: 'boolean' }, create_features: { type: 'boolean' } }, ['rows']),
      response: open, errors: { '422': 'No rows, or none of them names a competitor.' },
    },
    'GET /api/competitors/export': {
      summary: 'Download the plans of a competitor as a CSV',
      description: 'One row per plan: competitor, tier, module, product, plan, level, licence, most users, a price column for each billing period, currency, GST, and the features of the plan. The file can be imported again unchanged. Without id, every competitor (or only those for one module) is included.',
      query: { id: { description: 'Competitor id. Leave out for all competitors.' }, scope: { description: 'Only competitors for this module.' } },
      file: { type: 'text/csv', description: 'The plans.' }, errors: { '404': 'No such competitor.' },
    },
    'GET /api/competitors/import/template': {
      summary: 'A CSV to start from', description: 'kind: plans (default), tiers (Tier 1 / Tier 2 / Tier 3 side by side) or features (one row per feature, one column per plan).',
      query: { kind: { description: 'plans, tiers or features.', schema: { type: 'string', enum: ['plans', 'tiers', 'features'] } } }, response: open,
    },
    'GET /api/competitors/compare': {
      summary: 'Compare competitors', description: 'JSON, or format=csv for a file.', query: { format: { description: 'csv for a file.', schema: { type: 'string', enum: ['csv'] } } },
      response: open,
    },
    'GET /api/pointers': { summary: 'Quotes in uploaded files that back records', query: { target: { description: 'Only for this record.' }, attachment: { description: 'Only from this file.' }, status: { description: 'Only this status.' }, include_rejected: { description: '1 to include rejected quotes.' } }, response: open },
    'POST /api/pointers': {
      summary: 'Point at an exact quote in a file as evidence for a record', description: 'The quote must really be in the file at the given place.',
      body: obj({ attachment: str('File id.'), target: str('Record id the quote backs.'), quote: str('The exact words.'), locator: { type: 'object', additionalProperties: true, description: 'Where in the file (page, sheet, line...).' }, status: str(), origin: str() }, ['attachment', 'quote']), response: open, errors: { '422': 'The quote is not found where the locator says.' },
    },
    'PATCH /api/pointers/{id}': { summary: 'Confirm, reject or move a pointer', body: obj({ status: str(), reason: str(), target: str() }), response: open },
    'DELETE /api/pointers/{id}': { summary: 'Remove a pointer', response: open },
    'GET /api/dossier': {
      summary: 'All documents of the product in one file', description: 'html (default) or md, shown in the browser (download=1 to save).',
      query: { format: { description: 'html or md.', schema: { type: 'string', enum: ['html', 'md'] } }, phase: { description: 'Only this phase.' }, download: { description: '1 to save as a file.' } },
      file: { type: 'text/html', description: 'The dossier (text/markdown when format=md).' }, errors: { '422': 'format must be html or md.' },
    },
    'GET /api/journey': { summary: 'The product\'s journey through the stages', description: 'Where it is now and the state of each stage, with what to do next.', query: { stage: { description: 'Focus on one stage.' } }, response: obj({ current: int(), current_name: str(), stages: arr(open) }, [], { additionalProperties: true }) },
    'GET /api/product/summary': { summary: 'One-page summary of the product', response: open },
    'GET /api/reports/product': {
      summary: 'Status report of the product', description: 'JSON, or a file with format=csv or html.', query: { format: { description: 'csv or html for a file.', schema: { type: 'string', enum: ['csv', 'html'] } }, download: { description: '1 to save as a file.' } },
      response: open,
    },
    'GET /api/help/guide': { summary: 'The user guide', description: 'Markdown. Works without a product.', file: { type: 'text/markdown', description: 'USER_GUIDE.md' }, errors: { '404': 'The guide file is missing.' } },
  },
};
