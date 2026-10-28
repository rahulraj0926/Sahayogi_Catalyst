'use client';
import Link from 'next/link';
import { ChevronDown, ChevronUp, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { Card } from '@/components/dashboard/Card';
import { ErrorBox } from '@/components/ui';
import { PHASE_SHORT } from '@/components/shell/groups';
import { ColumnHead, OptionList } from './ColumnFilter';
import { useProducts } from './client';
import { HOME_COPY as C } from './copy';
import { NewProduct } from './NewProduct';
import { nextOf } from './nextStep';
import type { HomeProduct, ProductFilters, SortKey } from './types';

const PAGE = 10;
const BANDS: [string, string][] = [['0-25', 'Under 25%'], ['25-50', '25% to 50%'], ['50-75', '50% to 75%'], ['75-100', '75% and over']];
const inBand = (pct: number, band: string) => { const [lo, hi] = band.split('-').map(Number); return pct >= lo && (pct < hi || hi === 100); };

export const DEFAULT_FILTERS: ProductFilters = { q: '', stage: '', kind: '', health: '', owner: '', phase: '', ready: '', sort: 'activity', order: 'desc', page: 1 };

function SortButton({ id, label, f, set }: { id: SortKey; label: string; f: ProductFilters; set: (p: Partial<ProductFilters>) => void }) {
  const on = f.sort === id;
  return (
    <button type="button" aria-sort={on ? (f.order === 'asc' ? 'ascending' : 'descending') : 'none'} className="inline-flex items-center gap-1 hover:text-[var(--text-heading)]" onClick={() => set({ sort: id, order: on && f.order === 'desc' ? 'asc' : 'desc', page: 1 })}>
      {label}{on && (f.order === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
    </button>
  );
}

// same look as the other headings, whose label is a sort button (buttons do not take the heading's upper-casing)
const HEAD = 'whitespace-nowrap px-3 py-2 text-left text-xs font-semibold tracking-wide text-[var(--text-muted)]';
const CELL = 'px-3 py-3 text-sm';

/** One titled block inside a column's filter menu (the columns that used to have their own are now filtered from here). */
function FilterGroup({ title, sort, children }: { title: string; sort?: ReactNode; children: ReactNode }) {
  return (
    <div className="mt-1.5 border-t border-[var(--divider)] pt-1.5">
      <div className="flex items-center justify-between px-2 pb-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--text-muted)]"><span>{title}</span>{sort}</div>
      {children}
    </div>
  );
}

/** The percentage with a thin bar, the same length on every row so the bars line up. */
function Readiness({ pct }: { pct: number }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-10 shrink-0 font-semibold tabular-nums text-[var(--text-heading)]">{pct}%</span>
      <div role="progressbar" aria-label="Readiness" aria-valuemin={0} aria-valuemax={100} aria-valuenow={w} className="h-1.5 min-w-[3rem] flex-1 overflow-hidden rounded-full bg-[var(--surface-muted)]">
        <div className="h-full rounded-full bg-[var(--ok)]" style={{ width: `${w}%` }} />
      </div>
    </div>
  );
}

function Row({ p }: { p: HomeProduct }) {
  const n = nextOf(p);
  return (
    <tr className="border-t border-[var(--divider)] hover:bg-[var(--surface-muted)]/60">
      <td className={CELL}><Link href={`/products/${p.slug}`} className="block truncate font-semibold text-[var(--text-heading)]" title={p.name}>{p.name}</Link></td>
      <td className={`${CELL} text-[var(--text-heading)]`}><span className="block truncate">Phase {p.phase.id} · {p.phase.short}</span></td>
      <td className={CELL}><Readiness pct={p.readinessPercent} /></td>
      <td className={CELL}><span className="inline-flex whitespace-nowrap"><StatusBadge status={C.healthStatus[p.health]} label={C.healthLabel[p.health]} /></span></td>
      <td className={`${CELL} text-[var(--text-secondary)]`}><span className="block truncate" title={`${n.text}${n.min ? ` · about ${n.min} min` : ''}`}>{n.text}</span></td>
    </tr>
  );
}

export function ProductsTable({ filters, onFilters }: { filters: ProductFilters; onFilters: (f: ProductFilters) => void }) {
  // the server filters name, kind, stage, owner and health; phase and readiness are filtered here, so everything comes in one go
  const { data, error, loading } = useProducts({ ...filters, page: 1 }, 100);
  const [text, setText] = useState(filters.q);
  const [adding, setAdding] = useState(false);
  const set = (p: Partial<ProductFilters>) => onFilters({ ...filters, ...p });
  useEffect(() => { setText(filters.q); }, [filters.q]);
  useEffect(() => { // search while typing, after a short pause
    if (text === filters.q) return;
    const t = setTimeout(() => onFilters({ ...filters, q: text, page: 1 }), 300);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  const phases = filters.phase ? filters.phase.split(',') : [];
  const rows = useMemo(() => (data?.data ?? []).filter((p) => (!phases.length || phases.includes(String(p.phase.id))) && (!filters.ready || inBand(p.readinessPercent, filters.ready))), [data, filters.phase, filters.ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const page = Math.min(filters.page, pages);
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);
  const active = !!(filters.q || filters.stage || filters.kind || filters.health || filters.owner || filters.phase || filters.ready);
  const opts = (pairs: readonly (readonly [string, string])[]) => pairs.filter(([v]) => v).map(([value, label]) => ({ value, label }));

  return (
    <Card title={C.productsTitle} action={<div className="flex items-center gap-2">{active && <button type="button" className="btn ghost sm" onClick={() => onFilters(DEFAULT_FILTERS)}>Clear filters</button>}<button type="button" className="btn primary sm inline-flex items-center gap-1" onClick={() => setAdding(true)}><Plus size={14} />Add product</button></div>}>
      {error && <ErrorBox message={error} />}
      {data && (
        <div className={`-mx-1 overflow-x-auto pb-24 -mb-24 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {/* The five columns share the whole width in fixed proportions, so the table fills its card on any screen and nothing bunches up on the left. */}
          <table className="w-full min-w-[56rem] table-fixed border-collapse text-left">
            <colgroup><col className="w-[22%]" /><col className="w-[19%]" /><col className="w-[19%]" /><col className="w-[14%]" /><col className="w-[26%]" /></colgroup>
            <thead>
              <tr>
                {/* Product also holds the filters of the columns that were taken out: search (name or owner), kind and owner. */}
                <ColumnHead label="Product" active={!!(filters.q || filters.kind || filters.owner)} sort={<SortButton id="name" label="Product" f={filters} set={set} />}>
                  <label className="relative block"><Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input autoFocus className="h-9 w-full rounded-md border border-[var(--card-border)] bg-[var(--surface)] pr-2 text-sm" style={{ paddingLeft: 32 }} placeholder="Name or owner" aria-label="Search products" value={text} onChange={(e) => setText(e.target.value)} /></label>
                  <FilterGroup title="Kind"><OptionList options={opts(C.kinds)} value={filters.kind} onChange={(kind) => set({ kind, page: 1 })} anyLabel="Any kind" /></FilterGroup>
                  <FilterGroup title="Owner" sort={<SortButton id="owner" label="Sort" f={filters} set={set} />}><OptionList multi={false} options={(data.owners ?? []).map((o) => ({ value: o, label: o }))} value={filters.owner} onChange={(owner) => set({ owner, page: 1 })} anyLabel="Any owner" /></FilterGroup>
                </ColumnHead>
                {/* Current Stage holds the phase filter and the stage filter. */}
                <ColumnHead label="Current Stage" active={!!(filters.phase || filters.stage)} sort={<SortButton id="phase" label="Current Stage" f={filters} set={set} />}>
                  <OptionList options={PHASE_SHORT.map((n, i) => ({ value: String(i), label: `Phase ${i} · ${n}` }))} value={filters.phase} onChange={(phase) => set({ phase, page: 1 })} anyLabel="Any phase" />
                  <FilterGroup title="Stage" sort={<SortButton id="stage" label="Sort" f={filters} set={set} />}><OptionList options={opts(C.stages)} value={filters.stage} onChange={(stage) => set({ stage, page: 1 })} anyLabel="Any stage" /></FilterGroup>
                </ColumnHead>
                <ColumnHead label="Readiness" active={!!filters.ready} sort={<SortButton id="readiness" label="Readiness" f={filters} set={set} />}><OptionList multi={false} options={BANDS.map(([value, label]) => ({ value, label }))} value={filters.ready} onChange={(ready) => set({ ready, page: 1 })} anyLabel="Any readiness" /></ColumnHead>
                <ColumnHead label="Health" active={!!filters.health} sort={<SortButton id="activity" label="Health" f={filters} set={set} />}><OptionList options={opts(C.healths)} value={filters.health} onChange={(health) => set({ health, page: 1 })} anyLabel="Any health" /></ColumnHead>
                <th className={HEAD}>Next Action</th>
              </tr>
            </thead>
            <tbody>{shown.map((p) => <Row key={p.id} p={p} />)}</tbody>
          </table>
          {shown.length === 0 && <EmptyState title={C.noProducts} />}
        </div>
      )}
      {!data && loading && <div className="h-40 animate-pulse rounded-md bg-[var(--surface-muted)]" />}
      {data && rows.length > 0 && (
        <div className="mt-3 flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>{rows.length} product{rows.length === 1 ? '' : 's'}{pages > 1 ? ` · page ${page} of ${pages}` : ''}</span>
          {pages > 1 && <span className="flex gap-2">
            <button type="button" className="btn sm" disabled={page <= 1} onClick={() => set({ page: page - 1 })}>Previous</button>
            <button type="button" className="btn sm" disabled={page >= pages} onClick={() => set({ page: page + 1 })}>Next</button>
          </span>}
        </div>
      )}
      {adding && <NewProduct onClose={() => setAdding(false)} />}
    </Card>
  );
}
