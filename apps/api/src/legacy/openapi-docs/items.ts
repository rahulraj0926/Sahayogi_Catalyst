import { arr, bool, DocSet, int, obj, ref, str } from './types';

const ORIGIN = ['human', 'document', 'agent', 'assistant', 'derived', 'invented'];

/** items (the records of a product), links between them, and the review inbox for drafted records */
export const itemsDocs: DocSet = {
  schemas: {
    LegacyItem: obj({
      id: str('Record id such as FR-0007.'), type: str('Record type, e.g. Requirement, Risk, Stakeholder (see GET /api/meta).'), subtype: str('Optional subtype.'),
      title: str(), status: str('One of the statuses of its type (see GET /api/meta).'), phase: int('Lifecycle phase 0-12 the type belongs to.'),
      origin: str('Where it came from.', { enum: ORIGIN }), verification: str('For agent and assistant records.', { enum: ['unverified', 'verified', 'rejected', null], nullable: true }),
      priority: str('MoSCoW, for types that have it.', { enum: ['Must', 'Should', 'Could', 'Wont', null], nullable: true }),
      rev: int('Revision, goes up with every change. Send it back as expected_rev to avoid overwriting someone else.'),
      created_at: str(undefined, { format: 'date-time' }), updated_at: str(undefined, { format: 'date-time' }), created_by: str(undefined, { nullable: true }),
    }, ['id', 'type', 'status'], { additionalProperties: true, description: 'A record. Besides these fields it carries the fields of its type (statement, owner, ...).' }),
    LegacyItemListed: obj({
      _suspect: bool('A record it depends on changed after it was last reviewed.'), _suspectCauses: arr(str()), _stale: bool(), _counted: bool('Counts toward gates and readiness.'),
      _freshness: str(undefined, { nullable: true }), _links: int('How many links it has.'),
    }, [], { additionalProperties: true, description: 'LegacyItem plus these computed flags (underscore fields).' }),
    LegacyLink: obj({
      id: str('Link id such as LNK-0012.'), type: str('Link type (see GET /api/meta, links).'), source: str('Record id the link starts at.'), target: str('Record id it points to.'),
      attrs: { type: 'object', additionalProperties: true, description: 'Attributes of the link type.' },
      state: str('valid, or suspect when one end changed.'), created_at: str(undefined, { format: 'date-time' }), created_by: str(undefined, { nullable: true }),
    }, ['id', 'type', 'source', 'target']),
    LegacyItemDetail: obj({
      item: ref('LegacyItem'), def: obj({ prefix: str(), v2Ref: arr(str()), statuses: arr(str()) }), counted: bool(),
      suspect: { description: 'Why it is flagged, or null.' }, stale: { description: 'Staleness details, or null.' }, freshness: { description: 'Freshness state, or null.' },
      links: arr(obj({ id: str(), type: str(), direction: str(undefined, { enum: ['out', 'in'] }), other: str('The record at the other end.'), otherTitle: str(), otherType: str(), attrs: { type: 'object' }, state: str() })),
      upstream: { description: 'Records this one depends on (up to 3 levels).' }, downstream: { description: 'Records that depend on this one (up to 3 levels).' },
      usedBy: { description: 'Where the record is used.' }, history: arr({ type: 'object', additionalProperties: true }), pointers: arr({ type: 'object', additionalProperties: true, description: 'Quotes in uploaded documents that back this record.' }),
    }, ['item']),
  },
  routes: {
    'GET /api/items': {
      summary: 'List records',
      description: 'Records of one product, sorted by id, with computed flags. Filters combine (all must match).',
      query: {
        type: { description: 'Record type.' }, subtype: { description: 'Subtype.' }, phase: { description: 'Lifecycle phase 0-12.', schema: { type: 'integer', minimum: 0, maximum: 12 } },
        status: { description: 'Status.' }, origin: { description: 'Origin.', schema: { type: 'string', enum: ORIGIN } },
        q: { description: 'Search in id, title and statement (case-insensitive).' }, flag: { description: 'Only records flagged suspect.', schema: { type: 'string', enum: ['suspect'] } },
        limit: { description: 'Most rows to return (default 1000).', schema: { type: 'integer', minimum: 1 } },
      },
      response: obj({ total: int('How many matched in all.'), items: arr({ allOf: [ref('LegacyItem'), ref('LegacyItemListed')] }) }, ['total', 'items']),
    },
    'GET /api/items/{id}': { summary: 'One record with its links, history and where it is used', response: ref('LegacyItemDetail') },
    'POST /api/items': {
      summary: 'Create a record',
      body: obj({
        type: str('Record type.'), fields: { type: 'object', additionalProperties: true, description: 'Fields of the type; id is generated.' },
        origin: str('human (default) or document.', { enum: ['human', 'document'] }), subtype: str(),
      }, ['type']),
      response: obj({ item: ref('LegacyItem') }, ['item']), errors: { '422': 'Unknown type or a field is not valid.' },
    },
    'PATCH /api/items/{id}': {
      summary: 'Change fields of a record',
      description: 'Send expected_rev (or an If-Match header) with the revision you were looking at. If someone changed the record since, nothing is saved and the answer is 409 with code stale_edit and the current record.',
      body: obj({ fields: { type: 'object', additionalProperties: true, description: 'Only the fields to change.' }, expected_rev: int('Revision you were looking at.'), reviewed: bool('Mark as reviewed by the person (clears a suspect flag caused by an upstream change).') }, ['fields']),
      response: obj({ item: ref('LegacyItem') }, ['item']), errors: { '409': 'stale_edit: the record changed since expected_rev; the answer carries it as current.' },
    },
    'POST /api/items/{id}/status': { summary: 'Set the status of a record', body: obj({ status: str('A status of the record type.') }, ['status']), response: obj({ item: ref('LegacyItem') }, ['item']), errors: { '422': 'Status not allowed for this type, or the move is not allowed.' } },
    'DELETE /api/items/{id}': { summary: 'Delete a record and its links', response: obj({ removedLinks: int('How many links were removed with it.') }, ['removedLinks']) },
    'POST /api/items/{id}/clear': {
      summary: 'Clear the suspect flag after checking', description: 'Says the person looked at the change upstream and the record still stands.',
      body: obj({ note: str('Why it still stands.') }), response: obj({ cleared: { description: 'What was cleared.' } }),
    },
    'POST /api/review': {
      summary: 'Accept drafted records for review', description: 'Moves records to a status (default In review).',
      body: obj({ ids: arr(str()), status: str('Default In review.') }, ['ids']), response: obj({ updated: arr(str('Ids that were updated.')) }, ['updated']),
    },
    'GET /api/review/{type}': { summary: 'Drafted records of a type waiting for review', description: 'Derived records still in Draft.', response: obj({ type: str(), items: arr({ allOf: [ref('LegacyItem'), ref('LegacyItemListed')] }) }, ['type', 'items']) },
    'GET /api/links': {
      summary: 'List links', description: 'All links of the product, or only those touching one record.',
      query: { item: { description: 'Record id: only links where it is source or target.' } }, response: arr(ref('LegacyLink')),
    },
    'POST /api/links': {
      summary: 'Link two records', description: 'The link type decides which record types may be joined; an illegal pair is refused.',
      body: obj({ type: str('Link type.'), source: str('Record id.'), target: str('Record id.'), attrs: { type: 'object', additionalProperties: true } }, ['type', 'source', 'target']),
      response: obj({ link: ref('LegacyLink') }, ['link']), errors: { '422': 'Illegal link (wrong record types, unknown record, or it already exists).' },
    },
    'DELETE /api/links/{id}': { summary: 'Remove a link', response: obj({ removed: { description: 'The link that was removed.' } }) },
    'POST /api/links/{id}/clear': { summary: 'Clear the suspect flag of a link', body: obj({ note: str() }), response: obj({ link: ref('LegacyLink') }, ['link']) },
  },
};
