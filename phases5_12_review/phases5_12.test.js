'use strict';
/** Phases 5 to 12: the task lists, their order, their plain words, and a walk through Stage 5 one task at a time. */
const { seed, assert } = require('./helpers');
const requests = require('../engine/requests');
const gates = require('../engine/gates');
const plain = require('../engine/plain');
const compose = require('../engine/compose');

const later = () => requests.requests().filter((r) => r.phase >= 5);
const passGates = (S, upTo) => { for (let g = 0; g <= upTo; g++) S.data.gates[g] = { ...(S.data.gates[g] || { gate: g }), state: 'Passed', decision: 'go', decided_by: 'Test', decided_at: '2026-10-09T09:00:00.000Z' }; };
const readyLater = (S) => requests.plan(S).requests.filter((r) => r.phase >= 5 && r.status === 'ready').map((r) => r.id);
const statusOf = (S, id) => requests.plan(S).requests.find((r) => r.id === id);

module.exports = {
  'phases 5-12: 47 tasks, unique ids, every dependency and criterion resolves, each phase ends in a sign-off'() {
    const L = later(); assert.equal(L.length, 47);
    const all = requests.requests(); assert.equal(new Set(all.map((r) => r.id)).size, all.length);
    const crit = new Set(gates.criteria().map((c) => c.id)); const ids = new Set(all.map((r) => r.id));
    for (const r of L) {
      assert.ok(r.phase >= 5 && r.phase <= 12 && r.id.startsWith(`DR-${r.phase}-`), r.id);
      assert.ok(r.session && r.minutes > 0 && r.why_plain.length > 30 && r.title && r.ask, `${r.id} is missing wording or minutes`);
      for (const d of r.depends_on) assert.ok(ids.has(d), `${r.id} depends on ${d}`);
      for (const c of r.why.criteria) assert.ok(crit.has(c), `${r.id} names ${c}`);
      assert.equal(r.sequential, true, r.id);
    }
    for (let ph = 5; ph <= 12; ph++) {
      const ts = L.filter((r) => r.phase === ph); const last = ts[ts.length - 1];
      assert.equal(last.special, 'gate_decision', `phase ${ph} ends in a sign-off`);
      assert.equal(last.done_when.op === 'gate_decided' ? last.done_when.gate : last.done_when.of[1].gate, ph);
    }
  },
  'phases 5-12: every gate criterion of those phases is asked for by a task; every check has a plain sentence'() {
    const asked = new Set(later().flatMap((r) => r.why.criteria));
    for (const c of gates.criteria().filter((x) => /^G(5|6|7|8|9|10|11|12)-/.test(x.id))) assert.ok(asked.has(c.id), `${c.id} is not asked for by any task`);
    for (const c of gates.criteria()) assert.ok(plain.CRIT[c.id] && plain.CRIT[c.id][0] && plain.CRIT[c.id][1], `${c.id} has no plain sentence`);
    for (const [id, [need, todo]] of Object.entries(plain.CRIT)) assert.ok(!/\bG\d+-\d+|\bGate\b|\bNFR\b/.test(need + todo), `${id} carries rule words`);
  },
  'phases 5-12: the 8 sessions and the plain "waiting for" chain follow the stage order'() {
    const L = later();
    const first = (ph) => L.find((r) => r.phase === ph); const lastOf = (ph) => L.filter((r) => r.phase === ph).pop();
    assert.deepEqual(first(5).depends_on, ['DR-4-07']);
    for (let ph = 6; ph <= 12; ph++) assert.deepEqual(first(ph).depends_on, [lastOf(ph - 1).id]);
    const cfg = Object.keys(requests.load().sessions).filter((k) => Number(k.slice(1, k.indexOf('-'))) >= 5);
    assert.equal(cfg.length, 9);
    for (const r of L) assert.ok(cfg.includes(r.session), `${r.id}: session ${r.session} is not defined`);
  },
  'a product before Stage 4 is signed off sees none of the later tasks as ready'() {
    const S = seed(); assert.deepEqual(readyLater(S), []);
  },
  'Stage 5 walk-through: only the next task is open, an empty check cannot open the next one early, and records open them in order'() {
    const S = seed(); passGates(S, 4); S.data.settings.asOf = '2026-10-09';
    assert.deepEqual(readyLater(S), ['DR-5-01'], 'only the first task of the first open phase is ready');
    // an empty check passes with no records: it must not open the next task early
    const p0 = requests.plan(S); const st = (id) => p0.requests.find((r) => r.id === id);
    assert.notEqual(st('DR-5-04').status, 'ready'); assert.equal(st('DR-6-01').status, 'blocked');
    const stories = S.list('Story').filter((s) => s.priority === 'Must' && ['In review', 'Approved', 'Ready-for-handoff', 'Handed-off'].includes(s.status));
    assert.ok(stories.length > 0);
    // 1. a screen per must-have story
    const screens = stories.map((s, i) => { const sc = S.create('Screen', { title: `Screen ${i + 1}`, kind: 'page', status: 'Approved' }); S.link('designs', sc.id, s.id); return sc; });
    assert.deepEqual(readyLater(S), ['DR-5-02']);
    // 2. design links
    screens.forEach((sc, i) => S.update(sc.id, { design_link: `https://www.figma.com/file/x${i}` }));
    assert.deepEqual(readyLater(S), ['DR-5-03']);
    // 3. the four states of every screen
    for (const sc of screens) for (const k of ['loading', 'empty', 'error', 'permission_denied']) { const t = S.create('ScreenState', { title: `${sc.title} ${k}`, state_kind: k, description: 'x', status: 'Approved' }); S.link('state_of', t.id, sc.id); }
    assert.deepEqual(readyLater(S), ['DR-5-04'], 'the signature task is next and asks for the UX designer');
    const f = requests.formFor(S, 'DR-5-04'); assert.equal(f.form.special, 'attest'); assert.equal(f.form.role, 'UX designer');
    // 4. the UX designer signs
    gates.attest(S, { criterion: 'G5-06', gate: 5, role: 'UX designer', by: 'Maya', note: 'checked' }, 'Maya');
    assert.deepEqual(readyLater(S), ['DR-5-05']);
    // 5. an approved design review
    S.create('DesignReview', { title: 'Review 1', status: 'Approved', reviewer: 'Sam', scope: 'ui_design' });
    assert.deepEqual(readyLater(S), ['DR-5-06'], 'then the sign-off decision');
    assert.equal(statusOf(S, 'DR-6-01').status, 'blocked');
    // 6. Stage 5 signed off opens Stage 6, and only its first task
    passGates(S, 5);
    assert.deepEqual(readyLater(S), ['DR-6-01']);
  },
  'a step done out of order is credited only when the steps before it are done'() {
    const S = seed(); passGates(S, 4);
    // an approved review exists before any screen: its task must not look done yet
    S.create('DesignReview', { title: 'Early review', status: 'Approved', reviewer: 'Sam', scope: 'ui_design' });
    const r5 = statusOf(S, 'DR-5-05'); assert.equal(r5.done, false); assert.equal(r5.status, 'blocked');
  },
  'tasks outside the chosen depth never hold up the ones after them'() {
    const S = seed(); S.data.settings.params = S.data.settings.params || {}; passGates(S, 4);
    S.product().depth_level = 'L1';
    const p = requests.plan(S); const t = (id) => p.requests.find((r) => r.id === id);
    assert.equal(t('DR-5-03').inDepth, false);
    assert.deepEqual(t('DR-5-05').blockedBy.filter((d) => d !== 'DR-5-04'), []);
  },
  'documents: one for each of Stages 5 to 12, composed from the records, with the missing parts pointing at their task'() {
    const S = seed(); const l = compose.list(S).filter((d) => d.phase >= 5);
    assert.equal(l.length, 8); assert.deepEqual(l.map((d) => d.phase), [5, 6, 7, 8, 9, 10, 11, 12]);
    for (const d of l) { const m = compose.compose(S, d.key); const needs = m.sections.flatMap((s) => s.needs || []); assert.ok(needs.length > 0, d.key); assert.ok(needs.some((n) => n.target && n.target.request && /^DR-\d+-\d+$/.test(n.target.request)), d.key); }
  },
};
