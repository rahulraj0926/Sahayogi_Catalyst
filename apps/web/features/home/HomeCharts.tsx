'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useProducts } from './client';
import { Card } from '@/components/dashboard/Card';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { HOME_COPY as C } from './copy';
import { DEFAULT_FILTERS } from './ProductsTable';

// Calm, distinct colours: "held up" is a warm orange, not alarm red, so a portfolio full of blocked products still reads as work to do.
const HEALTH_COLOR: Record<string, string> = { on_track: '#22a06b', attention: '#e0a526', blocked: '#ec8a3c', idle: '#8b95a7' };
/** Readiness bars are coloured by how far along a product is, whatever its health. */
const READY_COLOR = (pct: number) => (pct >= 75 ? 'linear-gradient(90deg,#22a06b,#4cc38a)' : pct >= 50 ? 'linear-gradient(90deg,#4f7cff,#7aa2ff)' : pct >= 25 ? 'linear-gradient(90deg,#8b5cf6,#b08cff)' : 'linear-gradient(90deg,#e0a526,#f2c55c)');

const ORDER = ['blocked', 'attention', 'on_track', 'idle'] as const;
const PER = 6; // readiness rows per page

/** Ring plus one clickable row per health: count, share and a bar. A row opens the product list already filtered to it. */
function HealthBreakdown({ products }: { products: { health: string; name: string }[] }) {
  const total = products.length || 1;
  const rows = ORDER.map((h) => ({ h, label: C.healthLabel[h], color: HEALTH_COLOR[h], n: products.filter((p) => p.health === h).length }));
  const R = 38; const CIRC = 2 * Math.PI * R;
  let acc = 0;
  const good = rows.find((r) => r.h === 'on_track')?.n ?? 0;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
      <div className="relative shrink-0" style={{ width: 132, height: 132 }}>
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" role="img" aria-label={`${good} of ${products.length} products on track`}>
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--surface-muted)" strokeWidth="14" />
          {rows.filter((r) => r.n > 0).map((r) => {
            const len = (r.n / total) * CIRC; const off = acc; acc += len;
            return <circle key={r.h} cx="50" cy="50" r={R} fill="none" stroke={r.color} strokeWidth="14" strokeDasharray={`${Math.max(len - 1.5, 0)} ${CIRC}`} strokeDashoffset={-off} />;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-bold leading-none text-[var(--text-heading)]">{products.length}</span>
          <span className="mt-1 text-[0.6875rem] text-[var(--text-muted)]">products</span>
        </div>
      </div>
      <ul className="flex min-w-[11rem] flex-1 flex-col gap-1">
        {rows.map((r) => (
          <li key={r.h}>
            <Link href={`/?health=${r.h}`} scroll={false} className={`group block rounded-lg px-2 py-1.5 hover:bg-[var(--search-bg)] ${r.n ? '' : 'opacity-60'}`} title={`Show ${r.label.toLowerCase()} products`}>
              <div className="flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
                <span className="min-w-0 flex-1 truncate text-[var(--text-heading)]">{r.label}</span>
                <span className="font-semibold tabular-nums text-[var(--text-heading)]">{r.n}</span>
                <span className="w-9 text-right text-xs tabular-nums text-[var(--text-muted)]">{Math.round((r.n / total) * 100)}%</span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--surface-muted)]"><div className="h-full rounded-full" style={{ width: `${(r.n / total) * 100}%`, background: r.color }} /></div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Two cards under the numbers: how healthy the products are, and how ready each one is. Both are read straight from /home/products. */
export function HomeCharts() {
  const { data, loading, error } = useProducts({ ...DEFAULT_FILTERS, sort: 'readiness', order: 'desc', page: 1 }, 100);
  const products = data?.data ?? [];
  const [pg, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(products.length / PER));
  const page = Math.min(pg, pages);
  const note = (m: string) => <p className="text-sm text-[var(--text-muted)]">{m}</p>;
  return (
    <div className="grid grid-cols-1 items-stretch gap-[var(--space-md)] screen-sm:grid-cols-2">
      <Card title="Products by health" description="Click a row to list those products." className="min-h-[clamp(10rem,24vh,17rem)]">
        {loading ? note('Loading…') : error ? note('This chart could not be loaded.') : products.length === 0 ? <EmptyState title="No products yet" description="Create a product to see its health here." /> : <HealthBreakdown products={products} />}
      </Card>
      <Card title="Readiness by product" description={products.length ? `All ${products.length} products, most ready first.` : 'How close each product is to its next sign-off.'} className="min-h-[clamp(10rem,24vh,17rem)]">
        {loading ? note('Loading…') : error ? note('This chart could not be loaded.') : products.length === 0 ? <EmptyState title="No products yet" description="Create a product to see its progress here." /> : (
          <>
          <ul className="flex flex-col gap-2.5">
            {products.slice((page - 1) * PER, page * PER).map((p) => (
              <li key={p.id}>
                <Link href={`/products/${p.slug}`} className="block">
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-xs"><span className="truncate font-medium text-[var(--text-heading)]">{p.name}</span><span className="shrink-0 tabular-nums text-[var(--text-muted)]">{p.readinessPercent}%</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-muted)]"><div className="h-full rounded-full" style={{ width: `${Math.min(100, p.readinessPercent)}%`, background: READY_COLOR(p.readinessPercent) }} /></div>
                </Link>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <div className="mt-auto flex items-center justify-between pt-3 text-xs text-[var(--text-muted)]">
              <span>{(page - 1) * PER + 1}–{Math.min(page * PER, products.length)} of {products.length}</span>
              <span className="flex gap-2">
                <button type="button" className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
                <button type="button" className="btn sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
              </span>
            </div>
          )}
          </>
        )}
      </Card>
    </div>
  );
}
