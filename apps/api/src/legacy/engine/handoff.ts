/**
 * engine/handoff.ts - the handoff contract (spec section 8).
 *
 * A story package = the Story + its acceptance criteria + the transitive closure of everything the developer
 * tool needs: elaborated requirements, business rules, flow references (steps, outgoing edges, failure edges),
 * GLOBAL and applies_to NFRs, obligations, constraints, interfaces and state maps. An idempotency key makes
 * delivery safe to repeat. `validate` is the dry run (G4-14 / G4-15): schema, closure rule, hashes, suspect and
 * open-question checks.
 */
import * as crypto from 'node:crypto';
import * as Q from './query';
import * as questions from './questions';
import * as coverage from './coverage';
import * as stages from './stages';
import * as stories from './stories';

const SCHEMA_VERSION = '1.0';
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

function latestBaseline(store) {
  const b = store.data.baselines;
  return b.length ? b[b.length - 1] : null;
}

/** Collect the closure of a story. Returns buckets of items (no payload shaping yet). */
function closure(ctx, story) {
  const store = ctx.store;
  const get = (id) => store.get(id);
  const outs = (id, t) => store.out(id, t).map((l) => get(l.target)).filter(Boolean);
  const ins = (id, t) => store.inn(id, t).map((l) => get(l.source)).filter(Boolean);
  const uniq = (arr) => [...new Map(arr.map((x) => [x.id, x])).values()];

  const persona = outs(story.id, 'for_persona')[0] || null;
  const requirements = uniq(outs(story.id, 'elaborates').filter((x) => x.type === 'Requirement'));
  const features = uniq([...outs(story.id, 'elaborates').filter((x) => x.type === 'Feature'), ...requirements.flatMap((r: any) => outs(r.id, 'derives_from').filter((x) => x.type === 'Feature'))]);
  const acs = uniq([...ins(story.id, 'specifies'), ...requirements.flatMap((r: any) => ins(r.id, 'specifies'))].filter((a) => a.type === 'AcceptanceCriterion'));
  const steps = uniq([...ins(story.id, 'covers'), ...requirements.flatMap((r: any) => ins(r.id, 'covers'))].filter((x) => x.type === 'FlowStep'));
  const flows = uniq(steps.flatMap((s: any) => ins(s.id, 'contains').filter((f) => f.type === 'Flow')));
  const rules = uniq([
    ...ins(story.id, 'applies'), ...requirements.flatMap((r: any) => ins(r.id, 'applies')), ...steps.flatMap((s: any) => ins(s.id, 'applies')),
  ].filter((x) => x.type === 'BusinessRule'));
  const modules = uniq([story, ...requirements, ...features, ...flows].flatMap((x) => outs(x.id, 'belongs_to')));
  const release = outs(story.id, 'planned_in')[0] || null;
  const scopeTargets = new Set([ctx.store.product() && ctx.store.product().id, story.id, ...features.map((f: any) => f.id), ...flows.map((f: any) => f.id), ...steps.map((s: any) => s.id), ...modules.map((m: any) => m.id), release && release.id].filter(Boolean));
  const allNfrs = Q.select(ctx, { type: 'Requirement', subtype: 'non_functional' });
  const nfrs = allNfrs.filter((n) => n.global || store.out(n.id, 'applies_to').some((l) => scopeTargets.has(l.target)));
  const closureReqs = uniq([...requirements, ...nfrs]);
  const obligations = uniq([
    ...closureReqs.flatMap((r: any) => outs(r.id, 'satisfies')), ...rules.flatMap((r: any) => outs(r.id, 'satisfies')),
    ...Q.select(ctx, { type: 'Obligation', where: { applicability: 'applicable' } }).filter((o) => store.out(o.id, 'applies_to').some((l) => scopeTargets.has(l.target))),
  ].filter((x) => x.type === 'Obligation'));
  const regulatory = Q.select(ctx, { type: 'Requirement', subtype: 'regulatory' }).filter((r) => obligations.some((o: any) => store.out(r.id, 'satisfies').some((l) => l.target === o.id)));
  const externals = uniq([...closureReqs.flatMap((r: any) => outs(r.id, 'integrates_with')), ...steps.flatMap((s: any) => outs(s.id, 'calls'))]);
  const interfaceReqs = Q.select(ctx, { type: 'Requirement', subtype: 'interface' }).filter((r) => externals.some((e: any) => store.out(r.id, 'integrates_with').some((l) => l.target === e.id)));
  const entities = uniq(closureReqs.flatMap((r: any) => outs(r.id, 'operates_on')));
  const transitions = uniq(steps.flatMap((s: any) => outs(s.id, 'triggers_transition')));
  const itemsForConstraints = [story, ...requirements, ...features, ...flows, ...rules, ...modules];
  const constraints = uniq(itemsForConstraints.flatMap((x) => ins(x.id, 'constrains')).concat(ins(store.product().id, 'constrains')).filter((x) => x.type === 'Constraint'));
  return { story, persona, features, requirements, acs, steps, flows, rules, modules, release, nfrs, obligations, regulatory, externals, interfaceReqs, entities, transitions, constraints };
}

const reqView = (r) => ({ key: r.id, subtype: r.subtype, priority: r.priority, statement: r.statement, status: r.status });

function nfrView(store, n) {
  const asm = store.out(n.id, 'assumes')[0];
  return {
    key: n.id, scope: n.global ? 'global' : 'applies_to', category: n.category, metric: n.metric, comparator: n.comparator, target_value: n.target_value, unit: n.unit,
    percentile: n.percentile, window: n.window, condition_or_load_profile: n.condition, environment: n.environment, measurement_point: n.measurement_point,
    measurement_tool: n.measurement_tool, contractual: !!n.contractual, basis: n.basis, ...(asm ? { assumption: asm.target } : {}), priority: n.priority,
  };
}

/** Build the story package (JSON payload as in spec 8.8). */
function buildStoryPackage(ctx, storyId, opts: any = {}) {
  const store = ctx.store;
  const story = store.get(storyId);
  if (!story || story.type !== 'Story') throw Object.assign(new Error(`${storyId} is not a Story`), { status: 404 });
  const c = closure(ctx, story);
  const prod = store.product();
  const base = latestBaseline(store);
  const prev = store.out(storyId, 'handed_off_as').map((l) => store.get(l.target)).filter(Boolean);
  const version = (opts.version || prev.length + 1);
  const flowRefs = c.steps.map((s: any) => ({
    flow: (store.inn(s.id, 'contains')[0] || {}).source, step: s.id, kind: s.kind, title: s.title,
    edges_out: store.out(s.id, 'next').map((l) => ({ edge: l.id, type: (l.attrs || {}).kind, to: l.target, guard: (l.attrs || {}).condition || '' })),
  }));
  const body = {
    story: {
      key: story.id, title: story.title, status: story.status, priority: story.priority, want: story.want, benefit: story.benefit,
      persona: c.persona ? { key: c.persona.id, name: c.persona.title, kind: c.persona.kind } : null,
      estimate: story.estimate !== undefined ? { value: story.estimate, unit: 'points' } : null, module: c.modules[0] ? (c.modules[0] as any).id : null,
    },
    acceptance_criteria: c.acs.map((a: any) => ({ key: a.id, scenario_type: a.scenario_type, kind: a.kind || 'behavioural', given: a.given, when: a.when, then: a.then, status: a.status })),
    requirements: [...c.requirements, ...c.regulatory, ...c.interfaceReqs].filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i).map(reqView),
    business_rules: c.rules.map((r: any) => ({ key: r.id, kind: r.kind, category: r.category, statement: r.statement, parameters: r.parameters || [] })),
    flow_refs: flowRefs,
    applicable_nfrs: c.nfrs.map((n) => nfrView(store, n)),
    obligations: c.obligations.map((o: any) => ({ key: o.id, kind: o.kind, instrument: o.instrument, obligation_text: o.obligation_text })),
    constraints: c.constraints.map((k: any) => ({ key: k.id, kind: k.kind, statement: k.statement, flexibility: k.flexibility })),
    interfaces: c.externals.map((e: any) => ({ key: e.id, name: e.title, kind: e.kind, provider: e.provider })),
    state_maps: c.entities.map((e: any) => {
      const ec = coverage.entityCheck(store, e.id, ctx);
      return { entity: e.id, name: e.title, states: ec.states.map((s) => s.title), transitions: ec.transitions.map((t) => ({ key: t.id, from: t.from, to: t.to, kind: t.kind })) };
    }),
    exclusions: ['relates_to links', 'Risks (listed as references only)', 'Position, Feedback, Findings', 'items above the connection sensitivity limit (none filtered in this prototype)'],
  };
  const contentHash = 'sha256:' + sha(JSON.stringify(body)).slice(0, 16);
  const idem = 'sha256:' + sha([prod && prod.name, story.id, version, contentHash, 'conn-dev-tool'].join('|')).slice(0, 16);
  const pkg = {
    schema_version: SCHEMA_VERSION,
    package: { package_id: `PKG-${story.id}`, scope: 'story', package_version: version, ...(prev.length ? { supersedes: `PKG-${story.id}@${version - 1}` } : {}), idempotency_key: idem, content_hash: contentHash, created_at: store.now(), created_by: { type: 'user', id: opts.actor || 'preview' } },
    product: prod ? { key: prod.id, name: prod.name, mode: prod.mode, risk_class: prod.risk_class } : null,
    baseline: base ? { id: base.id, gate: base.gate, created_at: base.created_at, hash: base.hash } : { id: null, note: 'No gate baseline yet; this is a working-draft preview' },
    release: c.release ? { key: c.release.id, name: c.release.title, is_mvp: !!c.release.is_mvp } : null,
    ...body,
    _closure: { requirements: c.requirements.map((r: any) => r.id), nfrs: c.nfrs.map((n) => n.id), steps: c.steps.map((s: any) => s.id), rules: c.rules.map((r: any) => r.id), obligations: c.obligations.map((o: any) => o.id), externals: c.externals.map((e: any) => e.id) },
  };
  return pkg;
}

/** Dry run: validate a package against the contract. Returns { valid, errors, warnings, checks }. */
function validate(ctx, pkg) {
  const store = ctx.store;
  const errors = [];
  const warnings = [];
  const checks = [];
  const check = (name, ok, msg, severity = 'error') => {
    checks.push({ name, ok, message: ok ? 'ok' : msg });
    if (!ok) (severity === 'error' ? errors : warnings).push(`${name}: ${msg}`);
  };
  check('schema_version', pkg.schema_version === SCHEMA_VERSION, `expected ${SCHEMA_VERSION}`);
  check('package.keys', !!(pkg.package && pkg.package.package_id && pkg.package.idempotency_key && pkg.package.content_hash), 'package_id, idempotency_key and content_hash are required');
  check('product', !!pkg.product, 'product block missing');
  const st = pkg.story;
  check('story.present', !!st && !!st.key && !!st.want, 'story with a want statement is required');
  if (!st) return { valid: false, errors, warnings, checks };
  check('story.status', ['Approved', 'Ready-for-handoff', 'Handed-off'].includes(st.status), `story status is "${st.status}"; only Approved stories can be handed off`);
  check('story.persona', !!st.persona, 'every story needs a persona (for_persona)');
  const acs = pkg.acceptance_criteria || [];
  check('ac.count', acs.length >= 1, 'at least one acceptance criterion is required');
  check('ac.happy', acs.some((a) => a.scenario_type === 'happy'), 'at least one happy-path acceptance criterion is required');
  check('ac.reviewed', acs.every((a) => ['In review', 'Approved'].includes(a.status)), `draft acceptance criteria in the package: ${acs.filter((a) => !['In review', 'Approved'].includes(a.status)).map((a) => a.key).join(', ')}`);
  const reqs = pkg.requirements || [];
  check('requirements.present', reqs.length >= 1, 'the story elaborates no requirement');
  // closure rule: every global Must NFR, every applicable Must NFR and obligation must be in the package
  const pkgNfr = new Set((pkg.applicable_nfrs || []).map((n) => n.key));
  const missingGlobal = Q.select(ctx, { type: 'Requirement', subtype: 'non_functional', where: { priority: 'Must', global: true } }).filter((n) => !pkgNfr.has(n.id));
  check('closure.global_nfr', missingGlobal.length === 0, `global Must NFR(s) missing from the closure: ${missingGlobal.map((n) => n.id).join(', ')}`);
  const reqIds = new Set(reqs.map((r) => r.key));
  const storyReqs = store.out(st.key, 'elaborates').map((l) => l.target).filter((id) => (store.get(id) || {}).type === 'Requirement');
  const missingReq = storyReqs.filter((id) => !reqIds.has(id));
  check('closure.requirements', missingReq.length === 0, `elaborated requirement(s) missing: ${missingReq.join(', ')}`);
  const mustFlow = reqs.filter((r) => r.priority === 'Must' && r.subtype === 'functional').filter((r) => { const rr = store.get(r.key); return !rr.flow_applicability || rr.flow_applicability === 'flow'; });
  const stepsFor = (id) => store.inn(id, 'covers').length;
  const noFlow = mustFlow.filter((r) => stepsFor(r.key) === 0 && stepsFor(st.key) === 0);
  check('flow_refs', noFlow.length === 0, `Must requirement(s) with no flow step: ${noFlow.map((r) => r.key).join(', ')}`);
  // staleness and open questions
  const sm = ctx.suspectMap();
  const inClosure = [st.key, ...reqIds, ...acs.map((a) => a.key), ...(pkg.business_rules || []).map((r) => r.key), ...pkgNfr, ...(pkg.obligations || []).map((o) => o.key)];
  const suspect = inClosure.filter((id) => sm.has(id));
  check('closure.no_suspect', suspect.length === 0, `suspect item(s) in the closure: ${suspect.join(', ')}`);
  const openQ = Q.select(ctx, { type: 'Question', includeTerminal: true, where: { priority: 'Must' } }).filter((q) => questions.effectiveState(store, q).state === 'open' && (store.out(q.id, 'clarifies').concat(store.out(q.id, 'blocks')).some((l) => inClosure.includes(l.target))));
  check('questions.none_open', openQ.length === 0, `open Must question(s) about closure items: ${openQ.map((q) => q.id).join(', ')}`);
  // hash integrity
  const { schema_version, package: p, product, baseline, release, _closure, ...body } = pkg;
  const recomputed = 'sha256:' + sha(JSON.stringify(body)).slice(0, 16);
  check('hash', pkg.package && pkg.package.content_hash === recomputed, 'content_hash does not match the payload');
  check('baseline', !!(pkg.baseline && pkg.baseline.id), 'not yet baselined (Gate 4 has not passed); allowed for a dry run only', 'warning');
  return { valid: errors.length === 0, errors, warnings, checks };
}

/** For every Approved / Ready story: build + validate. Used by gate G4-14 and the dashboard. */
function readiness(ctx) {
  const stories = Q.select(ctx, { type: 'Story', where: { status: ['Approved', 'Ready-for-handoff'] } });
  const out = stories.map((s) => {
    const pkg = buildStoryPackage(ctx, s.id);
    const v = validate(ctx, pkg);
    return { id: s.id, title: s.title, status: s.status, ready: v.valid, reasons: v.errors, warnings: v.warnings };
  });
  return { stories: out, ready: out.filter((x) => x.ready).length, total: out.length };
}

/** Create a Handoff record (dry-run must be valid). */
function createHandoff(store, storyId, actor) {
  const ctx = new Q.Ctx(store, { gate: 4 });
  const pkg = buildStoryPackage(ctx, storyId, { actor });
  const v = validate(ctx, pkg);
  if (!v.valid) throw Object.assign(new Error(`handoff dry run failed: ${v.errors.join('; ')}`), { status: 409, validation: v });
  const prev = store.out(storyId, 'handed_off_as').map((l) => store.get(l.target)).filter(Boolean);
  for (const p of prev) store.update(p.id, { status: 'Superseded' }, { actor, silent: true });
  const base = latestBaseline(store);
  const h = store.create('Handoff', { title: `Package ${pkg.package.package_id} v${pkg.package.package_version}`, scope: 'story', story: storyId, package_version: pkg.package.package_version, idempotency_key: pkg.package.idempotency_key, content_hash: pkg.package.content_hash, baseline_id: base ? base.id : undefined, dry_run_result: 'valid', status: 'Ready' }, { actor });
  store.link('handed_off_as', storyId, h.id, {}, { actor });
  for (const id of [...pkg._closure.requirements, ...pkg._closure.nfrs, ...pkg._closure.rules, ...pkg._closure.obligations]) store.ensureLink('includes', h.id, id, {}, { actor, silent: true });
  if (store.get(storyId).status === 'Approved') store.update(storyId, { status: 'Ready-for-handoff' }, { actor });
  return { handoff: h, package: pkg, validation: v };
}

/**
 * The honest answer to "is this handed over?". Four different things are kept apart:
 *   stages signed off  - the five stage sign-offs (some of them possibly only by an agreed exception)
 *   stories approved   - user stories a second person approved
 *   stories ready      - approved stories whose package passes the dry run
 *   handed over        - a handoff package was actually created
 * A product is "handed off" only when a package exists.
 */
function status(store) {
  
  
  const today = store.today();
  const signed = [0, 1, 2, 3, 4].filter((n) => stages.isPassed(store, n)).length;
  const exceptions = store.list('Waiver', (w) => w.status === 'Active' && (!w.expiry_on || w.expiry_on >= today)).length;
  const waitingExc = store.list('Waiver', (w) => w.status === 'Requested').length;
  const list = stories.listStories(store);
  const approved = list.filter((s) => ['approved', 'handed_off'].includes(s.state)).length;
  const ctx = new Q.Ctx(store, { gate: 4 });
  const ready = readiness(ctx);
  const packages = store.list('Handoff', (h) => !['Superseded', 'Failed', 'Rejected'].includes(h.status));
  const handed = packages.length > 0;
  const word = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const outstanding = [];
  if (signed < 5) outstanding.push(`${5 - signed} of the 5 stages ${5 - signed === 1 ? 'is' : 'are'} not signed off yet.`);
  if (exceptions) outstanding.push(`${word(exceptions, 'item was', 'items were')} set aside by an exception instead of being finished.`);
  if (!list.length) outstanding.push('There are no user stories yet.');
  else if (!approved) outstanding.push(`0 stories approved yet: complete and approve a story first (${word(list.length, 'story is', 'stories are')} not approved yet).`);
  else if (!ready.ready) outstanding.push(`${word(approved, 'story is', 'stories are')} approved, but none passes the check developers need yet.`);
  if (!handed && approved && ready.ready) outstanding.push(`${word(ready.ready, 'story is', 'stories are')} ready, but nothing has been handed over yet.`);
  let headline;
  if (handed) headline = `Handed over: ${word(packages.length, 'package was', 'packages were')} created for developers.`;
  else if (signed === 5) headline = `All five stages are signed off${exceptions ? `, with ${word(exceptions, 'exception', 'exceptions')}` : ''}. Nothing has been handed over to developers yet: ${approved} ${approved === 1 ? 'story is' : 'stories are'} approved and ${ready.ready} ${ready.ready === 1 ? 'is' : 'are'} ready.`;
  else headline = `${signed} of 5 stages are signed off.`;
  return { stages_signed: signed, exceptions, exceptions_waiting: waitingExc, stories_total: list.length, stories_approved: approved, stories_ready: ready.ready, packages: packages.length, handed_off: handed, headline, outstanding };
}

export { status, closure, buildStoryPackage, validate, readiness, createHandoff, SCHEMA_VERSION };
