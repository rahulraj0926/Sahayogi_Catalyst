import { arr, bool, DocSet, int, obj, ref, str } from './types';

const open = { type: 'object', additionalProperties: true };

/** uploaded files and the drafts read from them, the review inbox, documents built from the records, the assistant, sharing, export/import */
export const filesDocs: DocSet = {
  schemas: {
    Attachment: obj({ id: str('ATT-... id.'), filename: str(), mime: str(undefined, { nullable: true }), status: str(undefined, { enum: ['Active', 'Deleted'] }), targets: arr(str('Record ids it is attached to.')) }, ['id'], { additionalProperties: true }),
    DocumentRow: obj({ key: str('Document key.'), title: str(), status: str('draft, in_review, approved or not_started.', { enum: ['draft', 'in_review', 'approved', 'not_started'] }) }, ['key'], { additionalProperties: true }),
  },
  routes: {
    'POST /api/attachments': {
      summary: 'Upload a file and attach it to a record', description: 'The body is the file itself (up to 25 MB), not JSON. The file name and the record go in the query. The file is read for text straight away.',
      query: { target: { description: 'Record id the file is attached to.', required: true }, name: { description: 'File name, e.g. brief.pdf.', required: true } },
      upload: 'The file bytes. Send its type in Content-Type.',
      response: obj({ attachment: ref('Attachment'), target: str(), extraction: obj({ status: str(), kind: str(), chars: int(), warnings: arr(str()) }, [], { additionalProperties: true }) }, ['attachment']),
      errors: { '404': 'The record does not exist.', '413': 'Larger than 25 MB.', '422': 'target or name missing, or the file type is not allowed.' },
    },
    'GET /api/attachments': {
      summary: 'List files', query: { target: { description: 'Only files attached to this record.' } },
      response: obj({ target: str(undefined, { nullable: true }), total: int(), attachments: arr(ref('Attachment')) }, ['total', 'attachments']), errors: { '404': 'target record not found.' },
    },
    'GET /api/attachments/{id}/download': { summary: 'Download the original file', description: 'Always sent as a download, never shown by the browser.', file: { type: 'application/octet-stream', description: 'The file (png, jpeg, gif, pdf, txt and csv keep their type).' }, errors: { '410': 'The file was deleted.' } },
    'GET /api/attachments/{id}/text': { summary: 'The text read from a file', response: open, errors: { '410': 'The file was deleted.' } },
    'POST /api/attachments/{id}/paste-text': {
      summary: 'Give the words of a file the system could not read', description: 'For scanned or protected files: paste the text and it is used as if it had been read.',
      body: obj({ text: str('The pasted words.') }, ['text']), response: open, errors: { '410': 'The file was deleted.', '422': 'text missing.' },
    },
    'DELETE /api/attachments/{id}': { summary: 'Delete a file', description: 'The file is marked Deleted; records drafted from it are kept.', response: open },
    'POST /api/attachments/{id}/suggest': { summary: 'Suggest records from a file', description: 'Reads the file and proposes records. Nothing is saved until you accept.', response: obj({ candidates: arr(open) }, [], { additionalProperties: true }) },
    'POST /api/attachments/{id}/accept': {
      summary: 'Create records from the suggestions you chose', description: 'Send the candidates you picked from /suggest. All or nothing: if any fails, none are saved.',
      body: obj({ candidates: arr(open) }, ['candidates']), response: obj({ created: arr(open), updated: arr(open), skipped: arr(open), errors: arr(open) }, [], { additionalProperties: true }), errors: { '410': 'The file was deleted.', '422': 'candidates missing.' },
    },
    'GET /api/attachments/{id}/view': { summary: 'A readable view of a file with its text locations', query: { sheet: { description: 'For spreadsheets: which sheet.' } }, response: open },
    'GET /api/attachments/{id}/raw': { summary: 'The file shown in a sandbox', description: 'Shown inline with a strict Content-Security-Policy so scripts inside it cannot run.', file: { type: 'text/html', description: 'The file, rendered safely.' } },
    'GET /api/attachments/{id}/media': { summary: 'A picture or media file inside an Office document', query: { path: { description: 'Path of the media inside the document.' } }, file: { type: 'application/octet-stream', description: 'The media file.' } },
    'POST /api/attachments/{id}/assist': { summary: 'Ask the assistant to read a file and propose records', description: 'In live mode this costs money (see /api/assistant/usage); in simple and demo mode it costs nothing. Proposals go to the inbox for review.', body: { type: 'object', additionalProperties: true, description: 'Options such as goal and the part of the file to read.' }, response: open },
    'POST /api/attachments/{id}/assist/estimate': { summary: 'What an assistant run would cost', description: 'Sends nothing anywhere.', body: { type: 'object', additionalProperties: true }, response: open },
    'GET /api/assistant/usage': { summary: 'Assistant spending this month against the cap', response: open },
    'POST /api/assistant/usage': { summary: 'Set the monthly spending cap', description: 'Administrator only.', body: obj({ cap_inr: { type: 'number', description: 'Monthly cap in INR.' } }, ['cap_inr']), response: open },
    'POST /api/assistant/chat': {
      summary: 'Ask the built-in helper', description: 'Answers from saved records only: what to do next, where the product stands, what waits for approval. It does not call an outside model.',
      body: obj({ message: str('The question.') }), response: obj({ reply: str(), sources: arr(str()) }, ['reply', 'sources']),
    },
    'GET /api/inbox': { summary: 'Proposals from the assistant waiting for review', query: { status: { description: 'Filter by status.' }, attachment: { description: 'Only proposals from this file.' }, goal: { description: 'Only this goal.' }, min: { description: 'Minimum confidence.' } }, response: open },
    'POST /api/inbox/accept-all': { summary: 'Accept every proposal that matches the filter', body: { type: 'object', additionalProperties: true }, response: open },
    'POST /api/inbox/{id}/accept': { summary: 'Accept one proposal', description: 'Creates or updates the record it proposes.', body: { type: 'object', additionalProperties: true }, response: open },
    'POST /api/inbox/{id}/edit': { summary: 'Change a proposal before accepting', body: obj({ fields: { type: 'object', additionalProperties: true } }, [], { additionalProperties: true }), response: open },
    'POST /api/inbox/{id}/reject': { summary: 'Reject a proposal', body: obj({ reason: str() }), response: open },
    'GET /api/documents': {
      summary: 'Documents built from the records', description: 'Each document is composed live from the records; approving one freezes a version.',
      response: obj({ product: obj({ id: str(), name: str() }), total: int(), approved: int(), approval_threshold_percent: { type: 'number' }, by_status: { type: 'object', additionalProperties: { type: 'integer' } }, documents: arr(ref('DocumentRow')) }, ['total', 'documents']),
    },
    'GET /api/documents/{key}': {
      summary: 'One document', description: 'format=json (default) gives the structure; html and md give a file shown in the browser (download=1 to save).',
      query: { format: { description: 'json, html or md.', schema: { type: 'string', enum: ['json', 'html', 'md'] } }, download: { description: '1 to save as a file.' } }, response: open, errors: { '422': 'format must be json, html or md.' },
    },
    'POST /api/documents/{key}/status': {
      summary: 'Set a document to draft, in review or approved', description: 'Only a named person can do it, in a recognised role.',
      body: obj({ status: str(undefined, { enum: ['draft', 'in_review', 'approved'] }), role: str('For example Product Owner or Sponsor.'), by: str('Defaults to you.'), note: str() }, ['status', 'role']), response: open, errors: { '422': 'Status or role not valid, or an agent tried to change it.' },
    },
    'GET /api/sheet': { summary: 'All records as one sheet', description: 'Every record of the product in tabular form.', response: open },
    'GET /api/sharing': { summary: 'How links to approvers are built', description: 'Public address and link lifetime. Not tied to a product.', response: open },
    'POST /api/sharing': {
      summary: 'Set the public address and link lifetime', description: 'Not tied to a product.',
      body: obj({ public_url: str('Address others can open, e.g. http://192.168.1.20:4317. Empty clears it.'), approval_expiry_days: int('1 to 365.') }), response: open, errors: { '422': 'Address or days not valid.' },
    },
    'GET /api/export': { summary: 'Download all data of the product as JSON', file: { type: 'application/json', description: 'A JSON file of every record, link, audit entry and setting.' } },
    'POST /api/import': {
      summary: 'Replace all data of the product from an export', description: 'Everything in the product is replaced. The data is checked first; a file with problems is refused and nothing changes.',
      body: obj({ data: { type: 'object', additionalProperties: true, description: 'The content of an export file.' } }, ['data']), response: obj({ items: int(), links: int() }, ['items', 'links']), errors: { '422': 'Up to 30 problems found in the data.' },
    },
    'POST /api/reset': { summary: 'Reset the product to its starting demo data', description: 'Destroys the product\'s data.', response: obj({ items: int(), links: int() }, [], { additionalProperties: true }) },
  },
};
