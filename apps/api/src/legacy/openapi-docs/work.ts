import { arr, bool, DocSet, int, obj, str } from './types';

const open = { type: 'object', additionalProperties: true };
const DEPTH = { description: 'Evaluate at this depth.', schema: { type: 'string', enum: ['L1', 'L2', 'L3'] } };

/** the work screens: requests (questions the tool needs answered), sessions, stories, handover to engineering, people, feedback, demo walkthrough */
export const workDocs: DocSet = {
  routes: {
    'GET /api/requests': { summary: 'Everything the tool needs from people', query: { depth: { ...DEPTH } }, response: obj({ depth: str(), totals: open, sessions: arr(open), requests: arr(open) }, ['requests'], { additionalProperties: true }) },
    'GET /api/requests/{id}': { summary: 'One request with its form and state', response: obj({ request: open, form: open, state: { description: 'Answer state or null.' } }, ['request'], { additionalProperties: true }), errors: { '404': 'request not found.' } },
    'POST /api/requests/{id}/answer': { summary: 'Answer a request', description: 'The body is the form values; what is needed depends on the request (see the form in GET /api/requests/{id}).', body: { type: 'object', additionalProperties: true }, response: open, errors: { '422': 'An answer is missing or not valid.' } },
    'POST /api/requests/{id}/derive': { summary: 'Let the tool work out the records for a request', response: open },
    'POST /api/requests/{id}/na': { summary: 'Mark a request as not applicable', body: obj({ reason: str('Why it does not apply.') }, ['reason']), response: obj({ ok: bool() }, ['ok']) },
    'GET /api/sessions': { summary: 'Work sessions and their steps', query: { forms: { description: '0 to leave out the forms (smaller answer).', schema: { type: 'string', enum: ['0', '1'] } } }, response: open },
    'POST /api/sessions/auto': { summary: 'Run every step the tool can do by itself', description: 'Safe to call when a work screen opens. Demo products are never changed.', response: obj({ ran: arr(open), skipped: str() }, [], { additionalProperties: true }) },
    'POST /api/sessions/{code}/steps/{requestId}': { summary: 'Post the answer to one step of a session', body: { type: 'object', additionalProperties: true }, response: open },
    'GET /api/stories': {
      summary: 'User stories and where each is', description: 'States: draft, complete, waiting (for approval), approved, handed_off.',
      response: obj({ stories: arr(open), counts: obj({ total: int(), draft: int(), complete: int(), waiting: int(), approved: int(), handed_off: int() }, ['total']) }, ['stories', 'counts'], { additionalProperties: true }),
    },
    'GET /api/stories/{id}': { summary: 'One story as a form', response: open },
    'POST /api/stories/{id}/complete': { summary: 'Fill in the missing parts of a story', body: { type: 'object', additionalProperties: true, description: 'The story fields to complete.' }, response: open },
    'POST /api/stories/{id}/submit': { summary: 'Send a story to an approver', body: obj({ approver: str('Who must approve it.') }, ['approver']), response: open, errors: { '409': 'self_approval: you prepared it, name someone else.' } },
    'GET /api/handoff/stories': { summary: 'Which stories are ready to hand to engineering', description: 'Evaluated against Gate 4.', response: obj({ stories: arr(open) }, ['stories'], { additionalProperties: true }) },
    'GET /api/handoff/preview': { summary: 'The package engineering would receive for a story', query: { story: { description: 'Story id.' } }, response: obj({ package: open, validation: open }, ['package', 'validation']) },
    'POST /api/handoff/validate': { summary: 'Check a package for a story', body: obj({ story: str('Story id (the package is built for you).'), package: open }), response: obj({ validation: open }, ['validation']) },
    'POST /api/handoff/create': { summary: 'Create the hand-over package for a story', body: obj({ story: str() }, ['story']), response: open },
    'GET /api/handoff/receiver': { summary: 'Where hand-over packages are delivered', description: 'Not tied to a product.', response: open },
    'POST /api/handoff/deliver': { summary: 'Deliver a story\'s package to the receiver', body: obj({ story: str() }, ['story']), response: open },
    'GET /api/handoff/overview': { summary: 'Hand-over status of every story', response: obj({ status: open, stories: arr(open), receiver: open }, ['stories'], { additionalProperties: true }) },
    'GET /api/existing': { summary: 'Records read from an existing system, waiting to be confirmed', description: 'For products that extend or replace a system already in use.', response: open },
    'POST /api/existing/{id}/confirm': { summary: 'Confirm a record read from the existing system', response: obj({ item: open }, ['item']) },
    'POST /api/existing/{id}/feature': { summary: 'Turn a record from the existing system into a feature', response: open },
    'GET /api/people': { summary: 'People who can act on this product', description: 'From the product\'s stakeholder records plus the person signed in. Works without a product.', response: obj({ people: arr(open), categories: arr(str()), role_words: open }, ['people'], { additionalProperties: true }) },
    'POST /api/people': { summary: 'Add a person', body: { type: 'object', additionalProperties: true, description: 'name, category, role_title, email, phone...' }, response: open },
    'GET /api/members': { summary: 'Members of the platform, a project or a phase', description: 'Everyone who has been added, with their role and where they were added. Works without a product.', query: { project: { description: 'Only members added to this product (a product id such as PRD-001).' }, scope: { description: 'platform, project or phase.' } }, response: open },
    'POST /api/members': { summary: 'Add a member', description: 'Administrators only. Adds a person at one level: the whole platform, one project (give product_id) or one phase of a project (give product_id and phase).', body: obj({ name: str('The person\'s name, as it should be shown.'), email: str('Optional email address.'), role: str('Owner, Lead, Contributor, Reviewer or Viewer. Default Contributor.'), scope: str('platform, project or phase.'), product_id: str('Needed for project and phase.'), phase: { type: 'integer', description: 'Phase number 0 to 12. Needed for phase.' } }, ['name', 'scope']), response: open, errors: { '403': 'Only an administrator can add members.', '409': 'This person is already a member at that level.', '422': 'A name is needed, or project / phase is missing.' } },
    'POST /api/members/{id}/role': { summary: 'Change a member\'s role', description: 'Administrators only.', body: obj({ role: str('Owner, Lead, Contributor, Reviewer or Viewer.') }, ['role']), response: open, errors: { '403': 'Only an administrator can change roles.', '404': 'No such member.', '422': 'That is not a role.' } },
    'DELETE /api/members/{id}': { summary: 'Remove a member', description: 'Administrators only. The person keeps their history; they just no longer have the role.', response: open, errors: { '403': 'Only an administrator can remove members.', '404': 'No such member.' } },
    'GET /api/needed': { summary: 'What is needed from whom to move the product forward', response: open },
    'POST /api/needed/send': { summary: 'Send a request for what is needed', description: 'Creates approval or answer requests with links.', body: { type: 'object', additionalProperties: true, description: 'stage and row to send.' }, response: open },
    'GET /api/flow-edit': { summary: 'Flows that can be edited', response: obj({ flows: arr(open) }, ['flows']) },
    'GET /api/flow-edit/{id}': { summary: 'One flow as an editable model', response: open },
    'POST /api/flow-edit/{id}': { summary: 'Save an edited flow', body: { type: 'object', additionalProperties: true, description: 'The edited flow model.' }, response: open },
    'GET /api/feedback': { summary: 'Notes people left about the tool', description: 'Not tied to a product.', response: open },
    'POST /api/feedback': { summary: 'Leave a note about the tool', description: 'Does not need a person\'s name. Not tied to a product.', body: obj({ text: str('The note.'), product: str('Product id it is about, optional.') }, [], { additionalProperties: true }), response: obj({ note: open, saved_in: str() }, ['note']) },
    'POST /api/feedback/{id}/done': { summary: 'Mark a note as dealt with (or not)', body: obj({ done: bool('Default true.') }), response: obj({ note: open }, ['note']) },
    'GET /api/demo': { summary: 'Where the guided demo walkthrough is', response: open },
    'POST /api/demo/next': { summary: 'Play the next demo step', description: 'Changes the demo product\'s data.', response: obj({ result: open, status: open }, ['status'], { additionalProperties: true }) },
    'POST /api/demo/back': { summary: 'Go back one demo step', description: 'Resets the demo product to its start and replays the steps. Destroys changes made since.', response: open },
    'POST /api/demo/reset': { summary: 'Restart the demo from the beginning', description: 'Resets the demo product to its start. Destroys changes made since.', response: open },
    'POST /api/demo/goto': { summary: 'Jump to a demo step', description: 'Resets the demo product and replays up to that step.', body: obj({ index: int('Step number.') }, ['index']), response: open },
  },
};
