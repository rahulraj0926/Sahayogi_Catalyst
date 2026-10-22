/**
 * engine/requests.ts - the data-collection plan engine (data/data_requests.json).
 *
 * Four owner kinds:
 *   HUMAN          facts or decisions only the company can supply; short forms that CREATE items and links
 *   DOCUMENT       existing material to paste or upload; becomes Evidence
 *   AGENT_RESEARCH market/competitor/regulation research with a ready-to-paste prompt and an ingest format
 *   DERIVED        drafts, links and reports the tool generates itself (engine/derive.ts)
 * Each request carries a completion rule (the same JSON query DSL as the gates) so "done" is computed from the
 * store, never ticked by hand. The engine computes totals of human minutes, agent tasks and derived items per phase
 * and depth level.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as Q from './query';
import * as gates from './gates';
import * as questions from './questions';
import * as schema from './schema';
import * as derive from './derive';
import * as fk from './formkit';
import * as plain from './words';
import * as approvals from './approvals';
import * as units from './units';
import * as compose from './compose';
import * as stages from './stages';
import * as coverageMod from './coverage';
import * as unitsMod from './units';

const LEVEL_ORDER = { L1: 1, L2: 2, L3: 3 };
let CACHE = null;

function load() {
  if (!CACHE) CACHE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'data_requests.json'), 'utf8'));
  return CACHE;
}
function reload() { CACHE = null; return load(); }
function requests() { return load().requests; }
function get(id) { return requests().find((r) => r.id === id) || null; }

// ---------------------------------------------------------------- completion rules
/** Extra ops available to completion rules on top of the gate DSL. */
function evalDone(ctx, q) {
  switch (q.op) {
    case 'criterion_pass': {
      const ev = gateEval(ctx, q.gate);
      const results = [].concat(q.criterion).map((id) => ev.results.find((r) => r.id === id));
      const bad = results.filter((r) => !r || !['PASS', 'WAIVED', 'NA'].includes(r.status));
      return { pass: bad.length === 0, message: bad.length ? `criterion ${bad.map((r) => (r ? r.id : '?')).join(', ')} not yet met` : 'criteria met', offenders: bad.flatMap((r) => (r && r.offenders) || []), criteria: bad.map((r) => (r ? r.id : '?')), detail: bad.map((r) => (r ? r.message : '')).filter(Boolean) };
    }
    case 'gate_decided': {
      const g = ctx.store.data.gates[q.gate];
      return { pass: !!g && ['Passed', 'Passed-with-conditions'].includes(g.state), message: g ? `Gate ${q.gate} ${g.state}` : `Gate ${q.gate} not decided` };
    }
    case 'any': {
      const rs = q.of.map((s) => evalDone(ctx, s));
      return { pass: rs.some((r) => r.pass), message: rs.map((r) => r.message).join(' / '), offenders: rs.flatMap((r) => r.offenders || []) };
    }
    case 'all_done': {
      const rs = q.of.map((s) => evalDone(ctx, s));
      return { pass: rs.every((r) => r.pass), message: rs.filter((r) => !r.pass).map((r) => r.message).join('; ') || 'done', offenders: rs.filter((r) => !r.pass).flatMap((r) => r.offenders || []), criteria: rs.flatMap((r) => r.criteria || []), detail: rs.flatMap((r) => r.detail || []) };
    }
    case 'entity_structure': { // the states and moves are complete; tests for forbidden moves are a separate check (written elsewhere)
      const list = coverageMod.lifecycleEntities(ctx);
      const bad = list.filter((e) => e.problems.some((p) => p.rule !== 'CR-32'));
      return { pass: list.length > 0 && bad.length === 0, message: list.length ? (bad.length ? `${bad.length} of ${list.length} life cycles are incomplete` : 'life cycles complete') : 'no life cycle described yet', offenders: bad.map((e) => ({ id: e.entity.id, title: e.entity.title, type: 'Entity', reason: e.problems.filter((p) => p.rule !== 'CR-32').map((p) => p.message).join('; ') })) };
    }
    case 'derived_ran': {
      const st = ctx.store.data.requestState[q.request];
      return { pass: !!(st && st.status === 'derived'), message: st ? 'generated' : 'not yet generated' };
    }
    default: {
      const r = gates.evalQuery(ctx, q);
      return { pass: r.pass, message: r.message, offenders: r.offenders || [] };
    }
  }
}

function gateEval(ctx, g) {
  ctx._gateEval = ctx._gateEval || {};
  if (!ctx._gateEval[g]) ctx._gateEval[g] = gates.evaluateGate(ctx.store, g);
  return ctx._gateEval[g];
}

// ---------------------------------------------------------------- plan
function agentState(store, req) {
  const items = store.all().filter((i) => i.request_id === req.id);
  const unverified = items.filter((i) => i.origin === 'agent' && i.verification === 'unverified').length;
  const verified = items.filter((i) => i.origin === 'agent' && i.verification === 'verified').length;
  const rejected = items.filter((i) => i.verification === 'rejected').length;
  const ingests = store.data.ingests.filter((x) => x.request_id === req.id).length;
  return { items: items.length, unverified, verified, rejected, ingests, state: !ingests ? 'prompt_ready' : unverified ? 'ingested_unverified' : verified ? 'verified' : 'ingested' };
}

function plan(store, opts: any = {}) {
  const depth = opts.depth || gates.depthOf(store);
  const ctx = new Q.Ctx(store, { depth });
  const all = requests();
  const statusById = {};
  const out = all.map((r) => {
    const inDepth = LEVEL_ORDER[r.depth_level] <= LEVEL_ORDER[depth];
    const st = store.data.requestState[r.id] || null;
    let done = false;
    let message = '';
    let doneOffenders = [];
    let doneCriteria = [];
    let doneDetail = [];
    if (st && st.status === 'na') { done = true; message = `marked not applicable: ${st.reason}`; } else {
      try { const d = evalDone(ctx, r.done_when); done = d.pass; message = d.message; doneOffenders = d.offenders || []; doneCriteria = d.criteria || []; doneDetail = d.detail || []; } catch (e) { message = `rule error: ${e.message}`; }
    }
    statusById[r.id] = done;
    return { ...r, inDepth, done, doneMessage: message, doneOffenders, doneCriteria, doneDetail, na: !!(st && st.status === 'na'), answeredAt: st && st.at || null, answeredBy: st && st.by || null };
  });
  for (const r of out) {
    r.blockedBy = (r.depends_on || []).filter((d) => !statusById[d]);
    r.status = r.done ? 'done' : r.blockedBy.length ? 'blocked' : 'ready';
    if (r.owner_kind === 'AGENT_RESEARCH') {
      r.agent = agentState(store, r);
      if (!r.done && r.status === 'ready' && r.agent.ingests) r.status = 'in_progress';
    }
    r.criteriaImpact = [];
  }
  // impact: how many currently failing criteria does this request feed?
  const failing = {};
  let nextGate = 0;
  while (nextGate < 4 && store.data.gates[nextGate] && ['Passed', 'Passed-with-conditions'].includes(store.data.gates[nextGate].state)) nextGate++;
  for (const g of [0, 1, 2, 3, 4]) {
    const ev = gateEval(ctx, g);
    for (const res of ev.results) if (['FAIL', 'ATTEST_PENDING'].includes(res.status)) failing[res.id] = { severity: res.severity, gate: g };
  }
  for (const r of out) {
    r.criteriaImpact = ((r.why && r.why.criteria) || []).filter((c) => failing[c]).map((c) => ({ id: c, severity: failing[c].severity, gate: failing[c].gate, next: failing[c].gate === nextGate }));
    r.impactScore = r.criteriaImpact.reduce((s, c) => s + (c.severity === 'must' ? 3 : 1) * (c.next ? 2 : 1), 0);
  }
  return { depth, requests: out, totals: totals(out, depth), sessions: sessions(out) };
}

/** Totals per phase and per depth level (cumulative: L2 includes L1). */
function totals(list, currentDepth) {
  const kinds = ['HUMAN', 'DOCUMENT', 'AGENT_RESEARCH', 'DERIVED'];
  const mk = () => ({ requests: 0, done: 0, humanMinutes: 0, humanMinutesDone: 0, humanRequests: 0, humanDone: 0, documentRequests: 0, documentDone: 0, documentMinutes: 0, agentTasks: 0, agentDone: 0, derivedTasks: 0, derivedDone: 0, byKind: Object.fromEntries(kinds.map((k) => [k, { n: 0, done: 0 }])) });
  const add = (t, r) => {
    t.requests++; if (r.done) t.done++;
    t.byKind[r.owner_kind].n++; if (r.done) t.byKind[r.owner_kind].done++;
    if (r.owner_kind === 'HUMAN' || r.owner_kind === 'DOCUMENT') {
      t.humanMinutes += r.minutes; if (r.done) t.humanMinutesDone += r.minutes;
      if (r.owner_kind === 'HUMAN') { t.humanRequests++; if (r.done) t.humanDone++; } else { t.documentRequests++; t.documentMinutes += r.minutes; if (r.done) t.documentDone++; }
    }
    if (r.owner_kind === 'AGENT_RESEARCH') { t.agentTasks++; if (r.done) t.agentDone++; }
    if (r.owner_kind === 'DERIVED') { t.derivedTasks++; if (r.done) t.derivedDone++; }
  };
  const byDepth = {};
  for (const d of ['L1', 'L2', 'L3']) {
    byDepth[d] = { all: mk(), phases: {} };
    for (const p of [0, 1, 2, 3, 4]) byDepth[d].phases[p] = mk();
    for (const r of list) if (LEVEL_ORDER[r.depth_level] <= LEVEL_ORDER[d]) { add(byDepth[d].all, r); add(byDepth[d].phases[r.phase], r); }
  }
  return { byDepth, current: byDepth[currentDepth] };
}

/** Group human/document requests into named sessions (short meetings) with their total minutes. */
function sessions(list) {
  const cfg = load().sessions || {};
  const m = {};
  for (const r of list) {
    if (!r.session) continue;
    const s = m[r.session] || (m[r.session] = { id: r.session, ...(cfg[r.session] || {}), minutes: 0, minutesInDepth: 0, requests: [], done: 0 });
    s.requests.push(r.id);
    s.minutes += r.minutes;
    if (r.inDepth) s.minutesInDepth += r.minutes;
    if (r.done) s.done++;
  }
  return Object.values(m).sort((a: any, b: any) => a.id.localeCompare(b.id));
}

/** Ranked "what I need from you" list: human/document requests that unblock the most failing criteria per minute. */
function ranking(planResult, limit = 8, currentPhase = -1) {
  const cands = planResult.requests.filter((r) => ['HUMAN', 'DOCUMENT'].includes(r.owner_kind) && r.inDepth && !r.done && r.status !== 'blocked');
  return cands
    .map((r) => ({ ...r, rankScore: r.impactScore / Math.sqrt(Math.max(1, r.minutes)) + (r.phase === currentPhase ? 0.3 : 0) }))
    .sort((a, b) => b.rankScore - a.rankScore || a.minutes - b.minutes || a.id.localeCompare(b.id))
    .slice(0, limit);
}

// ---------------------------------------------------------------- forms
function singleton(store, type) { return store.list(type)[0] || null; }

/** Resolve a prefill spec like {"from":"Product.name"}. */
function prefillValue(store, spec) {
  if (!spec) return undefined;
  if (spec.value !== undefined) return spec.value;
  if (spec.from) {
    const [type, field] = spec.from.split('.');
    const it = singleton(store, type);
    return it ? it[field] : undefined;
  }
  return undefined;
}

function options(store, ctx, spec) {
  return Q.select(ctx, spec).map((i) => ({ id: i.id, title: `${i.id}  ${i.title}` }));
}

/** The form to show for a request, with prefill and ref options resolved from the store. */
function formFor(store, id) {
  const r = get(id);
  if (!r) throw Object.assign(new Error(`request ${id} not found`), { status: 404 });
  const ctx = new Q.Ctx(store, {});
  const form = r.form ? JSON.parse(JSON.stringify(r.form)) : null;
  if (form) {
    for (const f of form.fields || []) {
      const pv = prefillValue(store, f.prefill);
      if (pv !== undefined && pv !== null) f.value = pv;
      if (f.options) f.optionList = options(store, ctx, f.options);
      if (f.example && !f.placeholder && typeof f.example === 'string') f.placeholder = f.example;
    }
  }
  const promptText = r.prompt ? fillPrompt(store, r.prompt) : null;
  return { id: r.id, owner_kind: r.owner_kind, title: r.title, ask: r.ask, minutes: r.minutes, form, prompt: promptText, ingest_format: r.ingest_format ? JSON.parse(fillPrompt(store, JSON.stringify(r.ingest_format))) : null, derive: r.derive || null, link_to: r.link_to || null, special: r.special || null };
}

/** Replace {{product}} style placeholders in an agent prompt. */
function fillPrompt(store, text) {
  const p = store.product();
  const comps = store.list('Competitor').map((c) => c.title).join(', ') || '(none yet)';
  const feats = store.list('Feature').filter((f) => f.priority === 'Must').map((f) => f.title).join('; ') || '(none yet)';
  return text.replace(/\{\{(\w+)\}\}/g, (m, k) => ({ product: p ? p.name : 'the product', asOf: store.today(), competitors: comps, mustFeatures: feats, id: '' }[k] || m));
}

// value coercion by schema field kind
function coerce(fd, raw) {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === 'string') raw = raw.trim();
  if (raw === '') return undefined;
  switch (fd && fd.kind) {
    case 'number': { const n = Number(typeof raw === 'string' ? raw.replace(/,/g, '') : raw); return Number.isNaN(n) ? raw : n; }
    case 'bool': return raw === true || /^(true|yes|y|1)$/i.test(String(raw));
    case 'list': case 'refs': return Array.isArray(raw) ? raw : String(raw).split(/[;,]/).map((s) => s.trim()).filter(Boolean);
    default: return raw;
  }
}

function interpolate(tpl, vars, local) {
  if (typeof tpl !== 'string') return tpl;
  const whole = /^\$([A-Za-z_][\w]*|\d+)$/.exec(tpl);
  const look = (k) => (local && local[k] !== undefined ? local[k] : vars[k]);
  if (whole) return look(whole[1]);
  return tpl.replace(/\$([A-Za-z_][\w]*|\d+)/g, (m, k) => { const v = look(k); return v === undefined || v === null || typeof v === 'object' ? '' : String(v); }).trim();
}

function buildFields(type, subtype, map, vars, local) {
  const fields: any = {};
  for (const [k, tpl] of Object.entries(map)) {
    const raw = interpolate(tpl, vars, local);
    const fd = k === 'title' || k === 'status' ? null : schema.fieldsFor(type, subtype).find((x) => x.name === k);
    const v = k === 'title' || k === 'status' ? (typeof raw === 'string' ? raw.trim() : raw) : coerce(fd, raw);
    if (v !== undefined && v !== '') fields[k] = v;
  }
  // "what is the price for" is one plain choice (per dealer a month, a flat fee ...); it fills in the metric, unit and billing way together
  if (type === 'PricePoint' && fields.price_for) { const pf = unitsMod.priceFor(fields.price_for); delete fields.price_for; if (pf) Object.assign(fields, pf); }
  return fields;
}

const fail = (list, headline?) => {
  const e: any = new Error(headline || (list.length === 1 ? list[0].message : `${list.length} answers need fixing: ${list.slice(0, 3).map((x) => x.message).join(' ')}${list.length > 3 ? ' ...' : ''}`));
  e.status = 422; e.errors = list.map((x) => x.message); e.validation = { fields: list };
  return e;
};

const whenHolds = (cond, payload) => {
  if (!cond) return true;
  const v = payload[cond.field];
  const s = v === undefined || v === null ? '' : String(v).trim();
  if (cond.in) return cond.in.map(String).includes(s);
  if (cond.not) return s !== '' && !cond.not.map(String).includes(s);
  return s !== '';
};

const todayWord = (store) => store.today();

/** Create (or reuse by title) the record behind a "new:Typed text" pick. Returns the value to put back in the cell. */
function createInline(store, spec, text, actor, origin, created) {
  const c = spec.create;
  const title = text.trim();
  if (!title) return '';
  const hit = store.list(c.type).find((i) => fk.normTitle(i.title) === fk.normTitle(title) && !schema.TERMINAL_STATUSES.has(i.status));
  if (hit) return spec.valueBy === 'title' ? hit.title : hit.id;
  const fields = { title };
  if (c.textField) fields[c.textField] = title;
  for (const [k, v] of Object.entries(c.set || {})) fields[k] = v === '$today' ? store.today() : v === '$actor' ? actor : v;
  const it = store.create(c.type, fields, { actor, origin, subtype: c.subtype });
  created.push(it.id);
  return spec.valueBy === 'title' ? it.title : it.id;
}

/**
 * Answer a HUMAN or DOCUMENT request (or the by-hand route of a research request): create/update items and links from the
 * submitted form values. Saving the same step again EDITS the records it made earlier (matched by the row they came from, then by name)
 * instead of adding copies. Returns { created:[ids], updated:[ids], links:n, removed:[ids] }.
 * opts: { route: 'form' | 'hand' }.
 */
function answer(store, id, payload, actor, opts: any = {}) {
  const r = get(id);
  if (!r) throw Object.assign(new Error(`request ${id} not found`), { status: 404 });
  const route = opts.route || 'form';
  if (route === 'hand') {
    if (r.owner_kind !== 'AGENT_RESEARCH' || !r.hand_form) throw Object.assign(new Error(`${id} cannot be filled in by hand`), { status: 422 });
  } else if (!['HUMAN', 'DOCUMENT'].includes(r.owner_kind)) throw Object.assign(new Error(`${id} is ${r.owner_kind}; it is not answered through a form`), { status: 422 });
  const form = route === 'hand' ? r.hand_form : r.form;
  if (!form) throw Object.assign(new Error(`${id} has no form`), { status: 422 });
  payload = payload || {};
  const snap = JSON.stringify(store.data);
  const vars: any = { today: store.today() };
  const origin = route === 'hand' ? 'human' : r.owner_kind === 'DOCUMENT' ? 'document' : 'human';
  const created = [];
  const updated = [];
  const removed = [];
  const notes = [];
  const aliases = {};
  let linkCount = 0;
  const problems = []; // { field, row, col, message }
  const rollback = () => store.replaceData(JSON.parse(snap));

  try {
    // ---- 1. read and check every answer
    const fieldByKey = Object.fromEntries((form.fields || []).map((f) => [f.key, f]));
    const lineFields = [];
    for (const f of form.fields || []) {
      if (f.kind !== 'lines' || (f.show_when && !whenHolds(f.show_when, payload))) continue;
      const rows = fk.applyDefaults(f, fk.normRows(payload[f.key], (f.lines && f.lines.separator) || '|'), vars.today);
      vars[f.key] = rows;
      lineFields.push({ f, rows });
    }
    for (const { f, rows } of lineFields) problems.push(...fk.validateRows(store, f, rows, { fieldRows: vars }));
    for (const f of form.fields || []) {
      if (f.show_when && !whenHolds(f.show_when, payload)) continue;
      const raw = payload[f.key];
      if (f.kind === 'lines') continue;
      const blank = raw === undefined || raw === null || String(raw).trim() === '';
      const needed = f.required || (f.required_when && whenHolds(f.required_when, payload));
      if (needed && (blank || (f.kind === 'bool' && raw !== true))) { problems.push({ field: f.key, message: `Please fill in "${f.label}" (it is required).` }); continue; }
      if (blank) { vars[f.key] = undefined; continue; }
      if (f.kind === 'enum') {
        const allowed = fk.valuesOf(f);
        const given = f.multi ? String(raw).split(',').map((x) => x.trim()).filter(Boolean) : [String(raw)];
        if (allowed.length && given.some((g) => !allowed.includes(g))) { problems.push({ field: f.key, message: `"${f.label}": choose one of the options (${allowed.map((a) => fk.labelOfValue(f, a)).join(', ')}).` }); continue; }
      }
      if (f.kind === 'number' && Number.isNaN(Number(String(raw).replace(/,/g, '')))) { problems.push({ field: f.key, message: `"${f.label}" must be a number (you typed "${plain.clip(raw, 20)}").` }); continue; }
      if (f.kind === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) { problems.push({ field: f.key, message: `"${f.label}" must be a date. Use the date picker.` }); continue; }
      if (f.kind === 'date') {
        const dp = units.dateRangeProblem(String(raw), store.today());
        if (dp && dp.level === 'error') { problems.push({ field: f.key, message: `"${f.label}": ${dp.message}` }); continue; }
        if (dp && !notes.includes('This date is far from today: check it is right.')) notes.push('This date is far from today: check it is right.');
      }
      vars[f.key] = f.kind === 'number' ? Number(String(raw).replace(/,/g, '')) : typeof raw === 'string' ? raw.trim() : raw;
    }
    if (problems.length) throw fail(problems);

    // ---- 2. records to create "inline" because the person picked "a new one" (a new question, release, assumption ...)
    for (const f of form.fields || []) {
      if (f.kind === 'ref' && f.create && typeof vars[f.key] === 'string' && vars[f.key].startsWith('new:')) {
        vars[f.key] = createInline(store, { create: f.create, valueBy: 'id' }, vars[f.key].slice(4), actor, origin, created);
        if (!vars[f.key]) problems.push({ field: f.key, message: `Type a name for the new ${plain.typeWord(f.create.type)}.` });
      }
    }
    for (const { f, rows } of lineFields) {
      (f.columns || []).forEach((c, ci) => {
        if (c.kind !== 'pick' || !c.pick || !c.pick.create) return;
        const sib = c.pick.siblings ? (vars[c.pick.siblings.field] || []).map((x) => fk.normTitle(x.cells[c.pick.siblings.col || 0])) : [];
        rows.forEach((row, ri) => {
          const v = fk.trim(row.cells[ci]);
          if (!v) return;
          if (v.startsWith('new:')) {
            const out = createInline(store, c.pick, v.slice(4), actor, origin, created);
            if (!out) problems.push({ field: f.key, row: ri + 1, col: c.key, message: `Row ${ri + 1}: type a name for the new ${plain.typeWord(c.pick.create.type)}.` }); else row.cells[ci] = out;
          } else if (c.pick.valueBy === 'title' && !sib.includes(fk.normTitle(v))) {
            const exists = store.list(c.pick.create.type).some((i) => fk.normTitle(i.title) === fk.normTitle(v));
            if (!exists) row.cells[ci] = createInline(store, c.pick, v, actor, origin, created);
          }
        });
      });
    }
    if (problems.length) throw fail(problems);
    for (const dv of form.derive_vars || []) {
      const src = String(vars[dv.from] === undefined ? '' : vars[dv.from]).split(',').map((x) => x.trim()).filter(Boolean);
      const test = (from, d) => { const v = String(vars[from] === undefined ? '' : vars[from]).split(',').map((x) => x.trim()).filter(Boolean); return d.includesAny ? d.includesAny.some((x) => v.includes(x)) : v.includes(d.includes); };
      // `also`: another answer that counts too, so one conclusion can rest on two questions (any one of them is enough)
      const hit = (dv.includesAny ? dv.includesAny.some((x) => src.includes(x)) : src.includes(dv.includes)) || (dv.also || []).some((al) => test(al.from, al));
      vars[dv.name] = hit ? dv.then : dv.else;
    }
    if (form.auto_release && !vars.release) { // a capacity must staff a release: use the first one, or make "Version 1" so nothing is blocked
      const rel = store.list('Release', (x) => !schema.TERMINAL_STATUSES.has(x.status)).sort((a, b) => (b.is_mvp ? 1 : 0) - (a.is_mvp ? 1 : 0) || a.id.localeCompare(b.id))[0];
      if (rel) { vars.release = rel.id; notes.push(`Linked to the release "${rel.title}".`); } else {
        const nr = store.create('Release', { title: 'Version 1', is_mvp: true, status: 'Planned' }, { actor, origin });
        nr.request_id = id; created.push(nr.id); vars.release = nr.id; notes.push('There was no release yet, so a first release called "Version 1" was created. Name it and set its dates when you plan the release.');
      }
    }

    const rowLocal = (row) => {
      if (!row) return null;
      const local: any = { line: row.text };
      row.cells.forEach((p, i) => { local[String(i + 1)] = p; });
      local.__parts = row.cells.length;
      return local;
    };
    const truthy = (expr, local) => {
      if (!expr) return true;
      const s = interpolate(expr, vars, local);
      if (s === undefined || s === null) return false;
      const str = String(s).trim();
      let m = /^(.*)==(.*)$/.exec(str);
      if (m) return m[1].trim() === m[2].trim();
      m = /^(.*)!=(.*)$/.exec(str);
      if (m) return m[1].trim() !== m[2].trim();
      return str !== '' && str !== 'false' && str !== 'undefined';
    };
    const rowsOfKey = (k) => (Array.isArray(vars[k]) ? vars[k] : []);
    /** Resolve a reference spec to a list of ids: @alias, title:Type:Title, flowof:STP-id, plain id or $var. */
    const resolveRef = (s, local) => {
      if (typeof s !== 'string') return [];
      if (s.startsWith('@')) return aliases[s.slice(1)] || [];
      const v = interpolate(s, vars, local);
      if (!v) return [];
      const str = String(v);
      let m = /^title:([A-Za-z]+):(.*)$/s.exec(str);
      if (m) {
        let hit = store.list(m[1]).filter((i) => fk.normTitle(i.title) === fk.normTitle(m[2]));
        const mineHit = hit.filter((i) => i.request_id === id);
        if (mineHit.length) hit = mineHit;
        if (!hit.length) { problems.push({ field: null, message: `Could not find a ${plain.typeWord(m[1])} called "${m[2].trim()}". Pick one from the list or add it first.` }); return []; }
        return [hit[hit.length - 1].id];
      }
      m = /^primary:([A-Za-z]+)$/.exec(str); // the main one of its kind (the primary customer group)
      if (m) { const hit = store.list(m[1]).filter((i) => i.primary); return hit.length ? [hit[hit.length - 1].id] : []; }
      m = /^failedge:(.+)$/.exec(str); // the failure paths that leave a flow step (the things a failure test exercises)
      if (m) return store.out(m[1].trim(), 'next').filter((x) => x.attrs && x.attrs.kind === 'failure').map((x) => x.id);
      m = /^edge:([^>]+)>(.+)$/s.exec(str); // the failure link that leaves step A and arrives at the step with this title
      if (m) { const hit = store.out(m[1].trim(), 'next').find((l) => (l.attrs || {}).kind === 'failure' && fk.normTitle((store.get(l.target) || {}).title) === fk.normTitle(m[2])); return hit ? [hit.id] : []; }
      m = /^flowof:(.+)$/.exec(str);
      if (m) { const l = store.inn(m[1].trim(), 'contains').find((x) => (store.get(x.source) || {}).type === 'Flow'); return l ? [l.source] : []; }
      return [str];
    };

    // ---- 3. records the person removed from a reopened list (only records this very step made)
    for (const rid of Array.isArray(payload.__removed) ? payload.__removed : []) {
      const it = store.get(rid);
      if (it && it.request_id === id) { store.remove(rid, { actor }); removed.push(rid); }
    }

    // ---- special handlers
    if (form.special === 'resolve_question') {
      const kind = vars.kind || 'answered';
      const res = questions.resolve(store, vars.question, kind, {
        answer: vars.answer,
        assumption: { title: String(vars.assumption_statement || '').trim().slice(0, 90), statement: vars.assumption_statement, owner: vars.owner, reconfirm_by: vars.reconfirm_by }, // named by what is assumed, not by a question number
        rationale: vars.rationale, approver: vars.approver, expiry_on: vars.expiry_on, requested_by: actor, pending: kind === 'waived',
      }, actor);
      updated.push(vars.question);
      if (res.assumption) created.push(res.assumption.id);
      if (res.waiver) created.push(res.waiver.id);
      let pendingApproval = null;
      if (res.pending) { // moving on without an answer needs the named person to agree; until then the question stays open
        const q = store.get(vars.question);
        pendingApproval = approvals.create(store, { kind: 'exception', subject: res.waiver.id, stage: q ? q.needed_by_gate : null, prepared_by: actor, approver: vars.approver,
          title: `Move on without an answer: ${q ? q.title : vars.question}`, statement: `${actor} asks ${vars.approver} to agree that the product moves on without an answer to "${q ? q.title : vars.question}" until ${vars.expiry_on}. Reason: ${vars.rationale}`,
          payload: { waiver: res.waiver.id, question: vars.question, request: id } });
        notes.push(`Waiting for ${vars.approver} to agree. Until they do, the question stays open.`);
      }
      markAnswered(store, id, actor, { created, updated, warnings: notes });
      return { created, updated, links: 0, removed, notes, pending: pendingApproval };
    }
    if (form.special === 'attest') {
      const sig: any = approvals.requestAttest(store, { criterion: form.criterion, gate: form.gate, role: form.role, by: vars.by || actor, note: vars.note }, actor, { request: id });
      if (sig && sig.pending) notes.push(sig.message);
      markAnswered(store, id, actor, { created, updated, warnings: notes });
      return { created, updated, links: 0, attested: sig && sig.pending ? undefined : form.criterion, removed, notes, pending: sig && sig.pending ? sig.approval : null };
    }
    if (form.special === 'approve_document') { // the one approval function, shared with the Approve button on the document page
      
      const r0 = compose.setStatus(store, form.document, { status: 'approved', role: compose.def(form.document).role, by: actor, second_approver: vars.approver, request: id }, actor);
      if (r0.pending) notes.push(r0.message);
      markAnswered(store, id, actor, { created, updated, warnings: notes });
      return { created, updated, links: 0, removed, notes, pending: r0.pending ? r0.approval : null };
    }

    for (const a of form.approve || []) {
      for (const it of Q.select(ctx0(store), { type: a.type, where: a.where })) {
        if (it.status !== 'Approved') { store.update(it.id, { status: 'Approved' }, { actor }); updated.push(it.id); }
      }
    }
    for (const ra of form.reviewAll || []) {
      for (const it of Q.select(ctx0(store), { type: ra.type, where: ra.where })) {
        const fields = buildFields(it.type, it.subtype, ra.set || {}, vars, null);
        store.update(it.id, fields, { actor }); updated.push(it.id);
      }
    }

    // ---- creation steps (idempotent: the same line again edits the record it made before)
    const primaryStep = {};
    for (const step of form.create || []) if (step.forEach && !primaryStep[step.forEach]) primaryStep[step.forEach] = step;
    const handMark = route === 'hand' ? { provenance: { agent: 'person', entered_by: actor, method: 'by_hand', retrieved_on: store.today() } } : null;
    for (const step of form.create || []) {
      if (step.skipIfExists && store.list(step.type).length) continue;
      const rows = step.forEach ? rowsOfKey(step.forEach) : [null];
      const made = [];
      const upsert = step.upsert !== undefined ? step.upsert : !!step.forEach;
      rows.forEach((row, idx) => {
        const local: any = rowLocal(row);
        if (local && step.minParts && local.__parts < step.minParts) { problems.push({ field: step.forEach, row: idx + 1, message: `Row ${idx + 1} needs at least ${step.minParts} boxes filled in.` }); return; }
        if (!truthy(step.when, local)) return;
        const sub = interpolate(step.subtype || '', vars, local) || undefined;
        const fields = buildFields(step.type, sub, step.map || {}, vars, local);
        try {
          let it = null;
          if (upsert) it = findExisting(store, id, step, fields, row, sub, primaryStep[step.forEach] === step);
          if (it) {
            const patch: any = {};
            for (const k of Object.keys(step.map || {})) { if (k === 'status' || k === 'price_for') continue; patch[k] = Object.prototype.hasOwnProperty.call(fields, k) ? fields[k] : undefined; }
            if (step.type === 'PricePoint') for (const k of ['value_metric', 'unit', 'billing_model', 'billing_period']) if (fields[k] !== undefined) patch[k] = fields[k];
            const changed = Object.entries(patch).some(([k, v]) => JSON.stringify(it[k]) !== JSON.stringify(v === undefined ? undefined : v));
            if (step.promote && (step.promote.from || []).includes(it.status)) patch.status = step.promote.to;
            const changed2 = changed || (patch.status && patch.status !== it.status);
            if (changed2) { store.update(it.id, patch, { actor }); if (!updated.includes(it.id)) updated.push(it.id); }
            if (!it.request_id) store.get(it.id).request_id = id;
          } else {
            it = store.create(step.type, { ...fields, ...(handMark || {}) }, { actor, origin: step.origin || origin, subtype: sub });
            it.request_id = id;
            created.push(it.id);
          }
          made.push(it.id);
        } catch (e) { problems.push({ field: step.forEach || null, row: row ? idx + 1 : undefined, message: friendlyStoreError(e, step, row ? idx + 1 : null) }); }
      });
      if (step.alias) aliases[step.alias] = made;
    }

    // ---- update steps
    for (const u of form.update || []) {
      const rows = u.forEach ? rowsOfKey(u.forEach) : [null];
      rows.forEach((row) => {
        const local = rowLocal(row);
        const holds = truthy(u.when, local);
        const targets = u.type && !u.id ? [singleton(store, u.type)].filter(Boolean).map((x) => x.id) : resolveRef(u.id, local);
        for (const tid of targets) {
          const it = store.get(tid);
          if (!it) { problems.push({ field: u.forEach || null, message: `Could not find ${tid}. It may have been deleted.` }); continue; }
          if (!holds) continue;
          const fields = buildFields(it.type, it.subtype, u.set || {}, vars, local);
          const patch = {};
          for (const k of Object.keys(u.set || {})) patch[k] = Object.prototype.hasOwnProperty.call(fields, k) ? fields[k] : undefined;
          // an optional box left empty on a single record clears nothing it did not own; only touch what was typed
          for (const k of Object.keys(patch)) if (patch[k] === undefined && u.keepEmpty !== false && !u.clearEmpty) delete patch[k];
          const changed = Object.entries(patch).some(([k, v]) => JSON.stringify(it[k]) !== JSON.stringify(v));
          if (changed) {
            try { store.update(tid, patch, { actor }); if (!updated.includes(tid)) updated.push(tid); } catch (e) { problems.push({ field: u.forEach || null, message: friendlyStoreError(e, { type: it.type }, null) }); }
          }
        }
        if (u.unsetWhenNot && !holds) { // e.g. a record that was "global" and now applies to one part only
          for (const tid of resolveRef(u.id, local)) { const it = store.get(tid); if (it && it[Object.keys(u.set || {})[0]] !== undefined) { store.update(tid, { [Object.keys(u.set)[0]]: undefined }, { actor }); if (!updated.includes(tid)) updated.push(tid); } }
        }
      });
    }

    // ---- link steps
    for (const l of form.links || []) {
      const rows = l.forEach ? rowsOfKey(l.forEach) : [null];
      rows.forEach((row) => {
        const local = rowLocal(row);
        const holds = truthy(l.when, local);
        if (!holds && !l.sync) return; // a connection that does not apply to this row is not even looked up
        const src = resolveRef(l.source, local);
        const tgt = resolveRef(l.target, local);
        if (l.sync) { // keep exactly the connections the row now says: drop the ones this row used to have
          const anchors = l.sync === 'target' ? tgt : src;
          const keep = new Set();
          if (holds) for (const s of src) for (const t of tgt) keep.add(l.sync === 'target' ? s : t);
          for (const a of anchors) {
            const old = l.sync === 'target' ? store.inn(a, l.type) : store.out(a, l.type);
            for (const lk of old) { const other = l.sync === 'target' ? lk.source : lk.target; if (!keep.has(other)) store.unlink(lk.id, { actor }); }
          }
        }
        if (!holds) return;
        const attrs = {};
        for (const [k, v] of Object.entries(l.attrs || {})) { const x = interpolate(v, vars, local); if (x !== undefined && x !== '') attrs[k] = x; }
        for (const s of src) for (const t of tgt) {
          try {
            const before = store.out(s, l.type).some((x) => x.target === t);
            store.ensureLink(l.type, s, t, attrs, { actor }); if (!before) linkCount++;
          } catch (e) { problems.push({ field: l.forEach || null, message: friendlyLinkError(e, l, s, t, store) }); }
        }
      });
      if (l.syncOthers && l.forEach) { // a ticked list means exactly these: records left unticked leave the chosen target
        const col0 = ((fieldByKey[l.forEach] || {}).columns || [])[0];
        if (col0 && col0.pick) {
          const chosen = new Set(rowsOfKey(l.forEach).map((r) => r.cells[0]));
          const tg = resolveRef(l.target, null);
          for (const o of fk.pickOptions(store, col0.pick)) if (!chosen.has(o.value)) for (const lk of store.out(o.value, l.type)) if (tg.includes(lk.target)) store.unlink(lk.id, { actor });
        }
      }
    }
    if (problems.length) throw fail(problems);

    // ---- side effects of the by-hand route that go beyond records (a signature)
    if (route === 'hand' && form.attest) {
      const by = vars[form.attest.by_field || 'signed_by'];
      if (by) {
        const sig: any = approvals.requestAttest(store, { criterion: form.attest.criterion, gate: form.attest.gate, role: form.attest.role, by, note: vars[form.attest.note_field || 'sign_note'] || `Entered and signed by hand by ${by}` }, actor, { request: id });
        if (sig && sig.pending) notes.push(sig.message);
      }
    }
  } catch (e) {
    rollback();
    throw e;
  }
  markAnswered(store, id, actor, { created, updated, route, warnings: notes });
  return { created, updated, links: linkCount, removed, notes };
}

/** Find the record an answer line is the new version of: the one it was loaded from, else one with the same name. */
function findExisting(store, requestId, step, fields, row, sub, isPrimary) {
  if (step.match === 'none') return null;
  if (row && row.id && isPrimary) { const it = store.get(row.id); if (it && it.type === step.type) return it; }
  const title = fields.title;
  if (!title) return null;
  const same = store.list(step.type, (i) => fk.normTitle(i.title) === fk.normTitle(title) && (!sub || i.subtype === sub) && !schema.TERMINAL_STATUSES.has(i.status) && constantsMatch(step.map, i));
  return same.find((i) => i.request_id === requestId) || same[0] || null;
}

/** Turn a store validation error ("category: x not in [...]") into a sentence a layman can act on. */
function friendlyStoreError(e, step, rowNo) {
  const where = rowNo ? `Row ${rowNo}: ` : '';
  const msgs = e.errors && e.errors.length ? e.errors : [e.message];
  return where + msgs.map((m) => {
    let x = String(m);
    const mm = /^([a-z_]+): "?(.*?)"? not in \[(.*)\]$/.exec(x);
    if (mm) return `"${mm[1].replace(/_/g, ' ')}" cannot be "${mm[2]}". Choose one of: ${mm[3].split(', ').join(', ')}.`;
    x = x.replace(/^status "(.*?)" is not valid for .*$/, 'That status is not allowed here.').replace(/ is required$/, ' is needed').replace(/^([a-z_]+) is needed$/, (a, n) => `"${n.replace(/_/g, ' ')}" is needed`);
    return plain.text(x.replace(/_/g, ' '));
  }).join(' ');
}
function friendlyLinkError(e, l, s, t, store) {
  const a = store.get(s); const b = store.get(t);
  const msgs = e.errors && e.errors.length ? e.errors.join('; ') : e.message;
  return `Could not connect "${a ? a.title : s}" to "${b ? b.title : t}": ${plain.text(msgs)}`;
}

function ctx0(store) { return new Q.Ctx(store, {}); }

function markAnswered(store, id, actor, info) {
  const prev = store.data.requestState[id] || {};
  store.data.requestState[id] = { status: 'answered', at: store.now(), by: actor, created: [...new Set([...(prev.status === 'answered' ? prev.created || [] : []), ...info.created])], updated: info.updated, warnings: info.warnings || [], route: info.route || 'form' };
  store.audit('request.answered', id, `${actor} ${prev.status === 'answered' ? 're-saved' : 'answered'} ${id}: ${info.created.length} item(s) created, ${info.updated.length} updated`, { actor });
}

function markNA(store, id, reason, actor) {
  if (!get(id)) throw Object.assign(new Error(`request ${id} not found`), { status: 404 });
  if (!reason || !String(reason).trim()) throw Object.assign(new Error('a reason is required to mark a request not applicable'), { status: 422 });
  store.data.requestState[id] = { status: 'na', reason: String(reason).trim(), at: store.now(), by: actor };
  store.audit('request.na', id, `${actor} marked ${id} not applicable: ${reason}`, { actor });
}
function reopenNA(store, id, actor) {
  const st = store.data.requestState[id];
  if (st && st.status === 'na') { delete store.data.requestState[id]; store.audit('request.na_undone', id, `${actor} reopened ${id} (it was marked not applicable)`, { actor }); }
}

// ---------------------------------------------------------------- reading the live records back into a form
const constantsMatch = (map, it) => Object.entries(map || {}).every(([k, tpl]) => typeof tpl !== 'string' || tpl.includes('$') || k === 'title' || k === 'status' || it[k] === tpl || (typeof tpl === 'string' && String(it[k]) === tpl));

/**
 * The answers as they stand in the store: for every field of the form, the value that would reproduce today's records.
 * Lines come back as [{ cells, id }]. Used to reopen a step that was answered before.
 */
function currentAnswers(store, id, which) {
  const r = get(id);
  const form = r && (which === 'hand' ? r.hand_form : r.form);
  if (!form) return {};
  const out: any = {};
  const fields = Object.fromEntries((form.fields || []).map((f) => [f.key, f]));
  const mine = (type, sub?) => store.all().filter((i) => i.type === type && (i.request_id === id) && (!sub || i.subtype === sub));
  const setCell = (cells, n, v) => { if (v === undefined || v === null || v === '') return; if (cells[n] === undefined || cells[n] === '') cells[n] = v; };
  const fin = (cells) => Array.from(cells, (c) => (c === undefined ? '' : c));

  // --- single values first (lines templates may use them, for example "$entity: $1")
  const scalar = (obj, map) => {
    for (const [k, tpl] of Object.entries(map || {})) {
      if (k === 'status') continue;
      const inv = fk.invertTemplate(tpl, k === 'title' ? obj.title : obj[k]);
      if (inv && !/^\d+$/.test(inv.name) && fields[inv.name] && fields[inv.name].kind !== 'lines' && out[inv.name] === undefined && inv.value !== '') out[inv.name] = fields[inv.name].kind === 'bool' ? obj[k] === true : inv.value;
    }
  };
  for (const step of form.create || []) {
    if (step.forEach) continue;
    const it = mine(step.type)[0];
    if (it) scalar(it, step.map);
  }
  for (const u of form.update || []) {
    if (u.forEach || !(u.type && !u.id)) continue;
    const it = singleton(store, u.type);
    if (it) scalar(it, u.set);
  }
  for (const f of form.fields || []) {
    if (out[f.key] !== undefined || f.kind === 'lines') continue;
    const pv = prefillValue(store, f.prefill);
    if (pv !== undefined && pv !== null && pv !== '') out[f.key] = Array.isArray(pv) ? pv.join(',') : pv;
  }
  // the record a single pick points at (for example the release a capacity staffs)
  for (const l of form.links || []) {
    if (l.forEach) continue;
    const m = /^\$(\w+)$/.exec(l.source || '');
    const alias = /^@(\w+)$/.exec(l.target || '');
    if (m && alias && fields[m[1]] && out[m[1]] === undefined) {
      const step = (form.create || []).find((c) => c.alias === alias[1]);
      const made = step && mine(step.type)[0];
      const lk = made && store.inn(made.id, l.type)[0];
      if (lk) out[m[1]] = lk.source;
    }
  }

  // --- lines produced by a creation step
  const primary = {};
  for (const step of form.create || []) if (step.forEach && !primary[step.forEach] && fields[step.forEach]) primary[step.forEach] = step;
  for (const [key, step] of Object.entries(primary)) {
    const items = mine((step as any).type, typeof (step as any).subtype === 'string' && !(step as any).subtype.includes('$') ? (step as any).subtype : undefined).filter((i) => constantsMatch((step as any).map, i)).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    out[key] = items.map((it) => rowFromItem(store, form, key, step, it, out));
  }
  // --- lines whose rows are fixed to existing records (estimate per feature, persona per story ...)
  for (const f of form.fields || []) {
    if (f.kind !== 'lines' || !f.lines || !f.lines.fixed) continue;
    const key = f.key;
    const items = fk.pickOptions(store, f.lines.fixed).map((o) => store.get(o.value)).filter(Boolean);
    out[key] = items.map((it) => {
      const cells = [it.id];
      for (const u of form.update || []) {
        if (u.forEach !== key) continue;
        const w = u.when ? /^\$(\d+)==(.+)$/.exec(u.when) : null;
        for (const [k, tpl] of Object.entries(u.set || {})) {
          const inv = fk.invertTemplate(tpl, it[k]);
          if (inv && /^\d+$/.test(inv.name)) setCell(cells, Number(inv.name) - 1, fk.showValue(inv.value));
          else if (w && it[k] === true) setCell(cells, Number(w[1]) - 1, w[2].trim());
        }
      }
      for (const l of form.links || []) {
        if (l.forEach !== key || l.source !== '$1') continue;
        const t = store.out(it.id, l.type).map((lk) => store.get(lk.target)).find(Boolean);
        const m = /^\$(\d+)$/.exec(l.target || '');
        if (t && m) setCell(cells, Number(m[1]) - 1, t.id);
      }
      return { cells: fin(cells), id: it.id };
    });
  }
  // --- checklists: the records already chosen
  for (const f of form.fields || []) {
    if (f.kind !== 'lines' || !f.lines || f.lines.style !== 'checklist' || out[f.key] !== undefined) continue;
    const link = (form.links || []).find((l) => l.forEach === f.key);
    if (!link) continue;
    const items = fk.pickOptions(store, f.columns[0].pick).map((o) => store.get(o.value)).filter(Boolean).filter((it) => store.out(it.id, link.type).length);
    out[f.key] = items.map((it) => ({ cells: [it.id], id: it.id }));
  }
  if (form.special === 'attest') {
    const a = store.data.attestations.find((x) => x.criterion === form.criterion && !x.withdrawn);
    if (a) { out.by = a.by; if (a.note) out.note = a.note; }
  }
  return out;
}

/** The form row that would re-create an existing record (and the connections it has). */
function rowFromItem(store, form, key, step, it, known) {
  const cells = [];
  const setCell = (n, v) => { if (v === undefined || v === null || v === '') return; if (cells[n] === undefined || cells[n] === '') cells[n] = v; };
  for (const [k, tpl] of Object.entries(step.map || {})) {
    if (k === 'status') continue;
    if (k === 'price_for') { // "what is the price for" is one choice that stands for the metric, unit and billing way
      const pf = unitsMod.PRICE_FOR.find((x) => x.f.value_metric === it.value_metric && x.f.unit === it.unit && x.f.billing_model === it.billing_model);
      const mm = /^\$(\d+)$/.exec((tpl as any));
      if (pf && mm) setCell(Number(mm[1]) - 1, pf.v);
      continue;
    }
    const inv = fk.invertTemplate(tpl, k === 'title' ? it.title : it[k], known);
    if (inv && /^\d+$/.test(inv.name)) setCell(Number(inv.name) - 1, fk.showValue(inv.value));
  }
  // columns that live on a connection (the question that settles a line, the module a feature belongs to ...)
  for (const l of form.links || []) {
    if (l.forEach !== key) continue;
    const srcSide = typeof l.source === 'string' && l.source.startsWith(`title:${step.type}:`);
    const tgtSide = typeof l.target === 'string' && l.target.startsWith(`title:${step.type}:`);
    if (!srcSide && !tgtSide) continue;
    const otherTpl = srcSide ? l.target : l.source;
    const linksOf = srcSide ? store.out(it.id, l.type) : store.inn(it.id, l.type);
    const lk = linksOf.find((x) => store.get(srcSide ? x.target : x.source));
    const other = lk && store.get(srcSide ? lk.target : lk.source);
    if (!other) continue;
    const mId = /^\$(\d+)$/.exec(otherTpl);
    const mTitle = /^title:[A-Za-z]+:(.+)$/.exec(otherTpl);
    if (mId) setCell(Number(mId[1]) - 1, other.id);
    else if (mTitle) { const inv2 = fk.invertTemplate(mTitle[1], other.title, known); if (inv2 && /^\d+$/.test(inv2.name)) setCell(Number(inv2.name) - 1, inv2.value); }
    // the other record is also made by this step (a person typed on the same row): read its boxes too
    for (const s2 of form.create || []) {
      if (s2 === step || s2.forEach !== key || s2.type !== other.type) continue;
      for (const [k2, tpl2] of Object.entries(s2.map || {})) { if (k2 === 'status') continue; const inv3 = fk.invertTemplate(tpl2, k2 === 'title' ? other.title : other[k2], known); if (inv3 && /^\d+$/.test(inv3.name)) setCell(Number(inv3.name) - 1, fk.showValue(inv3.value)); }
    }
    // the link's own attributes (for example whether a customer quote backs a job or goes against it)
    for (const av of Object.values(l.attrs || {})) {
      const mm = /^\$(\d+)$/.exec((av as any));
      const akey = Object.keys(l.attrs).find((k) => l.attrs[k] === av);
      if (mm && lk.attrs && lk.attrs[akey] !== undefined) setCell(Number(mm[1]) - 1, lk.attrs[akey]);
    }
  }
  return { cells: Array.from(cells, (c) => (c === undefined ? '' : c)), id: it.id };
}

// ---------------------------------------------------------------- DERIVED steps that run by themselves
const sigOf = (store) => { let rev = 0; for (const i of Object.values(store.data.items)) rev += (i as any).rev || 1; return `${Object.keys(store.data.items).length}:${store.data.linkList.length}:${rev}`; };

/** Run a DERIVED request. opts.auto: the tool ran it on its own (no audit noise when it changed nothing). */
function runDerive(store, id, actor, opts: any = {}) {
  const r = get(id);
  if (!r || r.owner_kind !== 'DERIVED') throw Object.assign(new Error(`${id} is not a DERIVED request`), { status: 422 });
  const res = derive.run(store, r.derive, r.derive_args || {}, actor, id);
  store.data.requestState[id] = { status: 'derived', at: store.now(), by: actor, created: res.created, message: res.message, report: res.report || null, auto_sig: sigOf(store), auto: !!opts.auto };
  if (!opts.auto || (res.created || []).length) store.audit('request.derived', id, `${id} ${opts.auto ? 'was prepared automatically' : 'generated'}: ${res.message}`, { actor });
  return res;
}

/** How far ahead the tool prepares drafts: the stage the person is in (or has already answered questions of), plus one. */
function autoHorizon(store) {
  
  let furthest = stages.earliestOpen(store);
  for (const [id, st] of Object.entries(store.data.requestState || {})) { const r = get(id); if (r && st && ['answered', 'na', 'skipped'].includes((st as any).status) && r.phase > furthest) furthest = r.phase; }
  return Math.min(4, furthest) + 1;
}

/**
 * Run every derived step whose inputs now exist (and whose inputs changed since it last ran), until nothing changes.
 * Returns the ids that did something. Steps marked auto:false stay behind a "Do this for me" button.
 */
function autoDerive(store, actor = 'the tool') {
  const ran = [];
  for (let pass = 0; pass < 6; pass++) {
    const p = plan(store);
    let any = false;
    const horizon = autoHorizon(store);
    for (const r of p.requests) {
      if (r.owner_kind !== 'DERIVED' || !r.inDepth || r.auto === false || r.blockedBy.length || r.phase > horizon) continue;
      const st = store.data.requestState[r.id];
      const sig = sigOf(store);
      if (st && st.status === 'derived' && st.auto_sig === sig) continue;
      const before = sigOf(store);
      let res;
      try { res = runDerive(store, r.id, actor, { auto: true }); } catch (e) { continue; }
      if (sigOf(store) !== before) any = true;
      if (((res.created || []).length || !st) && !ran.includes(r.id)) ran.push(r.id);
    }
    if (!any) break;
  }
  return ran;
}

/** The things the person must actually do (or let the tool do) before `r` can open. Derived steps are followed through to their own inputs. */
function waitingFor(planRequests, r, seen = new Set(), via = null) {
  const byId = planRequests._byId || (planRequests._byId = Object.fromEntries(planRequests.map((x) => [x.id, x])));
  const out = [];
  for (const d of r.blockedBy || []) {
    const b = byId[d];
    if (!b || seen.has(d)) continue;
    seen.add(d);
    if (b.blockedBy && b.blockedBy.length) out.push(...waitingFor(planRequests, b, seen, via || b)); else out.push(via ? Object.assign(Object.create(b), { via }) : b);
  }
  return out;
}

export { load, rowFromItem, reload, requests, get, plan, ranking, totals, sessions, formFor, answer, markNA, reopenNA, runDerive, autoDerive, autoHorizon, waitingFor, currentAnswers, evalDone, agentState, fillPrompt, LEVEL_ORDER, sigOf };
