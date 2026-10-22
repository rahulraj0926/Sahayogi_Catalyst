'use client';
import { AlarmClock, ClipboardCheck, Clock, Flag, Gauge, Lightbulb, Package, RefreshCw, Rocket } from 'lucide-react';
import type { ReactNode } from 'react';
import { KPITile } from '@/components/dashboard/KPITile';
import { GreetingCard } from '@/components/dashboard/GreetingCard';
import { ErrorBox } from '@/components/ui';
import type { Kpi } from './types';

const ICON: Record<string, ReactNode> = {
  in_progress: <Package />, blocked: <Flag />, approvals_waiting: <ClipboardCheck />, ideas_pending: <Lightbulb />, avg_readiness: <Gauge />,
  at_handoff: <Rocket />, idle: <AlarmClock />, stale_values: <RefreshCw />, minutes_owed: <Clock />,
};
const show = (k: Kpi) => (k.unit === 'percent' ? `${k.value}%` : k.unit === 'minutes' ? `${k.value} min` : k.value);

function Tile({ k }: { k: Kpi }) {
  return <KPITile title={k.label} value={show(k)} note={k.note} status={k.status} drillHref={k.href} icon={ICON[k.key]} />;
}

const SKELETON = Array.from({ length: 7 }, (_, i) => i);

/** Greeting first, then every number from /home/kpis, in one grid. */
const MAIN = 7; // greeting + 7 numbers = two rows of four
const ordered = (kpis: Kpi[] | undefined) => [...(kpis?.filter((k) => k.group === 'primary') ?? []), ...(kpis?.filter((k) => k.group === 'secondary') ?? [])];

export function KpiRow({ kpis, error, loading, name }: { kpis: Kpi[] | undefined; error: string | null; loading: boolean; name: string }) {
  const all = ordered(kpis).slice(0, MAIN);
  return (
    <div className="@container flex min-w-0 flex-col gap-[var(--space-md)]">
      <div className="grid auto-rows-fr grid-cols-2 gap-[var(--space-md)] @[40rem]:grid-cols-4">
        <div className="col-span-2 min-w-0 @[40rem]:col-span-1"><GreetingCard name={name} /></div>
        {all.map((k, i) => {
          const n = all.length; const r = (n + 1) % 4; const fromEnd = n - 1 - i;
          const wide4 = r === 2 ? (fromEnd < 2 ? '@[40rem]:col-span-2' : '') : r === 1 ? (fromEnd === 0 ? '@[40rem]:col-span-4' : '') : '';
          const wide2 = n % 2 === 1 && fromEnd === 0 ? '@max-[40rem]:col-span-2' : '';
          return <div key={k.key} className={`min-w-0 ${wide2} ${wide4}`}><Tile k={k} /></div>;
        })}
        {!kpis && loading && SKELETON.map((i) => <div key={i} className="h-28 animate-pulse rounded-[var(--card-radius)] bg-[var(--surface-muted)]" />)}
      </div>
      {error && !kpis && <ErrorBox message={`The numbers could not be loaded: ${error}`} />}
    </div>
  );
}
