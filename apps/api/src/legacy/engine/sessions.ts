/**
 * engine/sessions.ts - guided work: the data-request plan grouped into named sessions with a generic wizard definition.
 *
 * GET shape: phases[] > sessions[] > steps[]; every step carries a `form` (fields with label, help, example, required, type,
 * choices written in plain words, typed columns for repeatable lists, and the answers as they stand now) so a frontend can
 * render any step without per-step code. POST a step with answers (creates or EDITS items and links through the engine),
 * or skip it with a reason, mark it not applicable, or fill a research step in by hand.
 *
 * Rules this file keeps:
 *  - nothing a person has to type is a code word or a record id: choices are drop-downs and pick-lists written in words
 *  - a finished step can always be reopened and edited; saving again edits the same records
 *  - a step that is waiting says which step (or action) unlocks it, and the tool runs its own steps automatically
 */
import * as requests from './requests';
import * as gates from './gates';
import * as agent from './agent';
import * as fk from './formkit';
import * as words from './words';
import * as plain from './plain';
import * as Q from './query';
import * as approvals from './approvals';
import * as unitsMod from './units';
import * as dashboardMod from './dashboard';

const httpErr = (status, message, extra?) => Object.assign(new Error(message), { status }, extra || {});
const TYPE_OF = { person: 'person', text: 'text', longtext: 'longtext', enum: 'choice', bool: 'yes_no', lines: 'lines', ref: 'pick_item', date: 'date', number: 'number' };

/** Which assistant goal can answer a step from an uploaded document (null = a person has to answer). */
const ASSIST_GOAL = { 'DR-0-04': 'stakeholders', 'DR-0-05': 'stakeholders', 'DR-1-03': 'competitor_profile', 'DR-1-11': 'competitor_prices', 'DR-1-14': 'capabilities', 'DR-1-15': 'competitor_prices', 'DR-1-16': 'competitor_profile', 'DR-3-10': 'requirements_from_document', 'DR-2-11': 'requirements_from_document', 'DR-4-08': 'requirements_from_document' };

const DECISION_LABELS = { go: 'Go - move on to the next stage', go_with_conditions: 'Go, with follow-ups to close later', hold: 'Hold for now', recycle: 'Go back and redo an earlier stage', stop: 'Stop the product' };
const DECISION_HINTS = {
  go: 'Everything required is in place (some items may be covered by an agreed exception). Needs a second person to confirm. The next stage opens.',
  go_with_conditions: 'Go ahead, with named follow-ups that must be closed by a later stage. Needs a second person to confirm.',
  hold: 'Pause. Nothing is lost. Look at it again in 14 days.',
  recycle: 'Send the work back to an earlier stage to redo it.',
  stop: 'End the product. It is marked as stopped.',
};
/** The required items that are still missing, each once and by name, with where to fix it. */
function missingItems(store, phase) {
  const view = plain.stageView(gates.evaluateGate(store, phase));
  const seen = new Set();
  const reqs = requests.requests();
  return view.items.filter((i) => i.kind === 'required' && !i.done).filter((i) => (seen.has(i.need) ? false : seen.add(i.need))).map((i) => {
    const q = reqs.find((x) => x.session && ((x.why && x.why.criteria) || []).includes(i.id) && x.owner_kind !== 'DERIVED');
    return { need: i.need, todo: i.todo, stage_link: `#/gates/${phase}`, work: q ? { session: q.session, request: q.id, title: q.title } : null };
  });
}

// ------------------------------------------------------------------ profile-dependent text
function pick(r, key, prof) {
  const v = r.variants && r.variants[prof.audience];
  return (v && v[key] !== undefined) ? v[key] : r[key];
}
function naHint(r, prof) {
  const h = r.na_hint;
  if (!h) return null;
  if (typeof h === 'string') return h;
  return h[prof.audience] || h.default || null;
}

// ------------------------------------------------------------------ one field / one column, resolved for the browser
const labelled = (vals) => (vals || []).map((v) => (v && typeof v === 'object' ? { value: v.value, label: v.label, hint: v.hint || null } : { value: String(v), label: fmtValue(v), hint: null }));
function fmtValue(v) { const s = String(v).replace(/[_-]+/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1); }

function resolveColumn(store, r, f, c, prof) {
  const out: any = {
    key: c.key, label: c.label, kind: c.kind, required: !!c.required, required_when: c.required_when || null, enabled_when: c.enabled_when || null, help: c.help || null, advanced: !!c.advanced,
    default: c.default === undefined ? null : c.default === '$today' ? store.today() : c.default, min: c.min === undefined ? null : c.min, max: c.max === undefined ? null : c.max,
    example: fk.exampleFor(r.id, `${f.key}.${c.key}`, prof, c.example),
  };
  if (c.kind === 'choice') out.values = c.values_from === 'price_for' ? unitsMod.priceChoices(prof).map((x) => ({ value: x.value, label: x.label, hint: null })) : labelled(c.values);
  if (c.kind === 'yesno') out.values = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];
  if (c.kind === 'pick' && c.pick) {
    const sp = c.pick;
    out.pick = { value_by: sp.valueBy || 'id', none_text: sp.none_text || null, siblings: sp.siblings || null, create: sp.create ? { label: sp.create.label || `A new ${words.typeWord(sp.create.type)}...`, type: sp.create.type, type_word: words.typeWord(sp.create.type) } : null, types: (sp.types || [sp.type]).filter(Boolean).map((t) => ({ type: t, word: words.typeWord(t) })) };
    out.options = fk.pickOptions(store, sp).map((o) => ({ value: o.value, label: o.label, title: o.title, hint: o.hint, extra: !!o.extra, type: o.type || null }));
  }
  if (c.suggest) out.suggest = c.suggest.values ? c.suggest.values : fk.pickOptions(store, c.suggest).map((o) => o.title);
  return out;
}

function resolveField(store, r, f, prof, formRef, which) {
  const o: any = {
    key: f.key, label: f.label, type: f.multi ? 'multi_choice' : (TYPE_OF[f.kind] || 'text'), required: !!f.required, required_when: f.required_when || null, show_when: f.show_when || null,
    help: f.help || null, example: fk.exampleFor(r.id, f.key, prof, f.example), default: null, empty_text: f.empty_text || null,
  };
  if (f.kind === 'enum') o.values = labelled(f.values);
  if (f.kind === 'ref') {
    const opts = fk.pickOptions(store, f.options).filter((x) => !f.options.limit);
    o.options = opts.map((x) => ({ value: x.value, label: x.label, title: x.title, hint: x.hint }));
    if (f.create) o.create = { label: f.create.label || `A new ${words.typeWord(f.create.type)}...`, type: f.create.type, type_word: words.typeWord(f.create.type) };
  }
  if (f.kind === 'lines') {
    const cols = (f.columns || []).map((c) => resolveColumn(store, r, f, c, prof));
    const exampleRow = cols.map((c) => (c.example === null || c.example === undefined ? '' : String(c.example)));
    const L = f.lines || {};
    o.lines = {
      columns: cols.map((c) => c.key), cols, min_parts: 1, separator: '|', style: L.style || 'rows', add_label: L.add_label || 'Add another row', row_label: L.row_label || 'Row', min_rows: f.min_rows || 0,
      example_row: exampleRow.some(Boolean) ? exampleRow : null,
      fixed: L.fixed ? fk.pickOptions(store, L.fixed).map((x) => ({ value: x.value, label: x.title, hint: x.hint })) : null,
    };
  }
  return o;
}

/** Fields of a form (or of the by-hand form of a research step), with the answers as they stand. */
function buildForm(store, r, form, prof, which?) {
  const fields = (form.fields || []).map((f) => resolveField(store, r, f, prof, form, which));
  const values: any = requests.currentAnswers(store, r.id, which === 'hand' ? 'hand' : undefined);
  // starter rows: suggested rows to begin with (the riskiest assumptions, the competitors already named ...)
  for (const f of form.fields || []) {
    if (f.kind !== 'lines' || !f.lines || !f.lines.starter) continue;
    const st = f.lines.starter;
    const ctx = new Q.Ctx(store, {});
    let items = Q.select(ctx, { type: st.type, ...(st.where ? { where: st.where } : {}) });
    if (st.orderBy) items = items.sort((a, b) => (b[st.orderBy] || 0) - (a[st.orderBy] || 0) || a.id.localeCompare(b.id));
    if (st.n) items = items.slice(0, st.n);
    const primary = (form.create || []).find((s) => s.forEach === f.key);
    const rows = items.map((it) => (st.as === 'invert' && primary ? requests.rowFromItem(store, form, f.key, primary, it, values) : { cells: [it.id], id: st.as === 'id' ? undefined : it.id }));
    if (st.always) values[f.key] = rows;
    else {
      const have = new Set((values[f.key] || []).map((x) => x.cells[0]));
      values[f.key] = [...(values[f.key] || []), ...rows.filter((x) => !have.has(x.cells[0]))];
      values.__starter = (values.__starter || []).concat([f.key]);
    }
  }
  const example = {};
  for (const f of fields) { if (f.type === 'lines') { if (f.lines.example_row) example[f.key] = f.lines.example_row.slice(0, f.lines.cols.length).join(' | '); } else if (f.example) example[f.key] = f.example; }
  return { fields, values, example_answer: Object.keys(example).length ? example : null, attest: form.special === 'attest' ? { role: form.role } : null };
}

// ------------------------------------------------------------------ step kinds
function stepKind(r) {
  const sp = (r.form && r.form.special) || r.special || null;
  if (r.owner_kind === 'AGENT_RESEARCH') return 'agent_research';
  if (r.owner_kind === 'DERIVED') return 'derived';
  if (sp === 'gate_decision') return 'gate_decision';
  if (sp === 'attest') return 'attestation';
  if (sp === 'resolve_question') return 'resolve_question';
  if (sp === 'open_review') return 'review_drafts';
  if (sp === 'open_queue') return 'verify_agent_items';
  return r.form ? 'form' : 'info';
}

/** Wizard form definition for one request. */
function formDefinition(store, r, ctx) {
  const prof = fk.profile(store, ctx);
  const kind = stepKind(r);
  const base = { kind, link_to: r.link_to || null, read_doc: r.read_doc || null };
  if (kind === 'gate_decision') {
    const ev = gates.evaluateGate(store, r.phase);
    return { ...base, fields: [
      { key: 'decision', label: 'Your decision', type: 'choice', required: true, values: ev.eligible.map((v) => ({ value: v, label: DECISION_LABELS[v] || v, hint: DECISION_HINTS[v] || null })), help: plain.eligibleText(ev), example: null },
      { key: 'approver', label: 'Who approves this sign-off?', type: 'person', required: false, show_when: { field: 'decision', in: ['go', 'go_with_conditions'] }, required_when: { field: 'decision', in: ['go', 'go_with_conditions'] }, help: 'Nobody approves their own work. This person is asked, and the stage counts as signed off only when they say yes.' },
      { key: 'rationale', label: 'Why? (written for the record)', type: 'longtext', required: false },
      { key: 'conditions', label: 'Follow-ups (only when you move on with follow-ups)', type: 'lines', required: false, help: 'What must be done, by whom, and by which stage.', lines: { columns: ['text', 'owner', 'must_close_by_gate'], cols: [{ key: 'text', label: 'What must be done?', kind: 'text', required: true }, { key: 'owner', label: 'Who does it?', kind: 'text' }, { key: 'gate', label: 'Close it by which stage?', kind: 'choice', values: [0, 1, 2, 3, 4].map((n) => ({ value: String(n), label: `Stage ${n}` })) }], add_label: 'Add a follow-up', row_label: 'Follow-up', style: 'rows' } },
      { key: 'recycle_to', label: 'Go back to which stage? (only when you go back)', type: 'number', required: false },
    ], values: {}, missing_items: missingItems(store, r.phase), signed_off: ev.eligible.includes('go') || ev.eligible.includes('go_with_conditions') ? false : undefined };
  }
  if (kind === 'review_drafts') return { ...base, fields: [{ key: 'ids', label: 'Drafts you have read', type: 'lines', required: true, help: 'Normally you accept the drafts on the list page. Use this only to say "I have read them all".', lines: { columns: ['item'], cols: [{ key: 'item', label: 'Draft', kind: 'text' }], add_label: 'Add another', row_label: 'Draft' } }], values: {} };
  if (kind === 'verify_agent_items') return { ...base, fields: [], values: {} };
  if (kind === 'derived') return { ...base, fields: [], values: {} };
  if (kind === 'agent_research') {
    const base0 = requests.formFor(store, r.id);
    const hand: any = r.hand_form ? { available: true, ...buildForm(store, r, r.hand_form, prof, 'hand'), minutes: r.minutes || null } : { available: false };
    if (r.hand_link) hand.link = r.hand_link;
    return { ...base, fields: [], values: {}, routes: { hand, outside_ai: { prompt: base0.prompt || null, ingest_format: base0.ingest_format || null } }, prompt: base0.prompt || null, ingest_format: base0.ingest_format || null };
  }
  if (!r.form) return { ...base, fields: [], values: {} };
  const built = buildForm(store, r, r.form, prof);
  return { ...base, ...built };
}

// ------------------------------------------------------------------ explaining a step in words
/** Replace record codes in an engine sentence with the names people gave the records. */
const nameIds = (store, s) => String(s || '').replace(/\b[A-Z]{2,4}-\d{3,4}\b/g, (m) => { const i = store.get(m); return i && i.title ? '"' + words.clip(i.title, 50) + '"' : m; });

function reasonNotDone(store, r) {
  if (r.done) return null;
  const titles = [...new Set((r.doneOffenders || []).map((o) => words.clip(words.text(nameIds(store, o.title || o.id)) + (o.reason && r.reasonsInDetail ? ` (${words.text(nameIds(store, o.reason))})` : ''), 90)))];
  if (r.pending) {
    const msg = (titles.length ? r.pending : r.pending.split(/(?<=\.)\s+/).filter((sn) => !sn.includes('{offenders}')).join(' ') || r.pending.replace(/\s*[^.]*\{offenders\}[^.]*\./, '')).replace('{offenders}', words.list((titles as any), 4)).replace('{message}', words.text((r.doneDetail || [])[0] || r.doneMessage || '').replace(/[.]+$/, '.'));
    return words.text(msg);
  }
  const need = (r.doneCriteria || []).map((id) => plain.needOf(id)).filter(Boolean);
  const bits = [];
  if (need.length) bits.push(`The sign-off still needs: ${words.list(need, 3).replace(/\.$/, '')}.`);
  else if (r.doneMessage && !/^rule error/.test(r.doneMessage) && !titles.length) bits.push(`Still missing: ${words.text(r.doneMessage).replace(/\.$/, '')}.`);
  if (titles.length) bits.push(`Not yet satisfied: ${words.list((titles as any), 4)}.`);
  const why = (r.doneOffenders || []).map((o) => o.reason).filter(Boolean).slice(0, 2).map((x) => words.text(nameIds(store, x)));
  if (why.length && !r.pending) bits.push(`Why: ${why.join('; ')}.`);
  return bits.join(' ') || null;
}

/** Which kinds of record a step's work ends up as, when a second person has to check what the first typed in. */
const CHECK_TYPES = { 'DR-1-08': ['Opportunity'], 'DR-1-14': ['CompetitorCapability'], 'DR-1-15': ['PricePoint'], 'DR-1-16': ['CompetitorCapability', 'PricePoint'], 'DR-1-18': ['Evidence'] };
/** How many things entered for this step are waiting for a second person (hand-typed ratings, prices, customer words). */
function waitingChecks(store, r) {
  const types = CHECK_TYPES[r.id];
  if (!types) return 0;
  return store.all().filter((i) => types.includes(i.type) && agent.needsVerification(i)).length;
}

function stepSummary(store, r, state, withForm, ctx) {
  const prof = fk.profile(store, ctx);
  const rs = store.data.requestState[r.id] || null;
  const waitAll = waitingChecks(store, r);
  const waitCheck = r.done ? 0 : waitAll;
  // a step that was skipped, but whose work has since been done elsewhere (ratings typed on the competitor pages ...) is not "skipped" any more:
  // it is done when its rule holds, and "waiting for a second person" while the only thing missing is the check
  const skipped = !!(rs && rs.status === 'skipped') && !waitCheck;
  const kind = stepKind(r);
  const title = pick(r, 'title', prof); const ask = pick(r, 'ask', prof);
  const waiting = r.status === 'blocked' && !r.done ? requests.waitingFor(state.requests, r).map((b) => ({
    request_id: b.id, title: b.title, unlocks: b.via ? b.via.title : null, session: b.session || b.auto_session || null, kind: b.owner_kind === 'DERIVED' ? 'derived' : b.owner_kind === 'AGENT_RESEARCH' ? 'agent_research' : 'form',
    can_run: b.owner_kind === 'DERIVED' && !(b.blockedBy || []).length && b.auto === false, why: b.owner_kind === 'DERIVED' ? 'The tool does this by itself once its inputs exist.' : null,
  })) : [];
  const s: any = {
    question: ask, can_be_answered_by_document: !!ASSIST_GOAL[r.id], assist_goal: ASSIST_GOAL[r.id] || null,
    request_id: r.id, title, ask, why_plain: pick(r, 'why_plain', prof) || null, minutes: r.minutes, owner_kind: r.owner_kind, kind, phase: r.phase, depth_level: r.depth_level, in_depth: r.inDepth,
    status: r.done ? (r.na ? 'not_applicable' : 'done') : skipped ? 'skipped' : (waitCheck && r.status === 'ready') ? 'in_progress' : r.status, waiting_for_check: waitAll, blocked_by: r.blockedBy, waiting_for: waiting, done_message: r.doneMessage, feeds_criteria: (r.why && r.why.criteria) || [], feeds_plain: ((r.why && r.why.criteria) || []).filter((id) => !/^GC-/.test(id)).map((id) => plain.needOf(id, null)).filter((t, i, arr) => t && arr.indexOf(t) === i), creates: r.creates,
    skipped_reason: skipped ? rs.reason : null, na_reason: r.na && rs ? rs.reason : null, answered_at: skipped ? null : r.answeredAt, answered_by: skipped ? null : r.answeredBy,
    not_done_reason: r.status === 'blocked' ? null : (waitCheck ? `Entered, and waiting for a second person: ${waitCheck} ${waitCheck === 1 ? 'item has' : 'items have'} not been checked yet. Someone other than the person who typed ${waitCheck === 1 ? 'it' : 'them'} in opens "Things to check" and says where they checked.` : reasonNotDone(store, r)),
    na: { allowed: !!r.na_allowed, hint: naHint(r, prof), is_na: !!r.na }, editable: ['form', 'attestation', 'resolve_question', 'agent_research'].includes(kind) && (!!r.form || !!r.hand_form),
    read_doc: r.read_doc || null, list_label: r.list_label || null, link_to: r.link_to || null, auto_session: r.auto_session || null,
    nothing_to_do: r.done && !r.na && !r.answeredAt && ['resolve_question', 'review_drafts', 'verify_agent_items'].includes(kind),
    last_notes: rs && rs.warnings && rs.warnings.length ? rs.warnings : null,
    approval_waiting: (() => { const w = approvals.list(store).find((x) => approvals.statusOf(store, x) === 'waiting' && ((x.payload && x.payload.request) === r.id || (kind === 'gate_decision' && x.kind === 'stage_decision' && x.subject === `gate-${r.phase}`))); return w ? { id: w.id, approver: w.approver, title: w.title, since: w.created_at, prepared_by: w.prepared_by } : null; })(),
  };
  if (r.review_list) s.review_items = fk.pickOptions(store, { type: r.review_list.type, where: r.review_list.where }).map((o) => ({ label: o.title, hint: o.hint }));
  if (kind === 'derived') { const d = store.data.requestState[r.id]; s.auto = { later: r.phase > requests.autoHorizon(store) && !(d && d.status === 'derived'), stage: r.phase, ran: !!(d && d.status === 'derived'), message: d && d.message ? words.text(nameIds(store, d.message)) : null, auto: r.auto !== false }; }
  if (withForm) s.form = formDefinition(store, r, ctx);
  return s;
}

/** GET /api/sessions */
function list(store, opts: any = {}) {
  const plan = requests.plan(store);
  const prof = fk.profile(store, opts.ctx);
  const byPhase = {};
  const names = dashboardMod.PHASE_NAMES;
  for (const sess of plan.sessions) {
    const reqs = ordered(plan.requests.filter((r) => r.session === (sess as any).id));
    const inDepth = reqs.filter((r) => r.inDepth);
    const steps = reqs.map((r) => stepSummary(store, r, plan, opts.forms !== false, opts.ctx));
    const autos = plan.requests.filter((r) => r.owner_kind === 'DERIVED' && r.auto_session === (sess as any).id && r.inDepth).sort((a, b) => a.id.localeCompare(b.id))
      .map((r) => stepSummary(store, r, plan, false, opts.ctx));
    const done = inDepth.filter((r) => r.done).length;
    const next = steps.find((s) => s.in_depth && ['ready', 'in_progress'].includes(s.status)) || null;
    const attendees = String((sess as any).who || '').split('+').map((x) => x.trim()).filter(Boolean).map((x) => plain.roleName(x));
    const out = {
      code: (sess as any).id, title: (sess as any).title, purpose: (sess as any).purpose || '', who: (sess as any).who, who_text: plain.whoText((sess as any).who), attendees, bring: (sess as any).bring || '', outcome: (sess as any).outcome || '', phase: (sess as any).phase,
      total_minutes: inDepth.reduce((m, r) => m + r.minutes, 0), minutes_left: inDepth.filter((r) => !r.done).reduce((m, r) => m + r.minutes, 0),
      steps_total: inDepth.length, steps_done: done, complete: inDepth.length > 0 && done === inDepth.length, next_step: next ? next.request_id : null, steps, auto_steps: autos,
    };
    (byPhase[(sess as any).phase] = byPhase[(sess as any).phase] || []).push(out);
  }
  const phases = Object.keys(byPhase).sort().map((ph) => ({ phase: Number(ph), name: names[ph], sessions: byPhase[ph], minutes_left: byPhase[ph].reduce((m, s) => m + s.minutes_left, 0), minutes_total: byPhase[ph].reduce((m, s) => m + s.total_minutes, 0) }));
  const all = phases.flatMap((p) => p.sessions);
  return { depth: plan.depth, profile: { kind: prof.kind, audience: prof.audience }, phases, totals: { sessions: all.length, minutes_total: all.reduce((m, s) => m + s.total_minutes, 0), minutes_left: all.reduce((m, s) => m + s.minutes_left, 0), steps_total: all.reduce((m, s) => m + s.steps_total, 0), steps_done: all.reduce((m, s) => m + s.steps_done, 0), auto_total: all.reduce((m, s) => m + s.auto_steps.length, 0), auto_done: all.reduce((m, s) => m + s.auto_steps.filter((a) => a.status === 'done').length, 0) } };
}

/** Steps of a session in a sensible order: by id, but never before a step they wait for (inside the same session). */
function ordered(reqs) {
  const out = reqs.slice().sort((a, b) => a.id.localeCompare(b.id));
  for (let pass = 0; pass < out.length; pass++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      const deps = (out[i].depends_on || []).map((d) => out.findIndex((x) => x.id === d)).filter((k) => k > i);
      if (deps.length) { const [r] = out.splice(i, 1); out.splice(Math.max(...deps), 0, r); moved = true; break; }
    }
    if (!moved) break;
  }
  return out;
}

function find(store, code, requestId) {
  const plan = requests.plan(store);
  const sess = plan.sessions.find((s: any) => s.id === code);
  if (!sess) throw httpErr(404, `unknown session "${code}"`);
  const r = plan.requests.find((x) => x.id === requestId);
  if (!r || (r.session !== code && r.auto_session !== code)) throw httpErr(404, `step ${requestId} is not part of session ${code}`);
  return { plan, sess, r };
}

const brief = (store, id) => { const i = store.get(id); return i ? { id, type: i.type, title: i.title, status: i.status } : { id }; };

/** Parse a "lines" value (string or array) into trimmed rows. */
const rowsOf = (v) => (Array.isArray(v) ? v : String(v || '').split(/\r?\n/)).map((s) => (Array.isArray(s) ? s : String(s).trim())).filter((s) => (Array.isArray(s) ? s.length : s));

/** Ready-to-paste prompt asking an AI assistant for a DRAFT answer to a step; nothing is written. */
function agentPrompt(store, r, def) {
  const prod = store.product();
  const lines = [`You are helping fill in one step of a product documentation process for "${prod ? prod.name : 'a product'}".`, `Step: ${r.title}`, `Question: ${r.ask}`, '', 'Return ONLY a JSON object whose keys are the field keys below. Mark anything you are guessing with the word GUESS at the start of the value. Do not invent facts; leave a key out when unknown.', 'Fields:'];
  for (const f of def.fields) lines.push(`- ${f.key} (${f.type}${f.required ? ', required' : ''}${f.values ? ', one of ' + f.values.map((v) => v.value).join('/') : ''}): ${f.label}${f.help ? '. ' + f.help : ''}${f.example ? ' Example: ' + f.example : ''}`);
  return lines.join('\n');
}

/** POST /api/sessions/:code/steps/:requestId */
function postStep(store, code, requestId, body, actor, ctx) {
  const { r } = find(store, code, requestId);
  const action = body.action || 'answer';
  const before = store.data.audit.length;
  const none = { created: [], updated: [], links: 0 };
  if (action === 'skip') {
    if (!String(body.reason || '').trim()) throw httpErr(422, 'a reason is required to skip a step');
    store.data.requestState[r.id] = { status: 'skipped', reason: String(body.reason).trim(), at: store.now(), by: actor };
    store.audit('session.skip', r.id, `${actor} skipped step ${r.id} of session ${code}: ${body.reason}`, { actor, session: code, request: r.id });
    return { action, request_id: r.id, changed: none, ...nextInfo(store, code, ctx) };
  }
  if (action === 'na') {
    if (!r.na_allowed) throw httpErr(422, 'this step cannot be marked as not applicable');
    if (!String(body.reason || '').trim()) throw httpErr(422, 'give a one-line reason why this does not apply');
    requests.markNA(store, r.id, body.reason, actor);
    return { action, request_id: r.id, changed: none, ...nextInfo(store, code, ctx) };
  }
  if (action === 'reopen') {
    requests.reopenNA(store, r.id, actor);
    if (store.data.requestState[r.id] && store.data.requestState[r.id].status === 'skipped') delete store.data.requestState[r.id];
    return { action, request_id: r.id, changed: none, ...nextInfo(store, code, ctx) };
  }
  if (action === 'derive') {
    if (r.owner_kind !== 'DERIVED') throw httpErr(422, `step ${r.id} is not one the tool does for you`);
    if ((r.blockedBy || []).length) throw httpErr(422, 'the tool cannot do this yet: it needs earlier steps to be finished first', { options: requests.waitingFor(requests.plan(store).requests, r).map((b) => b.title) });
    const d = requests.runDerive(store, r.id, actor);
    const auto = requests.autoDerive(store, actor);
    return { action, request_id: r.id, changed: { created: (d.created || []).map((id) => brief(store, id)), updated: [], links: 0, extra: { message: d.message } }, auto_ran: autoNames(auto), ...nextInfo(store, code, ctx) };
  }
  if (action === 'ask_agent') {
    const def = formDefinition(store, r, ctx);
    const prompt = agentPrompt(store, r, def);
    store.audit('session.ask_agent', r.id, `${actor} asked the agent for a draft answer to step ${r.id} of session ${code}`, { actor, session: code, request: r.id });
    return { action, request_id: r.id, prompt, note: 'Paste the prompt into an AI assistant, review its JSON, then POST it back as answers. Drafts from an assistant are suggestions, not facts.', changed: none, ...nextInfo(store, code, ctx) };
  }
  if (action !== 'answer') throw httpErr(422, 'action must be answer, skip, na, reopen, derive or ask_agent');
  const answers = body.answers || {};
  const kind = stepKind(r);
  let res: any = { created: [], updated: [], links: 0 };
  let notes = [];
  if (kind === 'gate_decision') {
    const conditions = fk.normRows(answers.conditions).map((r0) => r0.cells).map((row) => { const [text, owner, gate] = row; return { text, owner: owner || undefined, must_close_by_gate: gate !== undefined && gate !== '' ? Number(gate) : undefined }; });
    // the same rules as the stage page: a sign-off waits for the named approver, whether it is asked here or there
    const rec: any = approvals.requestStageDecision(store, r.phase, answers.decision, { rationale: answers.rationale, approver: answers.approver, conditions, recycle_to: answers.recycle_to === undefined || answers.recycle_to === '' ? undefined : Number(answers.recycle_to) }, actor, { request: r.id });
    store.data.requestState[r.id] = { status: 'answered', at: store.now(), by: actor, created: [], updated: [] };
    if (rec.pending) { res = { created: [], updated: [], links: 0, pending: rec.approval, message: rec.message, notes: [rec.message] }; notes = [rec.message]; } else res = { created: rec.conditions || [], updated: [], links: 0, decision: rec.decision, state: rec.state };
  } else if (kind === 'review_drafts') {
    const ids = rowsOf(answers.ids);
    if (!ids.length) throw httpErr(422, 'ids is required');
    for (const id of ids) { store.update(Array.isArray(id) ? id[0] : id, { status: 'In review' }, { actor }); res.updated.push(Array.isArray(id) ? id[0] : id); }
    store.data.requestState[r.id] = { status: 'answered', at: store.now(), by: actor, created: [], updated: res.updated };
  } else if (kind === 'verify_agent_items') {
    const ids = rowsOf(answers.ids);
    if (!ids.length || !['verify', 'reject'].includes(answers.action)) throw httpErr(422, 'action (verify or reject) and ids are required');
    for (const id of ids) { if (answers.action === 'verify') agent.verify(store, id, actor, answers.note); else agent.reject(store, id, actor, answers.note); res.updated.push(id); }
  } else if (kind === 'derived') {
    const d = requests.runDerive(store, r.id, actor);
    res = { created: d.created || [], updated: [], links: 0, message: d.message };
  } else if (kind === 'agent_research') {
    if (body.route === 'hand' || (answers && answers.__route === 'hand')) {
      const hand = requests.answer(store, r.id, answers, actor, { route: 'hand' });
      res = { created: hand.created, updated: hand.updated, links: hand.links, removed: hand.removed }; notes = hand.notes || [];
    } else {
      let batch;
      try { batch = typeof answers.agent_json === 'string' ? JSON.parse(answers.agent_json) : answers.agent_json; } catch (e) { throw httpErr(422, 'What you pasted is not a valid result. Paste exactly what the assistant returned, starting with { and ending with }.', { errors: ['The text could not be read as the expected format.'] }); }
      if (!batch || typeof batch !== 'object') throw httpErr(422, 'Paste the result the assistant returned.');
      const ing: any = agent.ingest(store, { request_id: r.id, submitted_by: actor, ...batch });
      res = { created: ing.items || ing.created || [], updated: [], links: 0, unverified: ing.unverified };
    }
  } else if (kind === 'form' || kind === 'attestation' || kind === 'resolve_question') {
    const done = requests.answer(store, r.id, answers, actor);
    res = done; notes = done.notes || [];
  } else throw httpErr(422, `step ${r.id} has nothing to answer here; use ${r.link_to || 'its page'}`);
  store.audit('session.step', r.id, `${actor} completed step ${r.id} of session ${code}: ${(res.created || []).length} created, ${(res.updated || []).length} updated`, { actor, session: code, request: r.id, entries: store.data.audit.length - before });
  const auto = requests.autoDerive(store, actor);
  return { action, request_id: r.id, changed: { created: (res.created || []).map((id) => brief(store, id)), updated: (res.updated || []).map((id) => brief(store, id)), removed: (res.removed || []).length, links: res.links || 0, extra: { decision: res.decision, state: res.state, message: res.message, attested: res.attested, notes, pending: res.pending ? { id: res.pending.id, approver: res.pending.approver, title: res.pending.title } : null } }, auto_ran: autoNames(auto), ...nextInfo(store, code, ctx) };
}

function autoNames(ids) { return (ids || []).map((id) => { const q = requests.get(id); return { request_id: id, title: q ? q.title : id }; }); }

/** After a step: where is the session and what is the next step (with its form). */
function nextInfo(store, code, ctx) {
  const plan = requests.plan(store);
  const reqs = ordered(plan.requests.filter((r) => r.session === code && r.inDepth));
  const nxt = reqs.find((r) => !r.done && r.status !== 'blocked' && !(store.data.requestState[r.id] && store.data.requestState[r.id].status === 'skipped'));
  return { session: { code, steps_total: reqs.length, steps_done: reqs.filter((r) => r.done).length, complete: reqs.length > 0 && reqs.every((r) => r.done) }, next_step: nxt ? stepSummary(store, nxt, plan, true, ctx) : null };
}

export { list, postStep, formDefinition, stepKind, nextInfo, agentPrompt, stepSummary, DECISION_LABELS };
