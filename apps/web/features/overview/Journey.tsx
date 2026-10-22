'use client';
/** The prototype's journey page: seven steps, the current one open with its checklist, plus the folds below it. */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Circle, Clock, Pencil, Play, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ErrorBox, Loading } from '@/components/ui';
import { Fold, Modal, PersonSelect, ago, mins, useAction, useConfirm } from '@/components/kit';
import { api, go, useApi } from '@/lib/api';


function List({ items, render, none }: { items: any[]; render: (x: any) => React.ReactNode; none: string }) {
  return items.length ? <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.55 }}>{items.map(render)}</ul> : <p className="muted">{none}</p>;
}

function About({ S }: { S: any }) {
  const H = S.headline_numbers || {}; const pur = S.purpose || {}; const cust = S.target_customers || {}; const sc = S.scope || {};
  if (!pur.text && !(cust.segments || []).length && !(sc.in || []).length) return <div className="loading">Nothing is written yet. It fills in as you answer questions.</div>;
  const facts: string[] = [];
  if (H.competitors_tracked) facts.push(`${H.competitors_tracked} ${H.competitors_tracked === 1 ? 'competitor' : 'competitors'} tracked`);
  if (H.requirements) facts.push(`${H.requirements} requirements${H.requirements_by_priority?.Must ? ` (${H.requirements_by_priority.Must} must-have)` : ''}`);
  if (H.stories) facts.push(`${H.stories} user stories`);
  if (H.features) facts.push(`${H.features} features planned`);
  if (H.open_questions) facts.push(`${H.open_questions} open questions`);
  if (H.risks_open) facts.push(`${H.risks_open} open risks`);
  const Sec = ({ t, children }: any) => <div style={{ marginBottom: 14 }}><h3 className="small muted" style={{ textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{t}</h3>{children}</div>;
  const who = [...(cust.segments || []).map((x: any) => ({ t: x.title, w: x.definition })), ...(cust.personas || []).filter((p: any) => p.primary).map((p: any) => ({ t: p.title, w: 'main person' }))].slice(0, 6);
  return (
    <div>
      <Sec t="What it is for"><p>{pur.text || 'Not written yet.'}</p>{pur.problem && <p className="muted"><b>The problem: </b>{pur.problem}</p>}{pur.desired_outcome && <p className="muted"><b>What good looks like: </b>{pur.desired_outcome}</p>}</Sec>
      <Sec t="Who it is for"><List items={who} none="Not written yet." render={(x) => <li key={x.t}>{x.t}{x.w && <span className="muted"> - {x.w}</span>}</li>} /></Sec>
      <Sec t="What is included"><List items={(sc.in || []).slice(0, 6)} none="Nothing is marked as included yet." render={(x) => <li key={x.id}>{x.text}</li>} />{(sc.in || []).length > 6 && <div className="small muted">and {(sc.in || []).length - 6} more</div>}</Sec>
      <Sec t="What is left out"><List items={(sc.out || []).slice(0, 4)} none="Nothing is marked as left out yet." render={(x) => <li key={x.id}>{x.text}{x.why && <span className="muted"> - {x.why}</span>}</li>} /></Sec>
      {facts.length > 0 && <Sec t="In numbers"><div className="row wrap">{facts.map((f) => <span key={f} className="chip">{f}</span>)}</div></Sec>}
    </div>
  );
}

function EditDialog({ pid, S, onClose, onSaved }: { pid: string; S: any; onClose: () => void; onSaved: () => void }) {
  const P = S.product; const router = useRouter();
  const [name, setName] = useState(P.name); const [line, setLine] = useState(S.one_liner || ''); const [owner, setOwner] = useState(P.owner || ''); const [depth, setDepth] = useState(P.depth_level); const [structure, setStructure] = useState<string>(P.structure || '');
  const { data: costs } = useApi<any>('/requests?depth=L1', pid);
  const act = useAction(); const [ask, dialog] = useConfirm(); const [err, setErr] = useState('');
  const LEVELS: [string, string, string][] = [['L1', 'Light', 'Fewest requirements. Fine for small or low-risk products.'], ['L2', 'Standard', 'The usual balance of proof and effort.'], ['L3', 'Thorough', 'Every requirement. For large, regulated or risky products.']];
  const parked = P.stage === 'parked';
  const save = () => act.run(async () => {
    if (!name.trim()) { setErr('The product needs a name.'); return; }
    const patch: any = {};
    if (name.trim() !== P.name) patch.name = name.trim();
    if (line.trim() !== (S.one_liner || '')) patch.one_liner = line.trim();
    if (owner !== (P.owner || '')) patch.owner = owner;
    if (structure && structure !== (P.structure || '')) patch.structure = structure;
    if (Object.keys(patch).length) await api(`/portfolio/products/${pid}`, { method: 'PATCH', body: patch });
    if (depth !== P.depth_level) await api('/settings', { method: 'POST', body: { depth_level: depth }, product: pid });
    onSaved();
  });
  const status = (patch: any, msg: string, okText: string, after?: () => void) => act.run(async () => {
    if (!(await ask(msg, okText))) return;
    await api(`/portfolio/products/${pid}`, { method: 'PATCH', body: patch }); after ? after() : onSaved();
  });
  return (
    <Modal title="Edit details" onClose={onClose}>
      {act.box}{dialog}
      <div className="stack">
        <label className="strong">What is it called?<input type="text" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} style={{ width: '100%' }} /></label>
        {err && <div className="small" style={{ color: 'var(--bad)' }}>{err}</div>}
        <label className="strong">What is the idea in one line?<input type="text" value={line} maxLength={200} onChange={(e) => setLine(e.target.value)} style={{ width: '100%' }} placeholder="For example: A portal where dealers register warranties" /></label>
        <label className="strong">Who owns it?<PersonSelect pid={pid} value={owner} onChange={setOwner} /></label>
        <label className="strong">How is it built?<select value={structure} onChange={(e) => setStructure(e.target.value)} style={{ width: '100%' }}><option value="">Not said yet</option><option value="single">One product - its competitors compete with the whole product</option><option value="modules">A suite of modules - each module has its own competitors</option></select></label>
        <div className="strong">How thorough should the checks be?</div>
        {LEVELS.map(([v, t, d]) => (
          <label key={v} className="card" style={{ padding: '8px 12px', cursor: 'pointer', borderColor: depth === v ? 'var(--sd-accent)' : undefined }}>
            <input type="radio" name="depth" checked={depth === v} onChange={() => setDepth(v)} /> <b>{t}{v === 'L2' ? ' (recommended)' : ''}</b><div className="small muted">{d}</div>
          </label>))}
        <div className="xs muted">You can change this later.{costs?.totals?.byDepth?.L1 ? ` Light takes about ${mins(costs.totals.byDepth.L1.all.humanMinutes)} of people's time.` : ''}</div>
        <details><summary className="strong">Pause or archive this product</summary>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn" onClick={() => status({ parked: !parked }, parked ? `Resume "${P.name}"?` : `Park "${P.name}"? It stays in the portfolio but is marked as on hold.`, parked ? 'Resume' : 'Park')}>{parked ? 'Resume this product' : 'Park this product'}</button>
            <button className="btn danger" onClick={() => status({ archived: true }, `Archive "${P.name}"? It disappears from the portfolio list. Nothing is deleted.`, 'Archive', () => router.push('/'))}>Archive</button>
          </div></details>
        <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={act.busy} onClick={save}>Save changes</button></div>
      </div>
    </Modal>
  );
}

export default function Journey({ pid, stage, openEdit }: { pid: string; stage: number | null; openEdit?: boolean }) {
  const q = stage !== null ? `/journey?stage=${stage}` : '/journey';
  const { data: j, error, loading, reload } = useApi<any>(q, pid);
  const cur = useApi<any>('/journey', pid);
  const [edit, setEdit] = useState<any>(null);
  const [auto, setAuto] = useState(openEdit);
  const router = useRouter();
  const summary = useApi<any>('/product/summary', pid);
  if (loading) return <Loading />;
  if (error || !j) return <ErrorBox message={error || 'No journey'} />;
  const view = j.view; const current = j.current;
  const stages: any[] = j.stages;
  const vs = stages.find((s) => s.n === view) || stages.find((s) => s.n === current) || stages[0];
  const pctOf = (s: any) => (s.status === 'done' ? 100 : typeof s.progress === 'number' ? s.progress : s.tasks_total ? Math.round((s.tasks_done / s.tasks_total) * 100) : 0);
  const done = stages.filter((s) => s.status === 'done');
  const TONE: Record<string, { Icon: any; cls: string }> = {
    done: { Icon: CheckCircle2, cls: 'text-[var(--status-healthy-fg)]' }, waiting: { Icon: Clock, cls: 'text-[var(--status-warning-fg)]' },
    next: { Icon: Play, cls: 'text-[var(--sd-accent)]' }, blocked: { Icon: XCircle, cls: 'text-[var(--status-critical-fg)]' }, todo: { Icon: Circle, cls: 'text-[var(--text-muted)]' },
  };
  const pill = 'inline-flex items-center gap-1.5 rounded-full border border-[var(--divider)] bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--sd-accent)] hover:text-[var(--sd-accent)]';
  const row = (t: any, i: number) => {
    const { Icon, cls } = TONE[t.status] || TONE.todo;
    const who = t.who === 'you' ? 'You' : t.who_name || t.who;
    return (
      <li key={t.id} className="jy-in" style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}>
        <div role="link" tabIndex={0} onClick={(e) => { if (!(e.target as HTMLElement).closest('a,button')) router.push(go(pid, t.href)); }} onKeyDown={(e) => { if (e.key === 'Enter') router.push(go(pid, t.href)); }}
          className={`group flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-all hover:-translate-y-px hover:shadow-md ${t.status === 'next' ? 'border-[var(--sd-accent)] bg-[var(--sd-accent-soft)]' : 'border-[var(--divider)] bg-[var(--surface)]'}`}>
          <Icon size={18} className={`shrink-0 ${cls}`} />
          <span className="w-5 shrink-0 text-xs tabular-nums text-[var(--text-muted)]">{t.n}</span>
          <Link href={go(pid, t.href)} className={`min-w-0 flex-1 truncate text-sm ${t.status === 'done' ? 'text-[var(--text-muted)] line-through decoration-[var(--divider)]' : 'font-medium text-[var(--text-heading)]'}`}>{t.title}</Link>
          {(t.status === 'waiting' || t.status === 'blocked') && t.note && <span className="hidden max-w-[16rem] truncate text-xs text-[var(--text-muted)] @[44rem]:inline" title={t.note}>{t.note}</span>}
          {t.status !== 'done' && t.minutes ? <span className="hidden shrink-0 text-xs tabular-nums text-[var(--text-muted)] sm:inline">{mins(t.minutes)}</span> : null}
          <span className="shrink-0 rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]">{who}</span>
          {t.status === 'next' && <Link href={go(pid, t.href)} className="btn primary sm shrink-0">Continue</Link>}
        </div>
      </li>);
  };
  const plan = (pl: any) => pl?.sessions?.length ? (
    <div className="mt-3"><Fold title="Session plan">{() => <table className="tbl compact"><thead><tr><th>Session</th><th>Who comes</th><th>Bring</th><th>Time</th></tr></thead><tbody>
      {pl.sessions.map((s: any) => <tr key={s.code}><td>{s.title}</td><td>{s.who_text}</td><td>{s.bring || 'Nothing'}</td><td className="nowrap">{mins(s.total_minutes)}</td></tr>)}</tbody></table>}</Fold></div>) : null;
  const pct = pctOf(vs);

  return (
    <div className="@container flex flex-col gap-4">
      <style>{`@keyframes jy-up{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}.jy-in{animation:jy-up .35s ease both}@keyframes jy-pulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--sd-accent) 45%,transparent)}70%{box-shadow:0 0 0 9px transparent}100%{box-shadow:0 0 0 0 transparent}}.jy-pulse{animation:jy-pulse 2s ease-out infinite}@media (prefers-reduced-motion:reduce){.jy-in,.jy-pulse{animation:none}}`}</style>
      {(j.warnings || []).length > 0 && <div className="rounded-xl border border-[var(--status-warning-fg)]/40 bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-heading)]">{j.warnings[0]} <Link href={`/products/${pid}/gates`} className="font-medium text-[var(--sd-accent)] underline">See why</Link></div>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--text-heading)]"><ClipboardCheck size={18} className="text-[var(--text-muted)]" />Your journey</h2>
        <div className="flex flex-wrap gap-2">
          <Link href={`/products/${pid}/next`} className={pill}>All next steps</Link>
          <button type="button" className={pill} onClick={() => setEdit(true)}><Pencil size={13} />Edit details</button>
        </div>
      </div>

      <section key={vs.n} className="jy-in rounded-2xl border border-[var(--divider)] bg-[var(--surface-muted)]/40 p-3 @[40rem]:p-4" aria-label={`${vs.name} stage`}>
        <div className="mb-3 flex items-center gap-4">
          <Ring pct={pct} />
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-[var(--text-heading)]">{vs.name}</h3>
            <p className="text-sm text-[var(--text-muted)]">
              {vs.status === 'done' ? `Signed off${vs.signed_off_on ? ' ' + ago(vs.signed_off_on) : ''}${vs.signed_off_by ? ' by ' + vs.signed_off_by : ''}`
                : vs.n >= 1 && vs.n <= 5 ? `${vs.tasks_done} of ${vs.tasks_total} questions done` : vs.status === 'todo' ? `Starts after ${vs.starts_after}` : 'In progress'}
              {vs.status === 'waiting' && vs.waiting_on ? <span className="ml-2 rounded-full bg-[var(--surface)] px-2 py-0.5 text-xs">Waiting on {vs.waiting_on}</span> : null}
            </p>
          </div>
          {vs.n !== current && <Link href={`/products/${pid}`} className="btn sm">Back to current</Link>}
        </div>
        {j.tasks?.length ? <ol className="flex flex-col gap-1.5">{j.tasks.map(row)}</ol> : <p className="text-sm text-[var(--text-muted)]">No steps to show here yet.</p>}
        {vs.n >= 1 && vs.n <= 5 && plan(j.plan)}
        {vs.n === 6 && j.handover?.bullets?.length > 0 && <ul className="mt-3 list-disc pl-5 text-sm text-[var(--text-secondary)]">{j.handover.bullets.map((b: string) => <li key={b}>{b}</li>)}</ul>}
      </section>

      {done.filter((s) => s.n !== vs.n).length > 0 && (
        <ul className="flex flex-col divide-y divide-[var(--divider)] rounded-2xl border border-[var(--divider)] bg-[var(--surface)]">
          {done.filter((s) => s.n !== vs.n).map((s) => (
            <li key={s.n} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
              <CheckCircle2 size={16} className="text-[var(--status-healthy-fg)]" />
              <span className="font-medium text-[var(--text-heading)]">{s.name}</span>
              <span className="text-xs text-[var(--text-muted)]">{s.n === 0 ? 'Done' : s.n === 6 ? 'Handed over' : `Signed off${s.signed_off_on ? ' ' + ago(s.signed_off_on) : ''}${s.signed_off_by ? ' by ' + s.signed_off_by : ''}`}</span>
              <span className="ml-auto flex flex-wrap gap-3 text-xs font-medium text-[var(--sd-accent)]">
                {s.n === 0 ? <button type="button" onClick={() => setEdit(true)}>Edit details</button> : s.n === 6 ? <Link href={`/products/${pid}/handoff`}>Open hand-over</Link> : <>
                  <Link href={`/products/${pid}/documents`}>Documents</Link><Link href={`/products/${pid}/gates/${s.gate}`}>Sign-off</Link><Link href={`/products/${pid}?stage=${s.n}`}>View</Link></>}
              </span>
            </li>))}
        </ul>
      )}
      {stages[6]?.status === 'todo' && j.handover?.bullets?.length > 0 && vs.n !== 6 && (
        <div className="rounded-2xl border border-dashed border-[var(--divider)] px-4 py-3"><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">At hand-over</p><ul className="list-disc pl-5 text-sm text-[var(--text-secondary)]">{j.handover.bullets.map((b: string) => <li key={b}>{b}</li>)}</ul></div>
      )}

      <Fold title="About this product">{() => summary.data ? <About S={summary.data} /> : <Loading />}</Fold>
      {(edit || auto) && summary.data && <EditDialog pid={pid} S={summary.data} onClose={() => { setEdit(null); setAuto(false); }} onSaved={() => { setEdit(null); setAuto(false); reload(); cur.reload(); summary.reload(); }} />}
    </div>
  );
}

/** A small progress ring that fills in when it appears. */
function Ring({ pct }: { pct: number }) {
  const [on, setOn] = useState(false);
  useEffect(() => { const t = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(t); }, []);
  const R = 24; const C = 2 * Math.PI * R; const v = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative h-14 w-14 shrink-0" role="img" aria-label={`${v}% complete`}>
      <svg viewBox="0 0 60 60" className="h-full w-full -rotate-90">
        <circle cx="30" cy="30" r={R} fill="none" stroke="var(--divider)" strokeWidth="6" />
        <circle cx="30" cy="30" r={R} fill="none" stroke={v === 100 ? 'var(--status-healthy-fg)' : 'var(--sd-accent)'} strokeWidth="6" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - (on ? v : 0) / 100)} style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(.2,.8,.2,1)' }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[13px] font-bold tabular-nums text-[var(--text-heading)]">{v}%</span>
    </div>
  );
}
