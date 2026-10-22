/**
 * engine/lifecycle.ts - the 13-phase lifecycle (Phase 0 to 12) as data (data/lifecycle.json) plus the lifecycle overview
 * used by the dashboard: one row per phase with record counts, gate evaluation and sign-off state.
 * Phases 0-4 keep their original behaviour; Phases 5-12 use the same record / link / gate machinery (engine/phases_5_12.ts).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as framework from './framework';

const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'lifecycle.json'), 'utf8'));
const PHASES = DATA.phases;
const LAST_GATE = PHASES.length - 1;
const GATE_NAMES = PHASES.map((p) => p.name);
const PASSED = ['Passed', 'Passed-with-conditions'];

function overview(store, gates) {
  const evals = Array.from({ length: PHASES.length }, (_, g) => gates.evaluateGate(store, g));
  const items = store.all();
  const fw = framework.percentByPhase(store); // weighted completion per phase, from the framework steps
  const phases = PHASES.map((p, i) => {
    const ev = evals[i];
    const own = items.filter((x) => x.phase === i && x.type !== 'Product');
    const decided = ev.decision && PASSED.includes(ev.decision.state);
    const prevOk = i === 0 || (evals[i - 1].decision && PASSED.includes(evals[i - 1].decision.state));
    let status = 'Not started';
    if (decided) status = ev.decision.state === 'Passed' ? 'Signed off' : 'Signed off with conditions';
    else if (ev.decision && ev.decision.state === 'Held') status = 'On hold';
    else if (own.length) status = 'In progress';
    return {
      id: i, key: p.key, name: p.name, short: p.short, question: p.question, purpose: p.purpose, outputs: p.outputs, roles: p.roles, tool: p.tool, depth: p.depth,
      records: own.length, status, percent: fw[i] ? fw[i].percent : 0, stepsDone: fw[i] ? fw[i].stepsDone : 0, stepsTotal: fw[i] ? fw[i].stepsTotal : 0, title: fw[i] ? fw[i].title : p.name, frameworkNo: fw[i] ? fw[i].n : i,
 readiness: ev.summary.readiness, mustOk: ev.summary.mustOk, mustTotal: ev.summary.mustTotal,
      failed: ev.summary.failed, pending: ev.summary.pending, blockers: ev.blockers.slice(0, 3), liveState: ev.live_state,
      decision: ev.decision ? { decision: ev.decision.decision, by: ev.decision.decided_by, at: ev.decision.decided_at } : null,
      ready: prevOk, // the earlier phase is signed off, so this one can be worked and signed
    };
  });
  const firstOpen = phases.findIndex((p) => !['Signed off', 'Signed off with conditions'].includes(p.status));
  return { phases, current: firstOpen < 0 ? LAST_GATE : firstOpen, qualityGates9: DATA.qualityGates9 };
}

export { PHASES, LAST_GATE, GATE_NAMES, overview, DATA };
