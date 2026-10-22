'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { FeatureProps } from '../types';
import { Badge, Card, Empty, ErrorBox, Loading, Page } from '@/components/ui';
import { Pager, Stat, Tabs, useAction, usePaged } from '@/components/kit';
import { api, useApi } from '@/lib/api';

const level = (c: number) => (c >= 0.8 ? ['High', 'ok'] : c >= 0.5 ? ['Medium', 'warn'] : ['Low', 'bad']);
const describe = (p: any) => {
  const it = p.item || {}; const f = it.fields || {};
  const bits = Object.entries(f).filter(([k]) => k !== 'title').slice(0, 5).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${Array.isArray(v) ? v.join(', ') : v}`);
  return `${p.kind === 'update_fields' ? 'Update' : 'Add'} ${it.type}${f.title ? ' “' + f.title + '”' : ''}${bits.length ? ' — ' + bits.join('; ') : ''}`;
};

/** Review inbox: nothing the assistant proposes counts until a person accepts it. Prototype: inbox.js */
export default function Inbox({ pid, query }: FeatureProps) {
  const { data, error, loading, reload } = useApi<any>('/inbox?status=all', pid);
  const comps = useApi<any>('/items?type=Competitor&limit=200', pid);
  const [tab, setTab] = useState(query.get('tab') || 'proposed');
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error || 'No data'} />;
  const c = data.counts;
  const groups = (data.groups || []).map((g: any) => ({ ...g, list: g.proposals.filter((p: any) => p.status === tab) })).filter((g: any) => g.list.length);
  return (
    <Page title="Review inbox" right={<Link className="btn" href={`/products/${pid}/files`}>Open Files</Link>}>
      <div className="grid g3" style={{ marginBottom: 12 }}>
        <Stat value={c.proposed} label="waiting for you" kind={c.proposed ? 'warn' : undefined} /><Stat value={c.accepted} label="accepted" kind="ok" /><Stat value={c.rejected} label="rejected" />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[['proposed', `Waiting for you (${c.proposed})`], ['accepted', `Accepted (${c.accepted})`], ['rejected', `Rejected (${c.rejected})`]]} />
      {groups.length === 0 && <Empty>{data.total ? 'Nothing in this tab.' : 'Nothing to review yet. Upload a file and ask the assistant to read it.'}</Empty>}
      {groups.map((g: any) => <Group key={g.attachment.id} pid={pid} g={g} tab={tab} comps={comps.data?.items || []} reload={reload} />)}
    </Page>
  );
}

function Group({ pid, g, tab, comps, reload }: { pid: string; g: any; tab: string; comps: any[]; reload: () => void }) {
  const act = useAction();
  const pg = usePaged<any>(g.list, 5);
  const bulk = g.list.filter((p: any) => p.confidence >= 0.8 && !(p.conflicts || []).length).length;
  return (
    <Card title={<Link href={`/products/${pid}/files/${g.attachment.id}`}>{g.attachment.filename}</Link>} sub={`${g.list.length} ${tab}`}
      right={tab === 'proposed' && bulk > 0 ? <button className="btn sm" disabled={act.busy} onClick={async () => (await act.ask(`Accept the ${bulk} high-confidence proposals from this file?`, 'Accept them')) && act.run(async () => { await api(`/inbox/accept-all?attachment=${g.attachment.id}&minConfidence=0.8`, { method: 'POST', body: {}, product: pid }); reload(); })}>Accept all high-confidence ({bulk})</button> : null}>
      {act.box}
      {pg.rows.map((p: any) => <Proposal key={p.id} pid={pid} p={p} comps={comps} reload={reload} />)}
      <Pager {...pg} />
    </Card>
  );
}

function Proposal({ pid, p, comps, reload }: { pid: string; p: any; comps: any[]; reload: () => void }) {
  const act = useAction();
  const [lv, tone] = level(p.confidence);
  const [comp, setComp] = useState(p.competitor_id || '');
  const [edit, setEdit] = useState<Record<string, string> | null>(null);
  const needsComp = ['competitor_prices', 'capabilities', 'competitor_profile'].includes(p.goal) && !p.competitor_id;
  const post = (path: string, body: any) => api(`/inbox/${p.id}/${path}`, { method: 'POST', body, product: pid });
  const accept = () => act.run(async () => {
    if (edit) { const fields: any = {}; Object.entries(edit).forEach(([k, v]) => { if (String(p.item.fields[k] ?? '') !== v) fields[k] = isNaN(Number(v)) || v === '' ? v : Number(v); }); if (Object.keys(fields).length) await post('edit', { fields }); }
    await post('accept', needsComp ? { competitor_id: comp } : {}); reload();
  });
  const reject = async () => { const reason = await act.prompt('Why are you rejecting it? (optional)', 'Reject'); if (reason === null) return; act.run(async () => { await post('reject', { reason: reason || undefined }); reload(); }); };
  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
      <div className="row"><Badge kind={tone}>{lv} confidence</Badge>{p.status !== 'proposed' && <Badge>{p.status}</Badge>}<span className="mono xs muted">{p.id}</span></div>
      <div className="strong" style={{ margin: '6px 0' }}>{describe(p)}</div>
      <div className="small" style={{ borderLeft: '3px solid var(--warn)', padding: '4px 10px', background: 'var(--panel-2)' }}>“{p.pointer?.quote}”</div>
      <div className="xs muted" style={{ margin: '4px 0' }}>{p.reason}</div>
      {(p.conflicts || []).length > 0 && <div className="callout warn">The numbers disagree: {p.conflicts.map((c: any) => c.text || c.quote).join(' | ')}. Check before accepting.</div>}
      {act.box}
      {p.status === 'accepted' && <div className="small">Accepted by {p.reviewed_by}{p.result?.item ? <> → <Link href={`/products/${pid}/item/${p.result.item}`}>{p.result.item}</Link></> : null}{p.result?.verification === 'unverified' ? ' · waiting for a second person' : ''}</div>}
      {p.status === 'rejected' && <div className="small muted">Rejected by {p.reviewed_by}{p.reject_reason ? `: ${p.reject_reason}` : ''}</div>}
      {p.status === 'proposed' && (
        <>
          {needsComp && <select value={comp} onChange={(e) => setComp(e.target.value)} style={{ marginBottom: 8, maxWidth: 320 }}><option value="">Which competitor is this about?</option>{comps.map((c: any) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>}
          {edit && <div className="grid g3" style={{ margin: '8px 0' }}>{Object.keys(edit).map((k) => <div key={k}><label className="xs muted">{k.replace(/_/g, ' ')}</label><input value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} /></div>)}</div>}
          <div className="row">
            <button className="btn primary sm" disabled={act.busy || (needsComp && !comp)} onClick={accept}>{edit ? 'Accept with changes' : 'Accept'}</button>
            <button className="btn sm" disabled={act.busy} onClick={reject}>Reject</button>
            <button className="btn ghost sm" onClick={() => setEdit(edit ? null : Object.fromEntries(Object.entries(p.item.fields || {}).filter(([k, v]) => typeof v !== 'object' && k !== 'title').map(([k, v]) => [k, String(v ?? '')])))}>{edit ? 'Cancel edit' : 'Edit first'}</button>
            <Link className="btn ghost sm" href={`/products/${pid}/files/${p.attachment}`}>Open file</Link>
          </div>
        </>
      )}
    </div>
  );
}
