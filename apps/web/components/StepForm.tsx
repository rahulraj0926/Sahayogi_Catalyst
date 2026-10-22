'use client';
/**
 * Renders one guided step's form (the schema comes from GET /api/sessions, step.form.fields).
 * Field types: text longtext choice multi_choice yes_no number date person pick_item lines.
 * Lines support: pick columns with "a new one…", checklist style, fixed rows, "More detail" (advanced) columns,
 * example rows, removal of saved rows (sent as answers.__removed), conditional show/enable/require.
 * Used by features/work. Prototype: work.js (buildField, buildLines, buildCell, buildPickControl).
 */
import { useMemo, useState } from 'react';
import { Field, useConfirm } from './kit';
import { actor } from '@/lib/api';

type Def = any;
export const holds = (cond: any, vals: Record<string, any>, key = 'field') => {
  if (!cond) return true;
  const raw = vals[cond[key]];
  const v = raw === undefined || raw === null ? '' : String(raw);
  if (cond.in) return cond.in.map(String).includes(v);
  if (cond.not) return v !== '' && !cond.not.map(String).includes(v);
  return v !== '';
};
export type Problem = { field: string | null; row?: number; col?: string; message: string };
const NEW = '__new__';
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const humanize = (s: string) => String(s || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase();

/** Words from the rules engine that must never reach the screen. */
export function plain(t: any): string {
  return String(t || '')
    .replace(/\b(?:the )?Gate (\d)\b/gi, 'the Stage $1 sign-off').replace(/\bgates\b/gi, 'sign-offs').replace(/\bgate\b/gi, 'sign-off')
    .replace(/\bcheckpoints?\b/gi, 'sign-off').replace(/\b(?:G[0-4C]|GC)-\d+[a-z]?\b/g, 'a sign-off check')
    .replace(/\b(IntakeBrief|PricePoint|ScopeEntry|CompetitorCapability|CompetitorNote|AcceptanceCriterion|UserStory|BusinessRule|ProductDefinition)\b/g, (m) => humanize(m))
    .replace(/\bapplies_to\b/g, 'applies to').replace(/\bdecision_table\b/g, 'decision table').replace(/\bAUTO\b/g, 'automatic');
}

function Chips({ options, value, onChange, required, multi }: { options: any[]; value: string; onChange: (v: string) => void; required?: boolean; multi?: boolean }) {
  const on = new Set(String(value || '').split(',').map((x) => x.trim()).filter(Boolean));
  const hit = options.find((o) => o.value === value);
  return (
    <div>
      {multi && <div className="xs muted">Select all that apply</div>}
      <div className="row wrap">{options.map((o) => {
        const sel = multi ? on.has(o.value) : value === o.value;
        return <button key={o.value} type="button" aria-pressed={sel} className={`btn sm ${sel ? 'primary' : ''}`} onClick={() => {
          if (multi) { sel ? on.delete(o.value) : on.add(o.value); onChange([...on].join(',')); } else onChange(sel && !required ? '' : o.value);
        }}>{o.label}</button>;
      })}</div>
      {!multi && hit?.hint && <div className="xs muted">{plain(hit.hint)}</div>}
    </div>
  );
}

function Pick({ def, value, onChange, id, siblings }: { def: Def; value: any; onChange: (v: any) => void; id?: string; siblings?: string[] }) {
  const pk = def.pick || {}; const opts: any[] = def.options || pk.options || [];
  const isNew = typeof value === 'string' && value.startsWith('new:');
  const [typing, setTyping] = useState(isNew ? value.slice(4) : '');
  const [mode, setMode] = useState(isNew);
  const sib = (siblings || []).filter((t) => !opts.some((o) => String(o.value).toLowerCase() === t.toLowerCase()));
  const empty = !opts.length && !sib.length;
  if (empty && !pk.create && def.empty_text) return <div className="small muted">{def.empty_text}</div>;
  const groups: Record<string, any[]> = {}; opts.filter((o) => !o.extra).forEach((o) => { (groups[o.type || ''] = groups[o.type || ''] || []).push(o); });
  const gk = Object.keys(groups);
  const O = (o: any) => <option key={o.value} value={o.value} title={o.hint || ''}>{o.label}</option>;
  return (
    <div>
      <select id={id} disabled={empty && !pk.create} value={mode ? NEW : value ?? ''} onChange={(e) => {
        if (e.target.value === NEW) { setMode(true); onChange(typing ? 'new:' + typing : undefined); } else { setMode(false); onChange(e.target.value || undefined); }
      }}>
        <option value="">{empty && !pk.create ? (pk.none_text || def.empty_text || 'Nothing to choose from yet') : (pk.none_text && !empty ? pk.none_text : 'Choose…')}</option>
        {opts.filter((o) => o.extra).map(O)}
        {gk.length > 1 ? gk.map((k) => <optgroup key={k} label={cap(((pk.types || []).find((t: any) => t.type === k) || {}).word || humanize(k)) + 's'}>{groups[k].map(O)}</optgroup>) : gk.length ? groups[gk[0]].map(O) : null}
        {sib.map((t) => <option key={'s' + t} value={t}>{t} (just typed above)</option>)}
        {pk.create && <option value={NEW}>{pk.create.label || 'A new one…'}</option>}
      </select>
      {mode && <input type="text" placeholder={`Type the new ${pk.create?.type_word || 'item'}`} aria-label="New name" value={typing} onChange={(e) => { setTyping(e.target.value); onChange(e.target.value.trim() ? 'new:' + e.target.value.trim() : undefined); }} style={{ marginTop: 4 }} />}
    </div>
  );
}

function Scalar({ def, value, onChange, people, id, siblings }: { def: Def; value: any; onChange: (v: any) => void; people: string[]; id?: string; siblings?: string[] }) {
  const t = def.type || def.kind;
  const ph = def.default ? `Default: ${def.default}` : def.example || '';
  if (t === 'longtext') return <textarea id={id} rows={4} value={value ?? ''} placeholder={ph} onChange={(e) => onChange(e.target.value)} />;
  if (t === 'number') {
    const um = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(def.label || '');
    const inp = <input id={id} type="number" step="any" inputMode="decimal" value={value ?? ''} placeholder={ph} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />;
    return um ? <span className="row">{inp}<span className="muted small">{um[2]}</span></span> : inp;
  }
  if (t === 'date') return <input id={id} type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)} />;
  if (t === 'yes_no' || t === 'yesno') {
    const cur = value === true || value === 'yes' ? 'yes' : value === false || value === 'no' ? 'no' : '';
    const out = (v: string) => (t === 'yesno' ? v : v === 'yes');
    return <span className="row">{['yes', 'no'].map((v) => <button key={v} type="button" aria-pressed={cur === v} className={`btn sm ${cur === v ? 'primary' : ''}`} onClick={() => onChange(cur === v ? undefined : out(v))}>{v === 'yes' ? 'Yes' : 'No'}</button>)}</span>;
  }
  if (t === 'choice') {
    const vals: any[] = def.values || [];
    if (vals.length > 5 || vals.some((v) => String(v.label).length > 38) || def.kind === 'choice') {
      const hit = vals.find((o) => o.value === value);
      return <div><select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)}><option value="">Choose…</option>{vals.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>{hit?.hint && <div className="xs muted">{plain(hit.hint)}</div>}</div>;
    }
    return <Chips options={vals} value={value ?? ''} onChange={onChange} required={def.required} />;
  }
  if (t === 'multi_choice') return <Chips multi options={def.values || []} value={value ?? ''} onChange={onChange} />;
  if (t === 'person') {
    const excl = ['approver', 'by', 'signed_by'].includes(def.key) ? [actor()] : [];
    const list = people.filter((p) => !excl.includes(p));
    return <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}><option value="">Choose a person…</option>{list.map((p) => <option key={p}>{p}</option>)}</select>;
  }
  if (t === 'pick_item' || t === 'pick') return <Pick def={t === 'pick_item' ? { ...def, pick: { none_text: def.empty_text, create: def.create || null, types: [], ...(def.pick || {}) } } : def} id={id} value={value} onChange={onChange} siblings={siblings} />;
  return <input id={id} type="text" autoComplete="off" value={value ?? ''} placeholder={ph} list={def.suggest?.length ? `${id}-dl` : undefined} onChange={(e) => onChange(e.target.value)} />;
}

const toCells = (r: any, cols: Def[]): any[] => Array.isArray(r) ? r : Array.isArray(r?.cells) ? r.cells : cols.map((c) => r?.[c.key] ?? '');
const rowVals = (r: any, cols: Def[]) => { const o: Record<string, any> = {}; cols.forEach((c, i) => { o[c.key] = r.cells[i]; }); return o; };
const hasText = (v: any) => v !== undefined && v !== null && String(v).trim() !== '';

function Lines({ def, value, onChange, people, errors, values }: { def: Def; value: any[]; onChange: (v: any[], removed?: string[]) => void; people: string[]; errors: Problem[]; values: Record<string, any> }) {
  const [ask, askDialog] = useConfirm();
  const L = def.lines || {}; const cols: Def[] = L.cols || []; const rows = value || [];
  const checklist = L.style === 'checklist'; const fixed: any[] | null = L.fixed || null;
  const set = (i: number, ci: number, v: any) => onChange(rows.map((r, k) => (k === i ? { ...r, cells: r.cells.map((c: any, j: number) => (j === ci ? v : c)) } : r)));
  const removeRow = (i: number) => {
    const r = rows[i];
    if (r.id) { ask('This deletes the record this row made. Remove it?', 'Remove').then((ok) => { if (ok) onChange(rows.filter((_, k) => k !== i), [r.id]); }); return; }
    onChange(rows.filter((_, k) => k !== i), []);
  };
  const errFor = (ri: number, key: string) => errors.find((e) => e.row === ri + 1 && e.col === key)?.message;
  if (checklist) {
    const opts: any[] = cols[0]?.options || []; const chosen = new Set(rows.map((r) => r.cells[0]));
    if (!opts.length) return <div className="callout">{cols[0]?.pick?.none_text || 'Nothing to choose from yet.'}</div>;
    return <div>{opts.map((o) => <label key={o.value} style={{ display: 'flex', gap: 8, padding: '4px 0' }}><input type="checkbox" checked={chosen.has(o.value)} onChange={(e) => onChange(e.target.checked ? [...rows, { cells: [o.value] }] : rows.filter((r) => r.cells[0] !== o.value))} /><span>{o.title || o.label}{o.hint && <div className="xs muted">{o.hint}</div>}</span></label>)}</div>;
  }
  if (fixed && !fixed.length) return <div className="callout">There is nothing to go through yet. Finish the earlier steps first.</div>;
  const view = fixed ? fixed.map((item) => { const have = rows.find((r) => r.cells[0] === item.value); return have ? { ...have, fixedItem: item } : { cells: cols.map((_, i) => (i === 0 ? item.value : '')), fixedItem: item }; }) : (rows.length ? rows : [{ cells: cols.map(() => '') }]);
  const setView = (i: number, ci: number, v: any) => {
    if (!fixed) { if (!rows.length) { onChange([{ cells: cols.map((_, j) => (j === ci ? v : '')) }]); return; } return set(i, ci, v); }
    const item = fixed[i]; const exists = rows.findIndex((r) => r.cells[0] === item.value);
    if (exists >= 0) return set(exists, ci, v);
    onChange([...rows, { cells: cols.map((_, j) => (j === 0 ? item.value : j === ci ? v : '')) }]);
  };
  const cellView = (r: any, i: number, c: Def, ci: number) => {
    const vals = rowVals(r, cols);
    const off = c.enabled_when && !holds(c.enabled_when, vals, 'col');
    const need = c.required || (c.required_when && holds(c.required_when, vals, 'col'));
    const sibs = c.pick?.siblings ? ((values[c.pick.siblings.field] || []) as any[]).map((x) => x.cells?.[c.pick.siblings.col || 0]).filter((v) => v && !String(v).startsWith('new:')) : [];
    const err = errFor(i, c.key);
    return (
      <div key={c.key} className={err ? 'bad' : ''} style={{ opacity: off ? 0.5 : 1, gridColumn: c.kind === 'longtext' ? '1 / -1' : undefined }}>
        <label className="strong small" style={{ display: 'block' }}>{c.label}{need ? <span title="needed"> *</span> : !c.required_when ? <span className="muted"> (optional)</span> : null}</label>
        <fieldset disabled={off} style={{ border: 0, padding: 0, margin: 0 }}><Scalar def={c} id={`c-${def.key}-${i}-${c.key}`} value={r.cells[ci]} people={people} siblings={sibs} onChange={(v) => setView(i, ci, v)} /></fieldset>
        {c.suggest?.length > 0 && <datalist id={`c-${def.key}-${i}-${c.key}-dl`}>{c.suggest.map((s: string) => <option key={s} value={s} />)}</datalist>}
        {c.help && <div className="xs muted">{plain(c.help)}</div>}
        {err && <div className="xs" style={{ color: 'var(--bad)' }}>{err}</div>}
      </div>);
  };
  return (
    <div>{askDialog}
      {view.map((r: any, i: number) => (
        <div key={r.id || i} className="card" style={{ marginBottom: 8 }}>
          <div className="card-b" style={{ padding: '10px 12px' }}>
            <div className="row" style={{ marginBottom: 6 }}>
              {r.fixedItem ? <div><b>{r.fixedItem.label}</b>{r.fixedItem.hint && <div className="xs muted">{r.fixedItem.hint}</div>}</div> : <b>{L.row_label || 'Row'} {i + 1}</b>}
              <span className="spacer" />
              {!fixed && <button type="button" className="btn ghost sm" aria-label="Remove this row" title="Remove this row" onClick={() => (rows.length ? removeRow(i) : null)}>×</button>}
            </div>
            <div className="grid g2" style={{ gap: 10 }}>{cols.map((c, ci) => (c.advanced || (r.fixedItem && ci === 0) ? null : cellView(r, i, c, ci)))}</div>
            {cols.some((c) => c.advanced) && <details style={{ marginTop: 8 }}><summary title="We fill in a sensible default if you skip it">More detail</summary><div className="grid g2" style={{ gap: 10, marginTop: 6 }}>{cols.map((c, ci) => (c.advanced ? cellView(r, i, c, ci) : null))}</div></details>}
          </div>
        </div>
      ))}
      {!fixed && <div className="row">
        <button type="button" className="btn sm" onClick={() => onChange([...(rows.length ? rows : [{ cells: cols.map(() => '') }]), { cells: cols.map(() => '') }])}>{L.add_label || 'Add another'}</button>
        {L.example_row && <button type="button" className="btn ghost sm" onClick={() => { const ex = L.example_row.map((x: any) => x ?? ''); const blank = rows.findIndex((r) => r.cells.every((c: any) => !hasText(c))); onChange(blank >= 0 ? rows.map((r, k) => (k === blank ? { ...r, cells: ex } : r)) : [...rows, { cells: ex }]); }}>Start from an example</button>}
      </div>}
    </div>
  );
}

export function initialValues(defs: Def[], saved: Record<string, any> = {}) {
  const v: Record<string, any> = {};
  for (const d of defs) {
    const s = saved[d.key] ?? d.default ?? undefined;
    if (d.type === 'lines') v[d.key] = Array.isArray(s) ? s.map((r: any) => ({ id: r?.id, cells: toCells(r, d.lines?.cols || []) })) : [];
    else if (s !== undefined && s !== null) v[d.key] = s;
    else if (d.type === 'pick_item' && (d.options || []).length === 1 && d.required) v[d.key] = d.options[0].value;
  }
  return v;
}

/** answers payload: lines become [{cells,id}], empty values are dropped, hidden fields are dropped; removed saved rows go in __removed */
export function toAnswers(defs: Def[], vals: Record<string, any>) {
  const a: Record<string, any> = {}; const removed: string[] = [];
  for (const d of defs) {
    if (!holds(d.show_when, vals)) continue;
    const v = vals[d.key];
    if (d.type === 'lines') {
      const fixed = d.lines?.fixed;
      a[d.key] = (v || []).filter((r: any) => (fixed ? r.cells.slice(1) : r.cells).some(hasText) || d.lines?.style === 'checklist').map((r: any) => ({ cells: r.cells, id: r.id }));
    } else if (v !== undefined && v !== '') a[d.key] = v;
  }
  removed.push(...(vals.__removed || []));
  if (removed.length) a.__removed = removed;
  return a;
}

/** Checks done on the page before anything is sent, so most mistakes never leave it. */
export function localCheck(defs: Def[], vals: Record<string, any>): Problem[] {
  const out: Problem[] = [];
  for (const d of defs) {
    if (!holds(d.show_when, vals)) continue;
    const need = d.required || (d.required_when && holds(d.required_when, vals));
    const v = vals[d.key]; const label = plain(d.label);
    if (d.type === 'lines') {
      const cols: Def[] = d.lines?.cols || []; const fixed = d.lines?.fixed;
      const rows = (v || []).filter((r: any) => (fixed ? r.cells.slice(1) : r.cells).some(hasText));
      if (d.required && !rows.length && !(fixed && !fixed.length) && d.lines?.style !== 'checklist') out.push({ field: d.key, message: `Add at least one row to "${label}".` });
      if (d.min_rows && rows.length && rows.length < d.min_rows) out.push({ field: d.key, message: `"${label}" needs at least ${d.min_rows} rows (you have ${rows.length}).` });
      rows.forEach((r: any, ri: number) => cols.forEach((c, ci) => {
        const val = hasText(r.cells[ci]) ? String(r.cells[ci]).trim() : '';
        const rv = rowVals(r, cols);
        if (c.enabled_when && !holds(c.enabled_when, rv, 'col')) return;
        const needed = c.required || (c.required_when && holds(c.required_when, rv, 'col'));
        if (needed && val === '' && (c.default === undefined || c.default === null)) out.push({ field: d.key, row: ri + 1, col: c.key, message: `${rows.length > 1 ? `Row ${ri + 1}: ` : ''}"${plain(c.label).replace(/[?.:]+$/, '')}" is needed${c.kind === 'pick' ? ': choose one from the list' : ''}.` });
        if (c.kind === 'pick' && val === 'new:') out.push({ field: d.key, row: ri + 1, col: c.key, message: 'Type a name for the new item.' });
      }));
    } else if (need && (v === undefined || v === null || v === '' || ((d.type === 'yes_no') && d.required && v !== true))) {
      out.push({ field: d.key, message: d.type === 'yes_no' ? `Please tick Yes for "${label}" to go on.` : `Please fill in "${label}" (it is needed).` });
    }
  }
  return out;
}

export default function StepForm({ fields, values, people, onChange, readOnly, errors = [], starter }: { fields: Def[]; values: Record<string, any>; people: string[]; onChange: (v: Record<string, any>) => void; readOnly?: boolean; errors?: Problem[]; starter?: string[] }) {
  const visible = useMemo(() => fields.filter((f) => holds(f.show_when, values)), [fields, values]);
  const hasRequired = fields.some((d) => d.required || d.required_when || d.type === 'lines');
  const isOptional = (d: Def) => hasRequired && !d.required && !d.required_when && d.type !== 'lines' && !d.show_when;
  const main = visible.filter((d) => !isOptional(d)); const opt = visible.filter(isOptional);
  const optFilled = opt.filter((d) => hasText(values[d.key])).length;
  const firstEx = main.find((d) => d.example && ['text', 'longtext', 'number', 'date'].includes(d.type) && !hasText(values[d.key]));
  const one = (d: Def) => {
    const err = errors.find((e) => e.field === d.key && !e.row);
    const need = d.required || (d.required_when && holds(d.required_when, values));
    const ex = d.example && ['text', 'longtext', 'number', 'date'].includes(d.type) && !hasText(values[d.key]) && d === firstEx;
    return (
      <div key={d.key} className={err ? 'bad' : ''} style={err ? { borderLeft: '3px solid var(--bad)', paddingLeft: 8 } : undefined}>
        <Field label={`${plain(d.label)}${need ? ' *' : d.required_when || d.required ? '' : ' (optional)'}`} help={d.help ? plain(d.help) : undefined}>
          {d.type === 'lines'
            ? <Lines def={d} value={values[d.key] || []} people={people} errors={errors.filter((e) => e.field === d.key)} values={values} onChange={(v, rem) => onChange({ ...values, [d.key]: v, ...(rem?.length ? { __removed: [...(values.__removed || []), ...rem] } : {}) })} />
            : <Scalar def={d} id={`f-${d.key}`} value={values[d.key]} people={people} onChange={(v) => onChange({ ...values, [d.key]: v })} />}
        </Field>
        {ex && <div className="xs muted" style={{ marginTop: -6, marginBottom: 8 }}>Example: <q>{String(d.example)}</q> {['text', 'longtext'].includes(d.type) && <button type="button" className="btn ghost sm" onClick={() => onChange({ ...values, [d.key]: d.example })}>Use this example</button>}</div>}
        {d.type === 'lines' && starter?.includes(d.key) && <div className="callout" style={{ marginBottom: 8 }}>{d.lines?.style === 'checklist' ? 'We ticked the must-have features for you. Tick or untick to change.' : 'We added the rows above for you. Fill in what is missing, change what is wrong, remove what does not belong.'}</div>}
        {err && <div className="small" style={{ color: 'var(--bad)', marginBottom: 8 }}>{err.message}</div>}
      </div>);
  };
  return (
    <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0 }}>
      {main.map(one)}
      {opt.length > 0 && <details open={false}><summary className="strong small">{optFilled ? `Optional details (${optFilled} filled in)` : 'Optional details'}</summary>{opt.map(one)}</details>}
    </fieldset>
  );
}
