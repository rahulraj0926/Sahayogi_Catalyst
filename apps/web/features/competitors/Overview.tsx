'use client';
/**
 * One competitor on one page. Short fact blocks first, then what they do well next to where we can beat them.
 * Everything shown is either saved here or worked out from the plans, files and notes already recorded. Empty rows are left out.
 */
import { useState, type ReactNode } from 'react';
import { Field, useAction } from '@/components/kit';
import { api } from '@/lib/api';
import { BLOCKS, SIDES, type BlockDef, type Row } from './overviewBlocks';
import { Control, F, filled, norm } from './profileFields';

const niceDate = (d?: string) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
export const THREAT_COLOR: Record<string, string> = { High: 'var(--status-critical-fg)', Medium: 'var(--status-warning-fg)', Low: 'var(--status-healthy-fg)' };
export const tint = (c: string) => `color-mix(in srgb, ${c} 14%, transparent)`;
const EVERY = 'rounded-[var(--card-radius)] border border-[var(--card-border)] bg-[var(--surface)] [box-shadow:var(--card-shadow)]';
const today = () => new Date().toISOString().slice(0, 10);

/** The words for one saved value. */
function show(key: string, v: any): ReactNode {
  const d = F[key];
  if (key === 'website') return <a href={/^https?:/.test(v) ? v : `https://${v}`} target="_blank" rel="noopener noreferrer">{String(v).replace(/^https?:\/\//, '')}</a>;
  if (key === 'review_by') return niceDate(String(v));
  if (d?.kind === 'enum') return d.options!.find(([x]) => x === v)?.[1] ?? String(v);
  if (Array.isArray(v)) return <span className="flex flex-wrap gap-2">{v.map((x) => <span key={x} className="rounded-full bg-[var(--search-bg)] px-3 py-1.5 text-[13px] font-semibold text-[var(--text-heading)]">{x}</span>)}</span>;
  return String(v);
}

/** Lines of text become points. "Price: about $37 a user" shows "Price" as the title and the rest underneath. */
function Points({ text, tone }: { text: string; tone: string }) {
  const lines = text.split(/\n+/).map((l) => l.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean);
  return (
    <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
      {lines.map((l, i) => {
        const m = l.match(/^([^:.]{2,40}):\s+(.+)$/);
        return (
          <li key={i} className="grid grid-cols-[10px_1fr] gap-x-3">
            <span aria-hidden className="mt-[0.45em] h-2.5 w-2.5 rounded-full" style={{ background: tone }} />
            <span className="min-w-0 leading-snug">
              <span className="block text-[15px] font-bold text-[var(--text-heading)]">{m ? m[1] : l}</span>
              {m && <span className="mt-0.5 block text-[14px] text-[var(--text-secondary)]">{m[2].charAt(0).toUpperCase() + m[2].slice(1)}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

type Props = { c: any; onOpen: (tab: string) => void; onAddProduct: () => void; links: any[]; prices: any[]; files: any[]; notes: any[]; lines: any[]; onSaved: () => void; todo: ReactNode };

export default function Overview({ c, onOpen, onAddProduct, links, prices, files, notes, lines, onSaved, todo }: Props) {
  const derived: Record<string, ReactNode> = {
    // the products this company sells (each with its own plans); the Plans tab holds their prices
    products: (
      <span className="flex flex-wrap items-center gap-2">
        {lines.filter((l) => l.product_name).map((l) => <span key={l.id} className="rounded-full bg-[var(--search-bg)] px-3 py-1.5 text-[13px] font-semibold text-[var(--text-heading)]">{l.product_name}</span>)}
        <button type="button" className="text-[14px] font-semibold text-[var(--sd-accent)]" onClick={onAddProduct}>{lines.length ? '+ Add product' : 'Add a product'}</button>
      </span>
    ),
    evidence: links.filter((l) => l.otherType === 'Evidence').length || <span className="font-medium" style={{ color: 'var(--status-warning-fg)' }}>None yet</span>,
    files: files.length || '',
    notes: notes.length || '',
    verified: c.last_reviewed_on ? niceDate(c.last_reviewed_on) : '',
  };
  const overdue = !!c.review_by && c.review_by < today();
  const val = (r: Row): ReactNode => {
    const v = r.key && filled(c[r.key]) ? show(r.key, c[r.key]) : derived[r.id] || '';
    return r.id === 'review_by' && overdue && v ? <span className="font-medium" style={{ color: 'var(--status-warning-fg)' }}>{v} (overdue)</span> : v;
  };

  const [main, upkeep] = [['company', 'customers'].map((id) => BLOCKS.find((b) => b.id === id)!), BLOCKS.filter((b) => b.id === 'evidence')];
  const hasRows = (b: BlockDef) => b.rows.some((r) => r.key || (val(r) !== '' && val(r) != null));
  const top = main.filter(hasRows);
  const block = (b: BlockDef) => <Block key={b.id} b={b} c={c} val={val} onSaved={onSaved} onOpen={onOpen} />;
  // a row of equal cards: three across, two across when narrower; a lone last card takes the room left
  const across = (n: number) => n >= 3 ? 'grid gap-4 @3xl:grid-cols-2 @6xl:grid-cols-3 @3xl:[&>:last-child:nth-child(odd)]:col-span-2 @6xl:[&>:last-child:nth-child(odd)]:col-span-1' : n === 2 ? 'grid gap-4 @3xl:grid-cols-2' : 'grid gap-4';

  return (
    <div className="@container flex flex-col gap-4">
      <div className={across(top.length)}>{top.map(block)}</div>
      <div className={across(1 + upkeep.length)}>{todo}{upkeep.map(block)}</div>
      <HeadToHead c={c} onSaved={onSaved} />
    </div>
  );
}

/** Strengths and weaknesses, side by side at the bottom. A side with nothing in it gives its room to the other. */
function HeadToHead({ c, onSaved }: { c: any; onSaved: () => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState('');
  const act = useAction();
  const filledSides = SIDES.filter((s) => filled(c[s.key]) || editing === s.key);
  const emptySides = SIDES.filter((s) => !filledSides.includes(s));
  const save = (key: string) => act.run(async () => {
    const v = text.trim();
    if (v !== String(c[key] ?? '')) await api(`/items/${c.id}`, { method: 'PATCH', body: { fields: { [key]: v } } });
    setEditing(null); onSaved();
  });
  return (
    <div aria-label="Strengths and weaknesses" className={`grid gap-4 ${filledSides.length > 1 ? '@3xl:grid-cols-2' : ''}`}>
      {filledSides.map((s) => (
        <section key={s.key} className={`min-w-0 p-6 ${EVERY}`}>
          <div className="mb-4 flex items-center gap-2">
            <h3 className="m-0 flex-1 text-[18px] font-bold text-[var(--text-heading)]">{s.title}</h3>
            {editing !== s.key && <button type="button" className="text-[14px] font-semibold text-[var(--sd-accent)]" onClick={() => { setText(c[s.key] || ''); setEditing(s.key); }}>Edit</button>}
          </div>
          {editing === s.key ? (
            <>
              <Field label="One point on each line"><textarea rows={6} style={{ width: '100%' }} value={text} onChange={(e) => setText(e.target.value)} /></Field>
              {act.box}
              <div className="row"><button className="btn primary" disabled={act.busy} onClick={() => save(s.key)}>Save</button><button className="btn" onClick={() => setEditing(null)}>Cancel</button></div>
            </>
          ) : <Points text={String(c[s.key])} tone={s.tone} />}
        </section>
      ))}
      {emptySides.length > 0 && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
          {emptySides.map((s) => <button key={s.key} type="button" className="text-[var(--sd-accent)]" onClick={() => { setText(''); setEditing(s.key); }}>Add {s.title.toLowerCase()}</button>)}
        </div>
      )}
    </div>
  );
}

/** One block. Rows with nothing in them are left out; Edit opens the fields this block owns. */
function Block({ b, c, val, onSaved, onOpen }: { b: BlockDef; c: any; val: (r: Row) => ReactNode; onSaved: () => void; onOpen: (tab: string) => void }) {
  const [edit, setEdit] = useState(false);
  const [vals, setVals] = useState<Record<string, any>>({});
  const act = useAction();
  const keys = b.rows.filter((r) => r.key && F[r.key]).map((r) => r.key!);
  // a long answer or a row of tags reads better under its label than squeezed beside it
  const wide = (r: Row) => r.id === 'products' || (r.key && F[r.key]?.kind === 'longtext') || (r.key && Array.isArray(c[r.key]) && c[r.key].length > 2) || (r.key && typeof c[r.key] === 'string' && c[r.key].length > 70);
  const rows = b.rows.map((r) => [r, val(r)] as const).filter(([, v]) => v !== '' && v !== undefined && v !== null);
  const start = () => { setVals(Object.fromEntries(keys.map((k) => [k, c[k]]))); setEdit(true); };
  if (!edit && rows.length === 0 && keys.length === 0) return null;
  return (
    <section className={`@container flex h-full flex-col p-6 ${EVERY}`}>
      <div className="mb-4 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="m-0 text-[18px] font-bold text-[var(--text-heading)]">{b.title}</h3>
          {b.sub && <p className="m-0 mt-1 text-[14px] text-[var(--text-muted)]">{b.sub}</p>}
        </div>
        {keys.length > 0 && !edit && <button type="button" className="text-[14px] font-semibold text-[var(--sd-accent)]" onClick={start}>{rows.length ? 'Edit' : 'Add'}</button>}
      </div>
      {!edit ? (
        rows.length === 0 ? <p className="m-0 text-[14px] text-[var(--text-muted)]">Nothing here yet.</p> : (
          <dl className="m-0">
            {rows.map(([r, v]) => (
              <div key={r.id} className={`border-t border-[var(--divider)] py-3 first:border-t-0 first:pt-0 ${r.label && !wide(r) ? 'grid items-baseline gap-x-4 @xs:grid-cols-[7rem_1fr]' : ''}`}>
                {r.label && <dt className={wide(r) ? 'mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-[var(--text-muted)]' : 'text-[14px] text-[var(--text-muted)]'}>{r.label}</dt>}
                <dd className={`m-0 min-w-0 whitespace-pre-line text-[14px] ${wide(r) ? 'text-[var(--text-secondary)]' : 'font-semibold text-[var(--text-heading)]'}`}>{v}</dd>
              </div>
            ))}
          </dl>
        )
      ) : (
        <div>
          {keys.map((k) => <Field key={k} label={F[k].label}><Control d={F[k]} value={vals[k]} onChange={(v) => setVals({ ...vals, [k]: v })} /></Field>)}
          {act.box}
          <div className="row">
            <button className="btn primary" disabled={act.busy} onClick={() => act.run(async () => {
              const fields: any = {};
              for (const k of keys) { const v = norm(F[k], vals[k]); if (JSON.stringify(v ?? '') !== JSON.stringify(c[k] ?? '')) fields[k] = v; }
              if (Object.keys(fields).length) await api(`/items/${c.id}`, { method: 'PATCH', body: { fields } });
              setEdit(false); onSaved();
            })}>Save</button>
            <button className="btn" onClick={() => setEdit(false)}>Cancel</button>
          </div>
        </div>
      )}
      {!edit && b.open && <div className="h-4" />}
      {!edit && b.open && <button type="button" className="mt-auto w-full rounded-lg bg-[var(--sd-accent-soft)] px-3.5 py-2.5 text-left text-[14px] font-semibold text-[var(--sd-accent)]" style={{ marginTop: 'auto' }} onClick={() => onOpen(b.open!.tab)}>{b.open.label}</button>}
    </section>
  );
}
