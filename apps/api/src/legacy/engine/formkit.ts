/**
 * engine/formkit.ts - shared helpers for the guided question forms (used by engine/requests.ts and engine/sessions.ts).
 *
 *  - pick lists: existing records written in words (title plus one short description), never ids
 *  - rows: a "lines" answer is a list of rows; a row is a list of cells (one per column) plus the id of the record it came from
 *  - column validation with plain-language messages that name the row and the box
 *  - reading the live records back into a form (so a finished step can be reopened and edited, never duplicated)
 *  - examples that depend on the kind of product (software, hardware, service) and whether it is sold or internal
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as Q from './query';
import * as plain from './words';
import * as unitsMod from './units';

// ------------------------------------------------------------------ examples by product profile
let EXAMPLES = null;
function examples() {
  if (!EXAMPLES) {
    try { EXAMPLES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'request_examples.json'), 'utf8')); } catch (e) { EXAMPLES = {}; }
  }
  return EXAMPLES;
}
function reloadExamples() { EXAMPLES = null; return examples(); }

/** { kind: software|hardware|service, audience: sold|internal, key } for the product in this store (ctx.kind comes from the portfolio). */
function profile(store, ctx) {
  const p = store.product() || {};
  const kind = (ctx && ctx.kind) || p.product_kind || 'software';
  const audience = (ctx && ctx.audience) || p.audience || 'sold';
  return { kind, audience, key: `${kind}_${audience}` };
}

/** Resolve an example given as a string or as a { default, software, internal, software_internal ... } object. */
function pickExample(ex, prof) {
  if (ex === undefined || ex === null) return null;
  if (typeof ex === 'string') return ex;
  const order = [prof.key, prof.kind, prof.audience, 'default'];
  for (const k of order) if (ex[k] !== undefined) return ex[k];
  return null;
}
function exampleFor(id, key, prof, inline) {
  const lib = examples()[`${id}.${key}`];
  return pickExample(lib !== undefined ? lib : inline, prof);
}

// ------------------------------------------------------------------ describing records in words
const D = (i, n = 70) => plain.clip(i, n);
const STAGE_WORD = (g) => (g === undefined || g === null ? '' : `needed by the Stage ${g} sign-off`);
const DESC = {
  Assumption: (i) => [i.category && i.category !== 'other' ? i.category : '', i.risk_score ? (i.risk_score >= 15 ? 'high risk' : i.risk_score >= 8 ? 'medium risk' : 'low risk') : ''].filter(Boolean).join(', '),
  Question: (i) => [i.priority ? `${i.priority} answer` : '', STAGE_WORD(i.needed_by_gate), i.asked_of ? `ask ${i.asked_of}` : ''].filter(Boolean).join(', '),
  Feature: (i) => [i.priority, i.effort_pm ? `${i.effort_pm} person-month${i.effort_pm === 1 ? '' : 's'}` : ''].filter(Boolean).join(', '),
  Module: (i) => D(i.boundary_description, 50),
  Release: (i) => [i.is_mvp ? 'first release' : '', i.window_start ? `${i.window_start} to ${i.window_end || '?'}` : ''].filter(Boolean).join(', '),
  Persona: (i) => [({ customer_user: 'uses it', buyer: 'buys it', internal_user: 'staff user', beneficiary: 'benefits' })[i.kind], i.primary ? 'main user' : ''].filter(Boolean).join(', '),
  Segment: (i) => [i.primary ? 'main customer group' : '', D(i.definition, 50)].filter(Boolean).join(', '),
  Job: (i) => (i.rank ? `ranked ${i.rank}` : ''),
  Objective: (i) => (i.kind === 'vision' ? 'vision' : 'goal'),
  Constraint: (i) => [i.kind, i.amount ? `${i.amount} ${i.unit || ''}`.trim() : ''].filter(Boolean).join(', '),
  Stakeholder: (i) => [i.role_title, i.category].filter(Boolean).join(', '),
  Requirement: (i) => [i.subtype === 'non_functional' ? 'quality target' : i.subtype, i.priority].filter(Boolean).join(', '),
  Story: (i) => i.priority || '',
  Flow: (i) => i.priority || '',
  Competitor: (i) => [i.tier ? `tier ${i.tier}` : '', i.kind].filter(Boolean).join(', '),
  CompetitorCapability: (i) => [i.level ? `rated ${i.level}` : '', i.evidence_basis].filter(Boolean).join(', '),
  Evidence: (i) => [i.kind, i.published_on || i.retrieved_on].filter(Boolean).join(', '),
  Insight: (i) => i.confidence || '',
  Decision: (i) => i.kind || '',
  Risk: (i) => [i.category, i.score ? `score ${i.score}` : ''].filter(Boolean).join(', '),
  Obligation: (i) => [i.kind, i.jurisdiction].filter(Boolean).join(', '),
  Product: () => 'the whole product',
  ScopeEntry: (i) => i.disposition || '',
  Capacity: (i) => (i.person_months ? `${i.person_months} person-month${i.person_months === 1 ? '' : 's'}` : ''),
  FlowStep: (i, store) => { const l = store.inn(i.id, 'contains').map((x) => store.get(x.source)).find((x) => x && x.type === 'Flow'); return l ? `in the flow "${D(l.title, 40)}"` : ''; },
  Actor: (i) => ({ customer_user: 'customer or outside user', internal_user: 'our staff', system: 'a system' })[i.kind] || '',
  State: () => '',
};
function describeItem(store, i) {
  let title = i.title || i.statement || i.id;
  if (i.type === 'CompetitorCapability') {
    const comp = store.inn(i.id, 'contains').map((l) => store.get(l.source)).find(Boolean);
    title = comp ? `${comp.title}: ${i.capability_tag || i.title}` : (i.capability_tag || title);
  }
  const hint = (DESC[i.type] ? DESC[i.type](i, store) : '') || '';
  return { value: i.id, id: i.id, title: D(title, 80), hint: hint, label: hint ? `${D(title, 80)} (${hint})` : D(title, 80), type: i.type };
}

/** The options of a pick: [{ value, label, title, hint }]. spec: { type|types, where, subtype, counted, valueBy: 'id'|'title', extra:[{value,label}], sort } */
function pickOptions(store, spec, extraItems?) {
  if (!spec || (!spec.type && !spec.types)) return (spec && spec.extra || []).map((e) => ({ value: e.value, label: e.label, title: e.label, hint: '', extra: true }));
  const ctx = new Q.Ctx(store, {});
  const types = spec.types || [spec.type];
  const out = [];
  for (const t of types) {
    const sel = { type: t, ...(spec.where ? { where: spec.where } : {}), ...(spec.subtype ? { subtype: spec.subtype } : {}), ...(spec.counted ? { counted: true } : {}) };
    let items = Q.select(ctx, sel);
    if (spec.filter === 'unresolved_must') items = items.filter((x) => x.status === 'Open');
    for (const it of items) {
      const d = describeItem(store, it);
      out.push(spec.valueBy === 'title' ? { ...d, value: it.title } : d);
    }
  }
  const seen = new Set();
  const uniq = out.filter((o) => { const k = spec.valueBy === 'title' ? o.value.toLowerCase() : o.value; if (seen.has(k)) return false; seen.add(k); return true; });
  for (const x of extraItems || []) if (!seen.has(String(x).toLowerCase()) && !uniq.some((o) => o.value === x)) uniq.push({ value: x, label: x, title: x, hint: 'typed above' });
  if (spec.sort !== false) uniq.sort((a, b) => (a.type || '').localeCompare(b.type || '') || a.title.localeCompare(b.title, undefined, { numeric: true }));
  return [...(spec.extra || []).map((e) => ({ value: e.value, label: e.label, title: e.label, hint: '', extra: true })), ...uniq];
}

// ------------------------------------------------------------------ rows
const trim = (v) => (v === undefined || v === null ? '' : String(v).trim());
/** Normalise any accepted shape of a lines answer to [{ cells:[...], id?, text }]. Accepts "a | b" strings, arrays of cells, and { cells, id }. */
function normRows(value, sep?) {
  let arr;
  if (Array.isArray(value)) arr = value; else arr = String(value || '').split(/\r?\n/);
  const out = [];
  for (const r of arr) {
    let cells; let id;
    if (r && typeof r === 'object' && !Array.isArray(r)) { cells = (r.cells || []).map(trim); id = r.id || undefined; } else if (Array.isArray(r)) cells = r.map(trim); else cells = String(r).split(sep || '|').map(trim);
    while (cells.length && cells[cells.length - 1] === '') cells.pop();
    if (!cells.length || cells.every((c) => c === '')) continue;
    out.push({ cells, id, text: cells.join(' | ') });
  }
  return out;
}

const normTitle = (s) => trim(s).toLowerCase().replace(/\s+/g, ' ');
const isBlank = (v) => v === undefined || v === null || trim(v) === '';

/** Does a column's "required_when / enabled_when" condition hold for this row? cond: { col, in:[...] } or { col, not:[...] } */
function condHolds(cond, row, cols) {
  if (!cond) return true;
  const i = cols.findIndex((c) => c.key === cond.col);
  const v = i >= 0 ? trim(row.cells[i]) : '';
  if (cond.in) return cond.in.includes(v);
  if (cond.not) return v !== '' && !cond.not.includes(v);
  return v !== '';
}

const valuesOf = (spec) => (spec.values_from === 'price_for' ? unitsMod.PRICE_FOR.map((x) => x.v) : (spec.values || []).map((v) => (v && typeof v === 'object' ? v.value : v)));
const labelOfValue = (spec, v) => { const hit = (spec.values || []).find((x) => (x && typeof x === 'object' ? x.value : x) === v); return hit && typeof hit === 'object' ? hit.label : v; };

/**
 * Validate the rows of one lines field against its column specs. Returns [{ field, row (1-based), col, message }].
 * Does not touch the store, except to check that a picked record still exists.
 */
function validateRows(store, field, rows, opts: any = {}) {
  const sibTitles = (c) => (c.pick && c.pick.siblings && opts.fieldRows && opts.fieldRows[c.pick.siblings.field] ? opts.fieldRows[c.pick.siblings.field].map((r) => normTitle(r.cells[c.pick.siblings.col || 0])) : []);
  const errs = [];
  const cols = field.columns || [];
  const lab = field.label || field.key;
  if (field.required && !rows.length) errs.push({ field: field.key, message: `Add at least one row to "${lab}".` });
  if (field.min_rows && rows.length < field.min_rows && (rows.length || field.required)) errs.push({ field: field.key, message: `"${lab}" needs at least ${field.min_rows} rows (you have ${rows.length}).` });
  if (!cols.length) return errs;
  rows.forEach((row, ri) => {
    cols.forEach((c, ci) => {
      let v = trim(row.cells[ci]);
      if (v === '' && c.default !== undefined) v = String(c.default);
      const need = c.required || (c.required_when && condHolds(c.required_when, row, cols));
      const where = rows.length > 1 || field.show_row_numbers ? `Row ${ri + 1}: ` : '';
      const err = (message) => errs.push({ field: field.key, row: ri + 1, col: c.key, message: `${where}${message}` });
      if (v === '') {
        if (need) err(c.required_msg || (c.kind === 'pick' ? `"${c.label.replace(/[?.:]+$/, '')}" is needed: choose one from the list${c.pick && c.pick.create ? ' or type a new one' : ''}` : c.kind === 'choice' || c.kind === 'yesno' ? `"${c.label.replace(/[?.:]+$/, '')}" is needed: choose an option` : `"${c.label.replace(/[?.:]+$/, '')}" is needed`));
        return;
      }
      if (c.kind === 'choice' || c.kind === 'yesno') {
        const allowed = c.kind === 'yesno' ? ['yes', 'no'] : valuesOf(c);
        if (!allowed.includes(v)) err(`"${c.label.replace(/[?.:]+$/, '')}": choose one of the options (${allowed.map((a) => labelOfValue(c, a)).slice(0, 6).join(', ')})`);
      } else if (c.kind === 'number') {
        const n = Number(v.replace(/,/g, ''));
        if (Number.isNaN(n)) err(`"${c.label.replace(/[?.:]+$/, '')}" must be a number (you typed "${plain.clip(v, 20)}")`);
        else if (c.min !== undefined && n < c.min) err(`"${c.label.replace(/[?.:]+$/, '')}" must be at least ${c.min}`);
        else if (c.max !== undefined && n > c.max) err(`"${c.label.replace(/[?.:]+$/, '')}" must be at most ${c.max}`);
      } else if (c.kind === 'date') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) err(`"${c.label.replace(/[?.:]+$/, '')}" must be a date (use the date picker)`);
      } else if (c.kind === 'pick' && c.pick && !v.startsWith('new:') && !(c.pick.extra || []).some((e) => e.value === v)) {
        if (c.pick.valueBy === 'title') { /* free titles are created on the fly when allowed */ if (!c.pick.create && !sibTitles(c).includes(normTitle(v))) { const hit = pickOptions(store, c.pick).some((o) => normTitle(o.value) === normTitle(v)); if (!hit) err(`"${c.label.replace(/[?.:]+$/, '')}": "${plain.clip(v, 30)}" is not in the list. Choose one of the existing ones`); } } else if (!store.get(v)) err(`"${c.label.replace(/[?.:]+$/, '')}": that record no longer exists. Choose again`);
      }
      if (c.max_len && v.length > c.max_len) err(`"${c.label.replace(/[?.:]+$/, '')}" is too long (${v.length} characters, limit ${c.max_len})`);
    });
  });
  return errs;
}

/** Fill column defaults into rows (empty cells that have a default). */
function applyDefaults(field, rows, today) {
  const cols = field.columns || [];
  if (!cols.some((c) => c.default !== undefined)) return rows;
  return rows.map((r) => {
    const cells = r.cells.slice();
    cols.forEach((c, i) => { if (c.default !== undefined && (cells[i] === undefined || trim(cells[i]) === '')) cells[i] = c.default === '$today' && today ? today : String(c.default); });
    return { ...r, cells };
  });
}

// ------------------------------------------------------------------ reading records back into a form

/** For a template like "Test $1" or "$2" or "Pricing position: $position": the variable name and the text around it, or null if more than one variable. */
function templateVar(tpl) {
  if (typeof tpl !== 'string') return null;
  const vars = tpl.match(/\$([A-Za-z_]\w*|\d+)/g);
  if (!vars || vars.length !== 1) return null;
  const i = tpl.indexOf(vars[0]);
  return { name: vars[0].slice(1), pre: tpl.slice(0, i), post: tpl.slice(i + vars[0].length) };
}
function invertTemplate(tpl, value, known?) {
  if (typeof tpl !== 'string' || value === undefined || value === null) return null;
  let t = tpl;
  if (known) t = t.replace(/\$([A-Za-z_]\w*)/g, (m, n) => (known[n] !== undefined && known[n] !== null ? String(known[n]) : m));
  const tv = templateVar(t);
  if (!tv) return null;
  let s = typeof value === 'boolean' ? (value ? 'yes' : 'no') : String(value);
  if (tv.pre && !s.startsWith(tv.pre)) return null;
  if (tv.post && !s.endsWith(tv.post)) return null;
  s = s.slice(tv.pre.length, s.length - tv.post.length);
  return { name: tv.name, value: s };
}
function showValue(v, fd?) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

export { examples, reloadExamples, profile, pickExample, exampleFor, describeItem, pickOptions, normRows, validateRows, applyDefaults, condHolds, valuesOf, labelOfValue, isBlank, trim, normTitle, templateVar, invertTemplate, showValue };
