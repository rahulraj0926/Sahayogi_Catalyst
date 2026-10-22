'use client';
import Link from 'next/link';
import type { FeatureProps } from '../types';
import { Badge, Bar, Card, Empty, ErrorBox, Loading, Page } from '@/components/ui';
import { Stat } from '@/components/kit';
import { useApi } from '@/lib/api';

/** Stage health detail: readiness by stage, stale evidence, second looks. Prototype: dashboard.js (/gate-health) */
export default function Health({ pid }: FeatureProps) {
  const { data: d, error, loading } = useApi<any>('/dashboard', pid);
  if (loading) return <Loading />;
  if (error || !d) return <ErrorBox message={error || 'No data'} />;
  const list = (x: any) => (Array.isArray(x) ? x : x?.items || []);
  const stale = list(d.staleEvidence), suspect = list(d.suspect), queue = list(d.verificationQueue);
  return (
    <Page title="Stage health detail" sub={`${d.product.name} · as of ${d.asOf} · thoroughness ${d.depth}`}>
      <div className="grid g4" style={{ marginBottom: 12 }}><Stat value={d.counts.total} label="records" /><Stat value={d.counts.links} label="links" /><Stat value={d.staleCount ?? stale.length} label="stale values" kind={stale.length ? 'warn' : undefined} /><Stat value={queue.length} label="waiting for a second person" kind={queue.length ? 'warn' : undefined} /></div>
      <Card title="Stages" flush><table className="tbl compact"><thead><tr><th>Stage</th><th>State</th><th style={{ width: 160 }}>Readiness</th><th>Must-haves</th><th>Records</th><th>People’s time</th></tr></thead><tbody>
        {d.phases.map((p: any) => <tr key={p.phase}><td className="strong"><Link href={`/products/${pid}/gates`}>{p.phase}: {p.name}</Link></td><td><Badge>{p.gateState || p.status}</Badge>{p.liveState === 'at_risk' && <Badge kind="warn">at risk</Badge>}</td><td><Bar pct={p.readiness} /></td><td>{p.gate.mustOk} of {p.gate.mustTotal}</td><td>{p.items}</td><td className="small">{p.collection.humanMinutesDone} of {p.collection.humanMinutes} min</td></tr>)}
      </tbody></table></Card>
      <div className="grid g2" style={{ marginTop: 14 }}>
        <Card title="Stale or due values" sub={`${stale.length}`} flush>{stale.length === 0 ? <Empty>Everything is fresh.</Empty> : <table className="tbl compact"><tbody>{stale.slice(0, 15).map((s: any, i: number) => <tr key={s.id || i}><td className="mono xs"><Link href={`/products/${pid}/item/${s.id}`}>{s.id}</Link></td><td>{s.title}</td><td className="small muted">{s.ageDays ?? s.age_days} days</td></tr>)}</tbody></table>}</Card>
        <Card title="Records needing a second look" sub={`${suspect.length}`} flush>{suspect.length === 0 ? <Empty>Nothing flagged.</Empty> : <table className="tbl compact"><tbody>{suspect.slice(0, 15).map((s: any, i: number) => <tr key={s.id || i}><td className="mono xs"><Link href={`/products/${pid}/item/${s.id}`}>{s.id}</Link></td><td>{s.title}</td><td className="small muted">{(s.drivers || []).join(', ')}</td></tr>)}</tbody></table>}</Card>
      </div>
    </Page>
  );
}
