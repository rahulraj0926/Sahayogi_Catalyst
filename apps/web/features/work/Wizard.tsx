'use client';
/** The session wizard: one question at a time. Prototype: work.js (wizard, drawStep, drawForm, drawResearch, drawListStep, drawSummary) */
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Bar, Card, ErrorBox, Loading } from '@/components/ui';
import { Fold, Modal, mins, useAction } from '@/components/kit';
import StepForm, { initialValues, localCheck, plain, toAnswers, type Problem } from '@/components/StepForm';
import { actor, api, go, useApi } from '@/lib/api';
import { flat, liveSteps } from './Overview';

const isDone = (x: any) => x.status === 'done' || x.status === 'not_applicable';
const isOpen = (x: any) => ['ready', 'in_progress'].includes(x.status);
const fmtMin = (m?: number) => (m ? 'about ' + mins(m) : 'a few minutes');
const plural = (n: number, one: string, many?: string) => `${n} ${n === 1 ? one : many || one + 's'}`;
const humanize = (s: string) => String(s || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase();
const clipN = (t: string, n: number) => { const w = String(t || '').split(/\s+/); return w.length <= n ? w.join(' ') : w.slice(0, n).join(' '); };
type Banner = { text: string; links: { href: string; text: string }[]; items: string[]; warn: boolean } | null;

function describe(res: any, pid: string) {
  const ch = res.changed || {}; const parts: string[] = []; const links: { href: string; text: string }[] = []; const byType: Record<string, any[]> = {};
  (ch.created || []).forEach((c: any) => { (byType[c.type] = byType[c.type] || []).push(c); links.push({ href: `/products/${pid}/item/${c.id}`, text: c.title ? plain(c.title).slice(0, 60) : c.id }); });
  Object.entries(byType).forEach(([t, arr]) => parts.push(`${arr.length} new ${humanize(t)}${arr.length === 1 ? '' : 's'}`));
  if ((ch.updated || []).length) { parts.push(`${plural(ch.updated.length, 'record')} changed`); ch.updated.forEach((c: any) => links.push({ href: `/products/${pid}/item/${c.id}`, text: c.title ? plain(c.title).slice(0, 40) : c.id })); }
  if (ch.removed) parts.push(`${plural(ch.removed, 'record')} removed`);
  if (ch.links) parts.push(plural(ch.links, 'connection'));
  const ex = ch.extra || {}; const items: string[] = [];
  if (ex.decision) parts.push(`decision recorded: ${plain(String(ex.decision).replace(/_/g, ' '))}`);
  if (ex.attested) parts.push('sign-off recorded');
  (ex.notes || []).forEach((n: string) => items.push(plain(n)));
  if (ex.message) items.push(plain(ex.message));
  return { text: parts.length ? `Saved: ${parts.join(', ')}.` : 'Saved. Nothing needed changing.', links: links.slice(0, 8), items };
}

export default function Wizard({ pid, code, step }: { pid: string; code: string; step: string | null }) {
  const router = useRouter();
  const [auto, setAuto] = useState(false);
  useEffect(() => { api('/sessions/auto', { method: 'POST', body: {}, product: pid }).catch(() => {}).finally(() => setAuto(true)); }, [pid]);
  const sessR = useApi<any>(auto ? '/sessions' : null, pid);
  const docsR = useApi<any>(auto ? '/documents' : null, pid);
  const people = useApi<any>('/people', pid);
  const jr = useApi<any>(auto ? '/journey' : null, pid);
  const docsBefore = useRef<Record<string, any> | null>(null);
  if (docsR.data && !docsBefore.current) docsBefore.current = Object.fromEntries(docsR.data.documents.map((d: any) => [d.key, d]));
  const session = sessR.data ? flat(sessR.data).find((s) => s.code === code) : null;
  const jplan = jr.data?.plan?.sessions?.some((q: any) => q.code === code) ? jr.data.plan : null;
  const jr2 = useApi<any>(auto && session && jr.data && !jplan ? `/journey?stage=${session.phase + 1}` : null, pid);
  const plan = jplan || jr2.data?.plan || null;
  const shorts = useMemo(() => { const m: Record<string, string> = {}; let sessShort: string | null = null; (plan?.sessions || []).forEach((q: any) => { (q.steps || []).forEach((y: any) => { m[y.id] = y.short; }); if (q.code === code) sessShort = q.title; }); return { m, sessShort }; }, [plan, code]);
  if (!auto || sessR.loading) return <Loading />;
  if (sessR.error || !sessR.data) return <ErrorBox message={sessR.error || 'No data'} />;
  if (!session) return <Card title="Session not found"><div className="loading">There is no session called {code} at the current level of detail. <Link href={`/products/${pid}/work`}>See all sessions</Link></div></Card>;
  return <Inner pid={pid} code={code} session={session} initial={step} reloadSessions={sessR.reload} names={(people.data?.people || []).map((p: any) => p.name)} shorts={shorts} docsBefore={docsBefore.current} router={router} />;
}

function Inner({ pid, code, session, initial, reloadSessions, names, shorts, docsBefore, router }: any) {
  const steps = liveSteps(session) as any[];
  const find = (id: string | null) => steps.find((x) => x.request_id === id);
  const [cur, setCur] = useState<string | null>(() => (initial && find(initial) ? initial : (steps.find(isOpen) || steps[0])?.request_id || null));
  const [view, setView] = useState<'step' | 'summary'>('step');
  const [banner, setBanner] = useState<Banner>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [created, setCreated] = useState<any[]>([]); const [updated, setUpdated] = useState<Set<string>>(new Set());
  const [skipFor, setSkipFor] = useState<any>(null); const [docFor, setDocFor] = useState<any>(null);
  useEffect(() => { if (initial && find(initial)) { setCur(initial); setView('step'); } }, [initial]); // eslint-disable-line react-hooks/exhaustive-deps
  const x = find(cur);
  const shortOf = (s: any) => { const t = plain(shorts.m[s.request_id] || s.title); const c = clipN(t, 4); return c === t ? t : c + '…'; };
  const nextOpenAfter = (id: string) => { const i = steps.findIndex((s) => s.request_id === id); return steps.slice(i + 1).find(isOpen) || steps.find((s, k) => k !== i && isOpen(s)) || null; };
  const goStep = (id: string) => { setCur(id); setView('step'); window.history.replaceState(null, '', `/products/${pid}/work/${code}?step=${encodeURIComponent(id)}`); window.scrollTo(0, 0); };
  const done = steps.filter(isDone).length;

  // after saving: show what changed, then go to the next question (or stay when the answer is not complete yet)
  const finishSave = async (s: any, res: any) => {
    const d = describe(res, pid);
    (res.changed?.created || []).forEach((c: any) => setCreated((a) => [...a, c])); (res.changed?.updated || []).forEach((c: any) => setUpdated((u) => new Set(u).add(c.id)));
    if (res.pending || res.approval) d.items.push('It does not count yet: the named person has to decide.');
    if (res.auto_ran?.length) d.items.push(`The tool also prepared for you: ${res.auto_ran.map((a: any) => plain(a.title)).join('; ')}.`);
    const fresh = await api<any>('/sessions', { product: pid });
    const sNow = flat(fresh).find((q) => q.code === code); const now = sNow && liveSteps(sNow).find((q: any) => q.request_id === s.request_id);
    reloadSessions();
    const incomplete = now && !isDone(now) && now.status !== 'skipped' && now.kind !== 'review_drafts' && now.kind !== 'verify_agent_items' && now.not_done_reason && !now.approval_waiting;
    setBanner({ ...d, warn: !!incomplete });
    if (incomplete) { goStep(s.request_id); return; }
    const live = sNow ? liveSteps(sNow) : steps; const i = live.findIndex((q: any) => q.request_id === s.request_id);
    const nx = live.slice(i + 1).find(isOpen) || live.find((q: any, k: number) => k !== i && isOpen(q));
    if (nx && !(now && now.status === 'ready' && nx.request_id === s.request_id)) goStep(nx.request_id); else { setView('summary'); window.scrollTo(0, 0); }
  };

  return (
    <div>
      <Link className="small" href={`/products/${pid}`}>← Journey</Link>
      <div style={{ margin: '8px 0' }}><button className="btn sm" aria-expanded={navOpen} onClick={() => setNavOpen(!navOpen)}>Questions {done}/{steps.length}</button></div>
      {navOpen && (
        <nav className="card" aria-label="Questions in this session" style={{ marginBottom: 12 }}><div className="card-b"><ol style={{ margin: 0, paddingLeft: 18 }}>{steps.map((s, i) => {
          const c = view === 'step' && s.request_id === cur; const w = (s.waiting_for || [])[0];
          const sub = s.status === 'not_applicable' ? 'Not applicable' : s.nothing_to_do ? 'Nothing to do yet' : s.status === 'done' ? 'Done' : s.status === 'skipped' ? 'Skipped for now' : s.status === 'blocked' ? (w ? `Waits for: ${w.title}` : 'Waits for an earlier step') : fmtMin(s.minutes);
          const mark = isDone(s) ? '✓' : s.status === 'skipped' ? '↷' : s.status === 'blocked' ? '⏸' : '○';
          return <li key={s.request_id}><button className={`btn ghost sm`} style={{ fontWeight: c ? 700 : 500 }} aria-current={c ? 'step' : undefined} title={sub} onClick={() => { goStep(s.request_id); setNavOpen(false); }}>{mark} {i + 1}. {shortOf(s)}</button></li>;
        })}</ol></div></nav>)}
      <div className="card"><div className="card-b" style={{ padding: 22 }}>
        {view === 'summary'
          ? <Summary pid={pid} session={session} steps={steps} created={created} updated={updated} docsBefore={docsBefore} sessShort={shorts.sessShort} onReview={() => steps[0] && goStep(steps[0].request_id)} />
          : !x ? <div className="loading">This session has no steps at the current level of detail.</div>
            : <StepView key={x.request_id} pid={pid} code={code} session={session} x={x} steps={steps} done={done} banner={banner} setBanner={setBanner} shorts={shorts} names={names}
              goStep={goStep} nextOpenAfter={nextOpenAfter} finishSave={finishSave} reload={reloadSessions} onSkip={() => setSkipFor(x)} onDoc={() => setDocFor(x)} toSummary={() => setView('summary')} router={router} />}
      </div></div>
      {skipFor && <SkipModal pid={pid} code={code} x={skipFor} onClose={() => setSkipFor(null)} onDone={async () => { setSkipFor(null); reloadSessions(); setBanner({ text: 'Skipped for now. It stays on your list and does not count as done.', links: [], items: [], warn: true }); const nx = nextOpenAfter(skipFor.request_id); if (nx) goStep(nx.request_id); else setView('summary'); }} />}
      {docFor && <DocumentModal pid={pid} x={docFor} onClose={() => setDocFor(null)} onDone={() => router.push(`/products/${pid}/inbox`)} />}
    </div>
  );
}

function SkipModal({ pid, code, x, onClose, onDone }: any) {
  const [reason, setReason] = useState(''); const [err, setErr] = useState(''); const act = useAction();
  return (
    <Modal title="Skip this question for now?" onClose={onClose}>
      <p>Skipping does not count as done. We keep your reason so nobody forgets why.</p>
      <label className="strong">Why are you skipping it?<textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: need the finance head to confirm the number" style={{ width: '100%' }} autoFocus /></label>
      {err && <div className="small" style={{ color: 'var(--bad)' }}>{err}</div>}{act.box}
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={act.busy} onClick={() => { if (!reason.trim()) return setErr('Please say in a few words why you are skipping it.'); act.run(async () => { await api(`/sessions/${code}/steps/${x.request_id}`, { method: 'POST', body: { action: 'skip', reason: reason.trim() }, product: pid }); onDone(); }); }}>Skip this question</button></div>
    </Modal>
  );
}

function DocumentModal({ pid, x, onClose, onDone }: any) {
  const goal: string = x.assist_goal; const needsComp = /^competitor_|^capabilities$/.test(goal || '');
  const atts = useApi<any>('/attachments', pid); const comps = useApi<any>(needsComp ? '/items?type=Competitor' : null, pid); const prod = useApi<any>('/items?type=Product', pid);
  const [chosen, setChosen] = useState<string | null>(null); const [file, setFile] = useState<File | null>(null); const [comp, setComp] = useState('');
  const [msg, setMsg] = useState<{ t: string; ok?: boolean } | null>(null); const [busy, setBusy] = useState(false);
  const list = (atts.data?.attachments || []).filter((a: any) => a.status === 'Active');
  const run = async () => {
    setMsg(null);
    if (!file && !chosen) return setMsg({ t: 'Pick a file from the list, or upload a new one.' });
    if (needsComp && !comp) return setMsg({ t: 'Say which competitor this file is about.' });
    setBusy(true);
    try {
      const target = needsComp ? comp : prod.data?.items?.[0]?.id; let attId = chosen;
      if (file) {
        const res = await fetch(`/api/v1/attachments?target=${encodeURIComponent(target)}&name=${encodeURIComponent(file.name)}&product=${encodeURIComponent(pid)}`, { method: 'POST', headers: { 'x-actor': actor(), 'content-type': file.type || 'application/octet-stream' }, body: file });
        const j = await res.json().catch(() => ({}));
        if (res.ok) attId = j.attachment.id; else { const dup = res.status === 409 && list.find((a: any) => a.filename === file.name); if (dup) attId = dup.id; else throw Object.assign(new Error(j.error || `Upload failed (${res.status})`), { status: res.status }); }
      }
      const r = await api<any>(`/attachments/${attId}/assist`, { method: 'POST', body: { goal, ...(needsComp ? { target: comp } : {}) }, product: pid });
      const n = (r.added || []).length;
      if (!n) { setMsg({ t: 'The assistant read the file but found nothing it could suggest for this question. Try another file, or type the answer in yourself.' }); setBusy(false); return; }
      onDone();
    } catch (e: any) { setBusy(false); setMsg({ t: e.status === 415 ? `That type of file is not accepted: ${e.message}` : `${e.message}. Nothing was saved. Try again or pick a different file.` }); }
  };
  return (
    <Modal title="Answer from a document" onClose={onClose}>
      <p>Pick a file that already holds the answer. The assistant reads it and suggests answers with the exact place they came from. Nothing is saved until you accept each suggestion in the review inbox.</p>
      {needsComp && <label className="strong">Which competitor is the file about?<select value={comp} onChange={(e) => setComp(e.target.value)} style={{ width: '100%' }}><option value="">{(comps.data?.items || []).length ? 'Choose the competitor this is about…' : 'No competitors yet'}</option>{(comps.data?.items || []).map((c: any) => <option key={c.id} value={c.id}>{c.title || c.id}</option>)}</select></label>}
      <div className="strong" style={{ marginTop: 8 }}>{list.length ? 'Files you have already added' : 'No files added yet'}</div>
      {list.map((a: any) => <label key={a.id} style={{ display: 'flex', gap: 8, padding: '3px 0' }}><input type="radio" name="att" checked={chosen === a.id} onChange={() => { setChosen(a.id); setFile(null); }} /><span style={{ flex: 1 }}><b>{a.filename}</b> <span className="small muted">{Math.round(a.size_bytes / 1024) || 1} KB, added {String(a.uploaded_on).slice(0, 10)}</span></span>{a.extracted_text_status === 'unsupported' && <Badge kind="warn">cannot be read</Badge>}</label>)}
      <label className="strong" style={{ display: 'block', marginTop: 8 }}>Or add a new file<input type="file" accept=".pptx,.docx,.xlsx,.csv,.tsv,.txt,.md,.json,.html,.pdf" onChange={(e) => { setFile(e.target.files?.[0] || null); setChosen(null); }} /></label>
      <div className="small muted">PowerPoint, Word, Excel, PDF, CSV or plain text, up to 25 MB.</div>
      {msg && <div className={`callout ${msg.ok ? 'ok' : 'bad'}`} style={{ marginTop: 8 }}>{msg.t}</div>}
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={run}>{busy ? 'Reading the file…' : 'Read the file'}</button></div>
    </Modal>
  );
}

function Summary({ pid, session, steps, created, updated, docsBefore, sessShort, onReview }: any) {
  const doneN = steps.filter(isDone).length; const waiting = steps.filter((x: any) => !isDone(x)); const complete = !waiting.length; const changed = created.length + updated.size;
  const docs = useApi<any>('/documents', pid); const j = useApi<any>('/journey', pid);
  const richer = (docs.data?.documents || []).filter((d: any) => { const b = docsBefore?.[d.key]; return b && (d.completeness > b.completeness || d.missing_count < b.missing_count || d.word_count > b.word_count || d.status !== b.status); });
  return (
    <div>
      <div className="small muted">{sessShort || plain(session.title)}</div>
      <h2>{complete ? 'This session is finished' : 'Nothing more to do right now'}</h2>
      <ul style={{ lineHeight: 1.9, fontSize: 16 }}>
        <li>✓ {doneN} of {steps.length} questions answered</li>{changed > 0 && <li>✓ {plural(changed, 'record')} saved just now</li>}
        {docs.data && <li>✓ {richer.length ? `${plural(richer.length, 'document')} got richer` : 'No document changed this time'} {richer.length > 0 && <Link className="small" href={`/products/${pid}/documents/${richer[0].key}`}>Read it</Link>}</li>}
      </ul>
      {waiting.length > 0 && <Fold title={`Still open (${waiting.length})`} open>{() => <ul>{waiting.map((x: any) => <li key={x.request_id}>{plain(x.title)} <span className="small muted">{x.status === 'skipped' ? `Skipped: ${x.skipped_reason || ''}` : x.status === 'blocked' ? 'Waiting for an earlier step' : fmtMin(x.minutes)}</span> <Link className="btn sm" href={`/products/${pid}/work/${session.code}?step=${x.request_id}`}>Open</Link></li>)}</ul>}</Fold>}
      {j.data?.next?.kind === 'task' && <div className="small muted" style={{ margin: '8px 0' }}>{j.data.next.phrase}</div>}
      <div className="row" style={{ marginTop: 10 }}>
        {j.data?.next ? <Link className="btn primary" href={go(pid, j.data.next.href)}>{j.data.next.kind === 'task' ? 'Continue to the next task' : j.data.next.button}</Link> : <Link className="btn primary" href={`/products/${pid}`}>Back to the journey</Link>}
        <Link className="btn" href={`/products/${pid}`}>Back to the journey</Link><button className="btn ghost" onClick={onReview}>Review my answers</button>
      </div>
    </div>
  );
}

function StepView({ pid, code, session, x, steps, done, banner, setBanner, shorts, names, goStep, nextOpenAfter, finishSave, reload, onSkip, onDoc, toSummary, router }: any) {
  const idx = steps.findIndex((q: any) => q.request_id === x.request_id); const sn = idx + 1; const prev = idx > 0 ? steps[idx - 1] : null;
  const form = x.form || { fields: [], values: {} };
  const headingOf = (s: any) => { const t = plain(s.title); return t.split(/\s+/).length <= 12 ? t : plain(shorts.m[s.request_id] || clipN(t.replace(/:.*$/, ''), 12)); };
  const lead = plain(x.question || x.ask);
  const who = x.approval_waiting ? { t: `Waiting on ${x.approval_waiting.approver}` } : ['AGENT_RESEARCH', 'DERIVED'].includes(x.owner_kind) ? { t: 'Assistant' } : x.kind === 'attestation' ? { t: 'Someone else' } : { t: 'You' };
  const feeds = (x.feeds_plain || []).slice(0, 3);
  const act = useAction();
  const post = (body: any) => api<any>(`/sessions/${code}/steps/${x.request_id}`, { method: 'POST', body, product: pid });
  const nx = nextOpenAfter(x.request_id);

  const navRow = (
    <div className="row" style={{ marginTop: 14 }}>
      {nx ? <button className="btn primary" onClick={() => goStep(nx.request_id)}>Go to the next question</button> : <button className="btn primary" onClick={toSummary}>See the summary</button>}
      {x.form?.link_to && <Link className="btn" href={go(pid, x.form.link_to)}>Open the full page</Link>}
    </div>);
  const head = (
    <>
      {banner && <div className={`callout ${banner.warn ? 'warn' : 'ok'}`} role="status" style={{ marginBottom: 12 }}>{banner.text}
        {(banner.items.length > 0 || banner.links.length > 0) && <Fold title="Details">{() => <div>{banner.items.length > 0 && <ul>{banner.items.map((t: string, i: number) => <li key={i}>{t}</li>)}</ul>}{banner.links.length > 0 && <div className="small">{banner.links.map((l: any, i: number) => <Link key={i} href={l.href} style={{ marginRight: 12 }}>{l.text}</Link>)}</div>}</div>}</Fold>}
        <div><button className="btn ghost sm" onClick={() => setBanner(null)}>Dismiss</button></div></div>}
      <div className="row wrap small muted"><span>{shorts.sessShort || plain(session.title)}</span><span>Question {sn} of {steps.length}</span>{x.minutes ? <span>about {mins(x.minutes)}</span> : null}<span className="chip">{who.t}</span></div>
      <div style={{ margin: '6px 0 10px' }}><Bar pct={steps.length ? (done / steps.length) * 100 : 0} kind={done === steps.length ? 'ok' : 'accent'} /></div>
      <h2 style={{ fontSize: 24 }}>{headingOf(x)}</h2>
      {lead && lead !== plain(x.title) && lead.split(/\s+/).length <= 14 && <p>{lead}</p>}
      <div className="row wrap small">
        <Fold title="Why?">{() => <div>{plain(x.why_plain || session.purpose)}{feeds.length > 0 && <div style={{ marginTop: 6 }}><b>The sign-off looks for: </b><ul>{feeds.map((t: string) => <li key={t}>{plain(t)}</li>)}</ul></div>}</div>}</Fold>
        <Fold title="Details">{() => <div>{lead && lead !== plain(x.title) && <p>{lead}</p>}<div><b>Who comes: </b>{session.who_text || session.who}</div><div><b>Time: </b>{mins(session.total_minutes)} in all, {session.minutes_left ? fmtMin(session.minutes_left) + ' left' : 'nothing left'}</div>{session.bring && <div><b>Bring: </b>{session.bring}</div>}{(session.auto_steps || []).length > 0 && <div style={{ marginTop: 6 }}><b>The tool does for you: </b>{[...new Set((session.auto_steps as any[]).map((a) => plain(a.title)))].join('; ')}</div>}</div>}</Fold>
      </div>
      {x.approval_waiting && <div className="callout warn" role="status"><b>Waiting for {x.approval_waiting.approver}. </b>{x.approval_waiting.prepared_by} asked on {String(x.approval_waiting.since).slice(0, 10)}. This step is not finished, and nothing counts, until {x.approval_waiting.approver} decides. <Link href={`/products/${pid}/approvals`}>See approvals</Link></div>}
    </>);

  if (x.status === 'blocked') {
    const w: any[] = x.waiting_for || [];
    return (
      <div>{head}
        <div className="callout"><div className="strong">This step is waiting.</div><div>{w.length ? 'It opens up as soon as this is done:' : 'It opens up once the steps before it are done.'}</div>
          <ul>{w.map((b, i) => <li key={i} style={{ margin: '6px 0' }}><b>{plain(b.title)}</b>
            {b.unlocks && <div className="small muted">Do this first. It opens "{plain(b.unlocks)}", which in turn opens this step.</div>}{b.why && <div className="small muted">{b.why}</div>}
            <div style={{ marginTop: 4 }}>
              {b.can_run && <button className="btn primary sm" disabled={act.busy} onClick={() => act.run(async () => { await api(`/sessions/${b.session || code}/steps/${b.request_id}`, { method: 'POST', body: { action: 'derive' }, product: pid }); reload(); })}>Do it now</button>}
              {b.session && !b.can_run && (b.session === code ? <button className="btn primary sm" onClick={() => goStep(b.request_id)}>Go to this step</button> : <Link className="btn primary sm" href={`/products/${pid}/work/${b.session}?step=${b.request_id}`}>Go to this step</Link>)}
              {!b.session && !b.can_run && <span className="small muted">The tool does this by itself when it can.</span>}</div></li>)}</ul>
          {!w.length && <div className="small muted">Go back through the steps above and finish any that are still open.</div>}{act.box}</div>
        <div className="row" style={{ marginTop: 14 }}>{prev && <button className="btn ghost" onClick={() => goStep(prev.request_id)}>Back</button>}{navRow}</div>
      </div>);
  }
  if (x.status === 'not_applicable') {
    return (
      <div>{head}
        <div className="callout"><b>Marked as not applicable. </b>{x.na_reason ? `Reason: ${x.na_reason}. ` : ''}<button className="btn sm" disabled={act.busy} onClick={() => act.run(async () => { await post({ action: 'reopen' }); reload(); })}>Answer it after all</button></div>{act.box}{navRow}
      </div>);
  }
  const status = (
    <>
      {x.waiting_for_check > 0 && x.status === 'done' && <div className="callout warn"><b>{x.waiting_for_check} {x.waiting_for_check === 1 ? 'item is' : 'items are'} waiting for a second person. </b>Until someone other than the person who typed them in has checked them, they do not count at the sign-off. <Link href={`/products/${pid}/checks`}>Open the checking queue</Link></div>}
      {x.status === 'skipped' && <div className="callout warn"><b>You skipped this for now. </b>{x.skipped_reason ? `Reason: ${x.skipped_reason}` : ''}</div>}
      {x.nothing_to_do ? <div className="callout">Nothing to do here yet. It opens by itself when needed.</div>
        : x.status === 'done' && !['gate_decision', 'info'].includes(x.kind) ? <div className="callout ok"><b>Done. </b>{x.editable ? 'You can change it.' : ''}{x.answered_by && <span className="small muted" title={`${x.answered_by}, ${String(x.answered_at).slice(0, 10)}`}> {x.answered_by}, {String(x.answered_at).slice(0, 10)}</span>}</div>
          : x.not_done_reason && !x.approval_waiting && (x.answered_at || x.status === 'in_progress') ? <div className="callout warn"><b>Saved, but not complete yet. </b>{plain(x.not_done_reason)}</div> : null}
      {x.last_notes && !banner && <div className="callout">{(Array.isArray(x.last_notes) ? x.last_notes : [x.last_notes]).map(plain).join(' ')}</div>}
    </>);
  if (x.status === 'done' && ['gate_decision', 'info'].includes(x.kind)) {
    return (<div>{head}<div className="callout ok"><b>Done. </b>{x.answered_by ? `Recorded by ${x.answered_by}, ${String(x.answered_at).slice(0, 10)}.` : 'This decision is recorded.'}</div>{navRow}{x.link_to && <p><Link href={go(pid, x.link_to)}>{x.list_label || 'See what is checked'}</Link></p>}</div>);
  }
  if (x.kind === 'review_drafts' || x.kind === 'verify_agent_items') {
    return (
      <div>{head}{status}
        <div className="callout" style={{ margin: '12px 0 16px' }}>
          <div>{x.kind === 'review_drafts' ? 'Read each draft on the list, then accept, edit or reject it there. This step ticks itself when no draft is left waiting.' : 'A person other than the one who entered each fact opens its source and presses Check. This step ticks itself when nothing is left waiting.'}</div>
          <div style={{ marginTop: 10 }}><Link className="btn primary" href={go(pid, form.link_to || x.link_to || (x.kind === 'review_drafts' ? '#/review' : '#/checks'))}>{x.list_label || (x.kind === 'review_drafts' ? 'Open the list of drafts' : 'Open the checking queue')}</Link></div></div>
        <div className="row"><button className="btn" onClick={onSkip}>Skip for now</button><span className="spacer" />{prev && <button className="btn ghost" onClick={() => goStep(prev.request_id)}>Back</button>}{nx && <button className="btn" onClick={() => goStep(nx.request_id)}>Go to the next question</button>}</div>
      </div>);
  }
  const common = { pid, code, x, names, prev, goStep, onSkip, onDoc, finishSave, post, reload, setBanner, nextOpenAfter, toSummary };
  if (x.kind === 'agent_research') return <div>{head}{status}<Research {...common} form={form} /></div>;
  return <div>{head}{status}<FormBlock {...common} form={form} fields={form.fields || []} values={form.values || {}} route={undefined} doneLabel={x.status === 'done' ? 'Save changes' : null} /></div>;
}

function FormBlock({ pid, x, names, prev, goStep, onSkip, onDoc, finishSave, post, form, fields, values: saved, route, doneLabel, setBanner, nextOpenAfter, reload }: any) {
  const [vals, setVals] = useState<Record<string, any>>(() => initialValues(fields, saved || {}));
  const [problems, setProblems] = useState<Problem[]>([]); const [headline, setHeadline] = useState(''); const [top, setTop] = useState('');
  const [busy, setBusy] = useState(false); const [naOpen, setNaOpen] = useState(false); const [naReason, setNaReason] = useState(''); const [naErr, setNaErr] = useState('');
  const topRef = useRef<HTMLDivElement>(null);
  const label = doneLabel || (x.kind === 'gate_decision' ? 'Record my decision' : 'Save and next');
  const show = (list: Problem[], h?: string) => { setProblems(list); setHeadline(h || (list.length === 1 ? 'One answer needs fixing.' : `${list.length} answers need fixing.`)); setTimeout(() => topRef.current?.scrollIntoView({ block: 'center' }), 0); };
  const save = async () => {
    setProblems([]); setTop('');
    const local = localCheck(fields, vals); if (local.length) return show(local);
    setBusy(true);
    try { const res = await post({ answers: toAnswers(fields, vals), ...(route ? { route } : {}) }); await finishSave(x, res); }
    catch (e: any) {
      setBusy(false);
      if (e.status === 422 || e.status === 409) {
        const list: Problem[] = e.data?.validation?.fields || (e.data?.errors?.length ? e.data.errors.map((m: any) => ({ field: null, message: String(m) })) : [{ field: null, message: e.message }]);
        show(list.map((p) => ({ ...p, message: plain(p.message) })));
      } else setTop(`${e.message}. Nothing was saved. Check your connection and try again.`);
    }
  };
  const doNa = async () => {
    if (!naReason.trim()) return setNaErr('Please write one line saying why it does not apply.');
    setBusy(true);
    try { await post({ action: 'na', reason: naReason.trim() }); reload(); setBanner({ text: 'Marked as not applicable. It counts as dealt with, and you can change your mind any time.', links: [], items: [], warn: false }); const nx = nextOpenAfter(x.request_id); if (nx) goStep(nx.request_id); } catch (e: any) { setNaErr(e.message); setBusy(false); }
  };
  const unmatched = problems.filter((p) => !p.field || !fields.some((f: any) => f.key === p.field));
  return (
    <div>
      <div ref={topRef} />
      {(problems.length > 0 || top) && <div className="err-box" role="alert">{top || <><b>{headline}</b><ul style={{ margin: 0 }}>{problems.map((p, i) => <li key={i}>{p.message}</li>)}</ul></>}</div>}
      {x.kind === 'gate_decision' && (form.missing_items || []).length > 0 && <div className="callout warn"><b>{form.missing_items.length === 1 ? 'One thing is still needed before sign-off.' : form.missing_items.length + ' things are still needed before sign-off.'}</b>
        <Fold title="See what is missing">{() => <ul>{form.missing_items.map((m: any, i: number) => <li key={i}>{m.need} {m.work ? <Link href={`/products/${pid}/work/${m.work.session}?step=${m.work.request}`}>Fix it</Link> : <Link href={go(pid, m.stage_link)}>Open</Link>}</li>)}</ul>}</Fold></div>}
      {x.review_items?.length > 0 && <div className="callout"><b>Please read these first: </b><ul>{x.review_items.map((i: any, k: number) => <li key={k}>{i.label}{i.hint ? ` (${i.hint})` : ''}</li>)}</ul></div>}
      {x.read_doc && <div className="callout" style={{ marginBottom: 14 }}>Read the document before you approve it. <Link className="btn" href={`/products/${pid}/documents/${x.read_doc}`}>Read the document</Link></div>}
      <StepForm fields={fields} values={vals} people={names} onChange={setVals} errors={problems.filter((p) => !unmatched.includes(p))} starter={(saved || {}).__starter} />
      <div className="row wrap" style={{ marginTop: 14 }}>
        <button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : label}</button>
        <button className="btn" disabled={busy} onClick={onSkip}>Skip for now</button>
        {x.na?.allowed && !isDone(x) && <button className="btn" type="button" onClick={() => setNaOpen(true)}>This does not apply to us</button>}
        {x.can_be_answered_by_document && !route && <button className="btn" onClick={onDoc}>Answer from a document</button>}
        {form.link_to && x.kind !== 'gate_decision' && <Link className="btn ghost" href={go(pid, form.link_to)}>Open the full page</Link>}
        {x.kind === 'gate_decision' && (form.link_to || x.link_to) && <Link className="btn ghost" href={go(pid, form.link_to || x.link_to)}>See what is checked</Link>}
        <span className="spacer" />{prev && <button className="btn ghost" onClick={() => goStep(prev.request_id)}>Back</button>}
      </div>
      {naOpen && <div style={{ marginTop: 10, maxWidth: 620 }}><label className="strong">In one line: why does this not apply to us?<input type="text" style={{ width: '100%' }} value={naReason} placeholder={x.na?.hint || 'One line: why does this not apply?'} onChange={(e) => setNaReason(e.target.value)} /></label>
        {naErr && <div className="small" style={{ color: 'var(--bad)' }}>{naErr}</div>}
        <div style={{ marginTop: 8 }}><button className="btn primary sm" disabled={busy} onClick={doNa}>Mark as not applicable</button> <button className="btn ghost sm" onClick={() => setNaOpen(false)}>Cancel</button></div></div>}
    </div>
  );
}

/** Two ways to do a research step: by hand (a plain form) or through an outside AI assistant. */
function Research(props: any) {
  const { pid, x, form, prev, goStep, onSkip, finishSave, post, nextOpenAfter, reload, setBanner } = props;
  const routes = form.routes || {}; const hand = routes.hand || { available: false }; const ai = routes.outside_ai || {};
  const [paste, setPaste] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const copy = (t: string) => { try { navigator.clipboard.writeText(t); } catch { /* ignore */ } };
  const nx = nextOpenAfter(x.request_id);
  return (
    <div>
      <div className="card" style={{ marginBottom: 12 }}><div className="card-b">
        <h3>Fill this in by hand <span className="chip">recommended</span></h3>
        {hand.available ? <><Fold title="Why?">{() => <>Everything you type is saved as entered by a person. It counts at the sign-off like an assistant result that someone checked.</>}</Fold>
          {hand.link && <div className="small" style={{ margin: '0 0 10px' }}><Link href={go(pid, hand.link.href)}>{hand.link.label || 'Open the page'}</Link></div>}
          <FormBlock {...props} fields={hand.fields || []} values={hand.values || {}} route="hand" doneLabel={x.status === 'done' ? 'Save changes' : 'Save and next'} /></>
          : <><div className="small muted">There is no form for this one yet. Use the page below.</div>
            {hand.link && <div style={{ margin: '6px 0 12px' }}><Link className="btn primary" href={go(pid, hand.link.href)}>{hand.link.label || 'Open the page'}</Link></div>}
            <div className="row"><button className="btn" onClick={onSkip}>Skip for now</button><span className="spacer" />{nx && <button className="btn" onClick={() => goStep(nx.request_id)}>Go to the next question</button>}</div></>}
      </div></div>
      <details className="card"><summary className="card-b strong">Or use an outside AI assistant</summary><div className="card-b stack">
        <p className="small muted">Copy the prompt into an AI assistant of your choice. Paste what it gives back below. Its answers arrive marked "not yet checked", and a second person must check each one before it counts.</p>
        <div className="strong small">Step 1. Copy the prompt</div><textarea className="mono" readOnly rows={5} value={ai.prompt || ''} /><div><button className="btn sm" onClick={() => copy(ai.prompt || '')}>Copy the prompt</button></div>
        <div className="strong small">Step 2. Copy the format the assistant must follow</div><textarea className="mono" readOnly rows={5} value={ai.ingest_format ? JSON.stringify(ai.ingest_format, null, 2) : ''} /><div><button className="btn sm" onClick={() => copy(JSON.stringify(ai.ingest_format || {}, null, 2))}>Copy the format</button></div>
        <div className="strong small">Step 3. Paste the result</div><textarea className="mono" rows={6} placeholder="Paste what the assistant returned here" value={paste} onChange={(e) => setPaste(e.target.value)} />
        {err && <div className="err-box">{err}</div>}
        <div><button className="btn primary" disabled={busy} onClick={async () => { setErr(''); if (!paste.trim()) return setErr("Paste the assistant's result first."); setBusy(true); try { const res = await post({ answers: { agent_json: paste } }); await finishSave(x, res); } catch (e: any) { setBusy(false); setErr(e.message + (e.data?.errors?.length ? ' ' + e.data.errors.slice(0, 3).join(' ') : '')); } }}>Import the result</button></div>
      </div></details>
      {prev && <div className="row" style={{ marginTop: 12 }}><button className="btn ghost" onClick={() => goStep(prev.request_id)}>Back</button></div>}
    </div>
  );
}
