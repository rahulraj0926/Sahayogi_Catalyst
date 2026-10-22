/**
 * Pack: Dealer Order Portal (software, depth L1). Seeded through Phase 4: Gates 0 to 3 decided, Phase 4 started (one flow
 * complete, one with an external call that has no failure path yet, so Gate 4 is blocked). All facts are invented.
 */
const E = (title, kind, cls, date, grade, extra?) => [title, kind, cls, date, grade, extra];
export default {
  key: 'dealer', name: 'Dealer Order Portal', mode: 'greenfield', depth: 'L1', currency: 'INR', sponsor: 'Vikram Shah', owner: 'Vikram Shah', legal: 'Meera Iyer',
  reach: 4, decide: [0, 1, 2, 3], artifacts: false, experiments: false, last: '2026-10-08', lastNote: 'Neha Kapoor started the order-tracking flow walkthrough with the dispatch team.',
  dates: { start: '2026-05-11', g0: '2026-05-29', g1: '2026-06-26', g2: '2026-07-31', g3: '2026-09-04' },
  people: [
    ['Vikram Shah', 'Sponsor', 'Head of Sales', 'Fewer order errors and faster dealer response', true],
    ['Neha Kapoor', 'Delivery', 'Engineering manager', 'A scope the team of four can deliver by March', false],
    ['Sanjay Rao (pilot dealer)', 'Customer', 'Owner, pilot dealership', 'See order status without calling', false],
    ['Pilot dealer order clerk', 'End-user', 'Order clerk', 'Place an order in a few minutes from a phone', false],
  ],
  intake: {
    idea: 'Dealers send orders by phone, WhatsApp and e-mail. A web portal where a dealer places and tracks orders against their own price list and credit limit.',
    requester: 'Vikram Shah (Head of Sales)',
    problem: 'Dealers place orders by phone, WhatsApp and e-mail. The order desk re-types every order, about one order in nine needs a correction for a wrong item code or quantity, and dealers cannot see the state of an order until they call.',
    purpose: 'Cut order errors and status calls so dealers get faster answers and the order desk spends time on exceptions.',
    outcome: 'Within six months of launch, 70 percent of dealer orders arrive online and the correction rate falls below 2 percent.',
    neededBy: '2027-03-31', urgency: 'high', assets: ['Existing ERP with order and stock tables', 'Order desk of 6 people'], refs: ['DealerDesk', 'ERP dealer module'], data: ['dealer_master', 'order_history'], personal: true, jurisdictions: ['India'],
  },
  evidence: [
    E('Order desk error log, April to June 2026', 'data_file', 'internal', '2026-06-30', 'B'),
    E('Interview notes: 8 dealers on how they order today', 'interview', 'primary', '2026-05-20', 'B'),
    E('Order volume export by channel, second quarter', 'data_file', 'internal', '2026-07-02', 'B'),
    E('Competitor portal price pages (dated captures)', 'web_page', 'vendor_claim', '2026-07-18', 'B', { fields: { url_or_file: 'https://dealerdesk.example/pricing' } }),
  ],
  insights: [
    ['Dealers phone in orders because they trust a person to confirm them', 'Validated', 'Reported', [1]],
    ['About 11 percent of phoned and messaged orders need a correction', 'Validated', 'Reported', [0, 2]],
  ],
  assumptions: [
    ['Dealers will order from a phone browser at their counter', 'commercial', 3, 5, 'Neha Kapoor', 2, 'pilot with 5 dealers'],
    ['The ERP can return stock and order status through a REST interface in under 2 seconds', 'technical', 4, 5, 'Neha Kapoor', 2, '2-week spike'],
    ['Dealers accept a credit-limit check at order time', 'commercial', 3, 4, 'Vikram Shah', 2, 'dealer interviews'],
  ],
  constraints: [
    ['budget', 'Delivery budget for the first release', 85, 'INR lakh', 'hard', 'Anita Desai'],
    ['date', 'First release live before the end of the financial year', 2027, 'year-end', 'soft', 'Vikram Shah'],
  ],
  questions: [
    ['May a dealer place an order above the credit limit with approval?', 'Must', 1, 'Anita Desai', 'Answered', 'Yes, with approval by the regional sales manager within 4 working hours.'],
    ['Do sub-dealers get their own logins?', 'Must', 3, 'Vikram Shah', 'Assumed', 'Sub-dealers share the parent dealer account in version 1.'],
    ['Is a Hindi interface needed at launch?', 'Should', 3, 'Vikram Shah', 'Open'],
  ],
  risks: [['Dealers keep phoning and bypass the portal', 'market', 3, 4, 'Vikram Shah', 'Adoption stays under target and the order desk keeps re-typing']],
  scope0: [
    ['Dealer ordering, order tracking and monthly statements', 'in', 'the core of the problem'],
    ['Consumer web shop', 'out', 'different customer and payment needs'],
    ['Returns and warranty claims', 'unknown', 'depends on how the service desk is organised', 1],
  ],
  externals: [['Existing ERP', 'internal IT', 'platform', 'critical', 'Neha Kapoor'], ['Courier tracking interface', 'logistics partner', 'partner_api', 'high', 'Rahul Verma']],
  // ---- phase 1
  segments: [['Metro and city dealers', 'Dealers with an order clerk and more than 20 orders a month', true, 140]],
  personas: [['Dealer order clerk', 'customer_user', true, 'Place and amend orders quickly and know when they ship', 0], ['Dealer owner', 'buyer', true, 'See what was ordered, what it cost and what is owed', 0]],
  jobs: [
    ['When a customer asks for stock I want to place the order in minutes so I can promise a delivery date', 5, 0, 0, [1]],
    ['When I have placed an order I want to see its status so I do not have to call the order desk', 5, 0, 0, [1, 0]],
    ['When the month ends I want one reconciled statement so I can pay without disputes', 4, 0, 1, [1]],
  ],
  problems: [['Orders are re-typed by the order desk and one in nine needs a correction', 4, 1]],
  opportunities: [['Online ordering against the dealer price list with live stock, credit headroom and order tracking', 1, 0, 0]],
  competitors: [
    { name: 'DealerDesk (dealer-management SaaS)', kind: 'direct', tier: 'T1', basis: 'customer_shortlist', pos: 'Ready-made dealer ordering with mobile apps',
      profile: { website: 'https://dealerdesk.example', founded_year: 2016, hq_country: 'India', size_band: '51-200', strengths: 'Fast to start; mobile apps', weaknesses: 'Generic price lists; no ERP credit link', tier_class: 'tier1', gtm_channels: ['direct sales', 'partners'] },
      cells: [['Real-time ERP credit check', 'partial', 5, 3, 'needs a custom connector'], ['Order status tracking', 'strong', 4, 3]], prices: [{ plan: 'Business plan', amount: 1200, unit: 'user/month', metric: 'user', type: 'list', billing: 'subscription', evIdx: 3 }] },
    { name: 'ERP vendor dealer module', kind: 'direct', tier: 'T2', basis: 'marketplace_compare', pos: 'Native to the ERP, heavier to configure',
      profile: { website: 'https://erp-vendor.example', hq_country: 'Germany', size_band: '5000+', tier_class: 'tier2' },
      cells: [['Real-time ERP credit check', 'strong', 5, 3, 'native']], noPrice: 'Quote only; licence bundled with the ERP contract' },
    { name: 'Phone and WhatsApp ordering (status quo)', kind: 'alternative', tier: 'S', basis: 'customer_shortlist', pos: 'Free, familiar, error prone', cells: [['Order status tracking', 'absent', 4, 1, 'status by phone only']], noPrice: 'No price; the cost is order-desk staff time' },
  ],
  // ---- phase 2
  objectives: [['vision', 'Every dealer order is placed and tracked online', 'Every dealer order is placed, confirmed and tracked online without re-typing.'], ['objective', 'Cut order errors and status calls', 'Cut order corrections from 11 percent to under 2 percent and status calls by 60 percent']],
  metrics: [['Order correction rate', '%', 'measured', 11, 2, '<=', 'Rahul Verma', 'order desk log', 1], ['Share of orders placed online', '%', 'none_new_product', null, 70, '>=', 'Vikram Shah', 'order channel report', 1]],
  modules: [['Ordering', 'Sign-in, catalogue, cart, order placement and credit check'], ['Tracking', 'Order status from the ERP and the courier']],
  releases: [['R1 MVP: ordering and tracking', true, '2026-11-02', '2027-03-31']],
  features: [
    { name: 'Dealer sign-in with role-based access', module: 0, pri: 'Must', eff: 5, supports: ['obj:1'], fr: 'The portal shall let a dealer user sign in and shall show only the dealer accounts and actions allowed by the user role.', want: 'to sign in and see only my dealership', persona: 0,
      ac: [['happy', 'a dealer user with the clerk role', 'the user signs in with valid credentials', 'the dealer dashboard opens with only that dealership data'], ['negative', 'a dealer user with the clerk role', 'the user opens the dealer user administration page', 'access is refused and the attempt is recorded']] },
    { name: 'Order placement with dealer price list and quantity validation', module: 0, pri: 'Must', eff: 10, supports: ['obj:1', 'met:0'], realizes: ['opp:0'], addresses: ['prb:0'], fr: 'When a dealer submits a cart, the portal shall price each line from the dealer price list and shall reject any line with an unknown item code or a quantity below the minimum pack size.', want: 'to place an order from my price list in minutes', persona: 0,
      ac: [['happy', 'a cart with three valid lines', 'the clerk submits the order', 'the order is created with dealer prices and an order number is shown'], ['negative', 'a cart line with an unknown item code', 'the clerk submits the order', 'the line is rejected with the item code named and no order is created']] },
    { name: 'Credit limit check at order time', module: 0, pri: 'Must', eff: 7, supports: ['obj:1'], fr: 'When a dealer submits an order, the portal shall compare the order value with the dealer available credit from the ERP and shall hold the order for approval when it exceeds the available credit.', want: 'to know at once if my order needs approval', persona: 1,
      ac: [['happy', 'available credit of 200000 rupees', 'the dealer submits an order of 150000 rupees', 'the order is accepted without approval'], ['negative', 'available credit of 100000 rupees', 'the dealer submits an order of 150000 rupees', 'the order is held and the regional sales manager is asked to approve within 4 working hours']] },
    { name: 'Order status tracking from ERP and courier', module: 1, pri: 'Must', eff: 9, supports: ['obj:1', 'met:1'], addresses: ['prb:0'], fr: 'The portal shall show each order status from the ERP and, once dispatched, the courier tracking status, refreshed at least every 15 minutes.', want: 'to see where my order is without calling', persona: 0,
      ac: [['happy', 'a dispatched order with a courier consignment number', 'the clerk opens the order', 'the courier status and the last update time are shown'], ['negative', 'the courier interface is unavailable', 'the clerk opens a dispatched order', 'the last known status is shown with a notice that it may be out of date']] },
    { name: 'Hindi language interface', module: 0, pri: 'Could', eff: 6, scope: 'later', supports: ['obj:1'] },
    { name: 'Consumer web shop', module: 0, pri: 'Wont', eff: 30, scope: 'out', supports: ['obj:0'] },
  ],
  capacity: [['Core delivery team', 'team', 4, 85, 44]],
  scope2: [['Consumer web shop', 'out', 'Retail customers are not served', 'Different customer, payment and returns processes', 'con:0', 5], ['Hindi language interface', 'later', 'Some small-town clerks may ask for it earlier', 'Not a launch blocker; waiting for the dealer survey', 'con:1', 4]],
  // ---- phase 3
  nfrs: [
    { title: 'Order page response time', cat: 'latency', metric: 'time to show the order confirmation', op: '<=', target: 3, unit: 's', pct: 'p95', cond: '200 concurrent dealer users, ERP responding normally', point: 'browser timing at the portal edge', tool: 'synthetic monitor', basis: 'benchmarked', applies: [1], assumes: [1] },
    { title: 'Portal availability', cat: 'availability', metric: 'successful responses to dealer requests per month', op: '>=', target: 99.5, unit: '%', cond: 'office hours 08:00 to 20:00 IST, excluding planned maintenance', point: 'external probe from two regions', tool: 'uptime probe', basis: 'assumed', global: true, assumes: [0] },
  ],
  interfaces: [{ title: 'Read order and credit data from the ERP', statement: 'The portal shall read dealer credit, stock and order status from the ERP through its REST interface and shall retry failed reads three times with back-off.', counterparty: 'Existing ERP', direction: 'outbound', protocol: 'REST over HTTPS', failure: 'Show the last known value with a notice and alert the support team after three failed reads', ext: 0, feature: 2 }],
  dataReqs: [{ title: 'Order history retention', statement: 'The portal shall keep order records for 8 years.', retention: 2920, feature: 1, entity: 0 }],
  // ---- phase 4
  entity: { name: 'Dealer order', desc: 'One order placed by a dealer', fields: ['order number', 'dealer', 'lines', 'value', 'state'], states: [['Draft', true, false], ['Confirmed', false, false], ['Dispatched', false, false], ['Delivered', false, true], ['Cancelled', false, true]], transitions: [[0, 1, 'allowed', 'user_action'], [1, 2, 'allowed', 'system_event'], [2, 3, 'allowed', 'system_event'], [1, 4, 'allowed', 'user_action'], [3, 1, 'forbidden', 'user_action']] },
  actors: [['Dealer order clerk', 'customer_user'], ['Order desk executive', 'internal_user'], ['Portal (system)', 'system']],
  flows: [
    { title: 'Place an order', goal: 'A valid order reaches the ERP with the right price and credit decision', trigger: 'Dealer clerk submits a cart', actor: 0, prio: 'Must', module: 0,
      steps: ['S:Cart submitted', 'D:All lines valid?', 'T:Show the line errors', 'D:Order within available credit?', 'T:Hold the order for approval', 'X:Create the order in the ERP', 'E:Order confirmed', 'E:Order rejected'],
      edges: '0>1, 1>2:failure:a line is invalid, 1>3:happy:all lines valid, 2>7, 3>5:happy:within credit, 3>4:alternate:over credit, 4>5:alternate:approved, 5>6:happy:created, 5>7:failure:ERP did not answer', performers: { 4: 1, 5: 2 }, calls: { 5: 0 },
      covers: { 1: ['fr:1'], 3: ['fr:2', 'sty:2'], 5: ['fr:1', 'sty:1'] }, failureAC: { '1>2': ['Invalid line is refused', 'a cart with an unknown item code', 'the clerk submits', 'the order is not created and the line error is shown'] } },
    { title: 'Track an order', goal: 'The dealer sees the current status of any order', trigger: 'Dealer opens an order', actor: 0, prio: 'Must', module: 1,
      steps: ['S:Order opened', 'T:Read status from the ERP', 'D:Order dispatched?', 'X:Read courier status', 'T:Show the status', 'E:Status shown'],
      edges: '0>1, 1>2, 2>3:happy:dispatched, 2>4:alternate:not yet dispatched, 3>4:happy:read, 4>5', performers: { 1: 2, 3: 2, 4: 2 }, calls: { 3: 1 }, covers: { 1: ['fr:3', 'sty:3'] } },
  ],
};
