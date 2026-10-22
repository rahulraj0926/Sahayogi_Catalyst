'use client';
import Link from 'next/link';
import type { FeatureProps } from '../types';
import { Badge, Card, ErrorBox, Loading, Page } from '@/components/ui';
import { Pager, Stat, useAction, usePaged } from '@/components/kit';
import { api, go, useApi } from '@/lib/api';
import { PHASE_SHORT } from '@/components/shell/groups';

/** "Who you need": the people and approvals each stage still needs. Prototype: people.js */
export default function People({ pid }: FeatureProps) {
  const { data, error, loading, reload } = useApi<any>('/needed', pid);
  const act = useAction();
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error || 'No data'} />;
  const send = (body: any) => act.run(async () => { await api('/needed/send', { method: 'POST', body, product: pid }); reload(); });
  const s = data.summary;
  return (
    <Page title="Who you need">
      <div className="grid g3" style={{ marginBottom: 12 }}><Stat value={s.total} label="things needed" /><Stat value={s.waiting} label="waiting on someone" kind="warn" /><Stat value={s.done} label="done" kind="ok" /></div>
      {act.box}
      {data.stages.map((st: any) => <StageCard key={st.n} st={st} pid={pid} busy={act.busy} send={send} />)}
      <Card title={`Phases ${data.stages.length} to 12`} flush>
        <ul>{PHASE_SHORT.map((n, i) => ({ n, i })).filter(({ i }) => i >= data.stages.length).map(({ n, i }) => <li key={i} className="flex items-center justify-between gap-3" style={{ padding: '12px 18px', borderBottom: '1px solid var(--line)' }}><span><b>Phase {i}: {n}</b> <span className="small muted">Nobody has been asked yet</span></span><Link className="btn ghost sm" href={`/products/${pid}/phase/${i}`}>Open</Link></li>)}</ul>
      </Card>
    </Page>
  );
}

function StageCard({ st, pid, busy, send }: { st: any; pid: string; busy: boolean; send: (b: any) => void }) {
  const pg = usePaged<any>(st.rows, 6);
  return (
    <div style={{ marginBottom: 14 }}>
      <Card title={`Stage ${st.n}: ${st.name}`} sub={`${st.counts.done} of ${st.counts.total} done`} flush
        right={st.can_ask_count > 0 ? <button className="btn sm primary" disabled={busy} onClick={() => send({ stage: st.n })}>Ask everyone now ({st.can_ask_count})</button> : <Badge>{st.state}</Badge>}>
        <table className="tbl"><tbody>
          {pg.rows.map((r: any) => (
            <tr key={r.id}>
              <td className="strong">{r.who}<div className="xs muted">{r.role}</div></td>
              <td>{r.need}<div className="xs muted">{r.why}</div></td>
              <td><Badge kind={r.status === 'done' ? 'ok' : r.status === 'declined' ? 'bad' : r.status === 'not_asked' ? '' : 'warn'}>{r.word}</Badge></td>
              <td style={{ textAlign: 'right' }}>{r.can_ask ? <button className="btn sm" disabled={busy} onClick={() => send({ row: r.id })}>Ask</button> : r.why_not ? <span className="xs muted">{r.why_not}</span> : <Link className="btn ghost sm" href={go(pid, r.href)}>Open</Link>}</td>
            </tr>
          ))}
        </tbody></table>
        <Pager {...pg} />
      </Card>
    </div>
  );
}
