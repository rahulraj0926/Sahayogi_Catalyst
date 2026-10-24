'use client';
/**
 * The pieces every "plans and what they include" screen shares: a competitor's plans (Plans.tsx) and our own (Planner.tsx).
 * A plan card, the feature list with one tick box per plan, the search bar above it, the "copy features" bar, and the
 * bulk-tick logic (instant on screen, saved in the background, put back if the save fails, with Undo).
 */
import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight, Check, ChevronDown, ChevronUp, ListFilter, Search, X } from 'lucide-react';
import { Field, Modal, useAction } from '@/components/kit';
import { useApi } from '@/lib/api';

export const CHUNK = 200;
/** The top row of a long list: solid, so the rows scrolling under it never show through (set inline so no table style can override it). */
export const STICKY: CSSProperties = { position: 'sticky', top: 0, zIndex: 3, background: 'var(--bg)', boxShadow: 'inset 0 -1px 0 var(--divider)' };
const SMALL_SELECT: CSSProperties = { height: 32, minHeight: 0, padding: '0 8px', fontSize: 13 };

/** A checkbox that can show "some of them" (used on a group of features and on a whole column). */
export function GroupBox({ all, some, onChange, label }: { all: boolean; some: boolean; onChange: (v: boolean) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = some && !all; }, [all, some]);
  return <input ref={ref} type="checkbox" aria-label={label} checked={all} onChange={(e) => onChange(e.target.checked)} />;
}

/** A list with a fixed height that shows a small arrow where there is more to scroll to (the scroll bar itself is hidden). */
function ScrollList({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLUListElement>(null);
  const [more, setMore] = useState({ up: false, down: false });
  const look = () => {
    const el = ref.current; if (!el) return;
    const up = el.scrollTop > 2, down = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
    setMore((m) => (m.up === up && m.down === down ? m : { up, down }));
  };
  useEffect(() => {
    look();
    const el = ref.current; if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(look); ro.observe(el); return () => ro.disconnect();
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const go = (dir: number) => ref.current?.scrollBy({ top: dir * 120, behavior: 'smooth' });
  const arrow = 'absolute left-0 right-0 z-10 flex h-6 items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-heading)]';
  return (
    <div className="relative">
      {more.up && <button type="button" aria-label={`Scroll ${label} up`} className={`${arrow} top-0 bg-gradient-to-b from-[var(--bg)] to-transparent`} onClick={() => go(-1)}><ChevronUp size={16} /></button>}
      <ul ref={ref} onScroll={look} className="m-0 grid max-h-64 list-none gap-1 overflow-y-auto p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{children}</ul>
      {more.down && <button type="button" aria-label={`Scroll ${label} down`} className={`${arrow} bottom-0 bg-gradient-to-t from-[var(--bg)] to-transparent`} onClick={() => go(1)}><ChevronDown size={16} /></button>}
    </div>
  );
}

/** The plans side by side; sideways scroll when there are many. */
export function PlanRow({ children }: { children: ReactNode }) {
  return <div className="flex items-stretch gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{children}</div>;
}

export interface PlanCardProps {
  title: string;
  /** a second line under the name (for example the product it belongs to) */
  sub?: string | null;
  /** the small action at the top right (Rename, Edit) */
  action?: { label: string; onClick: () => void };
  /** what it costs: one line per billing period */
  terms?: { id: string; label: string; value: string }[];
  note?: string | null;
  /** anything extra under the price (for example who checked the prices) */
  extra?: ReactNode;
  features: { key: string; name: string }[];
  onRemoveFeature: (key: string) => void;
  /** when given, the card shows an "Add feature" button above its list and the empty text points to it */
  onAddFeature?: () => void;
  onDelete: () => void;
  busy?: boolean;
}

/** One plan: name, price, the features it includes (with a × to take one out) and Delete. The same card for a competitor's plan and for ours. */
export function PlanCard(p: PlanCardProps) {
  return (
    <div className="flex w-[260px] shrink-0 flex-col gap-3 rounded-xl border border-[var(--divider)] p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold text-[var(--text-heading)]">{p.title}</div>
          {p.sub && <div className="truncate text-xs text-[var(--text-muted)]">{p.sub}</div>}
        </div>
        {p.action && <button type="button" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-heading)]" onClick={p.action.onClick}>{p.action.label}</button>}
      </div>
      {p.terms && p.terms.length > 0 && (
        <div className="grid gap-0.5">
          {p.terms.map((t) => <div key={t.id} className="flex justify-between text-[13px]"><span className="text-[var(--text-muted)]">{t.label}</span><span className="font-medium text-[var(--text-heading)]">{t.value}</span></div>)}
        </div>
      )}
      {p.note && <div className="text-xs text-[var(--text-muted)]">{p.note}</div>}
      {p.extra}
      <div className="border-t border-[var(--divider)] pt-3">
        <div className="mb-1.5 flex items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
          <span>{p.features.length} feature{p.features.length === 1 ? '' : 's'} included</span>
          {p.onAddFeature && <button type="button" className="text-[13px] text-[var(--sd-accent)]" disabled={p.busy} onClick={p.onAddFeature}>+ Add feature</button>}
        </div>
        {p.features.length === 0 ? <div className="text-xs text-[var(--text-muted)]">{p.onAddFeature ? 'None yet.' : 'None yet. Tick them below.'}</div> : (
          <ScrollList label={`${p.title} features`}>
            {p.features.map((f) => (
              <li key={f.key} className="group flex items-start gap-1.5 text-[13px]">
                <span aria-hidden className="text-[var(--ok)]">✓</span>
                <span className="min-w-0 flex-1">{f.name}</span>
                <button type="button" aria-label={`Remove ${f.name} from ${p.title}`} title="Remove" className="text-[var(--text-muted)] opacity-0 hover:text-[var(--bad)] group-hover:opacity-100 focus:opacity-100" onClick={() => p.onRemoveFeature(f.key)}>×</button>
              </li>
            ))}
          </ScrollList>
        )}
      </div>
      <button type="button" className="mt-auto self-start text-[13px] text-[var(--text-muted)] hover:text-[var(--bad)]" disabled={p.busy} onClick={p.onDelete}>Delete plan</button>
    </div>
  );
}

/** For one plan column: show only the features it has (`in`) or only the ones it lacks (`out`). No entry means no filter. */
export type Filters = Record<string, 'in' | 'out'>;
/** Search and group above a feature list. Which features to show (all, ticked, not ticked) is chosen in the grid's first column. `children` goes at the end (for example an Add button). */
export function FeatureBar({ title, q, setQ, group, setGroup, groups, children }: { title: string; q: string; setQ: (v: string) => void; group: string; setGroup: (v: string) => void; groups: string[]; children?: ReactNode }) {
  return (
    <>
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <h2 className="m-0 mr-auto text-[15px] font-semibold text-[var(--text-heading)]">{title}</h2>
      <label className="relative block">
        <Search size={14} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search features" aria-label="Search features" className="h-9 w-44 rounded-lg border border-[var(--divider)] bg-[var(--search-bg)] pr-2 text-sm" style={{ paddingLeft: 32 }} />
      </label>
      {groups.length > 1 && (
        <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Group" style={{ height: 36, minHeight: 0, padding: '0 8px', fontSize: 13 }}>
          <option value="">All groups</option>{groups.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      )}
      {children}
    </div>
    </>
  );
}

/** "Copy features: [plan] -> [plan]" and the line that says what the last change was, with Undo. The two chosen plans are reported through `onPick` so the table can highlight them. */
/** `news(from, to)` is how many features the copy would add, so the button can say so and stay off when there is nothing new. */
export function CopyBar({ plans, msg, news, onCopy, onUndo, onPick }: { plans: { key: string; label: string }[]; msg: { text: string; undo?: () => void } | null; news: (from: string, to: string) => number; onCopy: (from: string, to: string) => void; onUndo: () => void; onPick?: (from: string, to: string) => void }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  useEffect(() => { onPick?.(from, to); }, [from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  if (plans.length < 2 && !msg) return null;
  const n = from && to && from !== to ? news(from, to) : 0;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
      {plans.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--divider)] px-3 py-2">
          <span className="font-medium text-[var(--text-heading)]">Copy features</span>
          <select value={from} onChange={(e) => { setFrom(e.target.value); if (e.target.value === to) setTo(''); }} aria-label="Copy from" style={SMALL_SELECT}><option value="">From plan</option>{plans.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select>
          <ArrowRight size={14} aria-hidden className="text-[var(--text-muted)]" />
          <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Copy to" style={SMALL_SELECT}><option value="">To plan</option>{plans.filter((p) => p.key !== from).map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select>
          <button type="button" className="btn sm primary" disabled={n === 0} onClick={() => onCopy(from, to)}>{from && to ? (n === 0 ? 'Nothing new to copy' : `Copy ${n} feature${n === 1 ? '' : 's'}`) : 'Copy'}</button>
        </div>
      )}
      {msg && <span className="ml-auto text-[13px] text-[var(--text-muted)]">{msg.text}{msg.undo && <button type="button" className="ml-2 font-medium text-[var(--sd-accent)]" onClick={onUndo}>Undo</button>}</span>}
    </div>
  );
}

/** The small button under a plan name: click once to list only the features the plan has, again for only the ones it lacks, again for all. */
function FilterButton({ mode, plan, onChange }: { mode?: 'in' | 'out'; plan: string; onChange: (v: 'in' | 'out' | undefined) => void }) {
  const next = mode === undefined ? 'in' : mode === 'in' ? 'out' : undefined;
  const title = next === 'in' ? `Show only features ${plan} has` : next === 'out' ? `Show only features ${plan} does not have` : 'Show all features again';
  const look = mode === 'in' ? 'border-[var(--ok)] text-[var(--ok)]' : mode === 'out' ? 'border-[var(--warn)] text-[var(--warn)]' : 'border-transparent text-[var(--text-muted)] opacity-0 transition-opacity hover:text-[var(--text-heading)] focus-visible:opacity-100 group-hover/col:opacity-100 [@media(hover:none)]:opacity-100';
  return (
    <button type="button" title={title} aria-label={title} className={`mx-auto mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${look}`} onClick={() => onChange(next)}>
      {mode === 'in' ? <><Check size={12} />Has it</> : mode === 'out' ? <><X size={12} />Lacks it</> : <><ListFilter size={12} />Filter</>}
    </button>
  );
}

/**
 * The feature list: one row per feature, one tick box per plan. Click anywhere in a cell to tick it; the box at the top of a column
 * ticks (or unticks) every feature shown; each group has its own box. The list scrolls inside its frame and the plan names stay on top.
 */
export function FeatureGrid({ rows, cols, has, apply, fkey, count, showGroups, onRename, onRemove, filters, setFilter, total, onClear, hl }: {
  /** the plans chosen in the copy bar: their columns are tinted, and the features about to be added to `to` are marked */ hl?: { from: string; to: string };
  /** per plan: only features it has / only features it lacks */ filters: Filters; setFilter: (col: string, v: 'in' | 'out' | undefined) => void; /** every feature on the list, shown or not */ total: number; onClear: () => void;
  onRename?: (f: any) => void; onRemove?: (f: any) => void;
  rows: any[]; cols: { key: string; label: string }[]; has: (f: any, col: string) => boolean; apply: (col: string, fs: any[], on: boolean) => void;
  fkey: (f: any) => string; count: (col: string) => number; showGroups: boolean;
}) {
  const tint = (col: string, strong = false): CSSProperties | undefined => {
    if (!hl) return undefined;
    if (col === hl.from) return { background: 'color-mix(in srgb, var(--sd-accent) 12%, transparent)' };
    if (col === hl.to) return { background: `color-mix(in srgb, var(--ok) ${strong ? 30 : 12}%, transparent)` };
    return undefined;
  };
  const role = (col: string) => (hl && col === hl.from ? 'Copying from' : hl && col === hl.to ? 'Copying to' : '');
  return (
    <div className="max-h-[65vh] overflow-auto rounded-xl border border-[var(--divider)] [scrollbar-width:thin]">
      <table className="tbl compact" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
        <thead>
          <tr>
            <th style={STICKY}>
              <span>Feature <span className="font-normal text-[var(--text-muted)]">({rows.length === total ? total : `${rows.length} of ${total}`})</span></span>
            </th>
            {cols.map((c) => {
              const n = rows.filter((x) => has(x, c.key)).length;
              return (
                <th key={c.key} className="group/col" style={{ ...STICKY, minWidth: 96, textAlign: 'center', ...(role(c.key) ? { background: (() => { const t = c.key === hl?.from ? 'color-mix(in srgb, var(--sd-accent) 16%, transparent)' : 'color-mix(in srgb, var(--ok) 16%, transparent)'; return `linear-gradient(${t}, ${t}), var(--bg)`; })() } : {}) }}>
                  <label className="flex w-full cursor-pointer flex-col items-center gap-1">
                    {role(c.key) && <span className={`text-[11px] font-semibold ${c.key === hl?.from ? 'text-[var(--sd-accent)]' : 'text-[var(--ok)]'}`}>{role(c.key)}</span>}
                    <span className={role(c.key) ? 'font-bold text-[var(--text-heading)]' : ''}>{c.label}</span>
                    <GroupBox label={`All shown features in ${c.label}`} all={rows.length > 0 && n === rows.length} some={n > 0} onChange={(v) => apply(c.key, rows, v)} />
                    <span className="font-normal text-[var(--text-muted)]">{count(c.key)} of {total}</span>
                  </label>
                  <FilterButton mode={filters[c.key]} plan={c.label} onChange={(v) => setFilter(c.key, v)} />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={cols.length + 1} className="text-sm text-[var(--text-muted)]" style={{ padding: '18px 12px' }}>No feature matches. {Object.keys(filters).length > 0 && <button type="button" className="font-medium text-[var(--sd-accent)]" onClick={onClear}>Clear filters</button>}</td></tr>
          )}
          {rows.map((f, i) => {
            const cat = f.category || 'Other';
            const head = (i === 0 && showGroups) || (i > 0 && (rows[i - 1].category || 'Other') !== cat);
            const inGroup = head ? rows.filter((x) => (x.category || 'Other') === cat) : [];
            return (
              <Fragment key={fkey(f)}>
                {head && (
                  <tr>
                    <td className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]" style={{ paddingTop: 18 }}>{cat} <span className="font-normal normal-case">({inGroup.length})</span></td>
                    {cols.map((c) => {
                      const n = inGroup.filter((x) => has(x, c.key)).length;
                      return <td key={c.key} className="text-center" style={{ paddingTop: 18, ...tint(c.key) }}><GroupBox label={`All ${cat} in ${c.label}`} all={n === inGroup.length} some={n > 0} onChange={(v) => apply(c.key, inGroup, v)} /></td>;
                    })}
                  </tr>
                )}
                <tr>
                  <td className="font-medium">
                    <div className="group flex items-center gap-2">
                      <span className="min-w-0 flex-1">{f.name}</span>
                      {(onRename || onRemove) && (
                        <span className="flex shrink-0 gap-2 text-xs font-normal opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                          {onRename && <button type="button" className="text-[var(--text-muted)] hover:text-[var(--text-heading)]" onClick={() => onRename(f)}>Rename</button>}
                          {onRemove && <button type="button" className="text-[var(--text-muted)] hover:text-[var(--bad)]" onClick={() => onRemove(f)}>Delete</button>}
                        </span>
                      )}
                    </div>
                  </td>
                  {cols.map((c) => (
                    <td key={c.key} className="cursor-pointer select-none text-center" style={tint(c.key, !!hl && c.key === hl.to && has(f, hl.from) && !has(f, hl.to))} onClick={(e) => { if ((e.target as HTMLElement).tagName !== 'INPUT') apply(c.key, [f], !has(f, c.key)); }}>
                      <input type="checkbox" aria-label={`${f.name} in ${c.label}`} checked={has(f, c.key)} onChange={(e) => apply(c.key, [f], e.target.checked)} />
                    </td>
                  ))}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export interface Msg { text: string; undo?: () => void }

/**
 * Ticking in bulk. `initial` is what the server last said (feature key -> column keys); a tick shows at once, is saved in the
 * background one batch at a time, and is put back with a message if the save fails. `send` saves one batch for one column.
 */
export function useBulkTicks({ initial, sig, fkey, colName, send, onStart }: {
  initial: Record<string, string[]> | null; sig: string; fkey: (f: any) => string; colName: (col: string) => string;
  send: (col: string, fs: any[], included: boolean) => Promise<void>; onStart?: () => void;
}) {
  const [ticks, setTicks] = useState<Record<string, string[]>>({});
  const [msg, setMsg] = useState<Msg | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const ticksRef = useRef(ticks); ticksRef.current = ticks; // the newest ticks, for Undo (a function made earlier would see old ones)
  useEffect(() => { if (initial) setTicks(initial); }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const has = (f: any, col: string) => (ticks[fkey(f)] || []).includes(col);
  const apply = (col: string, fs: any[], included: boolean, note?: string) => {
    const changed = fs.filter((f) => (ticksRef.current[fkey(f)] || []).includes(col) !== included);
    if (!changed.length) { setMsg({ text: `Nothing to change: ${colName(col)} already ${included ? 'has' : 'lacks'} ${fs.length === 1 ? 'it' : 'those'}.` }); return; }
    const set = (on: boolean) => setTicks((t) => {
      const n = { ...t };
      for (const f of changed) { const cur = new Set(n[fkey(f)] || []); if (on) cur.add(col); else cur.delete(col); n[fkey(f)] = [...cur]; }
      return n;
    });
    set(included);
    if (changed.length > 1) setMsg({ text: note || `${included ? 'Ticked' : 'Unticked'} ${changed.length} features in ${colName(col)}.`, undo: () => apply(col, changed, !included) });
    else setMsg(null);
    onStart?.();
    queue.current = queue.current.then(async () => {
      try { for (let i = 0; i < changed.length; i += CHUNK) await send(col, changed.slice(i, i + CHUNK), included); }
      catch (e: any) { set(!included); setMsg({ text: `Could not save, so it was put back: ${e?.message || e}` }); }
    });
  };
  const undo = () => { const u = msg?.undo; setMsg(null); u?.(); };
  return { ticks, has, apply, msg, undo, count: (col: string, all: any[]) => all.filter((f) => has(f, col)).length };
}


/**
 * Add features to a plan, the same window for our plans, a competitor's plan card and the feature table.
 * Click a feature that is already on the list, or type new ones (one per line). `pick` lets the person choose which plans get them (the table).
 * `rivals` also searches the features the competitors have (our plans only).
 */
export function AddFeatureModal({ title, copy, onCopy, known = [], onAddKnown, onAddNew, pick, rivals, onClose, onDone }: {
  title: string;
  copy?: { key: string; label: string; count: number }[];
  onCopy?: (from: string) => Promise<unknown>;
  known?: { key: string; name: string }[];
  onAddKnown?: (key: string, plans: string[]) => Promise<unknown> | void;
  onAddNew: (names: string[], plans: string[]) => Promise<unknown>;
  pick?: { key: string; label: string }[];
  rivals?: { pid: string; onAdd: (name: string) => Promise<unknown> };
  onClose: () => void;
  onDone: () => void;
}) {
  const [lines, setLines] = useState('');
  const [from, setFrom] = useState('');
  const [find, setFind] = useState('');
  const [q, setQ] = useState('');
  const [on, setOn] = useState<string[]>([]);
  const act = useAction();
  useEffect(() => { const t = setTimeout(() => setQ(find.trim()), 250); return () => clearTimeout(t); }, [find]);
  const names = lines.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const theirs = useApi<any>(rivals && q ? `/competitors/our-plans/pick-features?q=${encodeURIComponent(q)}&limit=6` : null, rivals?.pid || '', { keep: true });
  const matches = known.filter((f) => !q || f.name.toLowerCase().includes(q.toLowerCase()));
  const mine = matches.slice(0, 6);
  const other: any[] = rivals && q ? theirs.data?.features || [] : [];
  const total: number = rivals && q ? theirs.data?.total || 0 : 0;
  const run = (fn: () => Promise<unknown> | void) => act.run(async () => { await fn(); onDone(); });
  const btn = { justifyContent: 'space-between', textAlign: 'left' } as const;
  return (
    <Modal title={title} onClose={onClose}>
      {pick && pick.length > 0 && (
        <Field label="Put them in" help="Tick the plans that include them. You can change this later in the table.">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {pick.map((p) => <label key={p.key} className="row small" style={{ gap: 6 }}><input type="checkbox" checked={on.includes(p.key)} onChange={(e) => setOn(e.target.checked ? [...on, p.key] : on.filter((x) => x !== p.key))} />{p.label}</label>)}
          </div>
        </Field>
      )}
      {copy && copy.length > 0 && onCopy && (
        <Field label="Copy from another plan" help="Adds every feature of that plan to this one.">
          <div className="row" style={{ gap: 8 }}>
            <select value={from} onChange={(e) => setFrom(e.target.value)}><option value="">Choose a plan</option>{copy.map((p) => <option key={p.key} value={p.key}>{p.label} ({p.count} feature{p.count === 1 ? '' : 's'})</option>)}</select>
            <button type="button" className="btn" disabled={act.busy || !from} onClick={() => run(() => onCopy(from))}>Copy</button>
          </div>
        </Field>
      )}
      {(known.length > 0 || rivals) && (
        <>
          <Field label="Search features" help={rivals ? 'Search the features our plans and all the competitors have. Click one to add it to this plan.' : 'Click a feature on our list to add it to this plan.'}>
            <input type="search" autoFocus value={find} onChange={(e) => setFind(e.target.value)} placeholder="For example: audit, GST, export" />
          </Field>
          <div className="grid gap-1" style={{ margin: '-4px 0 12px' }}>
            {mine.map((f) => <button key={f.key} type="button" className="btn sm" style={btn} disabled={act.busy} onClick={() => run(() => onAddKnown?.(f.key, on))}><span>+ {f.name}</span></button>)}
            {other.map((f) => <button key={f.name} type="button" className="btn sm" style={btn} disabled={act.busy} title={(f.competitors || []).join(', ')} onClick={() => run(() => rivals!.onAdd(f.name))}><span>+ {f.name}</span><span className="xs muted">{f.count} competitor{f.count === 1 ? '' : 's'}</span></button>)}
            {theirs.loading && !theirs.data && q !== '' && rivals && <p className="small muted" style={{ margin: 0 }}>Searching…</p>}
            {q !== '' && !theirs.loading && mine.length + other.length === 0 && <p className="small muted" style={{ margin: 0 }}>No match. Type it below to add it as a new feature.</p>}
            {matches.length > mine.length && <p className="xs muted" style={{ margin: 0 }}>{matches.length - mine.length} more. Type more letters to narrow it down.</p>}
            {total > other.length && <p className="xs muted" style={{ margin: 0 }}>{total - other.length} more from competitors. Type more letters to narrow it down.</p>}
          </div>
        </>
      )}
      <Field label="Or type new features, one on each line">
        <textarea rows={4} autoFocus={known.length === 0 && !rivals} value={lines} onChange={(e) => setLines(e.target.value)} placeholder={'Two-step sign-in\nAudit log\nExport to Excel'} />
      </Field>
      {act.box}
      <button className="btn primary" disabled={act.busy || names.length === 0} onClick={() => run(() => onAddNew(names, on))}>{names.length > 1 ? `Add ${names.length} features` : 'Add feature'}</button>
    </Modal>
  );
}
