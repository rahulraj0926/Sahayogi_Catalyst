/**
 * Extra pack data so every sample product carries records in every early phase (0-4) in the same structure as the dealer product.
 * Merged over each product's own pack in seed_portfolio.ts. Only sections a pack does not already have are added here.
 * All facts are invented.
 */
const ac = (scen, given, when, then) => [scen, given, when, then];

// ---------------------------------------------------------------- Developer: phase 4 flows (phases 0-3 already authored)
export const developer = {
  dataReqs: [{ title: 'Audit history retention', statement: 'The tool shall keep the change history of every item for 7 years.', retention: 2555, feature: 0, entity: 0 }],
  entity: { name: 'Requirement', desc: 'One stated need in the record', fields: ['title', 'statement', 'priority', 'status', 'source'], states: [['Draft', true, false], ['In review', false, false], ['Approved', false, false], ['Superseded', false, true], ['Rejected', false, true]], transitions: [[0, 1, 'allowed', 'user_action'], [1, 2, 'allowed', 'user_action'], [1, 4, 'allowed', 'user_action'], [2, 3, 'allowed', 'user_action'], [3, 2, 'forbidden', 'user_action']] },
  actors: [['Product analyst', 'internal_user'], ['Reviewer', 'internal_user'], ['Developer tool (system)', 'system']],
  flows: [
    { title: 'Change an approved requirement', goal: 'Every dependent item is flagged when an approved requirement changes', trigger: 'Analyst edits an approved requirement', actor: 0, prio: 'Must', module: 0,
      steps: ['S:Edit saved', 'T:Find dependent items', 'D:Any dependents?', 'T:Flag each dependent as suspect', 'T:Notify the owners', 'E:Change recorded', 'E:No flags needed'],
      edges: '0>1, 1>2, 2>3:happy:dependents found, 2>6:alternate:no dependents, 3>4, 4>5', performers: { 1: 2, 3: 2, 4: 2 }, covers: { 3: ['fr:0', 'sty:0'] } },
    { title: 'Check a gate', goal: 'The reviewer sees which criteria block the gate and why', trigger: 'Reviewer opens a gate', actor: 1, prio: 'Must', module: 0,
      steps: ['S:Gate opened', 'T:Evaluate every criterion', 'D:All criteria pass?', 'T:List the blocking items', 'E:Gate can be decided', 'E:Gate blocked'],
      edges: '0>1, 1>2, 2>4:happy:all pass, 2>3:failure:a criterion fails, 3>5', performers: { 1: 2, 3: 2 }, covers: { 1: ['fr:1', 'sty:1'] }, failureAC: { '2>3': ['Failing criterion is named', 'a record with one failing criterion', 'the gate is opened', 'the criterion is shown as failing with its offending items'] } },
  ],
};

// ---------------------------------------------------------------- Meter: phases 2-4
export const meter = {
  objectives: [['vision', 'Meter readings reach the utility without a site visit', 'Every connected meter sends its readings to the utility cloud without manual collection.'], ['objective', 'Fast, repeatable installation', 'Commission a gateway on site in under 20 minutes for 90 percent of installations by March 2027']],
  metrics: [['Commissioning time', 'min', 'measured', 55, 20, '<=', 'Sunita Joshi', 'installer time study', 1], ['Gateways sold in the first 12 months', 'units', 'none_new_product', null, 5000, '>=', 'Rohan Mehta', 'sales ledger', 1]],
  modules: [['Gateway firmware', 'Meter reading, local buffering and cloud upload'], ['Commissioning app', 'Guided on-site setup and checks for installers']],
  releases: [['R1 first batch: read, buffer and upload', true, '2026-11-16', '2027-03-31']],
  features: [
    { name: 'Read three-phase meters over RS-485 Modbus', module: 0, pri: 'Must', eff: 14, supports: ['obj:1'], realizes: ['opp:0'], addresses: ['prb:0'], fr: 'The gateway shall poll each configured meter over RS-485 Modbus at the configured interval and shall store every reading with the meter identity and a timestamp.', want: 'readings collected without visiting the meter', persona: 0,
      ac: [ac('happy', 'a configured meter that answers on RS-485', 'the polling interval elapses', 'a reading with identity and timestamp is stored'), ac('negative', 'a meter that does not answer', 'three polls fail in a row', 'a meter-fault event is raised with the meter identity')] },
    { name: 'Local buffering during outages', module: 0, pri: 'Must', eff: 9, supports: ['obj:0'], fr: 'While the cellular link is down, the gateway shall keep readings in local storage and shall upload them in order when the link returns, for at least 72 hours of readings.', want: 'no readings lost when the network drops', persona: 0,
      ac: [ac('happy', 'a link outage of 24 hours', 'the link returns', 'all buffered readings are uploaded in order'), ac('boundary', 'an outage longer than 72 hours', 'the buffer is full', 'the oldest readings are overwritten and a data-loss event is recorded')] },
    { name: 'Guided commissioning on a phone', module: 1, pri: 'Must', eff: 11, supports: ['obj:1', 'met:0'], addresses: ['prb:0'], fr: 'The commissioning app shall guide the installer through meter detection, address check, link test and cloud registration, and shall show a pass or fail result for each step.', want: 'to finish the site visit quickly', persona: 1,
      ac: [ac('happy', 'a gateway wired to a supported meter', 'the installer completes the guided steps', 'each step shows pass and the gateway is registered'), ac('negative', 'a wrong meter address', 'the address check runs', 'the step fails and names the address that did not answer')] },
    { name: 'Over-the-air firmware update', module: 0, pri: 'Should', eff: 8, supports: ['obj:0'], fr: 'The gateway shall accept a signed firmware image over the cellular link and shall roll back to the previous image if the new one does not start.', want: 'new meter makes added without a site visit', persona: 0,
      ac: [ac('happy', 'a correctly signed image', 'the gateway installs it', 'the new version runs and is reported to the cloud'), ac('negative', 'an image with a bad signature', 'the gateway checks it', 'the image is refused and the old version keeps running')] },
    { name: 'Cloud analytics dashboards', module: 1, pri: 'Could', eff: 20, scope: 'later', supports: ['obj:0'] },
    { name: 'Meter hardware itself', module: 0, pri: 'Wont', eff: 50, scope: 'out', supports: ['obj:0'] },
  ],
  capacity: [['Firmware and app team', 'team', 6, 85, 60]],
  scope2: [['Meter hardware itself', 'out', 'Utilities keep buying meters elsewhere', 'Utilities already own meters', 'con:0', 5], ['Cloud analytics dashboards', 'later', 'Utilities may ask for a view of their readings', 'Not needed for the first batch', 'con:1', 4]],
  nfrs: [
    { title: 'Reading upload delay', cat: 'latency', metric: 'time from a reading to its arrival in the cloud', op: '<=', target: 5, unit: 'min', pct: 'p95', cond: 'cellular link available', point: 'cloud receipt timestamp', tool: 'ingest log', basis: 'benchmarked', applies: [0], assumes: [3] },
    { title: 'Operating temperature', cat: 'durability_DR', metric: 'continuous operation across the temperature range', op: '>=', target: 70, unit: 'degC upper limit', cond: 'DIN-rail cabinet with no ventilation', point: 'climate chamber test', tool: 'climate chamber', basis: 'assumed', global: true, assumes: [1] },
  ],
  interfaces: [{ title: 'Read meters over Modbus RS-485', statement: 'The gateway shall read register blocks from each meter over Modbus RTU on RS-485 and shall back off for one second after a failed read.', counterparty: 'Three-phase energy meter', direction: 'outbound', protocol: 'Modbus RTU over RS-485', failure: 'Mark the meter as faulty after three failed reads and keep polling the others', ext: 0, feature: 0 }],
  dataReqs: [{ title: 'Reading retention in the cloud', statement: 'The cloud service shall keep meter readings for 5 years.', retention: 1825, feature: 0, entity: 0 }],
  regReqs: [{ title: 'BIS registration marking', statement: 'The gateway shall carry the BIS registration mark and number on its label before the first volume shipment.', obligation: 0, feature: 0 }],
  entity: { name: 'Meter reading', desc: 'One reading taken from a meter', fields: ['meter id', 'timestamp', 'energy', 'voltage', 'upload state'], states: [['Captured', true, false], ['Buffered', false, false], ['Uploaded', false, false], ['Expired', false, true]], transitions: [[0, 1, 'allowed', 'system_event'], [1, 2, 'allowed', 'system_event'], [0, 2, 'allowed', 'system_event'], [1, 3, 'allowed', 'system_event'], [2, 1, 'forbidden', 'system_event']] },
  actors: [['Dealer installer', 'customer_user'], ['Utility metering engineer', 'customer_user'], ['Gateway (system)', 'system']],
  flows: [
    { title: 'Commission a gateway on site', goal: 'The installer finishes setup with every check passed', trigger: 'Installer starts the commissioning app', actor: 0, prio: 'Must', module: 1,
      steps: ['S:Start commissioning', 'X:Detect the meter', 'D:Meter answers?', 'T:Show the address error', 'T:Run the link test', 'T:Register with the cloud', 'E:Gateway ready', 'E:Setup stopped'],
      edges: '0>1, 1>2, 2>4:happy:meter answers, 2>3:failure:no answer, 3>7, 4>5, 5>6', performers: { 4: 2, 5: 2 }, calls: { 1: 0 }, covers: { 1: ['fr:0'], 4: ['fr:2', 'sty:2'] }, failureAC: { '2>3': ['Wrong address is reported', 'a wrong meter address', 'the detection runs', 'the app names the address that did not answer'] } },
    { title: 'Upload buffered readings', goal: 'No reading is lost after a link outage', trigger: 'Cellular link returns', actor: 2, prio: 'Must', module: 0,
      steps: ['S:Link returns', 'T:Read the oldest buffered reading', 'T:Send it to the cloud', 'D:Cloud accepted it?', 'T:Remove it from the buffer', 'D:More buffered readings?', 'E:Buffer empty', 'E:Retry later'],
      edges: '0>1, 1>2, 2>3, 3>4:happy:accepted, 3>7:failure:rejected or no answer, 4>5, 5>1:alternate:more readings, 5>6:happy:none left', performers: { 1: 2, 2: 2, 4: 2 }, covers: { 1: ['fr:1'] } },
  ],
};

// ---------------------------------------------------------------- Warranty: phases 1-4
export const warranty = {
  segments: [['Customers with products in warranty', 'Households and small businesses holding a registered product in its warranty period', true, 120]],
  personas: [['Warranty customer', 'customer_user', true, 'Raise a claim once and know when an engineer comes', 0], ['Service coordinator', 'internal_user', true, 'See every open claim and dispatch the right engineer', 0]],
  jobs: [
    ['When a product fails I want to raise a claim in minutes so I do not chase anyone by phone', 5, 0, 0, [0, 1]],
    ['When I raised a claim I want to see its status so I know when an engineer arrives', 5, 0, 0, [1]],
    ['When claims come in I want them sorted by urgency so the worst cases are handled first', 4, 0, 1, [0]],
  ],
  problems: [['Claims arrive by phone, e-mail and dealers and nobody can say how many are open', 4, 0]],
  opportunities: [['One claim register with first-reply tracking and dispatch with product history', 0, 0, 0]],
  competitors: [
    { name: 'ServiceLoop (field service SaaS)', kind: 'direct', tier: 'T1', basis: 'customer_shortlist', pos: 'Ready-made claims and dispatch for appliance makers',
      profile: { website: 'https://serviceloop.example', founded_year: 2015, hq_country: 'India', size_band: '51-200', strengths: 'Quick to start', weaknesses: 'No dealer registration; fixed claim forms', tier_class: 'tier1' },
      cells: [['Dealer product registration', 'absent', 4, 1], ['Claim status tracking', 'strong', 5, 1]], noPrice: 'Quote only; no list price published' },
    { name: 'CRM helpdesk module', kind: 'direct', tier: 'T2', basis: 'marketplace_compare', pos: 'General ticketing with a warranty add-on',
      profile: { website: 'https://crm-helpdesk.example', hq_country: 'United States', size_band: '1001-5000', tier_class: 'tier2' },
      cells: [['Dealer product registration', 'partial', 4, 1, 'custom fields needed'], ['Claim status tracking', 'parity', 5, 1]], noPrice: 'Per-seat licence; price list not public' },
    { name: 'Spreadsheets and e-mail (status quo)', kind: 'alternative', tier: 'S', basis: 'customer_shortlist', pos: 'Free and familiar, no counts', cells: [['Claim status tracking', 'absent', 5, 0, 'status only by asking']], noPrice: 'No price; the cost is service-team time' },
  ],
  objectives: [['vision', 'Every warranty claim is answered the next working day', 'Every claim is registered, triaged and answered within one working day.'], ['objective', 'Trusted open-claims count', 'First reply within 24 hours for 95 percent of claims and one open-claims count by June 2027']],
  metrics: [['Claims answered within 24 hours', '%', 'measured', 40, 95, '>=', 'Priya Nair', 'claim register report', 1], ['Engineer visits with product history known', '%', 'none_new_product', null, 90, '>=', 'Field service supervisor', 'dispatch log', 1]],
  modules: [['Claims', 'Product registration, claim intake and triage'], ['Dispatch', 'Engineer scheduling and visit records']],
  releases: [['R1 claims and dispatch', true, '2026-12-01', '2027-06-30']],
  features: [
    { name: 'Product registration with serial number', module: 0, pri: 'Must', eff: 8, supports: ['obj:1'], realizes: ['opp:0'], addresses: ['prb:0'], fr: 'The service desk shall let a customer or dealer register a product by serial number and shall refuse a serial number that is not in the factory list.', want: 'to register my product once', persona: 0,
      ac: [ac('happy', 'a serial number in the factory list', 'the customer registers it', 'the product is stored with its warranty end date'), ac('negative', 'a serial number not in the factory list', 'the customer registers it', 'the registration is refused with the reason')] },
    { name: 'Claim intake and triage by urgency', module: 0, pri: 'Must', eff: 10, supports: ['obj:1', 'met:0'], addresses: ['prb:0'], fr: 'When a claim is raised, the service desk shall give it a claim number, an urgency from the fault type and a first-reply due time of one working day.', want: 'a claim number and a promised reply time', persona: 0,
      ac: [ac('happy', 'a registered product in warranty', 'the customer raises a claim', 'a claim number and a due time are shown'), ac('negative', 'a product out of warranty', 'the customer raises a claim', 'the claim is marked out of warranty and routed for goodwill review')] },
    { name: 'Engineer dispatch with product history', module: 1, pri: 'Must', eff: 12, supports: ['obj:1', 'met:1'], fr: 'The service desk shall let a coordinator assign an engineer to a claim and shall show the engineer the product history and earlier visits.', want: 'to send the right engineer with the history', persona: 1,
      ac: [ac('happy', 'a claim with two earlier visits', 'the coordinator assigns an engineer', 'the engineer sees both earlier visits'), ac('negative', 'an engineer already booked for that slot', 'the coordinator assigns the engineer', 'the assignment is refused and free engineers are suggested')] },
    { name: 'Claim status for the customer', module: 1, pri: 'Should', eff: 6, supports: ['obj:1'], fr: 'The service desk shall show the customer the current status of a claim and shall send an SMS when the status changes.', want: 'to see where my claim stands', persona: 0,
      ac: [ac('happy', 'a claim that moves to engineer assigned', 'the status changes', 'an SMS is sent and the status page updates'), ac('negative', 'the SMS gateway is unavailable', 'the status changes', 'the status page updates and the SMS is retried later')] },
    { name: 'Spare parts inventory', module: 1, pri: 'Could', eff: 15, scope: 'later', supports: ['obj:0'] },
    { name: 'Consumer product sales', module: 0, pri: 'Wont', eff: 30, scope: 'out', supports: ['obj:0'] },
  ],
  capacity: [['Delivery team', 'team', 4, 80, 36]],
  scope2: [['Consumer product sales', 'out', 'Customers cannot buy through the service desk', 'Different customer and payment needs', 'con:0', 5], ['Spare parts inventory', 'later', 'Engineers keep checking stock by phone', 'Waiting for the answer on product lines', 'con:0', 4]],
  nfrs: [
    { title: 'Claim page response time', cat: 'latency', metric: 'time to show the claim confirmation', op: '<=', target: 3, unit: 's', pct: 'p95', cond: '100 concurrent users', point: 'browser timing at the edge', tool: 'synthetic monitor', basis: 'benchmarked', applies: [1], assumes: [2] },
    { title: 'Service desk availability', cat: 'availability', metric: 'successful requests per month', op: '>=', target: 99.5, unit: '%', cond: 'service hours 08:00 to 20:00 IST', point: 'external probe', tool: 'uptime probe', basis: 'assumed', global: true, assumes: [0] },
  ],
  interfaces: [{ title: 'Send claim status by SMS', statement: 'The service desk shall send an SMS through the messaging gateway on every claim status change and shall retry failed sends three times.', counterparty: 'SMS and e-mail gateway', direction: 'outbound', protocol: 'REST over HTTPS', failure: 'Keep the status change, queue the message and alert the support team after three failures', ext: 0, feature: 3 }],
  dataReqs: [{ title: 'Claim record retention', statement: 'The service desk shall keep claim records for 7 years after closure.', retention: 2555, feature: 1, entity: 0 }],
  entity: { name: 'Warranty claim', desc: 'One warranty claim raised for a product', fields: ['claim number', 'product serial', 'fault', 'urgency', 'status'], personal: true, states: [['Raised', true, false], ['Triaged', false, false], ['Engineer assigned', false, false], ['Resolved', false, true], ['Rejected', false, true]], transitions: [[0, 1, 'allowed', 'system_event'], [1, 2, 'allowed', 'user_action'], [2, 3, 'allowed', 'user_action'], [1, 4, 'allowed', 'user_action'], [3, 1, 'forbidden', 'user_action']] },
  actors: [['Warranty customer', 'customer_user'], ['Service coordinator', 'internal_user'], ['Service desk (system)', 'system']],
  flows: [
    { title: 'Raise a warranty claim', goal: 'A valid claim gets a number and a promised reply time', trigger: 'Customer submits the claim form', actor: 0, prio: 'Must', module: 0,
      steps: ['S:Claim form submitted', 'D:Product in warranty?', 'T:Mark for goodwill review', 'T:Set urgency from the fault type', 'T:Give the claim a number and due time', 'E:Claim registered', 'E:Sent to goodwill review'],
      edges: '0>1, 1>2:alternate:out of warranty, 1>3:happy:in warranty, 2>6, 3>4, 4>5', performers: { 2: 1, 3: 2, 4: 2 }, covers: { 1: ['fr:1', 'sty:1'] }, failureAC: { '1>2': ['Out-of-warranty claim is routed', 'a product out of warranty', 'the customer submits a claim', 'the claim goes to goodwill review and is not rejected silently'] } },
    { title: 'Dispatch an engineer', goal: 'An engineer with the product history is booked for the visit', trigger: 'Coordinator opens a triaged claim', actor: 1, prio: 'Must', module: 1,
      steps: ['S:Triaged claim opened', 'T:Show the product history', 'D:Engineer free in the slot?', 'T:Suggest other engineers', 'T:Assign the engineer', 'E:Visit booked'],
      edges: '0>1, 1>2, 2>4:happy:free, 2>3:alternate:booked, 3>4, 4>5', performers: { 1: 2, 3: 2 }, covers: { 1: ['fr:2', 'sty:2'] } },
  ],
};

// ---------------------------------------------------------------- BoSS: extra on features (3 to 4) and phase 3 and 4 data
export const bossFeatureExtras = [
  { fr: 'The platform shall run the month-end settlement from the bank files without manual steps and shall list every line it could not match.', want: 'settlement without a manual macro', persona: 0, ac: [ac('happy', 'the day files of a month', 'the settlement run is started', 'all matched lines post and the unmatched lines are listed'), ac('negative', 'a bank file with a changed layout', 'the run reads it', 'the file is rejected with the changed field named and no line posts')] },
  { fr: 'The platform shall show every unmatched line with its age and owner and shall suggest a match when one exists.', want: 'to see what waits longest', persona: 0, ac: [ac('happy', 'five unmatched lines of different ages', 'the queue is opened', 'lines are shown oldest first with age and owner'), ac('boundary', 'a line that matches two entries equally', 'the suggestion runs', 'both candidates are offered and none is applied automatically')] },
  { fr: 'The platform shall post ledger entries by the existing posting rules and shall refuse an entry that does not balance.', want: 'ledger entries posted by the same rules', persona: 1, ac: [ac('happy', 'a balanced entry', 'it is posted', 'the ledger shows the entry'), ac('negative', 'an entry whose debits and credits differ', 'it is posted', 'the entry is refused and nothing posts')] },
  { fr: 'The platform shall produce each of the 20 statutory and month-end reports with the layout and numbers of the BoSS report for the same period.', want: 'the same report layout as before', persona: 1, ac: [ac('happy', 'a closed month', 'a statutory report is produced', 'the layout and totals equal the BoSS report'), ac('negative', 'a report whose total differs by one rupee', 'the comparison runs', 'the difference is listed and the report is marked as not matching')] },
  { fr: 'The platform shall compare each new report with the BoSS report and shall list every difference.', want: 'to see differences at once', persona: 1, ac: [ac('happy', 'identical reports', 'the comparison runs', 'a match is recorded'), ac('negative', 'reports with a differing line', 'the comparison runs', 'the line is listed with both values')] },
];
export const boss = {
  nfrs: [
    { title: 'Settlement run time', cat: 'throughput', metric: 'time to settle one month of day files', op: '<=', target: 4, unit: 'h', cond: 'full month-end volume of 2 million lines', point: 'job log', tool: 'batch timer', basis: 'benchmarked', applies: [0], assumes: [0] },
    { title: 'Report match accuracy', cat: 'compliance', metric: 'statutory reports equal to the BoSS report', op: '>=', target: 100, unit: '%', cond: 'parallel run of three closed months', point: 'automated report comparison', tool: 'comparison script', basis: 'assumed', global: true, assumes: [0] },
  ],
  interfaces: [{ title: 'Send settlement payments to the gateway', statement: 'The platform shall send each settlement payment to the payment gateway once and shall treat a repeated send of the same payment as already done.', counterparty: 'Payment gateway', direction: 'outbound', protocol: 'REST over HTTPS', failure: 'Hold the payment, retry with the same reference and alert the back office after three failures', ext: 0, feature: 0 }],
  dataReqs: [{ title: 'Ledger entry retention', statement: 'The platform shall keep ledger entries for 10 years.', retention: 3650, feature: 2, entity: 0 }],
  entity: { name: 'Settlement run', desc: 'One month-end settlement run', fields: ['run id', 'period', 'lines', 'unmatched lines', 'state'], states: [['Planned', true, false], ['Running', false, false], ['Needs review', false, false], ['Posted', false, true], ['Failed', false, true]], transitions: [[0, 1, 'allowed', 'user_action'], [1, 2, 'allowed', 'system_event'], [1, 3, 'allowed', 'system_event'], [2, 3, 'allowed', 'user_action'], [1, 4, 'allowed', 'system_event'], [3, 1, 'forbidden', 'user_action']] },
  actors: [['Back-office clerk', 'internal_user'], ['Branch manager', 'internal_user'], ['Platform (system)', 'system']],
  flows: [
    { title: 'Run the month-end settlement', goal: 'All matched lines post and the rest are listed for review', trigger: 'Clerk starts the settlement run', actor: 0, prio: 'Must', module: 0,
      steps: ['S:Run started', 'T:Read the bank files', 'D:Layout recognised?', 'T:Stop and name the changed field', 'T:Match lines to entries', 'T:Post matched lines', 'E:Run posted', 'E:Run stopped'],
      edges: '0>1, 1>2, 2>4:happy:layout known, 2>3:failure:layout changed, 3>7, 4>5, 5>6', performers: { 1: 2, 3: 2, 4: 2, 5: 2 }, covers: { 4: ['fr:0', 'sty:0'] }, failureAC: { '2>3': ['Changed layout stops the run', 'a bank file with a changed layout', 'the run reads it', 'the run stops with the changed field named and nothing posts'] } },
    { title: 'Work the exception queue', goal: 'Every unmatched line is matched or escalated', trigger: 'Clerk opens the queue', actor: 0, prio: 'Must', module: 0,
      steps: ['S:Queue opened', 'T:Show the oldest unmatched line', 'D:A suggestion exists?', 'T:Accept the suggestion', 'T:Match by hand', 'E:Line matched'],
      edges: '0>1, 1>2, 2>3:happy:suggestion found, 2>4:alternate:no suggestion, 3>5, 4>5', performers: { 1: 2 }, covers: { 1: ['fr:1', 'sty:1'] } },
  ],
};
