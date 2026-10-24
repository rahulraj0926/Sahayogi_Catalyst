'use client';
/**
 * One competitor on one page. Short fact blocks first, then what they do well next to where we can beat them.
 * Everything shown is either saved here or worked out from the plans, files and notes already recorded. Empty rows are left out.
 */
import { useState, type ReactNode } from 'react';
import { Field, useAction } from '@/components/kit';
import { api } from '@/lib/api';
import { BLOCKS, SIDES, type BlockDef, type Row } from './overviewBlocks';
import PointList, { fromPoints, toPoints } from './PointList';
import { Control, F, filled, norm } from './profileFields';
import FilesCard from './FilesCard';
import NotesCard from './NotesCard';
import { CARD as EVERY } from './overviewStyle';

export const THREAT_COLOR: Record<string, string> = { High: 'var(--status-critical-fg)', Medium: 'var(--status-warning-fg)', Low: 'var(--status-healthy-fg)' };
export const tint = (c: string) => `color-mix(in srgb, ${c} 14%, transparent)`;

/** The words for one saved value. */
function show(key: string, v: any): ReactNode {
  const d = F[key];
  if (key === 'website') return <a href={/^https?:/.test(v) ? v : `https://${v}`} target="_blank" rel="noopener noreferrer">{String(v).replace(/^https?:\/\//, '')}</a>;
  if (d?.kind === 'enum') return d.options!.find(([x]) => x === v)?.[1] ?? String(v);
  if (Array.isArray(v)) return <span className="flex flex-wrap gap-2">{v.map((x) => <span key={x} className="rounded-full bg-[var(--search-bg)] px-3 py-1.5 text-[13px] font-semibold text-[var(--text-heading)]">{x}</span>)}</span>;
  return String(v);
}

type Props = { c: any; pid: string; onAddProduct: () => void; lines: any[]; files: any[]; notes: any[]; onSaved: () => void; todo: ReactNode; /** the control in Company details for what kind of competitor they are */ kind: ReactNode };

export default function Overview({ c, pid, onAddProduct, lines, files, notes, onSaved, todo, kind }: Props) {
  const derived: Record<string, ReactNode> = {
    // the products this company sells (each with its own plans); the Plans tab holds their prices
    products: (
      <span className="flex flex-wrap items-center gap-2">
        {lines.filter((l) => l.product_name).map((l) => <span key={l.id} className="rounded-full bg-[var(--search-bg)] px-3 py-1.5 text-[13px] font-semibold text-[var(--text-heading)]">{l.product_name}</span>)}
        <button type="button" className="text-[14px] font-semibold text-[var(--sd-accent)]" onClick={onAddProduct}>{lines.length ? '+ Add product' : 'Add a product'}</button>
      </span>
    ),
    kind,
  };
  const val = (r: Row): ReactNode => (r.key && filled(c[r.key]) ? show(r.key, c[r.key]) : derived[r.id] || '');

  const main = ['company', 'customers'].map((id) => BLOCKS.find((b) => b.id === id)!);
  const hasRows = (b: BlockDef) => b.rows.some((r) => r.key || (val(r) !== '' && val(r) != null));
  const top = main.filter(hasRows);
  const block = (b: BlockDef) => <Block key={b.id} b={b} c={c} val={val} onSaved={onSaved} />;
  // a row of equal cards: three across, two across when narrower; a lone last card takes the room left
  const across = (n: number) => n >= 3 ? 'grid gap-4 @3xl:grid-cols-2 @6xl:grid-cols-3 @3xl:[&>:last-child:nth-child(odd)]:col-span-2 @6xl:[&>:last-child:nth-child(odd)]:col-span-1' : n === 2 ? 'grid gap-4 @3xl:grid-cols-2' : 'grid gap-4';

  return (
    <div className="@container flex flex-col gap-4">
      <div className={across(top.length)}>{top.map(block)}</div>
      <div className={across(3)}><FilesCard id={c.id} pid={pid} files={files} onSaved={onSaved} />{todo}<NotesCard c={c} notes={notes} onSaved={onSaved} /></div>
      <HeadToHead c={c} onSaved={onSaved} />
    </div>
  );
}

/** Strengths and weaknesses, side by side at the bottom: numbered points, added and changed one at a time. */
function HeadToHead({ c, onSaved }: { c: any; onSaved: () => void }) {
  return (
    <div aria-label="Strengths and weaknesses" className="grid gap-4 @3xl:grid-cols-2">
      {SIDES.map((s) => (
        <section key={s.key} className={`min-w-0 p-6 ${EVERY}`}>
          <PointList title={s.title} tone={s.tone} one={s.one} points={toPoints(c[s.key])}
            onChange={async (next) => { await api(`/items/${c.id}`, { method: 'PATCH', body: { fields: { [s.key]: next.length ? fromPoints(next) : null } } }); onSaved(); }} />
        </section>
      ))}
    </div>
  );
}

/** One block. Rows with nothing in them are left out; Edit opens the fields this block owns. */
function Block({ b, c, val, onSaved }: { b: BlockDef; c: any; val: (r: Row) => ReactNode; onSaved: () => void }) {
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
    </section>
  );
}
