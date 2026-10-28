/* The numbers on the landing page (apps/web/components/landing/facts.json) must match the engine data they are counted from. */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const read = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
const data = path.join(__dirname, '..', 'legacy', 'data');
const facts = read(path.join(__dirname, '..', '..', '..', 'web', 'components', 'landing', 'facts.json'));
const gates = read(path.join(data, 'gates.json'));
const rules = read(path.join(data, 'coverage_rules.json'));
const life = read(path.join(data, 'lifecycle.json'));

/* The nine steps and the phases (or, for Phase 9, the exact checks) they cover. See memory note nine-step-lifecycle. */
const PHASES: Record<string, number[]> = { Idea: [0, 1], MVP: [2], Requirements: [3, 4], Design: [5, 6], Build: [7, 8], Launch: [10], Learn: [11, 12] };
const TEST = ['G9-01', 'G9-02', 'G9-03', 'G9-05', 'G9-06', 'G9-07'];
const QUALITY = ['G9-04', 'G9-08', 'G9-09', 'G9-10', 'G9-11'];

const criteria: { id: string; gate: string | number }[] = gates.criteria;
const inPhases = (ps: number[]) => criteria.filter((c) => ps.includes(Number(c.gate)) && String(c.gate) !== 'C').length;
const ruleList: unknown[] = Array.isArray(rules) ? rules : rules.rules;

let passed = 0;
const ok = (name: string, fn: () => void) => { fn(); passed++; console.log('  ok  ' + name); };

ok('the page shows the number of gate checks the engine has', () => assert.equal(facts.gateChecks, criteria.length));
ok('the page shows the number of quality gates the lifecycle lists', () => assert.equal(facts.qualityGates, life.qualityGates9.length));
ok('the page shows the number of link checks (coverage rules) the engine has', () => assert.equal(facts.linkRules, ruleList.length));
ok('each of the nine steps shows the checks its phases hold', () => {
  const want: Record<string, number> = {};
  for (const [name, ps] of Object.entries(PHASES)) want[name] = inPhases(ps);
  want['Test'] = TEST.length; want['Quality check'] = QUALITY.length;
  assert.deepEqual(facts.stepChecks, want);
});
ok('the Phase 9 split uses real checks and covers all of Phase 9', () => {
  const ids = new Set(criteria.filter((c) => Number(c.gate) === 9).map((c) => c.id));
  assert.deepEqual([...ids].sort(), [...TEST, ...QUALITY].sort());
});
ok('the nine steps plus the checks that apply to every step add up to all of the engine checks', () => {
  const conditions = criteria.filter((c) => String(c.gate) === 'C').length;
  const sum = (Object.values(facts.stepChecks) as number[]).reduce((a, b) => a + b, 0);
  assert.equal(Object.keys(facts.stepChecks).length, 9);
  assert.equal(sum + conditions, facts.gateChecks);
});

console.log(`\n${passed} checks passed`);
