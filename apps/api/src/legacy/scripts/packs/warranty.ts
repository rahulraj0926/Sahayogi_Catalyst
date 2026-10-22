/**
 * Pack: Warranty and Service Desk (service, depth L1). Seeded at the very start of Phase 0: Gate 0 is open and blocked because
 * no customer is named, the budget has no date constraint beside it, a Must question is open and the evidence register is thin.
 * All facts are invented.
 */
const E = (title, kind, cls, date, grade, extra?) => [title, kind, cls, date, grade, extra];

export const key = 'warranty';
export const name = 'Warranty and Service Desk';
export const mode = 'greenfield';
export const depth = 'L1';
export const currency = 'INR';
export const sponsor = 'Priya Nair';
export const owner = 'Priya Nair';
export const reach = 0;
export const decide = [];
export const artifacts = false;
export const last = '2026-10-08';
export const lastNote = 'Priya Nair listed the first open questions with the service team.';
export const dates = { start: '2026-10-02' };
export const intakeStatus = 'In review';
export const people = [
    ['Priya Nair', 'Sponsor', 'Head of Customer Service', 'Fewer lost warranty claims and faster visits', true],
    ['Sanjay Kulkarni', 'Delivery', 'IT lead', 'A clear first scope before any build', false],
    ['Field service supervisor', 'Operations', 'Field service supervisor', 'Dispatch engineers without phone tag', false],
    ['Anita Desai', 'Finance', 'Finance controller', 'Warranty cost visible by product and dealer', false],
    ['Dealer relations manager', 'Commercial', 'Dealer relations', 'Dealers can register products for their customers', false],
  ];
export const intake = {
    idea: 'One place to register products, raise warranty claims and dispatch service engineers, instead of e-mail threads and spreadsheets.',
    requester: 'Priya Nair (Head of Customer Service)',
    problem: 'Warranty claims arrive by phone, e-mail and dealers. They are tracked in spreadsheets, nobody can say how many are open, customers wait a week for a first reply and engineers are sent without knowing the product history.',
    purpose: 'Answer every warranty claim within one working day and send an engineer who already knows the product history.',
    outcome: 'First reply within 24 hours for 95 percent of claims and a single open-claims count that finance trusts.',
    neededBy: '2027-06-30', urgency: 'medium', assets: ['Claims spreadsheet since 2023', 'Service team of 18'], refs: [], data: ['customer_contacts', 'product_serials'], personal: true, jurisdictions: ['India'],
  };
export const evidence = [
    E('Claims spreadsheet export, January to September 2026', 'data_file', 'internal', '2026-09-28', 'B'),
    E('Notes from the first service-team workshop', 'interview', 'primary', '2026-10-06', 'B'),
  ];
export const insights = [['Customers wait a week for a first reply because claims are not triaged', 'Raw', 'Inferred', [0]]];
export const assumptions = [
    ['Serial numbers are recorded on every product at the factory', 'technical', 3, 4, 'Sanjay Kulkarni', 1, 'check 20 products'],
    ['Dealers will register products for their customers', 'commercial', 4, 4, 'Dealer relations manager', 1, 'dealer interviews'],
    ['Customers accept an online claim form', 'commercial', 2, 3, 'Priya Nair', 1, 'survey'],
  ];
export const constraints = [['budget', 'Budget for the first phase of discovery and design', 25, 'INR lakh', 'soft', 'Anita Desai']];
export const questions = [
    ['Which product lines are covered by the first release?', 'Must', 0, 'Priya Nair', 'Open'],
    ['Who approves out-of-warranty goodwill repairs?', 'Should', 1, 'Anita Desai', 'Open'],
  ];
export const risks = [['Dealers keep handling claims by phone', 'market', 3, 3, 'Dealer relations manager', 'Claims stay outside the system']];
export const scope0 = [['Claim registration, tracking and engineer dispatch', 'in', 'the core of the problem'], ['Spare parts inventory', 'unknown', 'depends on the answer on product lines', 0]];
export const externals = [['SMS and e-mail gateway', 'messaging provider', 'partner_api', 'medium', 'Sanjay Kulkarni']];
