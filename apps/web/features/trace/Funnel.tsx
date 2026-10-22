'use client';
import { Card, ErrorBox, Loading } from '@/components/ui';
import { useApi } from '@/lib/api';
import { ItemLinks } from './Links';

export default function Funnel({ pid }: { pid: string }) {
  const { data, error, loading } = useApi<any>('/trace/funnel', pid);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error || 'No data'} />;
  const stages: any[] = data.stages;
  const w = stages.filter((s) => s.next && s.total).map((s) => [s, (s.total - s.continuing) / s.total] as [any, number]).sort((a, b) => b[1] - a[1])[0];
  return (
    <div>
      <div className="callout" style={{ marginBottom: 12 }}>{w && w[1] ? `The biggest drop-off is from ${w[0].name} to ${w[0].next}: ${Math.round(w[1] * 1000) / 10}% do not continue.` : 'Everything continues through the chain.'}</div>
      <Card title="Evidence to flow step">
        {stages.map((s) => {
          const pct = s.total ? Math.round((s.continuing / s.total) * 1000) / 10 : 0;
          const drop = s.total ? Math.round(((s.total - s.continuing) / s.total) * 1000) / 10 : 0;
          return (
            <div key={s.name} style={{ marginTop: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 200px', gap: 12, alignItems: 'center' }}>
                <div><div className="strong">{s.name}</div><div className="small muted">{s.total} total</div></div>
                <div title={s.note || ''} style={{ position: 'relative', height: 24, background: 'var(--line)', borderRadius: 6, overflow: 'hidden' }}>
                  <i style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: 'var(--sd-accent)', opacity: 0.85 }} />
                  <b style={{ position: 'absolute', left: 8, top: 4, fontSize: 12 }}>{s.continuing} of {s.total} continue</b>
                </div>
                <div className="small">{s.next ? <span>to {s.next}: <b className={drop ? 'cell-gap' : 'cell-ok'}>{drop}% drop-off</b></span> : <span className="muted">end of the chain</span>}</div>
              </div>
              <details style={{ margin: '4px 0 0 162px' }}><summary className="small muted" style={{ cursor: 'pointer' }}>{s.dropped.length} dropped{s.note ? ` (${s.note})` : ''}</summary>
                {s.dropped.length ? <ItemLinks pid={pid} items={s.dropped} limit={20} /> : <div className="small muted">Nothing dropped.</div>}
              </details>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
