/**
 * Pack: Smart Energy Meter Gateway (hardware, depth L2). Seeded through Phase 1: Gate 0 decided, Phase 1 in progress.
 * Gate 1 is blocked on purpose: one tier-1 price is past its maximum age, Legal has not signed the obligation register, and an
 * agent-proposed competitor batch is waiting for a person to verify it. Prices use MRP, street price and dealer margin.
 * All facts are invented.
 */
import * as agentMod from '../../engine/agent';
const E = (title, kind, cls, date, grade, extra?) => [title, kind, cls, date, grade, extra];
const INR = { currency: 'INR' };
export default {
  key: 'meter', name: 'Smart Energy Meter Gateway', mode: 'greenfield', depth: 'L2', currency: 'INR', sponsor: 'Rohan Mehta', owner: 'Rohan Mehta', legal: 'Meera Iyer',
  reach: 1, decide: [0], artifacts: false, last: '2026-10-06', lastNote: 'Priya Nair uploaded the dealer price poll results for review.',
  dates: { start: '2026-08-17', g0: '2026-09-04' },
  conditions: [[{ text: 'Rohan Mehta confirms in writing which meter makes the gateway must read at launch (closes the working answer to the compatibility question).', owner: 'Rohan Mehta', must_close_by_gate: 2 }]],
  people: [
    ['Rohan Mehta', 'Sponsor', 'Head of Hardware Products', 'A gateway that utilities and dealers can both sell', true],
    ['Sunita Joshi', 'Delivery', 'Firmware lead', 'A hardware scope that fits one firmware team', false],
    ['Utility pilot engineer (external)', 'Customer', 'Metering engineer', 'Reads from existing three-phase meters without rewiring', false],
    ['Dealer pilot installer (external)', 'End-user', 'Installer', 'Commission a gateway in under 20 minutes on site', false],
    ['Meera Iyer', 'Regulator/Legal', 'Compliance', 'BIS, CRS and telecom approvals planned early', false],
  ],
  intake: {
    idea: 'A DIN-rail gateway that reads three-phase energy meters over RS-485 and sends the readings to the utility cloud, sold through dealers and directly to utilities.',
    requester: 'Rohan Mehta (Head of Hardware Products)',
    problem: 'Utilities and large consumers read three-phase meters by hand or with bulky data loggers. Readings arrive weeks late, meter faults go unseen, and installers spend hours on site configuring each logger.',
    purpose: 'Give utilities and dealers a low-cost way to collect meter readings automatically with a short, repeatable installation.',
    outcome: 'In the first 12 months, 5,000 gateways are sold through 40 dealers and two utilities, with an installation time under 20 minutes.',
    neededBy: '2027-06-30', urgency: 'medium', assets: ['A firmware team of 6', 'Contract manufacturer in Pune', 'Existing dealer network of 60'], refs: ['VoltEdge VE-300', 'MeterLink G2'], data: ['meter_readings'], personal: false, jurisdictions: ['India'], criticality: 'business',
  },
  evidence: [
    E('Utility pilot interviews: 5 metering engineers on current reading process', 'interview', 'primary', '2026-08-26', 'B'),
    E('Dealer poll: 22 dealers on price, margin and installation effort', 'survey', 'primary', '2026-09-12', 'B'),
    E('Installer time study, 6 installations of competing loggers', 'data_file', 'primary', '2026-09-02', 'B'),
    E('Competitor datasheets and published price lists (dated captures)', 'price_list', 'vendor_claim', '2026-09-22', 'B', { fields: { url_or_file: 'https://voltedge.example/ve-300' } }),
    E('Competitor price list screenshot, February', 'price_list', 'vendor_claim', '2026-02-10', 'C'),
  ],
  insights: [
    ['Installation time on site is the largest cost for utilities, not the device price', 'Validated', 'Reported', [0, 2]],
    ['Dealers will stock a gateway only with at least 18 percent margin on MRP', 'Validated', 'Reported', [1]],
  ],
  assumptions: [
    ['Most target meters expose Modbus over RS-485', 'technical', 3, 5, 'Sunita Joshi', 2, 'survey of the 20 most common meters'],
    ['A BIS registration can be obtained before the first volume shipment', 'technical', 3, 4, 'Meera Iyer', 3, 'lab quote and timeline'],
    ['Dealers accept an 18 percent margin on MRP', 'commercial', 3, 4, 'Rohan Mehta', 2, 'dealer poll follow-up'],
    ['Cellular data cost stays under 90 rupees per gateway per month', 'commercial', 2, 3, 'Sunita Joshi', 2, 'carrier quote'],
  ],
  constraints: [
    ['budget', 'Development and certification budget for the first batch', 1.8, 'INR crore', 'hard', 'Rohan Mehta'],
    ['date', 'First 500 units shipped before the next financial year', 2027, 'financial year', 'soft', 'Rohan Mehta'],
    ['regulatory', 'The gateway needs BIS registration and wireless approval before sale', null, null, 'hard', 'Meera Iyer'],
  ],
  questions: [
    ['Which meter makes must the gateway read at launch?', 'Must', 1, 'Sunita Joshi', 'Assumed', 'Launch with the three most common makes and add others by firmware update.'],
    ['Will utilities buy directly or only through dealers?', 'Must', 2, 'Rohan Mehta', 'Open'],
    ['Is a battery backup needed for outages?', 'Should', 2, 'Sunita Joshi', 'Open'],
  ],
  risks: [
    ['A competitor cuts MRP below our target margin structure', 'market', 3, 4, 'Rohan Mehta', 'Dealer margin or our gross margin has to give'],
    ['Certification slips by a quarter', 'regulatory', 3, 4, 'Meera Iyer', 'Shipments start late'],
  ],
  scope0: [
    ['RS-485 gateway, device firmware and a dealer commissioning app', 'in', 'the core of the product'],
    ['Meter hardware itself', 'out', 'utilities already own meters'],
    ['Cloud analytics dashboards', 'unknown', 'depends on utility demand', 1],
  ],
  externals: [['Contract manufacturer', 'Pune manufacturing partner', 'partner_api', 'critical', 'Sunita Joshi']],
  // ---- phase 1
  segments: [['State utilities and large industrial consumers', 'Organisations reading more than 500 three-phase meters', true, 60]],
  personas: [['Utility metering engineer', 'customer_user', true, 'Get readings automatically and see meter faults early', 0], ['Dealer installer', 'customer_user', true, 'Commission quickly with clear on-site feedback', 0]],
  jobs: [
    ['When billing time comes I want all meter readings in the system so I can bill on actual consumption', 5, 0, 0, [0, 2]],
    ['When a meter fails I want to know within a day so I can send a technician', 4, 0, 0, [0, 2]],
    ['When I install a gateway I want it working in minutes so I can finish the site visit', 5, 0, 1, [0, 2]],
  ],
  problems: [['Readings arrive weeks late and meter faults go unseen', 4, 0]],
  opportunities: [['A gateway with guided on-site commissioning and local buffering for outages', 0, 0, 0]],
  competitors: [
    { name: 'VoltEdge VE-300', kind: 'direct', tier: 'T1', basis: 'customer_shortlist', pos: 'Feature-rich gateway sold to utilities directly',
      profile: { website: 'https://voltedge.example', founded_year: 2013, hq_country: 'India', size_band: '201-1000', funding_summary: 'Series B, invented figures', strengths: 'Utility references; broad meter library', weaknesses: 'Long commissioning; high MRP', tier_class: 'tier1', certifications: ['BIS'] },
      cells: [['RS-485 and Modbus meter support', 'strong', 5, 3], ['Local buffering during outages', 'partial', 4, 3, '2 hours only'], ['Guided commissioning', 'absent', 5, 3, 'laptop software only']],
      prices: [{ plan: 'VE-300 MRP', amount: 21500, unit: 'unit', metric: 'device', type: 'mrp', billing: 'one_time', tax: 'incl_gst', evIdx: 3, extra: { mrp: 21500, gst_rate_pct: 18, channel_level: 'retail', billing_period: 'one_time', warranty_months: 24 } }, { plan: 'VE-300 dealer price', amount: 17630, unit: 'unit', metric: 'device', type: 'dealer', billing: 'one_time', tax: 'incl_gst', evIdx: 3, date: '2026-02-10', extra: { mrp: 21500, dealer_margin_pct: 18, gst_rate_pct: 18, channel_level: 'dealer', billing_period: 'one_time' } }] },
    { name: 'MeterLink G2', kind: 'direct', tier: 'T1', basis: 'marketplace_compare', pos: 'Low-cost gateway sold through distributors',
      profile: { website: 'https://meterlink.example', founded_year: 2019, hq_country: 'India', size_band: '51-200', strengths: 'Aggressive street price', weaknesses: 'Thin support network', tier_class: 'tier1' },
      cells: [['RS-485 and Modbus meter support', 'parity', 5, 3], ['Local buffering during outages', 'absent', 4, 3], ['Guided commissioning', 'partial', 5, 3, 'phone app, limited']],
      prices: [{ plan: 'G2 street price', amount: 14900, unit: 'unit', metric: 'device', type: 'street', billing: 'one_time', tax: 'incl_gst', evIdx: 3, extra: { street_price: 14900, mrp: 18000, gst_rate_pct: 18, channel_level: 'street', billing_period: 'one_time' } }] },
    { name: 'DIY gateway on a single-board computer', kind: 'alternative', tier: 'S', basis: 'customer_shortlist', pos: 'Cheap and flexible, no support or certification', cells: [['Guided commissioning', 'absent', 5, 1, 'depends on the installer']], noPrice: 'Parts cost varies; no list price exists' },
  ],
  tracked: [['VoltEdge product pages', 'voltedge.example/ve-300', 'competitor_site', 3]],
  obligations: [['BIS registration for metering accessories', 'standard', 'BIS compulsory registration scheme', 'Electronic metering accessories sold in India need BIS registration before sale.', 'Approved'], ['Wireless equipment approval', 'regulation', 'Equipment type approval rules', 'Radio-enabled equipment needs a valid type approval before sale.', 'In review']],
  obligationEvidence: [3],
  legalAttest: false,
  hooks: {
    after1(h) {
      // an agent-proposed competitor batch that nobody has verified yet (shows in the verification queue)
      agentMod.ingest(h.S, {
        request_id: 'DR-1-13', submitted_by: 'Priya Nair',
        provenance: { agent: 'claude-research', retrieved_on: '2026-10-05', grade: 'C', confidence: 'moderate', source_url: 'https://cypress-databridge.example/products' },
        items: [
          { tmp: 'c1', type: 'Competitor', fields: { title: 'Cypress DataBridge', kind: 'direct', tier: 'T2', tier_basis: 'marketplace_compare', positioning: 'Cloud-first gateway with a monthly service fee' } },
          { tmp: 'k1', type: 'CompetitorCapability', fields: { title: 'Cypress DataBridge: RS-485 and Modbus meter support', capability_tag: 'RS-485 and Modbus meter support', level: 'parity', evidence_basis: 'documented', importance: 5 } },
          { tmp: 'p1', type: 'PricePoint', fields: { title: 'Cypress DataBridge monthly service', plan: 'Service fee', value_metric: 'device', unit: 'device/month', amount: 450, currency: 'INR', price_type: 'list', billing_model: 'subscription', tax_basis: 'excl_gst', region: 'India' } },
        ],
        links: [{ type: 'contains', source: 'c1', target: 'k1' }, { type: 'contains', source: 'c1', target: 'p1' }],
      });
    },
  },
};
void INR;
