/* Pure round trip: engine data -> table rows -> engine data must come back unchanged. No database needed. */
import * as os from 'node:os'; import * as fs from 'node:fs'; import * as path from 'node:path';
import { seedPortfolio } from '../legacy/scripts/seed_portfolio';
import { productToRows, rowsToProduct, fromKv, toKv, Row } from '../db/mapper';
import { registryToRows, rowsToRegistry } from '../db/repository';

const norm = (v: any): any => JSON.parse(JSON.stringify(v));
function diff(a: any, b: any, p = '', out: string[] = []): string[] {
  if (out.length > 25) return out;
  if (a === b) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], p + '/' + k, out);
    return out;
  }
  out.push(`${p}: ${JSON.stringify(a)?.slice(0, 70)}  !=  ${JSON.stringify(b)?.slice(0, 70)}`);
  return out;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-'));
const src: any = seedPortfolio(tmp);
src.ensureSlugs();
let bad = 0, rows = 0;
src.reg.products.forEach((entry: Row, pos: number) => {
  const data = src.store(entry.id).data;
  const { rows: set, audit } = productToRows(pos, { entry, data });
  for (const m of set.values()) rows += m.size;
  const auditRows = audit.map((a: Row) => ({ row: a, details: Object.entries(a.details).map(([k, v]) => toKv(k, v, 'audit')) }));
  const back = rowsToProduct(set, auditRows);
  // `report` of derived requests is deliberately not stored
  const want = norm({ entry, data }); for (const k of ['documents', 'approvals', 'inbox', 'hallucinations']) { const v = want.data[k]; if (v && (Array.isArray(v) ? !v.length : !Object.keys(v).length)) delete want.data[k]; } for (const r of Object.values<any>(want.data.requestState)) delete r.report;
  const got = norm(back);
  const d = diff(want, got);
  if (d.length) { bad++; console.log(`✗ ${entry.id}`); d.forEach((x) => console.log('   ' + x)); } else console.log(`✓ ${entry.id}  (${Object.keys(data.items).length} items, ${data.linkList.length} links, ${data.audit.length} audit)`);
});

// records the seed does not contain: documents, approvals, assistant inbox, flagged answers
{
  const entry = src.reg.products[0]; const data = JSON.parse(JSON.stringify(src.store(entry.id).data));
  const T = '2026-10-01T10:00:00.000Z';
  data.documents = { prd: { status: 'approved', approved_at: T, approved_by: 'Asha (sponsor)', waiver: { reason: 'time', approver: 'Ravi', completeness: 70, threshold: 80 },
    history: [{ status: 'in_review', role: 'author', by: 'Kanishk', at: T, note: 'sent', completeness: 70, waiver: null }, { status: 'approved', role: 'sponsor', by: 'Asha', at: T, note: '', completeness: 70, waiver: { reason: 'time', approver: 'Ravi', completeness: 70, threshold: 80 } }] } };
  data.approvals = [{ id: 'APR-001', token: 'tok1', kind: 'stage', subject: 'GATE-2', title: 'Gate 2', statement: 's', product_name: 'P', stage: 2, prepared_by: 'A', approver: 'B', approver_contact: { email: 'b@x.in', phone: '' }, status: 'approved',
    created_at: T, expires_at: T, expiry_days: 7, payload: { gate: 2, decision: 'go_with_conditions', rationale: 'ok', conditions: [{ title: 't', text: 'x', owner: 'A', must_close_by_gate: 3 }], request: 'DR-1' },
    audit: [{ at: T, event: 'asked', by: 'A' }, { at: T, event: 'approved', by: 'B', via: 'link', ua: 'x', note: 'fine' }], decided_at: T, decided_by: 'B', decision_note: 'fine', decision_via: 'link', seen_by_requester: false },
    { id: 'APR-002', token: 'tok2', kind: 'story', subject: 'STY-001', title: 't', statement: '', product_name: 'P', stage: null, prepared_by: 'A', approver: 'B', approver_contact: { email: '', phone: '' }, status: 'waiting', created_at: T, expires_at: T, expiry_days: 7, payload: { story: 'STY-001' }, audit: [{ at: T, event: 'asked', by: 'A' }] }];
  data.inbox = [{ id: 'PRP-001', attachment: 'ATT-1', goal: 'competitors', status: 'accepted', kind: 'create_item', competitor_id: null, item: { type: 'Competitor', fields: { name: 'Acme', price: 12.5, active: true, tags: ['a', 'b'] } },
    pointer: { locator: { kind: 'sheet_cell', sheet: 'Prices', cell: 'B4' }, quote: '12.5' }, where: 'Prices B4', confidence: 0.8, reason: 'r', source: 'upload', proposed_by: 'Assistant', proposed_at: T, from_pasted: { by: 'A', at: T },
    also_seen: [{ where: 'p2', quote: 'q' }], flags: ['conflict'], reviewed_by: 'A', reviewed_at: T, result: { item: 'CMP-001', created: ['CMP-001'], pointer: 'PTR-1', verification: 'verified' }, edited_by: 'A', edited_at: T, edits: [{ by: 'A', at: T, changed: ['price'] }] }];
  data.hallucinations = [{ at: T, attachment: 'ATT-1', goal: 'g', source: 's', quote: 'q', locator: { kind: 'page', index: 3 }, reason: 'not found' }];
  const { rows: set, audit } = productToRows(0, { entry, data });
  const back = rowsToProduct(set, audit.map((a: Row) => ({ row: a, details: Object.entries(a.details).map(([k, v]) => toKv(k, v, 'audit')) })));
  const d = diff(norm(data), norm(back.data));
  if (d.length) { bad++; console.log('✗ documents/approvals/inbox/flagged'); d.forEach((x) => console.log('   ' + x)); } else console.log('✓ documents, approvals, assistant inbox and flagged answers round-trip');
}
{
  const reg: any = norm(src.reg); reg.products = [];
  reg.counters = { ...(reg.counters || {}), feedback: 2 };
  reg.feedback = [
    { id: 'NOTE-001', text: 'Too much text here', categories: ['too much text', 'confusing'], route: '/products/PRD-001', product: 'PRD-001', product_name: 'P', actor: 'Asha', at: '2026-10-16T10:00:00.000Z', width: 1280, words: 340, done: false, done_at: null, done_by: null },
    { id: 'NOTE-002', text: 'Broken link', categories: [], route: '', product: '', product_name: '', actor: '', at: '2026-10-16T11:00:00.000Z', width: 0, words: 0, done: true, done_at: '2026-10-16T12:00:00.000Z', done_by: 'Priya' },
  ];
  const back: any = rowsToRegistry(registryToRows(reg));
  const d = diff(norm(reg.feedback), norm(back.feedback));
  if (d.length || back.counters.feedback !== 2) { bad++; console.log('✗ feedback notes'); d.forEach((x) => console.log('   ' + x)); } else console.log('✓ feedback notes (and their counter) round-trip through the registry tables');
}
console.log(bad ? `${bad} product(s) differ` : `all ${src.reg.products.length} products round-trip (${rows} rows)`);
process.exit(bad ? 1 : 0);
