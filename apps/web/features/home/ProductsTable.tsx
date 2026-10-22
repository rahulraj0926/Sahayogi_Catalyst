'use client';
import Link from 'next/link';
import { ChevronDown, ChevronUp, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { Card } from '@/components/dashboard/Card';
import { Badge, Bar, ErrorBox } from '@/components/ui';
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

function Row({ p }: { p: HomeProduct }) {
  return (
    <tr className="border-t border-[var(--divider)] align-top hover:bg-[var(--surface-muted)]/60">
      <td className="px-3 py-2.5">
        <Link href={`/products/${p.slug}`} className="font-semibold text-[var(--text-heading)] hover:underline">{p.name}</Link>
        <div className="max-w-[16rem] truncate text-xs text-[var(--text-muted)]" title={p.oneLiner}>{p.oneLiner}</div>
      </td>
      <td className="px-3 py-2.5"><Badge kind="outline">{p.kind}</Badge></td>
      <td className="px-3 py-2.5 text-sm">
        <span className="font-medium">Phase {p.phase.id}</span>
        <div className="text-xs text-[var(--text-muted)]">{p.phase.short}</div>
      </td>
      <td className="px-3 py-2.5 text-sm">{p.stageLabel}{p.daysInStage !== null && <div className="text-xs text-[var(--text-muted)]">{p.daysInStage} days</div>}</td>
      <td className="px-3 py-2.5 text-sm">{p.owner || <span className="text-[var(--text-muted)]">No owner</span>}</td>
      <td className="min-w-[8rem] px-3 py-2.5"><Bar pct={p.readinessPercent} /><span className="text-xs text-[var(--text-muted)]">{p.readinessPercent}% ready</span></td>
      <td className="px-3 py-2.5">
        <StatusBadge status={C.healthStatus[p.health]} label={C.healthLabel[p.health]} />
        {p.approvalsWaiting > 0 && <div className="mt-1 text-xs text-[var(--text-muted)]">{p.approvalsWaiting} approval{p.approvalsWaiting > 1 ? 's' : ''} waiting</div>}
      </td>
      <td className="hidden max-w-[18rem] px-3 py-2.5 text-xs @[76rem]:table-cell text-[var(--text-secondary)]"><span className="line-clamp-2 text-[var(--sd-accent)]" title={p.nextStep}>{(() => { const n = nextOf(p); return `${n.text}${n.min ? ` · ${n.min} min` : ''}`; })()}</span></td>
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
          <table className="w-full min-w-[42rem] border-collapse text-left">
            <thead>
              <tr>
                <ColumnHead label="Product" active={!!filters.q} sort={<SortButton id="name" label="Product" f={filters} set={set} />}>
                  <label className="relative block"><Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input autoFocus className="h-9 w-full rounded-md border border-[var(--card-border)] bg-[var(--surface)] pr-2 text-sm" style={{ paddingLeft: 32 }} placeholder="Name or owner" aria-label="Search products" value={text} onChange={(e) => setText(e.target.value)} /></label>
                </ColumnHead>
                <ColumnHead label="Lifecycle" active={!!filters.kind}><OptionList options={opts(C.kinds)} value={filters.kind} onChange={(kind) => set({ kind, page: 1 })} anyLabel="Any kind" /></ColumnHead>
                <ColumnHead label="Phase" active={!!filters.phase} sort={<SortButton id="phase" label="Phase" f={filters} set={set} />}>
                  <OptionList options={PHASE_SHORT.map((n, i) => ({ value: String(i), label: `Phase ${i} · ${n}` }))} value={filters.phase} onChange={(phase) => set({ phase, page: 1 })} anyLabel="Any phase" />
                </ColumnHead>
                <ColumnHead label="Stage" active={!!filters.stage} sort={<SortButton id="stage" label="Stage" f={filters} set={set} />}><OptionList options={opts(C.stages)} value={filters.stage} onChange={(stage) => set({ stage, page: 1 })} anyLabel="Any stage" /></ColumnHead>
                <ColumnHead align="right" label="Owner" active={!!filters.owner} sort={<SortButton id="owner" label="Owner" f={filters} set={set} />}><OptionList multi={false} options={(data.owners ?? []).map((o) => ({ value: o, label: o }))} value={filters.owner} onChange={(owner) => set({ owner, page: 1 })} anyLabel="Any owner" /></ColumnHead>
                <ColumnHead align="right" label="Readiness" active={!!filters.ready} sort={<SortButton id="readiness" label="Readiness" f={filters} set={set} />}><OptionList multi={false} options={BANDS.map(([value, label]) => ({ value, label }))} value={filters.ready} onChange={(ready) => set({ ready, page: 1 })} anyLabel="Any readiness" /></ColumnHead>
                <ColumnHead align="right" label="Health" active={!!filters.health} sort={<SortButton id="activity" label="Health" f={filters} set={set} />}><OptionList options={opts(C.healths)} value={filters.health} onChange={(health) => set({ health, page: 1 })} anyLabel="Any health" /></ColumnHead>
                <th className="hidden px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] @[76rem]:table-cell">Next</th>
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
