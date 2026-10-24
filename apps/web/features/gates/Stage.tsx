'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Badge, Bar, Card, Empty, ErrorBox, Loading, Page } from '@/components/ui';
import { Field, Fold, Modal, Stat, useAction, useConfirm, fmtDate } from '@/components/kit';
import { actor, api, go, useApi } from '@/lib/api';
import { AttestModal, DecisionPanel, WaiveModal } from '@/components/GateActions';
import type { FeatureProps } from '../types';

const adapt = (i: any) => ({ id: i.id, text: i.need, status: i.status, waivable: i.waivable, attest_required: { role: i.attest_role || i.signer || '' } });
const fixHref = (pid: string, fix: any) => (!fix ? null : fix.type === 'request' ? `/products/${pid}/work/${fix.session}?step=${fix.request}` : fix.href ? go(pid, fix.href) : null);

function Recheck({ item, onClose, onDone }: { item: any; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('Checked again, still valid.');
  const act = useAction();
  return (
    <Modal title={`Look at ${item.id} again`} onClose={onClose}>
      <p className="small">{item.title}{item.reason ? ` (${item.reason})` : ''}</p>
      <Field label="Note"><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      {act.box}
      <button className="btn primary" disabled={act.busy} onClick={() => act.run(async () => { await api(`/items/${encodeURIComponent(item.id)}/clear`, { method: 'POST', body: { note } }); onDone(); })}>Confirm it is still valid</button>
    </Modal>
  );
}

function ItemRow({ pid, n, i, reload }: { pid: string; n: number; i: any; reload: () => void }) {
  const [m, setM] = useState<'attest' | 'waive' | null>(null);
  const [re, setRe] = useState<any>(null);
  const href = fixHref(pid, i.fix);
  const r = adapt(i);
  return (
    <div style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
      <div className="row wrap">
        <Badge kind={i.status === 'PASS' ? 'ok' : i.status === 'FAIL' ? 'bad' : 'warn'}>{i.status_text}</Badge>
        <span className="strong" style={{ flex: 1 }}>{i.need}</span>
        {href && !i.done && <Link className="btn sm primary" href={href}>{i.fix.label || 'Go and do it'}</Link>}
        {i.status === 'ATTEST_PENDING' && <button className="btn sm primary" onClick={() => setM('attest')}>{i.kind === 'required' ? 'Sign off' : 'Sign off anyway'}</button>}
        {i.status === 'FAIL' && i.waivable && <button className="btn sm ghost" onClick={() => setM('waive')}>Set aside</button>}
        {i.status === 'WAIVED' && <Badge kind="warn">set aside</Badge>}
      </div>
      {!i.done && i.todo && <div className="small muted">{i.todo}</div>}
      {i.statement && <div className="small"><i>“{i.statement}”</i></div>}
      {i.waiver && <div className="small muted">Set aside: {i.waiver.status === 'Requested' ? `waiting for ${i.waiver.approver}` : `approved by ${i.waiver.approver}`}{i.waiver.rationale ? `. ${i.waiver.rationale}` : ''}</div>}
      {i.attested && <div className="small muted">Signed by {i.attested.by} ({i.attested.role}) {fmtDate(i.attested.at)}</div>}
      {(i.affected || []).length > 0 && (
        <ul className="small" style={{ margin: '4px 0 0 18px' }}>
          {(i.affected as any[]).slice(0, 8).map((a) => (
            <li key={a.id}><Link href={`/products/${pid}/item/${a.id}`}>{a.id}</Link> {a.title} <span className="muted">({a.reason})</span> <button className="btn xs ghost" onClick={() => setRe(a)}>Recheck</button></li>
          ))}
          {i.affected_count > 8 && <li className="muted">+{i.affected_count - 8} more</li>}
        </ul>
      )}
      <details className="small muted" style={{ marginTop: 4 }}>
        <summary>Expert detail</summary>
        <div>{i.expert?.code} · {i.expert?.type} · depth {i.expert?.depth}</div><div>{i.expert?.engine_text}</div><div>{i.expert?.engine_message}</div>
      </details>
      {m === 'attest' && <AttestModal pid={pid} n={n} r={r} onClose={() => setM(null)} onDone={() => { setM(null); reload(); }} />}
      {m === 'waive' && <WaiveModal pid={pid} n={n} r={r} onClose={() => setM(null)} onDone={() => { setM(null); reload(); }} />}
      {re && <Recheck item={re} onClose={() => setRe(null)} onDone={() => { setRe(null); reload(); }} />}
    </div>
  );
}

export default function Stage({ pid, n }: FeatureProps & { n: number }) {
  const [depth, setDepth] = useState('');
  const st = useApi<any>(`/stages/${n}`, pid);
  const live = useApi<any>(`/gates/${n}${depth ? `?depth=${depth}` : ''}`, pid);
  const [ask, dialog] = useConfirm();
  const reload = () => { st.reload(); live.reload(); };
  if (st.loading || live.loading) return <Loading />;
  if (st.error || live.error || !st.data || !live.data) return <ErrorBox message={st.error || live.error || 'No data'} />;
  const s = st.data.stage; const g = live.data;
  const items: any[] = s.items || [];
  const need = items.filter((i) => i.kind === 'required' && !i.done);
  const done = items.filter((i) => i.kind === 'required' && i.done);
  const rec = items.filter((i) => i.kind !== 'required');
  const needMap: Record<string, string> = Object.fromEntries(items.map((i) => [i.id, i.need]));
  const close = async (c: any) => { try { await api(`/conditions/${c.id}/close`, { method: 'POST', product: pid }); reload(); } catch (e: any) { alert(e.message); } };
  const revoke = async (w: any) => { if (!(await ask('Cancel this exception? The item counts as missing again.', 'Cancel exception'))) return; try { await api(`/waivers/${w.id}/revoke`, { method: 'POST', product: pid }); reload(); } catch (e: any) { alert(e.message); } };
  return (
    <Page title={`Stage ${n}: ${s.name}`} sub={s.state_text}
      right={<span className="row"><Link className="btn sm" href={`/products/${pid}/gates`}>All stages</Link>{n > 0 && <Link className="btn sm" href={`/products/${pid}/gates/${n - 1}`}>← Stage {n - 1}</Link>}<Link className="btn sm" href={`/products/${pid}/gates/${n + 1}`}>Stage {n + 1} →</Link></span>}>
      {dialog}
      {st.data.draft_warning && <div className="callout warn" style={{ marginBottom: 10 }}>{st.data.draft_warning}</div>}
      {(st.data.warnings || []).map((w: string, i: number) => <div key={i} className="callout warn" style={{ marginBottom: 10 }}>{w}</div>)}
      <div className="grid g4" style={{ marginBottom: 12 }}>
        <Stat value={`${s.readiness}%`} label="ready" kind={s.readiness === 100 ? 'ok' : 'warn'} />
        <Stat value={`${s.required_done}/${s.required_total}`} label="required items done" />
        <Stat value={s.required_open} label="still needed" kind={s.required_open ? 'bad' : 'ok'} />
        <Stat value={s.thoroughness} label="thoroughness" />
      </div>
      <Bar pct={s.readiness} />
      <div className="stack" style={{ marginTop: 14 }}>
        <Card title={need.length ? 'Still needed' : 'Nothing required is missing'} sub={need.length ? `${need.length} required` : 'All required items are done'}>
          {need.length === 0 ? <Empty>Everything required is in place.</Empty> : need.map((i) => <ItemRow key={i.id} pid={pid} n={n} i={i} reload={reload} />)}
        </Card>
        <Card title="The sign-off decision"><DecisionPanel pid={pid} n={n} live={g} onDone={reload} /></Card>
        {done.length > 0 && <Fold title={`Done (${done.length})`}>{() => <div>{done.map((i) => <ItemRow key={i.id} pid={pid} n={n} i={i} reload={reload} />)}</div>}</Fold>}
        {rec.length > 0 && <Fold title={`Recommended (${rec.length})`}>{() => <div>{rec.map((i) => <ItemRow key={i.id} pid={pid} n={n} i={i} reload={reload} />)}</div>}</Fold>}
        <Card title={`Follow-ups (${(g.conditions || []).filter((c: any) => c.status === 'Open').length} open)`} flush>
          {(g.conditions || []).length === 0 ? <Empty>No follow-ups.</Empty> : (
            <table className="tbl"><thead><tr><th>Follow-up</th><th>Owner</th><th>Close by</th><th>Status</th><th /></tr></thead><tbody>
              {(g.conditions as any[]).map((c) => <tr key={c.id}><td className="small">{c.text}</td><td>{c.owner}</td><td>Stage {c.must_close_by_gate} sign-off</td><td><Badge>{c.status}</Badge></td><td>{c.status === 'Open' && <button className="btn sm" onClick={() => close(c)}>Close</button>}</td></tr>)}
            </tbody></table>
          )}
        </Card>
        <Card title={`Exceptions (${(g.waivers || []).filter((w: any) => w.status === 'Active').length} active)`} flush>
          {(g.waivers || []).length === 0 ? <Empty>No exceptions.</Empty> : (
            <table className="tbl"><thead><tr><th>What was set aside</th><th>Approved by</th><th>Until</th><th>Status</th><th /></tr></thead><tbody>
              {(g.waivers as any[]).map((w) => <tr key={w.id}><td className="small">{needMap[w.criterion_id] || w.title}</td><td className="small">{w.approver}<div className="muted">asked by {w.requested_by || 'unknown'}</div></td><td>{w.expiry_on || (w.expiry_gate !== undefined ? `Stage ${w.expiry_gate} sign-off` : '')}</td><td>{w.status === 'Requested' ? <Badge kind="warn">{`Waiting for ${w.approver}`}</Badge> : <Badge>{w.status}</Badge>}</td><td>{w.status === 'Active' && <button className="btn sm danger" onClick={() => revoke(w)}>Cancel</button>}</td></tr>)}
            </tbody></table>
          )}
        </Card>
        <Card title="Saved snapshots" flush>
          {(g.baselines || []).length === 0 ? <Empty>No snapshot yet. One is saved each time a stage is signed off.</Empty> : (
            <table className="tbl"><thead><tr><th>Stage</th><th>Why</th><th>Saved</th><th>Records</th></tr></thead><tbody>
              {(g.baselines as any[]).map((b) => <tr key={b.id}><td>Stage {b.gate}</td><td>{b.purpose === 'gate' ? 'Saved when the stage was signed off' : b.purpose}</td><td>{fmtDate(b.created_at)} by {b.created_by}</td><td>{b.approved_count} approved of {b.item_count}</td></tr>)}
            </tbody></table>
          )}
        </Card>
        <Fold title="Expert: the checks the engine ran">{() => (
          <div>
            <div className="row" style={{ marginBottom: 8 }}>
              <span className="small">Preview at depth:</span>
              {['', 'L1', 'L2', 'L3'].map((d) => <button key={d} className={`btn sm ${depth === d ? 'primary' : ''}`} onClick={() => setDepth(d)}>{d || 'Current'}</button>)}
            </div>
            <table className="tbl"><thead><tr><th>Depth</th><th>Evaluated</th><th>Must ok</th><th>Failed</th><th>Ready</th><th>Blockers</th></tr></thead><tbody>
              {(g.depthEffect as any[]).map((d) => <tr key={d.depth}><td>{d.depth}</td><td>{d.evaluated}</td><td>{d.mustOk}/{d.mustTotal}</td><td>{d.failed}</td><td>{d.readiness}%</td><td className="small">{(d.blockers || []).join(', ')}</td></tr>)}
            </tbody></table>
            <table className="tbl" style={{ marginTop: 10 }}><thead><tr><th>Code</th><th>Check</th><th>Type</th><th>Severity</th><th>Status</th><th>Message</th></tr></thead><tbody>
              {(g.results as any[]).map((r) => <tr key={r.id}><td>{r.id}</td><td className="small">{r.text}</td><td>{r.type}</td><td>{r.severity}</td><td><Badge>{r.status}</Badge></td><td className="small">{r.message}{r.offenders?.length ? ` (${r.offenders.length} offenders)` : ''}</td></tr>)}
            </tbody></table>
          </div>
        )}</Fold>
      </div>
    </Page>
  );
}
