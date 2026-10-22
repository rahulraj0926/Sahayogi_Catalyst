'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge, Bar, Card, ErrorBox, Loading, Page } from '@/components/ui';
import { Pager, mins, useAction, usePaged } from '@/components/kit';
import { PHASE_SHORT } from '@/components/shell/groups';
import { plain } from '@/components/StepForm';
import { api, go, useApi } from '@/lib/api';

const TAGLINE = ['What is this and why now?', 'Is the problem real, and where do we stand?', 'What exactly will we build first?', 'What must it do, precisely?', 'How do people and processes move through it?'];
const plural = (n: number, one: string, many?: string) => `${n} ${n === 1 ? one : many || one + 's'}`;
const fmtMin = (m?: number) => (m ? 'about ' + mins(m) : 'a few minutes');
export const flat = (sess: any) => sess.phases.flatMap((p: any) => p.sessions) as any[];
export const liveSteps = (s: any) => (s.steps || []).filter((x: any) => x.in_depth) as any[];

function pickResume(sess: any, next: any) {
  const all = flat(sess); const acts: any[] = next?.actions || [];
  const act = acts.find((a) => a.route?.session && a.ref);
  if (act) {
    const s = all.find((x) => x.code === act.route.session); const st = s && liveSteps(s).find((x) => x.request_id === act.ref);
    if (s && st && !s.complete && ['ready', 'in_progress'].includes(st.status)) return { session: s, step: st, why: act.why };
  }
  const s = all.find((x) => !x.complete && x.steps_done > 0 && x.next_step) || all.find((x) => !x.complete && x.next_step);
  return s ? { session: s, step: liveSteps(s).find((x) => x.request_id === s.next_step), why: null } : null;
}

function AutoPanel({ sess, pid, reload }: { sess: any; pid: string; reload: () => void }) {
  const items = flat(sess).flatMap((s) => (s.auto_steps || []).map((a: any) => ({ ...a, session: s })));
  const act = useAction();
  if (!items.length) return null;
  const done = items.filter((a) => a.status === 'done').length;
  const run = (a: any) => act.run(async () => { await api(`/sessions/${a.session.code}/steps/${a.request_id}`, { method: 'POST', body: { action: 'derive' }, product: pid }); reload(); });
  return (
    <Card title="Done for you by the tool" sub="drafts and documents prepared by themselves">
      {act.box}
      <p className="small muted">{done} of {items.length} steps are done. The tool prepares these by itself as soon as it has what it needs, so you never have to press anything on an Advanced page.</p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>{items.map((a) => {
        const waiting = a.status === 'blocked'; const manual = a.auto && a.auto.auto === false;
        return (
          <li key={a.session.code + a.request_id} className="row" style={{ padding: '6px 0', borderTop: '1px solid var(--line)' }}>
            <span>{a.status === 'done' ? '✓' : waiting ? '⏸' : '○'}</span>
            <span style={{ flex: 1 }}>{plain(a.title)}<div className="small muted">{waiting ? `Starts by itself when: ${(a.waiting_for || []).map((w: any) => w.title).join(', ') || 'an earlier step is done'}` : a.auto?.later ? `Starts by itself when you reach Stage ${a.auto.stage}.` : a.status === 'done' ? (a.auto?.message || 'Done') : 'Ready'}</div></span>
            {!waiting && a.status !== 'done' && manual && <button className="btn sm primary" disabled={act.busy} onClick={() => run(a)}>Do it now</button>}
            {manual && a.status === 'done' && <button className="btn sm" disabled={act.busy} onClick={() => run(a)}>Do it again</button>}
          </li>);
      })}</ul>
    </Card>
  );
}

export default function Overview({ pid }: { pid: string }) {
  const [ready, setReady] = useState(false);
  const [stage, setStage] = useState('all');
  useEffect(() => { api('/sessions/auto', { method: 'POST', body: {}, product: pid }).catch(() => {}).finally(() => setReady(true)); }, [pid]);
  const sessR = useApi<any>(ready ? '/sessions?forms=0' : null, pid);
  const nextR = useApi<any>(ready ? '/next-actions?limit=8' : null, pid);
  const rows = ((sessR.data?.phases as any[]) || []).flatMap((ph: any) => ph.sessions.filter((s: any) => s.steps_total > 0).map((s: any) => ({ ...s, _phase: ph.phase, _phaseName: ph.name })));
  const shown = rows.filter((s) => stage === 'all' || String(s._phase) === stage);
  const pg = usePaged<any>(shown, 10);
  if (!ready || sessR.loading || nextR.loading) return <Loading />;
  if (sessR.error || !sessR.data) return <ErrorBox message={sessR.error || 'No data'} />;
  const sess = sessR.data; const all = flat(sess);
  if (!all.length) return <Page title="Work session"><Card><div className="loading">There is nothing to work on for this product yet. <Link href={`/products/${pid}`}>Back to the overview</Link></div></Card></Page>;
  const totalSteps = all.reduce((m, s) => m + s.steps_total, 0); const doneSteps = all.reduce((m, s) => m + s.steps_done, 0);
  const minsLeft = all.reduce((m, s) => m + s.minutes_left, 0);
  const pct = totalSteps ? Math.round((doneSteps / totalSteps) * 100) : 0;
  const resume = pickResume(sess, nextR.data); const st = resume?.step;
  const stages = PHASE_SHORT.map((_, n) => n);
  return (
    <Page title="Work session">
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 16, marginBottom: 18 }}>
        <section className="card" style={{ borderColor: 'var(--sd-accent)' }}>
          <div className="card-b">
            <div className="xs muted">{resume ? `Continue where you left off · ${plain(resume.session.title)}` : 'All planned sessions are done'}</div>
            {resume ? (<>
              <h2 style={{ margin: '4px 0 6px', fontSize: 20 }}>{st ? plain(st.title) : 'Open the next session'}</h2>
              <p style={{ maxWidth: '70ch', marginBottom: 12 }}>{plain(resume.why) || (st ? plain(st.why_plain || st.question) : resume.session.purpose)} <span className="muted">{st ? `(${fmtMin(st.minutes)})` : ''}</span></p>
              <Link className="btn primary" href={`/products/${pid}/work/${resume.session.code}${st ? '?step=' + st.request_id : ''}`}>{resume.session.steps_done ? 'Continue' : 'Start'}</Link>
            </>) : <div style={{ marginTop: 8 }}><Link className="btn primary" href={`/products/${pid}/documents`}>Read the documents</Link></div>}
          </div>
        </section>
        <section className="card"><div className="card-b">
          <div className="flex items-baseline gap-2"><b style={{ fontSize: 30 }} className="tabular">{pct}%</b><span className="muted small">{doneSteps} of {totalSteps} steps answered</span></div>
          <div style={{ margin: '10px 0 6px' }}><Bar pct={pct} kind={pct === 100 ? 'ok' : 'accent'} /></div>
          <div className="xs muted">{minsLeft ? `About ${mins(minsLeft)} of your time left` : 'Nothing left to do'}</div>
        </div></section>
      </div>

      <div className="flex flex-wrap items-center gap-3" style={{ marginBottom: 10 }}>
        <h2 style={{ fontSize: 17, margin: 0 }}>Sessions</h2>
        <span className="spacer" />
        <select aria-label="Phase" value={stage} onChange={(e) => { setStage(e.target.value); }}><option value="all">All phases</option>{stages.map((n) => <option key={n} value={String(n)}>{n}. {PHASE_SHORT[n] || ''}</option>)}</select>
      </div>
      <section className="card">
        <table className="tbl">
          <thead><tr><th>Session</th><th>Phase</th><th>Who comes</th><th style={{ textAlign: 'right' }}>Time left</th><th style={{ width: 180 }}>Progress</th><th /></tr></thead>
          <tbody>
            {pg.rows.map((s: any) => {
              const p = s.steps_total ? Math.round((s.steps_done / s.steps_total) * 100) : 0;
              return (
                <tr key={s.code}>
                  <td><Link className="strong" href={`/products/${pid}/work/${s.code}`}>{plain(s.title)}</Link>{resume?.session.code === s.code && <> <Badge kind="info">Suggested next</Badge></>}<div className="xs muted" style={{ maxWidth: '52ch' }}>{s.outcome}</div></td>
                  <td className="small" style={{ whiteSpace: 'nowrap' }}>{s._phase}. {PHASE_SHORT[s._phase] || s._phaseName}</td>
                  <td className="small">{s.who_text || s.who}</td>
                  <td className="small tabular" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{s.complete ? 'Done' : mins(s.minutes_left)}</td>
                  <td><div className="flex items-center gap-2"><div style={{ flex: 1 }}><Bar pct={p} kind={s.complete ? 'ok' : 'accent'} /></div><span className="xs tabular muted">{s.steps_done}/{s.steps_total}</span></div></td>
                  <td style={{ textAlign: 'right' }}><Link className={`btn sm ${!s.complete && resume?.session.code === s.code ? 'primary' : ''}`} href={`/products/${pid}/work/${s.code}`}>{s.complete ? 'Review' : s.steps_done ? 'Continue' : 'Start'}</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Pager {...pg} />
      </section>
      <details style={{ marginTop: 16 }}><summary className="strong" style={{ cursor: 'pointer' }}>Done for you by the tool</summary><div style={{ marginTop: 10 }}><AutoPanel sess={sess} pid={pid} reload={sessR.reload} /></div></details>
    </Page>
  );
}
