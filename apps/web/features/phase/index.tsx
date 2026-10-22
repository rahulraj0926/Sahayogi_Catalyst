'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Badge, Bar, Card, Empty, ErrorBox, Loading, Page } from '@/components/ui';
import CriteriaList from '@/components/Criteria';
import { CriterionActions } from '@/components/GateActions';
import RecordForm from '@/components/RecordForm';
import Steps from './Steps';
import { useApi } from '@/lib/api';
import type { FeatureProps } from '../types';

export default function PhasePage({ pid, args }: FeatureProps) {
  const n = args[0] ?? '0';

  const num = Number(n);
  const life = useApi<any>('/lifecycle', pid);
  const gate = useApi<any>(`/gates/${num}`, pid);
  const items = useApi<any>(`/items?phase=${num}&limit=2000`, pid);
  const meta = useApi<any>('/meta', pid);
  const [adding, setAdding] = useState<any>(null);
  const [tab, setTab] = useState<string>('');
  const phase = life.data?.phases?.[num];
  const label = phase?.title || phase?.name;
  const types = useMemo(() => Object.values(meta.data?.schema?.types || {}).filter((t: any) => t.phase === num) as any[], [meta.data, num]);
  const grouped = useMemo(() => {
    const m: Record<string, any[]> = {};
    for (const i of items.data?.items || []) (m[i.type] ||= []).push(i);
    return m;
  }, [items.data]);
  if (life.loading || meta.loading) return <Loading />;
  if (life.error || !phase) return <ErrorBox message={life.error || 'Unknown phase'} />;
  const typeNames = Array.from(new Set([...types.map((t) => t.name), ...Object.keys(grouped)]));
  const active = tab || typeNames[0] || '';
  const reload = () => { items.reload(); gate.reload(); life.reload(); };
  return (
    <Page
      title={`Phase ${num}: ${label}`}
      sub={phase.purpose}
      right={<span className="row"><Badge kind="outline">{phase.percent}% complete</Badge><Badge>{phase.status}</Badge>{phase.depth === 'tracking' && <Badge kind="outline">links &amp; status</Badge>}</span>}
    >
      {!phase.ready && num > 0 && <div className="callout warn" style={{ marginBottom: 12 }}>Phase {num - 1} is not signed off yet. You can prepare records here, but this phase cannot be signed off until the earlier one is.</div>}
      <Steps pid={pid} num={num} onChanged={life.reload} />
      <div style={{ height: 16 }} />
      <div className="grid g3" style={{ marginBottom: 16 }}>
        <Card title="What this phase produces"><ul className="list">{phase.outputs.map((o: string) => <li key={o}>{o}</li>)}</ul></Card>
        <Card title="Who does it"><div>{phase.roles.join(', ')}</div>{phase.tool && <div className="small muted" style={{ marginTop: 8 }}>Real tool: {phase.tool}</div>}<div className="small muted" style={{ marginTop: 8 }}>{phase.question}</div></Card>
        <Card title="Sign-off readiness">
          <div className="kpi"><span className="v">{phase.readiness}%</span><span className="l">{phase.mustOk} of {phase.mustTotal} must-have checks ok</span></div>
          <div style={{ marginTop: 8 }}><Bar pct={phase.readiness} /></div>
          <Link className="btn sm" style={{ marginTop: 10 }} href={`/products/${pid}/gates`}>All gates</Link>
        </Card>
      </div>
      <div className="grid g2">
        <Card title="Records" sub={`${items.data?.total ?? 0} in this phase`}>
          <div className="tabs">{typeNames.map((t) => <button key={t} className={t === active ? 'on' : ''} onClick={() => setTab(t)}>{t.replace(/([A-Z])/g, ' $1').trim()} ({grouped[t]?.length || 0})</button>)}</div>
          {active && (
            <>
              <div className="row" style={{ marginBottom: 8 }}>
                <span className="spacer" />
                {types.find((t) => t.name === active) && <button className="btn primary sm" onClick={() => setAdding(types.find((t) => t.name === active))}>Add {active.replace(/([A-Z])/g, ' $1').trim().toLowerCase()}</button>}
              </div>
              {(grouped[active] || []).length === 0 ? <Empty>No {active} records yet.</Empty> : (
                <table className="tbl compact"><thead><tr><th>ID</th><th>Title</th><th>Status</th><th>Flags</th></tr></thead><tbody>
                  {grouped[active].map((i: any) => (
                    <tr key={i.id}><td className="mono xs"><Link href={`/products/${pid}/item/${i.id}`}>{i.id}</Link></td><td>{i.title}</td><td><Badge>{i.status}</Badge></td>
                      <td>{i._suspect && <Badge kind="warn">second look</Badge>} {i.origin === 'invented' && <Badge kind="outline">sample</Badge>}</td></tr>
                  ))}
                </tbody></table>
              )}
            </>
          )}
        </Card>
        <Card title="Sign-off checks" sub={gate.data ? `${gate.data.summary.passed} pass · ${gate.data.summary.failed} fail` : ''}>
          {gate.loading ? <Loading /> : gate.error ? <ErrorBox message={gate.error} /> : <CriteriaList results={gate.data.results} actions={(r) => <CriterionActions pid={pid} n={num} r={r} onDone={reload} />} />}
        </Card>
      </div>
      {adding && <RecordForm pid={pid} typeDef={adding} onCancel={() => setAdding(null)} onDone={() => { setAdding(null); reload(); }} />}
    </Page>
  );
}
