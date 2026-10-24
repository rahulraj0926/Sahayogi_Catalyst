'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Card } from '@/components/dashboard/Card';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { PHASE_SHORT } from '@/components/shell/groups';
import { useProducts } from './client';
import { HOME_COPY as C } from './copy';
import { DEFAULT_FILTERS } from './ProductsTable';

const N = PHASE_SHORT.length; // 13 phases: 0 Intake ... 12 Improve
const PER = 10; // products listed per page under the line
const HEALTH_COLOR: Record<string, string> = { on_track: '#22a06b', attention: '#e0a526', blocked: '#ec8a3c', idle: '#8b95a7' };

/**
 * The lifecycle as one straight line of 13 phases. Above each phase: how many products are in it and a bar to compare phases.
 * The line itself never grows with the number of products. Pick a phase to see its products in a list, 10 to a page, so 5 or 500 products look the same.
 */
export function LifecycleLine() {
  const router = useRouter();
  const { data, loading, error } = useProducts({ ...DEFAULT_FILTERS, sort: 'name', order: 'asc', page: 1 }, 100);
  const products = useMemo(() => data?.data ?? [], [data]);
  const [pick, setPick] = useState<number | null>(null);
  const [pg, setPg] = useState(1);
  const by = useMemo(() => PHASE_SHORT.map((_, i) => products.filter((p) => p.phase.id === i)), [products]);
  const past = (i: number) => products.filter((p) => p.phase.id > i).length;
  const furthest = products.reduce((m, p) => Math.max(m, p.phase.id), -1);
  const list = pick === null ? [] : by[pick];
  const pages = Math.max(1, Math.ceil(list.length / PER));
  const page = Math.min(pg, pages);
  const choose = (i: number) => { setPick((c) => (c === i ? null : i)); setPg(1); };
  const note = (m: string) => <p className="text-sm text-[var(--text-muted)]">{m}</p>;

  return (
    <Card title="Product lifecycle">
      {loading ? note('Loading…') : error ? note('The lifecycle could not be loaded.') : products.length === 0 ? <EmptyState title="No products yet" description="Create a product to see where it sits in the lifecycle." /> : (
        <div className="flex flex-col gap-4">
          {/* ---- the line: it scrolls sideways on a narrow screen, it never wraps or grows */}
          <div className="overflow-x-auto pb-1 pt-1" role="group" aria-label="Lifecycle phases">
            <div className="grid" style={{ gridTemplateColumns: `repeat(${N}, minmax(4.5rem, 1fr))`, minWidth: `${N * 4.5}rem`, gap: 0 }}>
              {PHASE_SHORT.map((name, i) => {
                const n = by[i].length; const sel = pick === i;
                return (
                  <button key={name} type="button" aria-pressed={sel} onClick={() => choose(i)}
                    title={`Phase ${i}, ${name}: ${n} ${n === 1 ? 'product' : 'products'}`}
                    className={`group flex flex-col items-center gap-1 rounded-lg px-0 pb-2 pt-1 text-center transition-colors hover:bg-[var(--search-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--sd-accent)] ${sel ? 'bg-[var(--search-bg)]' : ''}`}
                    style={{ minHeight: 0, border: 0, padding: '4px 0 8px', background: sel ? undefined : 'transparent' }}>
                    <span className="relative flex h-9 w-full items-center justify-center" aria-hidden>
                      {i > 0 && <span className="absolute left-0 right-1/2 top-1/2 h-[3px] -translate-y-1/2" style={{ background: i <= furthest ? 'var(--sd-accent)' : 'var(--divider)' }} />}
                      {i < N - 1 && <span className="absolute left-1/2 right-0 top-1/2 h-[3px] -translate-y-1/2" style={{ background: i + 1 <= furthest ? 'var(--sd-accent)' : 'var(--divider)' }} />}
                      <span className="relative z-10 grid h-8 w-8 place-items-center rounded-full text-xs font-bold transition-transform group-hover:scale-110"
                        style={{ background: n ? 'var(--sd-accent)' : 'var(--surface)', color: n ? '#fff' : 'var(--text-muted)', border: `2px solid ${n ? 'var(--sd-accent)' : 'var(--divider)'}`, boxShadow: sel ? '0 0 0 3px var(--surface), 0 0 0 5px var(--sd-accent)' : undefined }}>{i}</span>
                    </span>
                    <span className={`min-h-[2lh] text-[0.6875rem] leading-tight ${n ? 'font-medium text-[var(--text-heading)]' : 'text-[var(--text-muted)] opacity-70'}`} style={{ overflowWrap: 'anywhere' }}>{name}</span>
                    <span className={`text-xs font-bold tabular-nums ${n ? 'text-[var(--text-heading)]' : 'text-[var(--text-muted)] opacity-60'}`} title={`${n} ${n === 1 ? 'product' : 'products'} in this phase`}>{n}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ---- the products of the picked phase; nothing is shown until a phase is picked */}
          {pick !== null && <div className="rounded-lg border border-[var(--card-border)] p-3">
            {(
              <>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm"><b className="text-[var(--text-heading)]">Phase {pick}: {PHASE_SHORT[pick]}</b> <span className="text-[var(--text-muted)]">· {list.length} {list.length === 1 ? 'product' : 'products'} here · {past(pick)} already past it</span></div>
                  <span className="flex gap-2">
                    {list.length > 0 && <button type="button" className="btn sm" onClick={() => router.replace(`/?phase=${pick}`, { scroll: false })}>Show in the table below</button>}
                    <button type="button" className="btn sm ghost" onClick={() => setPick(null)}>Close</button>
                  </span>
                </div>
                {list.length === 0 ? <p className="text-sm text-[var(--text-muted)]">No product is in this phase.</p> : (
                  <>
                    <ul className="divide-y divide-[var(--card-border)]">
                      {list.slice((page - 1) * PER, page * PER).map((p) => (
                        <li key={p.id}>
                          <Link href={`/products/${p.slug}`} className="flex items-center gap-3 py-1.5 text-sm hover:bg-[var(--search-bg)]">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: HEALTH_COLOR[p.health] }} title={C.healthLabel[p.health]} />
                            <span className="min-w-0 flex-1 truncate font-medium text-[var(--text-heading)]">{p.name}</span>
                            <span className="hidden shrink-0 text-xs text-[var(--text-muted)] sm:inline">{C.healthLabel[p.health]}</span>
                            <span className="w-10 shrink-0 text-right text-xs tabular-nums text-[var(--text-muted)]">{p.readinessPercent}%</span>
                          </Link>
                        </li>))}
                    </ul>
                    {pages > 1 && (
                      <div className="flex items-center justify-between pt-2 text-xs text-[var(--text-muted)]">
                        <span>{(page - 1) * PER + 1}–{Math.min(page * PER, list.length)} of {list.length}</span>
                        <span className="flex gap-2">
                          <button type="button" className="btn sm" disabled={page <= 1} onClick={() => setPg(page - 1)}>Previous</button>
                          <button type="button" className="btn sm" disabled={page >= pages} onClick={() => setPg(page + 1)}>Next</button>
                        </span>
                      </div>)}
                  </>)}
              </>)}
          </div>}
        </div>)}
    </Card>
  );
}
