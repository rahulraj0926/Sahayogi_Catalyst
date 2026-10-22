'use client';
import Link from 'next/link';
import type { FeatureProps } from '../types';
import { Badge, Card, Empty, ErrorBox, Loading, Page } from '@/components/ui';
import { useApi } from '@/lib/api';
import FlowDiagram from './Diagram';
import FlowEditor from './Editor';

/** Flows (viewer + editor) and data-object life cycles. Prototype: flows.js, flows_svg.js, flowedit_ui.js */
export default function Flows({ pid, args }: FeatureProps) {
  if (args[0] === 'entity' && args[1]) return <Entity pid={pid} id={args[1]} />;
  if (args[0] && args[1] === 'edit') return <FlowEditor pid={pid} id={args[0]} />;
  if (args[0]) return <One pid={pid} id={args[0]} />;
  return <List pid={pid} />;
}

function List({ pid }: { pid: string }) {
  const { data, error, loading } = useApi<any>('/flows', pid);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error || 'No data'} />;
  return (
    <Page title="Flows" sub="How the product behaves, step by step, including what happens when things go wrong.">
      <Card title="Flows" sub={`${data.flows.length}`} flush>
        {data.flows.length === 0 ? <Empty>No flows yet. They are drafted in Stage 4.</Empty> : <table className="tbl"><tbody>{data.flows.map((f: any) => (
          <tr key={f.id}><td><Link className="strong" href={`/products/${pid}/flows/${f.id}`}>{f.title}</Link><div className="xs muted">{f.id} · {f.steps} steps</div></td><td><Badge>{f.status}</Badge></td><td><Badge kind={f.check.ok ? 'ok' : 'bad'}>{f.check.ok ? 'complete' : 'has problems'}</Badge></td><td style={{ textAlign: 'right' }}><Link className="btn sm" href={`/products/${pid}/flows/${f.id}/edit`}>Edit</Link></td></tr>
        ))}</tbody></table>}
      </Card>
      <div style={{ height: 12 }} />
      <Card title="Data objects and their life cycles" sub={`${data.entities.length}`} flush>
        {data.entities.length === 0 ? <Empty>None yet.</Empty> : <table className="tbl"><tbody>{data.entities.map((e: any) => <tr key={e.id}><td><Link className="strong" href={`/products/${pid}/flows/entity/${e.id}`}>{e.title}</Link><div className="xs muted">{e.id}</div></td><td><Badge>{e.status}</Badge></td><td>{e.has_lifecycle ? <Badge kind="ok">has a life cycle</Badge> : <Badge kind="warn">no life cycle</Badge>}</td></tr>)}</tbody></table>}
      </Card>
    </Page>
  );
}

function One({ pid, id }: { pid: string; id: string }) {
  const { data: d, error, loading } = useApi<any>(`/flows/${id}`, pid);
  if (loading) return <Loading />;
  if (error || !d) return <ErrorBox message={error || 'Not found'} />;
  return (
    <Page title={d.flow.title} sub={`${d.flow.id} · ${d.flowItem.trigger_summary || ''}`} right={<span className="row"><Badge kind={d.ok ? 'ok' : 'bad'}>{d.ok ? 'complete' : 'has problems'}</Badge><Link className="btn sm" href={`/products/${pid}/flows/${id}/edit`}>Edit</Link><Link className="btn sm" href={`/products/${pid}/flows`}>All flows</Link></span>}>
      <FlowDiagram steps={d.steps} edges={d.edges} />
      <div className="grid g2" style={{ marginTop: 14 }}>
        <Card title="Completeness checks" flush><table className="tbl compact"><tbody>{d.rules.map((r: any) => <tr key={r.id}><td className="mono xs">{r.id}</td><td>{r.title}<div className="xs muted">{r.detail}</div></td><td><Badge kind={r.ok ? 'ok' : 'bad'}>{r.ok ? 'ok' : 'fails'}</Badge></td></tr>)}</tbody></table></Card>
        <Card title="Steps" flush><table className="tbl compact"><tbody>{d.steps.map((s: any) => <tr key={s.id}><td className="mono xs"><Link href={`/products/${pid}/item/${s.id}`}>{s.id}</Link></td><td>{s.title}<div className="xs muted">{d.actors[s.id] || ''}{d.calls[s.id] ? ` · calls ${d.calls[s.id]}` : ''}</div></td><td className="xs">{(d.covers[s.id] || []).map((c: any) => <Link key={c.id} href={`/products/${pid}/item/${c.id}`} style={{ marginRight: 4 }}>{c.id}</Link>)}</td></tr>)}</tbody></table></Card>
      </div>
    </Page>
  );
}

function Entity({ pid, id }: { pid: string; id: string }) {
  const { data: d, error, loading } = useApi<any>(`/entities/${id}`, pid);
  if (loading) return <Loading />;
  if (error || !d) return <ErrorBox message={error || 'Not found'} />;
  const name = (sid: string) => d.states.find((s: any) => s.id === sid)?.title || sid;
  const steps = d.states.map((s: any) => ({ id: s.id, title: s.title, kind: s.initial ? 'start' : s.terminal ? 'end' : 'step' }));
  const edges = d.transitions.map((t: any) => ({ id: t.id, from: t.from, to: t.to, kind: t.kind === 'allowed' ? 'happy' : 'forbidden', condition: t.title }));
  return (
    <Page title={d.entity.title} sub={`${d.entity.id} · life cycle`} right={<span className="row"><Badge kind={d.ok ? 'ok' : 'bad'}>{d.ok ? 'complete' : 'has problems'}</Badge><Link className="btn sm" href={`/products/${pid}/flows`}>All flows</Link></span>}>
      <FlowDiagram steps={steps} edges={edges} />
      {d.problems.length > 0 && <div className="callout warn" style={{ marginTop: 12 }}><ul style={{ margin: '0 0 0 18px' }}>{d.problems.map((p: any, i: number) => <li key={i}>{typeof p === 'string' ? p : p.text || p.message}</li>)}</ul></div>}
      <Card title="Allowed and forbidden changes" flush><table className="tbl compact"><tbody>{d.transitions.map((t: any) => <tr key={t.id}><td>{name(t.from)} → {name(t.to)}</td><td>{t.title}</td><td><Badge kind={t.kind === 'allowed' ? 'ok' : 'bad'}>{t.kind}</Badge></td><td>{t.tested ? <Badge kind="ok">tested</Badge> : <Badge kind="warn">no test</Badge>}</td></tr>)}</tbody></table></Card>
    </Page>
  );
}
