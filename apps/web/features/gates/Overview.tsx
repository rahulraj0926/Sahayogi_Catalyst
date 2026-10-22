'use client';
import Link from 'next/link';
import { Badge, Bar, ErrorBox, Loading, Page } from '@/components/ui';
import { useApi } from '@/lib/api';
import { Pager, usePaged } from '@/components/kit';
import { PHASE_SHORT } from '@/components/shell/groups';
import type { FeatureProps } from '../types';

export default function Overview({ pid }: FeatureProps) {
  const { data, error, loading } = useApi<any>('/stages', pid);
  const life = useApi<any>('/lifecycle', pid);
  // all 13 phases: the first ones come with their sign-off detail, the later ones from the lifecycle overview
  const rows: any[] = PHASE_SHORT.map((name, n) => { const st = (data?.stages || []).find((x: any) => x.stage === n); const lp = life.data?.phases?.[n]; return st ? { ...st, _detail: true } : { stage: n, name: lp?.name || name, state_text: lp?.status || 'Not started', readiness: lp?.readiness || 0, signed_off: /^Signed off/.test(lp?.status || ''), required_done: lp?.mustOk ?? 0, required_total: lp?.mustTotal ?? 0, items: [], _detail: false }; });
  const pg = usePaged<any>(rows, 10);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error || 'No data'} />;
  return (
    <Page title="Sign-offs">
      {(data.warnings || []).map((w: string, i: number) => <div key={i} className="callout warn" style={{ marginBottom: 10 }}>{w}</div>)}
      <section className="card">
        <ul>
          {pg.rows.map((s: any) => {
            const href = s._detail ? `/products/${pid}/gates/${s.stage}` : `/products/${pid}/phase/${s.stage}`;
            const open = !s.signed_off ? (s.items || []).filter((i: any) => i.kind === 'required' && !i.done).slice(0, 2) : [];
            return (
              <li key={s.stage} className="flex flex-wrap items-center gap-x-6 gap-y-2" style={{ padding: '16px 18px', borderBottom: '1px solid var(--line)' }}>
                <div style={{ minWidth: 220, flex: '1 1 220px' }}>
                  <div className="flex items-center gap-2"><Link className="strong" href={href}>Phase {s.stage}: {s.name}</Link>{s.stage === data.current && <Badge kind="info">You are here</Badge>}{s.signed_off && <Badge kind="ok">Signed off</Badge>}</div>
                  <div className="small muted">{s.state_text}</div>
                  {open.map((i: any) => <div key={i.id} className="small" style={{ marginTop: 3 }}>• {i.need}</div>)}
                </div>
                <div style={{ width: 220 }}>
                  <div className="flex items-center gap-2"><div style={{ flex: 1 }}><Bar pct={s.readiness} /></div><b className="small tabular">{s.readiness}%</b></div>
                  <div className="xs muted" style={{ marginTop: 3 }}>{s.required_done} of {s.required_total} required done</div>
                </div>
                <Link className="btn sm" href={href}>{s.signed_off ? 'See it' : 'Open'}</Link>
              </li>
            );
          })}
        </ul>
        <Pager {...pg} />
      </section>
    </Page>
  );
}
