'use client';
/** Expert tabs of the competitor area: tracked sources, verification queue + ingests, effort and cost. Prototype: competitors.js */
import { useState } from 'react';
import Link from 'next/link';
import { Badge, Card, Empty, ErrorBox, Loading } from '@/components/ui';
import { Field, Modal, Stat, useAction, fmtDate } from '@/components/kit';
import { actor, api, useApi } from '@/lib/api';

const inr = (n: number) => `Rs ${Math.round(n).toLocaleString('en-IN')}`;
const hrs = (n: number) => String(Math.round(n * 10) / 10);
const sp = (s?: string) => String(s || '').replace(/_/g, ' ');

export function Sources({ pid }: { pid: string }) {
  const { data: d, error, loading } = useApi<any>('/competitors/sources', pid);
  if (loading) return <Loading />;
  if (error || !d) return <ErrorBox message={error || 'No data'} />;
  const tos = (v?: string) => <Badge kind={v === 'allows_manual' || v === 'allows' ? 'ok' : v === 'forbids' || v === 'prohibits' ? 'bad' : 'warn'}>{sp(v || 'unknown')}</Badge>;
  return (
    <div className="stack">
      <Card title="Tracked sources" sub="pages we are allowed to watch, and how" flush>
        {d.tracked.length === 0 ? <Empty>No tracked sources registered.</Empty> : (
          <table className="tbl compact"><thead><tr><th>ID</th><th>Source</th><th>URL pattern</th><th>Type</th><th>Grade</th><th>Access</th><th>Login</th><th>Terms verdict</th><th>Status</th><th>Evidence</th></tr></thead><tbody>
            {d.tracked.map((r: any) => <tr key={r.id}><td><Link href={`/products/${pid}/item/${r.id}`}>{r.id}</Link></td><td>{r.title}</td><td className="mono small">{r.url_pattern}</td><td>{sp(r.source_type)}</td><td><Badge kind="info">{r.default_grade || '?'}</Badge></td><td>{sp(r.access_method)}</td><td>{r.login_required ? <Badge kind="warn">required</Badge> : 'no'}</td><td>{tos(r.tos_verdict)} {r.tos_checked_on && <span className="small muted">{r.tos_checked_on}</span>}</td><td><Badge>{r.status}</Badge></td><td>{r.evidence}</td></tr>)}
          </tbody></table>
        )}
      </Card>
      <Card title="Evidence register" sub={`${d.evidence.length} records; grade A-F reflects the source, not the claim`} flush>
        {d.evidence.length === 0 ? <Empty>No evidence recorded.</Empty> : (
          <table className="tbl compact"><thead><tr><th>ID</th><th>Evidence</th><th>Grade</th><th>Credibility</th><th>Retrieved</th><th>Freshness</th><th>Origin</th><th className="right">Cited by</th></tr></thead><tbody>
            {d.evidence.map((r: any) => (
              <tr key={r.id}><td><Link href={`/products/${pid}/item/${r.id}`}>{r.id}</Link></td>
                <td>{r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer">{r.title}</a> : r.title}{r.source && <div className="small muted">via {r.source.id} {r.source.title}</div>}</td>
                <td><Badge kind="info">{r.grade || '?'}</Badge></td><td>{r.credibility === undefined ? '' : `${r.credibility}/6`}</td>
                <td>{r.retrieved_on} ({r.ageDays === undefined ? '?' : `${r.ageDays} d`})</td><td><Badge kind={r.freshness === 'fresh' ? 'ok' : 'warn'}>{r.freshness}</Badge></td>
                <td className="small">{r.origin}{r.verification ? ` / ${r.verification}` : ''}</td><td className="right">{r.citedBy || 0}</td></tr>
            ))}
          </tbody></table>
        )}
      </Card>
    </div>
  );
}

/** A second person says where they checked the facts. The server refuses the person who created them. */
export function VerifyDialog({ ids, label, onClose, onDone }: { ids: string[]; label: string; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const act = useAction();
  return (
    <Modal title={ids.length > 1 ? `Verify ${ids.length} facts` : `Verify ${ids[0]}`} onClose={onClose}>
      <p className="small">{label}</p>
      <Field label="Where did you check it?"><textarea rows={3} value={note} placeholder="For example: opened the vendor price page today and the price matches" onChange={(e) => setNote(e.target.value)} /></Field>
      {err && <div className="callout bad">{err}</div>}{act.box}
      <button className="btn primary" disabled={act.busy} onClick={() => act.run(async () => {
        setErr('');
        if (note.trim().length < 3) { setErr('Write where you checked it (a few words are enough).'); return; }
        let ok = 0; const bad: string[] = [];
        for (const id of ids) { try { await api(`/agent/verify/${id}`, { method: 'POST', body: { note: note.trim() } }); ok++; } catch (e: any) { bad.push(e.message); } }
        if (bad.length) { setErr(`${ok ? `${ok} checked. ` : ''}${bad.length} refused: ${Array.from(new Set(bad)).slice(0, 2).join(' | ')}`); if (!ok) return; if (ok) { onDone(); return; } }
        onDone();
      })}>Mark as checked by {actor()}</button>
    </Modal>
  );
}

function RejectDialog({ item, onClose, onDone }: { item: any; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const act = useAction();
  return (
    <Modal title={`Reject ${item.id}`} onClose={onClose}>
      <p>{item.title}</p>
      <Field label="Why is this value rejected? (required)"><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      {act.box}
      <button className="btn danger" disabled={act.busy || !note.trim()} onClick={() => act.run(async () => { await api(`/agent/reject/${item.id}`, { method: 'POST', body: { note: note.trim() } }); onDone(); })}>Reject</button>
    </Modal>
  );
}

export function Queue({ pid }: { pid: string }) {
  const q = useApi<any>('/agent/queue', pid);
  const ing = useApi<any>('/agent/ingests', pid);
  const [verify, setVerify] = useState<{ ids: string[]; label: string } | null>(null);
  const [reject, setReject] = useState<any>(null);
  if (q.loading || ing.loading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox message={q.error || 'No data'} />;
  const items: any[] = q.data.items;
  const reload = () => { q.reload(); ing.reload(); };
  return (
    <div className="stack">
      <div className="callout"><b>AI proposes, a different human verifies. </b>Unverified agent items do not count toward any gate, score or price comparison. The person who submitted a batch cannot verify it; switch “Acting as” at the top.</div>
      <Card title={`Items awaiting verification (${items.length})`} sub={`Acting as ${actor()}`} right={items.length > 0 ? <button className="btn sm" onClick={() => setVerify({ ids: items.map((x) => x.id), label: `${items.length} facts found by the assistant. Say where you checked them. Anything you created or asked for yourself is refused.` })}>Verify all</button> : undefined} flush>
        {items.length === 0 ? <Empty>Nothing is waiting for verification.</Empty> : (
          <table className="tbl compact"><thead><tr><th>ID</th><th>Type</th><th>Item</th><th>Key fields</th><th>Source</th><th>Grade</th><th>Submitted</th><th /></tr></thead><tbody>
            {items.map((r) => {
              const u = r.provenance?.source_url || r.evidence?.[0]?.url;
              return (
                <tr key={r.id}><td><Link href={`/products/${pid}/item/${r.id}`}>{r.id}</Link></td><td><Badge>{String(r.type).replace('Competitor', 'Comp. ')}</Badge></td>
                  <td><div className="strong">{r.title}</div>{r.parent && <div className="small muted">of <Link href={`/products/${pid}/competitors/${r.parent.id}`}>{r.parent.id}</Link> {r.parent.title}</div>}</td>
                  <td className="small">{Object.entries(r.fields || {}).filter(([, v]) => v !== undefined && v !== null && v !== '').slice(0, 7).map(([k, v]) => <div key={k}><span className="muted">{sp(k)}: </span>{Array.isArray(v) ? v.join(', ') : String(v)}</div>)}</td>
                  <td>{u ? <a className="small" href={u} target="_blank" rel="noopener noreferrer">{String(u).replace(/^https?:\/\//, '').slice(0, 38)}</a> : <span className="muted small">none</span>}</td>
                  <td><Badge kind="info">{r.provenance?.grade || '?'}</Badge></td>
                  <td className="small">by {r.proposed_by || '?'}<div className="muted">agent {r.agent || '?'}</div><div className="muted">{r.request_id || ''} {fmtDate(r.created_at)}</div></td>
                  <td className="nowrap"><button className="btn sm primary" onClick={() => setVerify({ ids: [r.id], label: r.title })}>Verify</button> <button className="btn sm danger" onClick={() => setReject(r)}>Reject</button></td></tr>
              );
            })}
          </tbody></table>
        )}
      </Card>
      <Card title="Recent ingests" flush>
        {(ing.data?.ingests || []).length === 0 ? <Empty>No ingests yet.</Empty> : (
          <table className="tbl compact"><thead><tr><th>Ingest</th><th>When</th><th>Request</th><th>Agent</th><th>Submitted by</th><th>Grade</th><th>Items</th><th>Sources</th></tr></thead><tbody>
            {(ing.data.ingests as any[]).slice().reverse().slice(0, 15).map((r) => <tr key={r.id}><td>{r.id}</td><td>{fmtDate(r.at)}</td><td>{r.request_id}</td><td>{r.agent}</td><td>{r.submitted_by}</td><td><Badge kind="info">{r.grade || '?'}</Badge></td><td className="mono small">{(r.items || []).join(', ')}</td><td className="small">{(r.source_urls || []).join(', ')}</td></tr>)}
          </tbody></table>
        )}
      </Card>
      {verify && <VerifyDialog ids={verify.ids} label={verify.label} onClose={() => setVerify(null)} onDone={() => { setVerify(null); reload(); }} />}
      {reject && <RejectDialog item={reject} onClose={() => setReject(null)} onDone={() => { setReject(null); reload(); }} />}
    </div>
  );
}

function EffortSet({ title, set }: { title: string; set: any }) {
  const c = set.counts;
  return (
    <Card title={title}>
      <div className="small muted" style={{ marginBottom: 8 }}>{c.T1} Tier 1, {c.T2} Tier 2, {c.T3} Tier 3, {c.S} alternatives</div>
      <table className="tbl compact"><thead><tr><th>Work package</th><th className="right">Low</th><th className="right">Likely</th><th className="right">High</th></tr></thead><tbody>
        {set.lines.map((l: any) => <tr key={l.item}><td>{l.item}</td><td className="right">{hrs(l.low)}</td><td className="right">{hrs(l.likely)}</td><td className="right">{hrs(l.high)}</td></tr>)}
        <tr className="strong"><td>Build total (hours)</td><td className="right">{hrs(set.build.low)}</td><td className="right">{hrs(set.build.likely)}</td><td className="right">{hrs(set.build.high)}</td></tr>
      </tbody></table>
      <div className="grid g2" style={{ marginTop: 12 }}>
        <Stat value={`${inr(set.buildCostInr.low)} - ${inr(set.buildCostInr.high)}`} label="Build cost" />
        <Stat value={`${hrs(set.monthlyHours.low)}-${hrs(set.monthlyHours.high)} h`} label={`Monthly upkeep (${inr(set.monthlyCostInr.low)} - ${inr(set.monthlyCostInr.high)} a month)`} />
      </div>
      <div className="small" style={{ marginTop: 8 }}><b>Fixed monthly items: </b>{(set.monthlyFixedItems || []).join('; ')}</div>
    </Card>
  );
}

export function Effort({ pid }: { pid: string }) {
  const { data: d, error, loading } = useApi<any>('/competitors/effort', pid);
  if (loading) return <Loading />;
  if (error || !d) return <ErrorBox message={error || 'No data'} />;
  const a = d.assumptions;
  return (
    <div className="stack">
      <div className="callout">
        <div><b>Assumptions: </b>Rs {a.rupeesPerHour.low} to Rs {a.rupeesPerHour.high} per hour; tools Rs {a.toolsPerMonth.low.toLocaleString('en-IN')} to Rs {a.toolsPerMonth.high.toLocaleString('en-IN')} per month.</div>
        <div className="small">{a.note} Hours are the authors&apos; calibration, to be recalibrated in a pilot.</div>
        {d.agentProposedValues ? <div className="small">{d.agentProposedValues} agent-proposed value(s) still need verification, which is included in the verification pass line.</div> : null}
      </div>
      <div className="grid g2"><EffortSet title="Your current competitor set" set={d.current} /><EffortSet title="The report's standard set (3 / 6 / 10 / 3, about 150 hours)" set={d.standardSet} /></div>
    </div>
  );
}
