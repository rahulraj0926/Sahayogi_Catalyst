/**
 * scripts/flow_fixture.ts - the answers a real product leader gives, stage by stage, replayed through the SAME engine calls the screens use
 * (sessions.postStep, approvals, stories). Used by tests/round3_flow.test.js to prove that a blank product can be taken, honestly,
 * from nothing to a created handoff package. Every business fact below is invented for the test ("Dealer Warranty and Service Portal").
 *
 *   import { build } from './flow_fixture';
 *   const { store, pf, entry } = build({ upTo: 4, stories: true, handoff: true });
 */
import { Portfolio } from '../engine/portfolio';
import * as sessions from '../engine/sessions';
import * as approvals from '../engine/approvals';
import * as requests from '../engine/requests';
import * as gates from '../engine/gates';
import * as stories from '../engine/stories';
import * as handoff from '../engine/handoff';
import * as Q from '../engine/query';
import * as agent from '../engine/agent';

const ME = 'Kanishk';
const rows = (...r) => r.map((cells) => ({ cells }));
const CTX = { kind: 'software', audience: 'internal' };

function build(opts: any = {}) {
  const c = build0(opts);
  if (opts.root) { c.pf.save(c.entry.id); c.pf.saveRegistry(); } // a real folder on disk: a server can be pointed at it
  return c;
}

function build0(opts: any = {}) {
  const pf = new Portfolio(opts.root || null);
  pf.reg.asOf = null;
  const entry = pf.create({ name: 'Dealer Warranty and Service Portal', one_liner: 'A portal where dealers register warranties and raise service requests', kind: 'software', audience: 'internal', owner: ME, depth_level: opts.depth || 'L1' }, { actor: ME });
  const S = pf.store(entry.id);
  const log = [];
  const post = (code, id, answers, extra?, actor = ME) => {
    try { const r = sessions.postStep(S, code, id, { answers, ...(extra || {}) }, actor, CTX); log.push(`${id} ok`); return r; } catch (e) { e.message = `${id}: ${e.message}${e.errors ? ' ' + e.errors.join(' ') : ''}`; throw e; }
  };
  const confirmAll = (who?) => { for (const a of approvals.list(S)) if (approvals.statusOf(S, a) === 'waiting' && (!who || approvals.same(a.approver, who))) approvals.confirmInPerson(S, a.id, a.approver); };
  const by = (type, title) => S.list(type).find((x) => x.title === title);
  const ids = (type, pred) => S.list(type, pred).map((x) => x.id);
  const future = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const decide = (code, id, decision, approver, extra?) => {
    const r = post(code, id, { decision, approver, rationale: 'The required items are in place.', ...(extra || {}) });
    confirmAll();
    return r;
  };
  const ctxO: any = { S, pf, entry, post, confirmAll, by, ids, future, decide, log, rows };
  if (opts.upTo === undefined) return ctxO;

  // ------------------------------------------------------------------ Stage 0
  post('S0-A', 'DR-0-02', { problem: 'Dealers phone our service desk to check whether a product is under warranty, then wait days for a service visit to be confirmed. Customers wait and dealers lose sales.', purpose: 'An internal portal where our dealers register warranties at the time of sale and raise service requests themselves.', outcome: 'Warranty checks take under a minute and service requests are confirmed in two working days.', requester: 'Anita Rao' });
  post('S0-A', 'DR-0-03', { cats: 'contact,documents,business_data', sensitive: 'personal', juris: 'India', crit: 'business' });
  post('S0-A', 'DR-0-04', { sponsor: 'Rajesh Mehta', role: 'Managing Director' });
  post('S0-A', 'DR-0-05', { people: rows(['Anita Rao', 'Operations', 'Head of Service', 'Fewer calls to the service desk'], ['Suresh Iyer', 'Delivery', 'IT manager', 'A system we can support'], ['Dinesh Patel', 'End-user', 'Dealer owner', 'Register a sale in a minute'], ['Vikram Shah', 'Customer', 'Customer who bought a product', 'A quick repair'], ['Meera Joshi', 'Regulator/Legal', 'Legal counsel', 'Consumer law is followed']) });
  post('S0-A', 'DR-0-16', { title: 'Sponsor memo', text: 'The managing director wants dealers to stop phoning the service desk. Budget is two and a half million rupees.', date: '2026-10-01' });
  post('S0-B', 'DR-0-06', { rows: rows(['budget', 'Total budget for version 1', '2500000', 'INR', 'hard', 'Rajesh Mehta'], ['date', 'Live before the festive season', '', '', 'soft', 'Rajesh Mehta']) });
  post('S0-B', 'DR-0-07', { rows: rows(['regulatory', 'Warranty promises must follow the Consumer Protection Act', '', '', 'hard', 'Meera Joshi'], ['technology', 'It must run on our existing servers', '', '', 'soft', 'Suresh Iyer']) });
  post('S0-B', 'DR-0-08', { rows: rows(['Dealers will use a portal instead of phoning', 'operational', '3', '4', 'Anita Rao', '2'], ['We can reuse the existing dealer login', 'technical', '2', '3', 'Suresh Iyer', '2'], ['Customers keep their invoice', 'operational', '2', '3', 'Anita Rao', '2']) });
  post('S0-B', 'DR-0-13', { rows: rows(['Dealers keep phoning out of habit', 'operational', '3', '3', 'Anita Rao'], ['Customer data leaks', 'security', '2', '5', 'Suresh Iyer'], ['The sponsor changes the budget', 'financial', '2', '3', 'Rajesh Mehta']) });
  post('S0-C', 'DR-0-09', { rows: rows(['Do dealers pay through the portal?', 'Must', '0', 'Rajesh Mehta'], ['Which dealers go first?', 'Should', '1', 'Anita Rao'], ['Who answers dealer questions?', 'Could', '2', 'Anita Rao']) });
  const must0 = S.list('Question').find((q) => q.priority === 'Must' && q.needed_by_gate === 0);
  post('S0-C', 'DR-0-10', { question: must0.id, kind: 'assumed', assumption_statement: 'No payments in version 1', owner: 'Rajesh Mehta', reconfirm_by: future(90) });
  post('S0-C', 'DR-0-11', { rows: rows(['Register a warranty at the time of sale', 'in', 'Core', ''], ['Raise a service request', 'in', 'Core', ''], ['Online payments', 'out', 'Later', ''], ['Spare parts ordering', 'unknown', '', 'new:Is spare parts ordering part of version 1?']) });
  post('S0-C', 'DR-0-12', { effort: 20, cost: 1500000, approver: 'Rajesh Mehta' });
  post('S0-C', 'DR-0-14', { confirm: true, approver: 'Rajesh Mehta' });
  confirmAll();
  if (opts.pendingStage0) { post('S0-C', 'DR-0-15', { decision: 'go', approver: 'Rajesh Mehta', rationale: 'Ready.' }); return ctxO; } // asked, not yet confirmed
  decide('S0-C', 'DR-0-15', 'go', 'Rajesh Mehta');
  if (opts.upTo === 0) return ctxO;

  // ------------------------------------------------------------------ Stage 1
  post('S1-A', 'DR-1-01', { segments: rows(['Authorised dealers', 'yes', 'Shops that sell our products'], ['End customers', 'no', 'People who bought a product']), personas: rows(['Dealer owner', 'internal_user', 'yes', 'Authorised dealers'], ['Dealer counter staff', 'internal_user', 'no', 'Authorised dealers'], ['Service desk agent', 'internal_user', 'no', 'Authorised dealers']) });
  const persDealer = by('Persona', 'Dealer owner'); const segDealer = by('Segment', 'Authorised dealers');
  post('S1-A', 'DR-1-02', { jobs: rows(['When a customer buys a product I want to register its warranty in a minute', '5', '1', persDealer.title, segDealer.title], ['When a product breaks I want to raise a service request without phoning', '4', '2', persDealer.title, segDealer.title], ['When a customer asks I want to check warranty status', '4', '3', persDealer.title, segDealer.title]) });
  post('S1-A', 'DR-1-03', { rows: rows(['Northwind Dealer Care', 'direct', 'T1', 'customer_shortlist', 'A dealer service portal'], ['Spreadsheets and phone calls', 'alternative', 'S', 'analyst_judgement', 'What dealers do today'], ['ServiceBridge', 'indirect', 'T2', 'dealer_poll', 'General service software']) });
  post('S1-A', 'DR-1-13', { rows: rows(['Northwind Dealer Care', 'direct', 'T1', 'customer_shortlist', 'A dealer service portal', 'northwind.example.com'], ['Spreadsheets and phone calls', 'alternative', 'S', 'analyst_judgement', 'What dealers do today', ''], ['ServiceBridge', 'indirect', 'T2', 'dealer_poll', 'General service software', 'servicebridge.example.com']) }, { route: 'hand' });
  post('S1-A', 'DR-1-11', { title: 'Northwind price list', text: 'Northwind Dealer Care: Basic plan Rs 900 per dealer per month, Standard Rs 1,200 per dealer per month.', date: '2026-10-05', url: '' });
  post('S1-A', 'DR-1-12', { title: 'Service desk log summary', text: 'Dealers phoned 400 times a week about warranty checks in September.', date: '2026-10-06' });
  const nw = by('Competitor', 'Northwind Dealer Care'); const sb = by('Competitor', 'ServiceBridge');
  post('S1-A', 'DR-1-14', { rows: rows([nw.title, 'Register a warranty', 'strong', '5', 'documented', 'Datasheet page 2'], [nw.title, 'Raise a service request', 'parity', '4', 'documented', 'Datasheet page 3'], [sb.title, 'Register a warranty', 'partial', '5', 'review', 'Reviews on a comparison site'], [sb.title, 'Raise a service request', 'strong', '4', 'review', 'Reviews on a comparison site'], ['Spreadsheets and phone calls', 'Register a warranty', 'partial', '3', 'hands_on', 'Used by dealers today'], ['Spreadsheets and phone calls', 'Raise a service request', 'absent', '4', 'hands_on', 'Phone calls only']) }, { route: 'hand' });
  post('S1-A', 'DR-1-15', { rows: rows([nw.title, 'Basic', '900', 'INR', 'dealer_month', 'excl_gst', 'published', '2026-10-05'], [nw.title, 'Standard', '1200', 'INR', 'dealer_month', 'excl_gst', 'published', '2026-10-05'], [sb.title, 'Team', '1500', 'INR', 'site_month', 'excl_gst', 'published', '2026-10-05']), no_price: rows(['Spreadsheets and phone calls', 'Not sold: it is what dealers do by hand today']) }, { route: 'hand' });
  post('S1-B', 'DR-1-06', { rows: rows(['A competitor cuts its price', '3', '3', 'Anita Rao'], ['Dealers do not adopt the portal', '3', '4', 'Rajesh Mehta'], ['Warranty rules change', '2', '4', 'Meera Joshi']) });
  post('S1-B', 'DR-1-18', { rows: rows(
    ['Dinesh Patel, dealer owner', 'I lose a sale every week because I cannot prove the warranty date', 'When a customer buys a product I want to register its warranty in a minute', 'supports', 'Dealer call 3 October', 'Authorised dealers'],
    ['A dealer counter clerk in Surat', 'Customers get angry when I cannot find their warranty', 'When a customer buys a product I want to register its warranty in a minute', 'supports', 'Dealer call 4 October', 'Authorised dealers'],
    ['A dealer in Pune', 'I phone the service desk three times for one repair', 'When a product breaks I want to raise a service request without phoning', 'supports', 'Dealer call 6 October', 'Authorised dealers'],
    ['A dealer in Indore', 'I never know if a repair is booked', 'When a product breaks I want to raise a service request without phoning', 'supports', 'Dealer call 7 October', 'Authorised dealers'],
    ['Anita Rao, head of service', 'Half of my calls are warranty checks', 'When a customer asks I want to check warranty status', 'supports', 'Service desk log', 'Authorised dealers'],
    ['A service desk agent', 'I search paper files for every warranty question', 'When a customer asks I want to check warranty status', 'supports', 'Service desk visit', 'Authorised dealers']) }, { route: 'hand' });
  // a second person checks what was typed (each typist is refused)
  const checkAll = (who) => { for (const it of agent.queue(S)) agent.verify(S, it.id, who, 'Opened the source and checked it'); };
  ctxO.checkAll = checkAll;
  if (opts.upTo === 1.5) return ctxO;
  checkAll('Anita Rao');
  if (opts.upTo === 1.6) return ctxO;
  decide('S1-B', 'DR-1-10', 'go', 'Rajesh Mehta');
  if (opts.upTo === 1) return ctxO;

  // ------------------------------------------------------------------ Stage 2
  post('S2-A', 'DR-2-01', { rows: rows(['vision', 'Every dealer sees every warranty and service request in one place', '12 months'], ['objective', 'Settle service requests in two working days', ''], ['objective', 'Cut calls to the service desk by half', '']) });
  post('S2-A', 'DR-2-03', { modules: rows(['Warranty', 'Registering and checking warranties'], ['Service', 'Raising and following service requests']), features: rows(['Register a customer warranty at the time of sale', 'Warranty', 'Must', '', 'Cut calls to the service desk by half'], ['Look up the warranty status of a product', 'Warranty', 'Must', '', 'Cut calls to the service desk by half'], ['Raise a service request for a faulty product', 'Service', 'Must', '', 'Settle service requests in two working days'], ['Follow the progress of a service request', 'Service', 'Should', '', 'Settle service requests in two working days'], ['Export a warranty report', 'Warranty', 'Could', '', 'Cut calls to the service desk by half']) });
  const fids = S.list('Feature').map((x) => x.id);
  post('S2-A', 'DR-2-02', { rows: rows(['Warranty check time', 'seconds', 'measured', '240', '60', '<=', 'Anita Rao', 'Timed at the counter every month'], ['Days to settle a service request', 'days', 'estimated', '6', '2', '<=', 'Anita Rao', 'Taken from the request dates'], ['Calls to the service desk', 'calls per week', 'measured', '400', '200', '<=', 'Anita Rao', 'Counted by the phone system']) });
  post('S2-A', 'DR-2-04', { rows: S.list('Feature').filter((x) => x.priority === 'Must').map((x, i) => ({ cells: [x.id, String([3, 2, 4][i] || 2), 'medium'] })) });
  post('S2-A', 'DR-2-07', { rows: rows(['Online payments', 'later', 'Not needed for the first dealers', 'Dealers pay as they do today', 'Rajesh Mehta', 'new:Payments wait until dealers are live'], ['Customer-facing mobile app', 'out', 'Dealers act for the customer', 'None for dealers', 'Rajesh Mehta', 'new:Dealers act for the customer']) });
  post('S2-B', 'DR-2-05', { name: 'Contract developers', kind: 'team', pm: 30, avail: 80 });
  post('S2-B', 'DR-2-06', { release: 'new:Version 1', start: future(10), end: future(160), features: fids.map((id) => ({ cells: [id] })) });
  post('S2-B', 'DR-2-08', { confirm: true });
  post('S2-B', 'DR-2-09', { chosen: 'Go ahead with version 1 as scoped', why: 'It covers the dealer pain.', decider: 'Rajesh Mehta' });
  decide('S2-B', 'DR-2-10', 'go', 'Rajesh Mehta');
  if (opts.upTo === 2) return ctxO;

  // ------------------------------------------------------------------ Stage 3
  requests.autoDerive(S, 'the tool');
  post('S3-A', 'DR-3-02', { rows: rows(['A warranty lasts 24 months from the date of sale', 'sla', 'constraint', 'Anita Rao'], ['A service request must be confirmed within two working days', 'sla', 'constraint', 'Anita Rao'], ['Only authorised dealers can see their own customers', 'security', 'constraint', 'Suresh Iyer']) });
  post('S3-A', 'DR-3-03', { rows: rows(['Warranty check speed', 'latency', 'Time to show a warranty status', '<=', '3', 'seconds', 'p95', 'normal dealer load', 'production', 'the portal server', 'a timing log', 'assumed', 'new:Dealers have a normal office connection', S.list('Feature').find((x) => x.title.startsWith('Look up')).id, 'Time 100 warranty checks in the busiest hour and read the 95th slowest']) });
  const nfr = S.list('Requirement', (r) => r.subtype === 'non_functional')[0];
  post('S3-A', 'DR-3-04', { rows: rows([nfr.id, 'global']) });
  // each requirement the tool drafted is rewritten by a person, in plain words
  const sentences = { 'Register a customer warranty at the time of sale': 'A dealer shall be able to register a warranty for a customer in one screen, using the invoice number and the product serial number.', 'Look up the warranty status of a product': 'A dealer or a service desk agent shall be able to see whether a product is under warranty, from the serial number alone.', 'Raise a service request for a faulty product': 'A dealer shall be able to raise a service request for a product under warranty, describing the fault, without phoning the service desk.', 'Follow the progress of a service request': 'A dealer shall be able to see the status of every service request they raised.' };
  for (const r of S.list('Requirement', (x) => x.subtype === 'functional')) { const t = sentences[r.title]; if (t) { const before = JSON.parse(JSON.stringify(r)); S.update(r.id, { statement: t }, { actor: ME }); stories.noteEdited(S, before, ME); } }
  const personaByStory = { 'Register a customer warranty at the time of sale': 'Dealer counter staff', 'Look up the warranty status of a product': 'Service desk agent', 'Raise a service request for a faulty product': 'Dealer owner', 'Follow the progress of a service request': 'Dealer owner' };
  const storyText = {
    'Register a customer warranty at the time of sale': ['register the warranty for a customer while they are still at the counter', 'the customer leaves with the warranty on record and nobody has to phone us later to prove the date of sale', [['a customer has just bought a product and the dealer has the invoice number and serial number', 'the dealer enters both numbers and saves', 'the warranty is on record with the date of sale and the end date'], ['the serial number is already registered to another customer', 'the dealer tries to register it again', 'the portal refuses, says who registered it and when, and changes nothing']]],
    'Look up the warranty status of a product': ['see at once whether a product is under warranty', 'I can answer a dealer in one call without searching paper records', [['a product has been registered', 'the agent enters its serial number', 'the portal shows the end date and whether the product is covered'], ['the serial number does not exist', 'the agent enters it', 'the portal says the number is not found and offers to check for a typing mistake']]],
    'Raise a service request for a faulty product': ['raise a service request for a faulty product without phoning the service desk', 'the customer does not wait on the phone and the fault is written down once, correctly', [['a registered product under warranty has a fault', 'the dealer describes the fault and sends the request', 'a service request is created and the dealer sees a reference number'], ['the warranty has ended', 'the dealer tries to raise a request', 'the portal says the warranty has ended and explains the paid repair option']]],
    'Follow the progress of a service request': ['follow the progress of the service requests I raised', 'I can tell my customers when to expect the repair without asking the service desk', [['the dealer has raised two requests', 'the dealer opens the list of requests', 'both are shown with their latest status'], ['the dealer has raised no request yet', 'the dealer opens the list', 'the portal says there are none and offers to raise one']]],
  };
  const ruleIds = S.list('BusinessRule').map((x) => x.id);
  for (const st of S.list('Story')) {
    const feature = Object.keys(storyText).find((k) => st.title.includes(k.slice(0, 20)) || (S.out(st.id, 'elaborates').map((l) => S.get(l.target)).find((r) => r && r.type === 'Requirement') || {}).title === k);
    if (!feature) continue;
    const [want, why, tests] = storyText[feature];
    const form = stories.storyForm(S, st.id);
    const persona = S.list('Persona').find((x) => x.title === personaByStory[feature]);
    stories.completeStory(S, st.id, { persona: persona.id, want, benefit: why, requirement: form.requirement, rules: ruleIds.slice(0, 1), tests: [{ id: (form.tests[0] || {}).id, kind: 'happy', given: tests[0][0], when: tests[0][1], then: tests[0][2] }, { id: (form.tests[1] || {}).id, kind: 'negative', given: tests[1][0], when: tests[1][1], then: tests[1][2] }] }, ME);
  }
  post('S3-A', 'DR-3-05', { rows: S.list('Story').map((x) => ({ cells: [x.id, (S.out(x.id, 'for_persona')[0] || {}).target] })) });
  if (opts.upTo === 3.5) return ctxO;
  post('S3-B', 'DR-3-08', { confirm: true, approver: 'Rajesh Mehta' });
  confirmAll();
  if (opts.upTo === 3.6) return ctxO;
  decide('S3-B', 'DR-3-09', 'go', 'Rajesh Mehta');
  if (opts.upTo === 3) return ctxO;

  // ------------------------------------------------------------------ Stage 4
  requests.autoDerive(S, 'the tool');
  post('S4-A', 'DR-4-01', { rows: rows(['Register a warranty at the counter', 'A customer buys a product', 'Dealer counter staff', 'internal_user', 'The warranty is on record', 'Must'], ['Raise a service request', 'A product has a fault', 'Dealer owner', 'internal_user', 'The service desk has the request', 'Must']) });
  if (opts.upTo === 3.8) return ctxO;
  const taskSteps = (flow) => S.out(flow.id, 'contains').map((l) => S.get(l.target)).filter((x) => x && x.kind !== 'start' && x.kind !== 'end');
  const failRows = [];
  for (const flow of S.list('Flow', (x) => x.priority === 'Must')) { const t = taskSteps(flow)[0]; if (t) failRows.push([t.id, 'The step is stopped and the person is told what went wrong; nothing is saved', 'The information is wrong or missing', 'Enter wrong details and check that nothing is saved and the screen says what is wrong']); }
  post('S4-A', 'DR-4-02', { rows: rows(...failRows) });
  post('S4-A', 'DR-4-03', { entity: 'Service request', states: rows(['Raised', 'yes', 'no'], ['Confirmed', 'no', 'no'], ['Repaired', 'no', 'no'], ['Closed', 'no', 'yes']), moves: rows(['Raised', 'Confirmed', 'allowed', 'user_action'], ['Confirmed', 'Repaired', 'allowed', 'user_action'], ['Repaired', 'Closed', 'allowed', 'user_action'], ['Closed', 'Raised', 'forbidden', 'user_action', 'It refuses and says the request is already closed']) });
  // the flow drafts the tool wrote are kept as drafted (recorded, and warned about at the sign-off) unless rewritten
  for (const fl of S.list('Flow', (x) => x.status === 'Draft')) { S.update(fl.id, { status: 'In review' }, { actor: ME, strict: false }); stories.noteAccepted(S, fl.id, ME); }
  for (const st of S.list('FlowStep', (x) => x.status === 'Draft')) S.update(st.id, { status: 'In review' }, { actor: ME, strict: false });
  if (opts.upTo === 3.9) return ctxO;
  decide('S4-B', 'DR-4-07', 'go', 'Rajesh Mehta');
  if (opts.upTo === 4) return ctxO;
  return ctxO;
}

export { build, CTX, ME, rows };
