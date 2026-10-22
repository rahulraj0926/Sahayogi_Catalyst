'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FeatureProps } from '../types';
import { PHASE_SHORT } from '@/components/shell/groups';
import { Badge, Bar, Card, ErrorBox, Loading, Page } from '@/components/ui';
import { Fold, Modal, mins, useAction } from '@/components/kit';
import { api, go, useApi } from '@/lib/api';

const KINDS = ['HUMAN', 'DOCUMENT', 'AGENT_RESEARCH', 'DERIVED'];
const KIND_NAME: Record<string, string> = { HUMAN: 'Human', DOCUMENT: 'Document', AGENT_RESEARCH: 'Agent research', DERIVED: 'Derived' };
const KIND_TONE: Record<string, string> = { HUMAN: 'teal', DOCUMENT: 'info', AGENT_RESEARCH: 'violet', DERIVED: '' };
const DEPTH_RANK: Record<string, number> = { L1: 1, L2: 2, L3: 3 };
const STATUS_KIND: Record<string, string> = { done: 'ok', ready: 'info', blocked: 'warn', in_progress: 'violet' };
const PHASE_NAME = ['Phase 0 - Intake and discovery', 'Phase 1 - Product and market', 'Phase 2 - Definition and scope', 'Phase 3 - Requirements', 'Phase 4 - Flows'];
const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 100);

function NaModal({ pid, r, onClose, onDone }: any) {
  const [reason, setReason] = useState(''); const [err, setErr] = useState(''); const act = useAction();
  return (
    <Modal title={`Mark ${r.id} not applicable`} onClose={onClose}>
      <p>{r.title}</p><textarea rows={3} style={{ width: '100%' }} placeholder="Why does this not apply to this product?" value={reason} onChange={(e) => setReason(e.target.value)} />
      {err && <div className="small" style={{ color: 'var(--bad)' }}>{err}</div>}{act.box}
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={act.busy} onClick={() => { if (!reason.trim()) return setErr('A reason is required'); act.run(async () => { await api(`/requests/${r.id}/na`, { method: 'POST', body: { reason: reason.trim() }, product: pid }); onDone(`${r.id} marked not applicable`); }); }}>Mark not applicable</button></div>
    </Modal>
  );
}

/** Prompt to paste into an outside assistant, the format it must follow, and the box to ingest the result. */
function AgentModal({ pid, id, onClose, onDone }: any) {
  const d = useApi<any>(`/requests/${id}`, pid); const [txt, setTxt] = useState(''); const [err, setErr] = useState(''); const act = useAction();
  const copy = (t: string) => { try { navigator.clipboard.writeText(t); } catch { /* ignore */ } };
  if (d.loading || !d.data) return <Modal title={`${id}  Agent research task`} onClose={onClose}><Loading /></Modal>;
  const f = d.data.form; const r = d.data.request; const fmt = JSON.stringify(f.ingest_format, null, 2);
  return (
    <Modal title={`${id}  Agent research task`} onClose={onClose}>
      <div className="stack">
        <div className="callout"><div className="strong">{r.title}</div><div>{f.ask}</div><div className="small muted">Status: <Badge>{r.status}</Badge> {r.agent ? `${r.agent.items} item(s) so far, ${r.agent.unverified} unverified, ${r.agent.verified} verified` : ''}</div></div>
        <div className="row"><h3>1. Prompt to paste into Claude</h3><span className="spacer" /><button className="btn sm" onClick={() => copy(f.prompt)}>Copy prompt</button></div><pre className="mono small" style={{ whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>{f.prompt}</pre>
        <div className="row"><h3>2. Ingest format the answer must follow</h3><span className="spacer" /><button className="btn sm" onClick={() => copy(fmt)}>Copy format</button></div><pre className="mono small" style={{ maxHeight: 160, overflow: 'auto' }}>{fmt}</pre>
        <h3>3. Paste the result and ingest</h3><textarea rows={8} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Paste the JSON that Claude returned here, then press Ingest." />
        <div className="small muted">Items arrive as origin=agent, status Draft, unverified. They do not count toward any gate until a different person verifies them (Competitors page, verification queue).</div>
        {err && <ErrorBox message={err} />}{act.box}
        <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={onClose}>Close</button>
          <button className="btn primary" disabled={act.busy} onClick={() => { let batch; try { batch = JSON.parse(txt); } catch (e: any) { return setErr('That is not valid JSON: ' + e.message); } setErr(''); act.run(async () => { try { const res = await api<any>('/agent/ingest', { method: 'POST', body: batch, product: pid }); onDone(`Ingested ${res.created.length} item(s) as ${res.ingest.id}; all unverified`); } catch (e: any) { setErr(e.message + (e.data?.errors ? ': ' + e.data.errors.slice(0, 3).join('; ') : '')); } }); }}>Ingest</button></div>
      </div>
    </Modal>
  );
}

/** All questions at a glance: every data request of the product at the chosen thoroughness. Prototype: plan.js */
export default function Plan({ pid, query }: FeatureProps) {
  const router = useRouter();
  const { data, error, loading, reload } = useApi<any>('/requests', pid);
  const [f, setF] = useState({ phase: 'all', kind: 'all', status: 'all', depth: 'grey', session: null as string | null });
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [na, setNa] = useState<any>(null); const [agent, setAgent] = useState<string | null>(null);
  const [msg, setMsg] = useState(''); const act = useAction();
  const want = query.get('request');
  useEffect(() => {
    if (!data || !want) return;
    const r = data.requests.find((x: any) => x.id === want);
    if (r && (r.session || r.auto_session)) router.replace(`/products/${pid}/work/${r.session || r.auto_session}?step=${want}`); else if (r) setOpen((o) => ({ ...o, [want]: true }));
  }, [data, want, pid, router]);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error || 'No data'} />;
  const cur = data.totals.current.all; const by = data.totals.byDepth;
  const used = data.sessions.filter((s: any) => s.minutesInDepth > 0); const next = used.find((s: any) => s.done < s.requests.length);
  const level = ({ L1: 'minimum', L2: 'standard', L3: 'full' } as any)[data.depth] || data.depth; const left = cur.humanMinutes - cur.humanMinutesDone;
  const summary = left <= 0 ? `At the ${level} level all ${mins(cur.humanMinutes)} of your questions are answered.` : `At the ${level} level you need ${mins(cur.humanMinutes)} in ${used.length} short sessions; ${mins(left)} are still to do (${pct(cur.humanMinutesDone, cur.humanMinutes)}% done).` + (next ? ` Next: ${next.title}.` : '');
  const sessDone = used.filter((s: any) => s.done >= s.requests.length).length;
  const rank = DEPTH_RANK[data.depth];
  const rows = data.requests.filter((r: any) => !(f.phase !== 'all' && String(r.phase) !== f.phase) && !(f.kind !== 'all' && r.owner_kind !== f.kind) && !(f.session && r.session !== f.session)
    && !(f.status === 'done' && !r.done) && !(f.status === 'todo' && (r.done || r.status === 'blocked')) && !(f.status === 'blocked' && r.status !== 'blocked') && !(f.depth === 'hide' && DEPTH_RANK[r.depth_level] > rank));
  const sessList = data.sessions.filter((s: any) => s.minutesInDepth > 0 || data.depth === 'L3');
  const sel = (key: keyof typeof f, opts: [string, string][]) => <select value={(f as any)[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
  const derive = (r: any) => act.run(async () => { const res = await api<any>(`/requests/${r.id}/derive`, { method: 'POST', body: {}, product: pid }); setMsg(`${r.id}: ${res.message}`); reload(); });
  const action = (r: any) => {
    if (r.done) return <span className="small muted">done</span>;
    if (r.status === 'blocked') return <span className="small muted" title={'waiting for ' + (r.blockedBy || []).join(', ')}>blocked</span>;
    if (r.owner_kind === 'HUMAN' || r.owner_kind === 'DOCUMENT') return <Link className="btn sm primary" href={r.link_to ? go(pid, r.link_to) : `/products/${pid}/work/${r.session || r.auto_session || ''}${r.session ? '?step=' + r.id : ''}`}>{r.link_to ? 'Open' : 'Answer'}</Link>;
    if (r.owner_kind === 'AGENT_RESEARCH') return <button className="btn sm" onClick={() => setAgent(r.id)}>Prompt and ingest</button>;
    return <button className="btn sm" disabled={act.busy} onClick={() => derive(r)}>Generate</button>;
  };
  const depthCard = (label: string, t: any, current: boolean) => (
    <div className="card" style={current ? { borderColor: 'var(--sd-accent)', background: 'var(--sd-accent-soft)' } : undefined}><div className="card-b stack">
      <div className="row"><b>{label}</b>{current && <Badge kind="info">current</Badge>}</div><div style={{ fontSize: 20, fontWeight: 700 }}>{mins(t.humanMinutes)}</div>
      <div className="small muted">{t.humanRequests + t.documentRequests} human/document asks - {t.agentTasks} agent - {t.derivedTasks} derived</div><Bar pct={pct(t.humanMinutesDone, t.humanMinutes)} kind="ok" /><div className="small">{mins(t.humanMinutes - t.humanMinutesDone)} left ({pct(t.humanMinutesDone, t.humanMinutes)}% done)</div></div></div>
  );
  const kpi = (v: React.ReactNode, l: string, sub: string, p: number) => <div><div className="kpi"><span className="v">{v}</span><span className="l">{l}</span><span className="small muted">{sub}</span></div><Bar pct={p} kind="ok" /></div>;
  return (
    <Page title="All questions at a glance" sub="Every question the tool needs answered, who answers it and in what order.">
      <div className="callout" style={{ marginBottom: 14 }}><strong>{summary}</strong> To answer questions, use <Link href={`/products/${pid}/work`}>Work on it</Link>; it shows the same sessions in plain words.</div>
      {msg && <div className="callout ok" style={{ marginBottom: 10 }}>{msg}</div>}{act.box}
      <Fold title="Details: your effort in numbers">{() => (
        <Card title="Your effort in numbers" sub={`current depth ${data.depth}; change it in the top bar`}><div className="stack" style={{ gap: 14 }}>
          <div className="callout"><strong>At {data.depth} you need {cur.humanMinutes} minutes in {used.length} short sessions; everything else ({cur.agentTasks} agent tasks and {cur.derivedTasks} derived tasks) is done by agents or generated by the tool.</strong><div className="small">{mins(left)} of human time remain. Agent output still needs a different person to verify it.</div></div>
          <div className="grid g4">{kpi(mins(cur.humanMinutes), 'Human minutes (human + document)', `${mins(cur.humanMinutesDone)} done`, pct(cur.humanMinutesDone, cur.humanMinutes))}{kpi(`${sessDone}/${used.length}`, 'Human sessions complete', 'short, one topic each', pct(sessDone, used.length))}{kpi(`${cur.agentDone}/${cur.agentTasks}`, 'Agent research tasks done', 'Claude researches, a person verifies', pct(cur.agentDone, cur.agentTasks))}{kpi(`${cur.derivedDone}/${cur.derivedTasks}`, 'Derived tasks done', 'generated by the tool, then reviewed', pct(cur.derivedDone, cur.derivedTasks))}</div>
          <div className="grid g3">{['L1', 'L2', 'L3'].map((d) => <div key={d}>{depthCard(`${d} ${({ L1: 'minimum', L2: 'standard', L3: 'full' } as any)[d]}`, by[d].all, d === data.depth)}</div>)}</div></div></Card>)}</Fold>
      <Fold title="Details: sessions, filters and the full list of questions" open>{() => (
        <div className="stack" style={{ gap: 16 }}>
          <Card title="Sessions" sub={`${sessList.length} sessions in order; click one to filter`}><div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))' }}>
            {sessList.map((s: any) => { const total = s.requests.length; const complete = s.done >= total; return (
              <div key={s.id} className="card" title="Click to filter the request list to this session" onClick={() => setF({ ...f, session: f.session === s.id ? null : s.id })} style={{ cursor: 'pointer', opacity: complete ? 0.75 : 1, borderColor: f.session === s.id ? 'var(--sd-accent)' : undefined }}><div className="card-b">
                <div className="row"><span className="mono strong">{s.id}</span><span className="spacer" />{complete ? <Badge kind="ok">complete</Badge> : <Badge kind="teal">{mins(s.minutesInDepth)}</Badge>}</div>
                <div className="strong">{s.title}</div><div className="small muted">{s.who}</div><div className="small" style={{ margin: '6px 0 4px' }}>{s.done} of {total} requests done</div><Bar pct={pct(s.done, total)} kind="ok" /></div></div>); })}</div></Card>
          <Card title="Filters"><div className="row wrap small">
            <label>Phase {sel('phase', [['all', 'All'], ...PHASE_SHORT.map((n, p) => [String(p), `${p}. ${n}`] as [string, string])])}</label>
            <label>Owner {sel('kind', [['all', 'All'], ...KINDS.map((k) => [k, KIND_NAME[k]] as [string, string])])}</label>
            <label>Status {sel('status', [['all', 'All'], ['todo', 'To do'], ['done', 'Done'], ['blocked', 'Blocked']])}</label>
            <label>Requests above {data.depth} {sel('depth', [['grey', 'Show greyed'], ['hide', 'Hide']])}</label>
            {f.session && <button className="btn sm" onClick={() => setF({ ...f, session: null })}>Clear session {f.session}</button>}</div></Card>
          <Card title="Requests" sub={`${rows.length} shown of ${data.requests.length}`} flush>
            {rows.length === 0 && <div className="loading">No requests match these filters.</div>}
            {PHASE_SHORT.map((_, ph) => {
              const inPh = rows.filter((r: any) => r.phase === ph); if (!inPh.length) return null;
              return (
                <div key={ph}>
                  <div className="row" style={{ padding: '12px 16px 6px' }}><h3>{PHASE_NAME[ph] || `Phase ${ph}: ${PHASE_SHORT[ph]}`}</h3><span className="small muted">{inPh.filter((r: any) => r.done).length} of {inPh.length} done</span></div>
                  {KINDS.map((k) => { const g = inPh.filter((r: any) => r.owner_kind === k); if (!g.length) return null; const mn = g.reduce((a: number, r: any) => a + (r.inDepth ? r.minutes : 0), 0);
                    return (
                      <div key={k}>
                        <div className="strong small" style={{ padding: '6px 16px', background: 'var(--panel-2)' }}>{KIND_NAME[k]} ({g.length}){mn ? ' - ' + mins(mn) : ''}</div>
                        <table className="tbl compact"><thead><tr>{['ID', 'Request', 'Owner', 'Time', 'Depth', 'Status', 'Session', ''].map((t) => <th key={t}>{t}</th>)}</tr></thead><tbody>
                          {g.flatMap((r: any) => { const above = !r.inDepth; const isOpen = !!open[r.id]; const out = [
                            <tr key={r.id} style={above ? { opacity: 0.45 } : undefined}><td className="mono nowrap">{r.id}</td>
                              <td><span style={{ cursor: 'pointer' }} onClick={() => setOpen({ ...open, [r.id]: !isOpen })}>{isOpen ? 'v ' : '> '}{r.title}</span>{above && <span className="small muted"> (needs {r.depth_level})</span>}</td>
                              <td><Badge kind={KIND_TONE[r.owner_kind]}>{KIND_NAME[r.owner_kind]}</Badge></td><td className="right nowrap">{r.minutes ? mins(r.minutes) : '-'}</td><td><Badge kind="outline">{r.depth_level}</Badge></td>
                              <td><Badge kind={r.na ? '' : STATUS_KIND[r.status]}>{r.na ? 'n/a' : r.status.replace('_', ' ')}</Badge></td><td className="small mono">{r.session || ''}</td><td className="right">{above ? '' : action(r)}</td></tr>];
                            if (isOpen) out.push(
                              <tr key={r.id + 'd'}><td colSpan={8} style={{ background: 'var(--panel-2)' }}><dl className="kv">
                                {r.ask && <><dt>What is asked</dt><dd>{r.ask}</dd></>}{r.creates && <><dt>Creates</dt><dd>{r.creates}</dd></>}
                                {(r.depends_on || []).length > 0 && <><dt>Depends on</dt><dd>{r.depends_on.map((d: string) => <a key={d} href="#" className="mono" style={{ marginRight: 8 }} onClick={(e) => { e.preventDefault(); setOpen({ ...open, [d]: true }); }}>{d}</a>)}</dd></>}
                                {(r.why?.criteria?.length || r.why?.tiles?.length) ? <><dt>Why it matters</dt><dd>{(r.why.criteria || []).map((c: string) => { const m = /^G(\d)/.exec(c); return <Link key={c} className="chip" href={`/products/${pid}/gates${m ? '/' + m[1] : ''}`} title="Gate criterion this request feeds">{c}</Link>; })}{(r.why.tiles || []).map((t: string) => <Badge key={t} kind="outline">{t}</Badge>)}</dd></> : null}
                                {r.doneMessage && <><dt>Why this status</dt><dd>{r.doneMessage}{r.na ? ' (marked not applicable)' : ''}</dd></>}
                                {r.blockedBy?.length > 0 && <><dt>Blocked by</dt><dd>{r.blockedBy.join(', ')}</dd></>}
                                {r.answeredAt && <><dt>Answered</dt><dd>{String(r.answeredAt).slice(0, 16).replace('T', ' ')} by {r.answeredBy || '?'}</dd></>}
                                {(r.v2Ref || []).length > 0 && <><dt>Design reference</dt><dd>{r.v2Ref.join(', ')}</dd></>}
                                {!r.done && <><dt>Other</dt><dd><button className="btn sm ghost" onClick={() => setNa(r)}>Mark not applicable</button></dd></>}
                              </dl></td></tr>); return out; })}
                        </tbody></table></div>); })}
                </div>); })}
          </Card>
        </div>)}</Fold>
      <Fold title="Details: the four kinds of question">{() => (
        <Card title="The four layers" sub="only the first two cost human time"><div className="grid g4">
          {([['HUMAN', 'Only the company can answer. Costs human minutes. Done in a session.'], ['DOCUMENT', 'Existing material (a policy, a spreadsheet). Paste it; no new thinking.'], ['AGENT_RESEARCH', 'Claude researches public facts. Comes back unverified; a different person verifies.'], ['DERIVED', 'The tool generates it from earlier answers. One click, then a person reviews.']] as [string, string][]).map(([k, t]) => <div key={k}><Badge kind={KIND_TONE[k]}>{KIND_NAME[k]}</Badge><div className="small" style={{ marginTop: 4 }}>{t}</div></div>)}</div></Card>)}</Fold>
      {na && <NaModal pid={pid} r={na} onClose={() => setNa(null)} onDone={(m: string) => { setNa(null); setMsg(m); reload(); }} />}
      {agent && <AgentModal pid={pid} id={agent} onClose={() => setAgent(null)} onDone={(m: string) => { setAgent(null); setMsg(m); reload(); }} />}
    </Page>
  );
}
