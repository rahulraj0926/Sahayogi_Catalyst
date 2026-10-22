// dev aid: node scripts/check_seed.ts <seed key>  -> prints gate picture and validation
import * as gates from '../engine/gates'; 
import { SEEDS } from './seed_portfolio';
import * as schema from '../engine/schema';
const key = process.argv[2];
const S = SEEDS[key]();
let bad = 0; for (const it of S.all()) { const e = schema.validateItem(it); if (e.length) { bad++; console.log('INVALID', it.id, e.join('; ')); } }
console.log(key, 'items', S.all().length, 'links', S.links().length, 'invalid', bad, 'depth', gates.depthOf(S), 'phase', S.product().current_phase);
for (const ev of gates.evaluateAll(S)) console.log(' gate', ev.gate, ev.state.padEnd(22), ev.live_state || '', 'ready', ev.summary.readiness + '%', 'must', ev.summary.mustOk + '/' + ev.summary.mustTotal, ev.blockers.map((b) => b.id).join(','));
if (process.argv[3]) for (const ev of gates.evaluateAll(S)) for (const r of ev.results) if (['FAIL', 'ATTEST_PENDING'].includes(r.status) && (process.argv[3] === 'all' || String(ev.gate) === process.argv[3])) console.log('   ', ev.gate, r.id, r.status, r.message.slice(0, 220), r.offenders.slice(0, 3).map((o) => o.id + ':' + (o.reason || '').slice(0, 80)).join(' | '));
