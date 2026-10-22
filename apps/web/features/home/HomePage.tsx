'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { actor } from '@/lib/api';
import { ActivityFeed } from './ActivityFeed';
import { useKpis } from './client';
import { EventCalendar } from './EventCalendar';
import { HomeCharts } from './HomeCharts';
import { IdeasPanel } from './IdeasPanel';
import { KpiRow } from './KpiRow';
import { LifecycleLine } from './LifecycleLine';
import { DEFAULT_FILTERS, ProductsTable } from './ProductsTable';
import type { ProductFilters } from './types';

const KEYS = ['q', 'stage', 'kind', 'health', 'owner', 'phase', 'ready'] as const;

/** Filters live in the URL (/?health=blocked) so a KPI card can link to its detail and a view can be shared. */
function useUrlFilters(): [ProductFilters, (f: ProductFilters) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const f: ProductFilters = {
    ...DEFAULT_FILTERS,
    ...Object.fromEntries(KEYS.map((k) => [k, params.get(k) ?? ''])),
    sort: (params.get('sort') as ProductFilters['sort']) || DEFAULT_FILTERS.sort,
    order: params.get('order') === 'asc' ? 'asc' : 'desc',
    page: Math.max(1, Number(params.get('page')) || 1),
  };
  const set = (n: ProductFilters) => {
    const p = new URLSearchParams();
    for (const k of KEYS) if (n[k]) p.set(k, n[k]);
    if (n.sort !== DEFAULT_FILTERS.sort || n.order !== DEFAULT_FILTERS.order) { p.set('sort', n.sort); p.set('order', n.order); }
    if (n.page > 1) p.set('page', String(n.page));
    router.replace(p.size ? `/?${p}` : '/', { scroll: false });
  };
  return [f, set];
}

export default function HomePage() {
  const kpis = useKpis();
  const [filters, setFilters] = useUrlFilters();
  const [who, setWho] = useState('there');
  useEffect(() => setWho(actor()), []);

  return (
    <div className="dashboard-root @container flex flex-col gap-[var(--space-lg)] pb-4">
      <div className="grid grid-cols-1 gap-[var(--space-md)] @[64rem]:grid-cols-[minmax(0,1fr)_22rem]">
        <div data-tour="kpis" className="min-w-0"><KpiRow kpis={kpis.data?.kpis} error={kpis.error} loading={kpis.loading} name={who} /></div>
        {/* the calendar fills exactly the height of the numbers beside it; its list scrolls if it is longer */}
        <div data-tour="calendar" className="relative min-h-[17rem] @[64rem]:min-h-0"><div className="h-full @[64rem]:absolute @[64rem]:inset-0"><EventCalendar /></div></div>
      </div>
      <div data-tour="lifecycle"><LifecycleLine /></div>
      <div data-tour="products"><ProductsTable filters={filters} onFilters={setFilters} /></div>
      <div data-tour="charts"><HomeCharts /></div>
      <div data-tour="feed" className="grid gap-[var(--space-md)] lg:grid-cols-2">
        <IdeasPanel />
        <ActivityFeed />
      </div>
    </div>
  );
}
