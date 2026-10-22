'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { FeatureProps } from '../types';
import { Badge, Card, Empty, ErrorBox, Loading, Page } from '@/components/ui';
import { Field, Modal, Pager, Stat, useAction, usePaged } from '@/components/kit';
import { api, useApi } from '@/lib/api';

const KIND: Record<string, string> = { keep: 'ok', fix: 'warn', drop: 'bad', add: 'info', confirm_first: '' };

/** Existing system: what the old system does today and what happens to each function. Prototype: existing.js */
export default function Existing({ pid }: FeatureProps) {
  const { data, error, loading, reload } = useApi<any>('/existing', pid);
  const [edit, setEdit] = useState<any>(null);
  const act = useAction();
  const pg = usePaged<any>(data?.functions ?? [], 5);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error || 'No data'} />;
  if (!data.applies) return <Page title="Existing system"><Card><Empty>This product is built from scratch, so there is no old system to describe.</Empty></Card></Page>;
  const c = data.counts; const W = data.decisions;
  const post = (path: string, ok?: string) => act.run(async () => { await api(path, { method: 'POST', body: {}, product: pid }); reload(); });
  return (
    <Page title="Existing system" right={<button className="btn primary" onClick={() => setEdit({})}>Add a function</button>}>
      <div className="grid g4" style={{ marginBottom: 12 }}><Stat value={c.total} label="functions" /><Stat value={c.confirmed} label="confirmed" kind="ok" /><Stat value={c.undecided} label="no decision yet" kind={c.undecided ? 'warn' : undefined} /><Stat value={c.without_feature} label="keep/fix with no feature yet" /></div>
      {act.box}
      {data.functions.length === 0 && <Card><Empty>No functions yet. Add the first one.</Empty></Card>}
      {pg.rows.map((fn: any) => (
        <div key={fn.id} style={{ marginBottom: 12 }}><Card title={<span>{fn.title}{fn.area && <span className="small muted" style={{ marginLeft: 8, fontWeight: 400 }}>{fn.area}</span>}</span>} right={<span className="row">{fn.decision ? <Badge kind={KIND[fn.decision]}>{W[fn.decision]}</Badge> : <Badge kind="warn">No decision yet</Badge>}{fn.confirmed ? <Badge kind="ok">Confirmed by {fn.verified_by}</Badge> : <Badge>Not confirmed yet</Badge>}</span>}>
          <div className="grid g3" style={{ gap: 20 }}>
            <div><div className="strong small">How it works today</div><div>{fn.how_it_works || <span className="muted">Not written yet</span>}</div></div>
            <div><div className="strong small">What is wrong</div><div>{fn.whats_wrong || <span className="muted">Not written yet</span>}</div></div>
            <div><div className="strong small">How it should work</div><div>{fn.decision === 'drop' ? 'Dropped: it will not exist in the new system.' : fn.target_behaviour || <span className="muted">Not written yet</span>}</div></div>
          </div>
          {fn.feature && <div className="small" style={{ marginTop: 6 }}>Feature: <Link href={`/products/${pid}/item/${fn.feature.id}`}>{fn.feature.id} {fn.feature.title}</Link></div>}
          <div className="small" style={{ marginTop: 6 }}><b>Next:</b> {fn.next}</div>
          <div className="row wrap" style={{ marginTop: 8 }}>
            {!fn.confirmed && fn.how_it_works && <button className="btn sm" disabled={act.busy} onClick={() => post(`/existing/${fn.id}/confirm`)}>Confirm it works like this</button>}
            {['keep', 'fix', 'add'].includes(fn.decision) && !fn.feature && <button className="btn sm primary" disabled={act.busy} onClick={() => post(`/existing/${fn.id}/feature`)}>Turn it into a feature</button>}
            <button className="btn sm" onClick={() => setEdit(fn)}>Change</button>
          </div>
        </Card></div>
      ))}
      <Pager {...pg} />
      {edit && <FnForm pid={pid} fn={edit} decisions={W} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload(); }} />}
    </Page>
  );
}

function FnForm({ pid, fn, decisions, onClose, onDone }: { pid: string; fn: any; decisions: Record<string, string>; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<any>({ title: fn.title || '', area: fn.area || '', how_it_works: fn.how_it_works || '', whats_wrong: fn.whats_wrong || '', decision: fn.decision || '', target_behaviour: fn.target_behaviour || '', owner: fn.owner || '' });
  const act = useAction();
  const T = (k: string, label: string, rows = 0) => <Field label={label}>{rows ? <textarea rows={rows} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /> : <input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}</Field>;
  return (
    <Modal title={fn.id ? `Change: ${fn.title}` : 'Add a function of the old system'} onClose={onClose}>
      {T('title', 'Function name *')}{T('area', 'Part of the old system')}{T('how_it_works', 'How it works today', 3)}{T('whats_wrong', 'What is wrong or missing today', 3)}
      <Field label="Your decision"><select value={f.decision} onChange={(e) => setF({ ...f, decision: e.target.value })}><option value="">Not decided</option>{Object.entries(decisions).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      {T('target_behaviour', 'How it should work in the new system', 3)}{T('owner', 'Who can confirm how it works today')}
      {act.box}
      <button className="btn primary" disabled={!f.title.trim() || act.busy} onClick={() => act.run(async () => { const fields: any = {}; Object.entries(f).forEach(([k, v]) => { if (v !== '') fields[k] = v; }); if (fn.id) await api(`/items/${fn.id}`, { method: 'PATCH', body: { fields, expected_rev: fn.rev }, product: pid }); else await api('/items', { method: 'POST', body: { type: 'SystemFunction', fields }, product: pid }); onDone(); })}>{fn.id ? 'Save' : 'Add function'}</button>
    </Modal>
  );
}
