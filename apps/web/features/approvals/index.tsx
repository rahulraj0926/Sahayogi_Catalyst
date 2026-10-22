'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { FeatureProps } from '../types';
import { Badge, Card, ErrorBox, Loading, Page } from '@/components/ui';
import { Field, Pager, useAction, usePaged } from '@/components/kit';
import { actor, api, setActor, useApi } from '@/lib/api';

const same = (a: string, b: string) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
/** the server builds prototype hash links; the platform serves the same page at /approve/<token> */
export const approvalLink = (ap: any) => { const t = String(ap.link || '').split('/').pop(); return `${typeof window !== 'undefined' ? window.location.origin : ''}/approve/${t}`; };

function ApprovalCard({ pid, ap, onDone, me }: { pid: string; ap: any; onDone: () => void; me: string }) {
  const act = useAction();
  const link = approvalLink(ap);
  const text = encodeURIComponent(`Please review and decide: ${ap.title}\n${link}`);
  const mine = same(ap.approver, me);
  const read = ap.read?.document ? `/products/${pid}/documents` : ap.read?.story ? `/products/${pid}/stories/${ap.read.story}` : ap.stage != null ? `/products/${pid}/gates` : null;
  const post = (act_: string, body: any = {}) => act.run(async () => { await api(`/approvals/${ap.id}/${act_}`, { method: 'POST', body, product: pid }); onDone(); });
  return (
    <div className="card" style={{ marginBottom: 10, borderLeft: `5px solid var(--${mine ? 'accent' : 'warn'})` }}>
      <div className="card-b">
        <div className="strong">{ap.title}</div>
        <div className="small muted"><Badge kind="outline">{ap.kind_word}</Badge> <b>Waiting for {ap.approver}</b> · asked by {ap.prepared_by} · link valid until {String(ap.expires_at).slice(0, 10)} · {ap.opened ? 'opened' : 'not opened'}</div>
        {ap.statement && <div className="small" style={{ margin: '6px 0' }}>{ap.statement}</div>}
        {read && <Link className="small" href={read}>Read what is being approved</Link>}
        <div className="row" style={{ margin: '8px 0' }}>
          <input readOnly value={link} onFocus={(e) => e.target.select()} className="mono xs" style={{ flex: 1 }} />
          <button className="btn sm" onClick={() => navigator.clipboard?.writeText(link)}>Copy link</button>
          <a className="btn sm" href={`mailto:?subject=${encodeURIComponent(ap.title)}&body=${text}`}>Email</a>
          <a className="btn sm" target="_blank" rel="noopener" href={`https://wa.me/?text=${text}`}>WhatsApp</a>
        </div>
        {act.box}
        <div className="row wrap">
          {mine
            ? <><button className="btn primary sm" disabled={act.busy} onClick={async () => (await act.ask(`Confirm as ${me}: "${ap.title}"? This counts straight away.`, 'Confirm')) && post('confirm')}>Confirm (I am {ap.approver})</button>
                <button className="btn sm" onClick={async () => { const note = await act.prompt('Why are you declining? (needed)', 'Decline', { required: true }); if (note) post('decline', { note }); }}>Decline</button></>
            : <button className="btn sm" title="Switches “Acting as” on this computer" onClick={() => { setActor(ap.approver); window.location.reload(); }}>Confirm in person: act as {ap.approver}</button>}
          <button className="btn ghost sm" disabled={act.busy} onClick={() => post('resend')}>Send again (new link)</button>
          <button className="btn ghost sm" disabled={act.busy} onClick={async () => (await act.ask(`Withdraw the request to ${ap.approver}? The link stops working.`, 'Withdraw')) && post('withdraw')}>Withdraw</button>
        </div>
      </div>
    </div>
  );
}

/** Waiting for approval + the address the links start with. Prototype: approvals_ui.js */
export default function Approvals({ pid }: FeatureProps) {
  const { data, error, loading, reload } = useApi<any>('/approvals', pid);
  const sharing = useApi<any>('/sharing', pid);
  const act = useAction();
  const [url, setUrl] = useState<string | null>(null);
  const [days, setDays] = useState<number | null>(null);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error || 'No data'} />;
  const me = actor();
  const others = data.waiting.filter((a: any) => !same(a.approver, me));
  const s = sharing.data;
  const finish = async () => { await api('/approvals/seen', { method: 'POST', body: {}, product: pid }); reload(); };
  return (
    <Page title="Waiting for approval">
      {data.notices.length > 0 && (
        <Card title={`${data.notices.length} new decision${data.notices.length === 1 ? '' : 's'}`} right={<button className="btn sm" onClick={finish}>Got it</button>}>
          {data.notices.map((n: any) => <div key={n.id} className={`callout ${n.status === 'approved' ? 'ok' : 'warn'}`} style={{ marginBottom: 6 }}><b>{n.approver} {n.status}</b>: {n.title}{n.decision_note ? ` (${n.decision_note})` : ''}</div>)}
        </Card>
      )}
      <Card title={`Waiting for you (${me})`}><PagedApprovals list={data.for_you} pid={pid} me={me} reload={reload} empty={`Nothing is waiting for ${me}.`} /></Card>
      <div style={{ height: 14 }} />
      <Card title="Waiting for others"><PagedApprovals list={others} pid={pid} me={me} reload={reload} empty="Nothing is waiting for anybody else." /></Card>
      <div style={{ height: 14 }} />
      {s && (
        <Card title="The address approval links start with">
          <p className="small">{s.base.explain} {s.detected ? `This computer's network address is ${s.detected}.` : ''}</p>
          {s.base.warning && <div className="callout warn">{s.base.warning}</div>}
          <Field label="Public address (leave empty to detect automatically)"><input value={url ?? s.public_url ?? ''} onChange={(e) => setUrl(e.target.value)} placeholder={s.base.url} /></Field>
          <Field label="A link works for (days)"><input type="number" min={1} max={365} style={{ width: 90 }} value={days ?? s.approval_expiry_days} onChange={(e) => setDays(Number(e.target.value))} /></Field>
          {act.box}
          <button className="btn primary" disabled={act.busy} onClick={() => act.run(async () => { await api('/sharing', { method: 'POST', body: { public_url: (url ?? s.public_url ?? '').trim(), approval_expiry_days: days ?? s.approval_expiry_days }, product: pid }); sharing.reload(); })}>Save</button>
        </Card>
      )}
    </Page>
  );
}

function PagedApprovals({ list, pid, me, reload, empty }: { list: any[]; pid: string; me: string; reload: () => void; empty: string }) {
  const pg = usePaged<any>(list, 4);
  if (!list.length) return <div className="muted small">{empty}</div>;
  return <>{pg.rows.map((a: any) => <ApprovalCard key={a.id} pid={pid} ap={a} me={me} onDone={reload} />)}<Pager {...pg} /></>;
}
