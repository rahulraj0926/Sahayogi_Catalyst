'use client';
import Link from 'next/link';
import { AlertTriangle, Check, FileCheck2, Gauge } from 'lucide-react';
import { Card } from '@/components/dashboard/Card';
import { KPITile } from '@/components/dashboard/KPITile';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { ErrorBox, Loading } from '@/components/ui';
import { useApi } from '@/lib/api';
import Journey from './Journey';
import { ProductSwitcher } from '@/components/shell/ProductSwitcher';
import type { FeatureProps } from '../types';

export default function Overview({ pid, query }: FeatureProps) {
  const st = query.get('stage');
  const life = useApi<any>('/lifecycle', pid);
  const pf = useApi<any>('/portfolio');
  const activity = useApi<any>('/audit?limit=5', pid);
  if (life.loading) return <Loading />;
  if (life.error) return <ErrorBox message={life.error} />;
  const prod = pf.data?.products?.find((p: any) => p.id === pid || p.slug === pid);
  const phases: any[] = life.data.phases;
  const signed = phases.filter((p) => String(p.status).startsWith('Signed off')).length;
  const blockers = prod?.blocker_count ?? 0;

  return (
    <div className="flex flex-col gap-[var(--space-lg)] pb-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <ProductSwitcher name={prod?.name || pid} pid={pid} path={`/products/${pid}`} items={(pf.data?.products || []).map((p: any) => ({ slug: p.slug || p.id, name: p.name, readiness: p.readiness_percent }))} />
          {prod?.one_liner && <p className="mt-1 max-w-3xl text-sm text-[var(--text-muted)]">{prod.one_liner}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
          {prod?.stage_label && <StatusBadge status={blockers ? 'warning' : 'healthy'} label={prod.stage_label} />}
          {prod?.kind && <StatusBadge status="info" label={prod.kind} />}
          {prod?.owner ? <span>Owner <b className="text-[var(--text-heading)]">{prod.owner}</b></span> : <span>No owner yet</span>}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-[var(--space-md)] md:grid-cols-4">
        <KPITile title="Phases signed off" value={`${signed} of ${phases.length}`} note={`Now in ${prod?.stage_label || 'progress'}`} status={signed === phases.length ? 'healthy' : 'info'} icon={<Check />} />
        <KPITile title="Ready for sign-off" value={prod ? `${prod.readiness_percent}%` : '—'} note={prod ? `${prod.days_in_stage ?? 0} days in this stage` : undefined} status="info" icon={<Gauge />} />
        <KPITile title="Holding it up" value={prod ? blockers : '—'} note={prod ? `${prod.open_must_questions ?? 0} must-answer questions open` : undefined} status={blockers ? 'critical' : 'healthy'} icon={<AlertTriangle />} />
        <KPITile title="Documents approved" value={prod ? `${prod.documents_approved} of ${prod.documents_total}` : '—'} note={prod ? `${prod.human_minutes_owed ?? 0} min of people's time needed` : undefined} status="neutral" icon={<FileCheck2 />} drillHref={`/products/${pid}/documents`} />
      </div>

      <Journey pid={pid} stage={st !== null && st !== '' ? Number(st) : null} openEdit={query.get('edit') === '1'} />

      <Card title="Recent activity" action={<Link href={`/products/${pid}/history`} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-heading)]">See all</Link>}>
        {activity.loading ? <p className="text-sm text-[var(--text-muted)]">Loading…</p> : (activity.data?.entries || []).length === 0 ? <p className="text-sm text-[var(--text-muted)]">Nothing has happened yet.</p> : (
          <ul className="flex flex-col divide-y divide-[var(--divider)]">
            {(activity.data.entries as any[]).slice(0, 5).map((e, i) => (
              <li key={i} className="flex items-baseline gap-3 py-1.5 text-sm">
                <span className="w-28 shrink-0 text-xs tabular-nums text-[var(--text-muted)]">{String(e.at).replace('T', ' ').slice(0, 16)}</span>
                <span className="min-w-0 flex-1 truncate text-[var(--text-heading)]">{e.summary || e.text}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
