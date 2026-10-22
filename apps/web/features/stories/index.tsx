'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { FeatureProps } from '../types';
import { Badge, Card, ErrorBox, Loading, Page } from '@/components/ui';
import { Field, useAction } from '@/components/kit';
import { api, useApi } from '@/lib/api';

const STATE: Record<string, [string, string]> = { draft: ['Needs completing', 'warn'], complete: ['Complete, not approved yet', 'info'], waiting: ['Waiting for approval', 'warn'], approved: ['Approved', 'ok'], handed_off: ['Handed over', 'ok'] };

/** Finish user stories (list and form). Prototype: stories.js */
export default function Stories({ pid, args }: FeatureProps) {
  return args[0] ? <StoryForm pid={pid} id={args[0]} /> : <StoryList pid={pid} />;
}

function StoryList({ pid }: { pid: string }) {
  const { data: d, error, loading } = useApi<any>('/stories', pid);
  if (loading) return <Loading />;
  if (error || !d) return <ErrorBox message={error || 'No data'} />;
  const c = d.counts;
  return (
    <Page title="Finish user stories" sub="Complete each story. A second person approves it.">
      <div className={`callout ${c.total && c.approved + c.handed_off === c.total ? 'ok' : ''}`} style={{ marginBottom: 12 }}>
        <b>{c.total ? `${c.approved + c.handed_off} of ${c.total} stories approved.` : 'There are no user stories yet.'}</b>
        <ol className="small" style={{ margin: '6px 0 0 20px' }}><li>Complete the story (who it is for, what they want, why, the tests). The tool’s drafts are only a start.</li><li>Ask a second person to approve it.</li><li>Create its hand-over package on the Hand over page.</li></ol>
        {d.drafts.kept_unchanged > 0 && <div className="small" style={{ marginTop: 6 }}><b>{d.drafts.kept_unchanged} drafts were kept exactly as the tool wrote them.</b> They count, but nobody has put them in their own words.</div>}
        {!c.total && <div style={{ marginTop: 6 }}>Stories are drafted in Stage 3 from the features you listed in Stage 2. <Link href={`/products/${pid}/work`}>Open Work on it</Link></div>}
      </div>
      {d.stories.length > 0 && (
        <Card title="Your stories" flush>
          <table className="tbl"><tbody>{d.stories.map((s: any) => {
            const b = STATE[s.state] || ['', ''];
            return (
              <tr key={s.id}><td><div className="strong">{s.title} {s.draft && <Badge kind="warn">Draft, needs your rewrite</Badge>}</div>
                <div className="small muted"><Badge kind={b[1]}>{s.state_text || b[0]}</Badge> {s.persona ? `For: ${s.persona}` : 'No user type chosen'}</div>
                {s.missing.length > 0 && <ul className="small muted" style={{ margin: '4px 0 0 18px' }}>{s.missing.map((m: any) => <li key={m.text}>{m.text}</li>)}</ul>}</td>
                <td style={{ textAlign: 'right' }}><Link className={`btn ${s.state === 'draft' ? 'primary' : ''}`} href={`/products/${pid}/stories/${s.id}`}>{['approved', 'handed_off', 'waiting'].includes(s.state) ? 'Open' : s.state === 'complete' ? 'Ask for approval' : 'Complete this story'}</Link></td></tr>
            );
          })}</tbody></table>
        </Card>
      )}
    </Page>
  );
}

function StoryForm({ pid, id }: { pid: string; id: string }) {
  const { data: f, error, loading, reload } = useApi<any>(`/stories/${id}`, pid);
  const people = useApi<any>('/people', pid);
  const [st, setSt] = useState<any>(null);
  const [approver, setApprover] = useState('');
  const [errs, setErrs] = useState<string[]>([]);
  const act = useAction();
  if (loading) return <Loading />;
  if (error || !f) return <ErrorBox message={error || 'Not found'} />;
  const locked = ['approved', 'handed_off'].includes(f.state);
  const s = st || { persona: f.persona || '', want: f.want || '', benefit: f.benefit || '', requirement: f.requirement || '', rules: f.rules || [], tests: (f.tests || []).map((t: any) => ({ ...t, given: t.draft ? '' : t.given, when: t.draft ? '' : t.when, then: t.draft ? '' : t.then })) };
  const set = (p: any) => setSt({ ...s, ...p });
  const setTest = (i: number, p: any) => set({ tests: s.tests.map((t: any, k: number) => (k === i ? { ...t, ...p } : t)) });
  const save = () => act.run(async () => {
    setErrs([]);
    try { await api(`/stories/${id}/complete`, { method: 'POST', body: { persona: s.persona, want: s.want, benefit: s.benefit, requirement: s.requirement, rules: s.rules, tests: s.tests.map((t: any) => ({ id: t.id, kind: t.kind, given: t.given, when: t.when, then: t.then })) }, product: pid }); setSt(null); reload(); }
    catch (e: any) { setErrs(e.data?.validation?.fields?.map((x: any) => x.message) || [e.message]); throw e; }
  });
  const names: string[] = (people.data?.people || []).map((p: any) => p.name);
  return (
    <Page title="Complete this story" sub={f.title} right={<Link className="btn sm" href={`/products/${pid}/stories`}>All stories</Link>}>
      <div className={`callout ${!f.missing.length ? 'ok' : ''}`} style={{ marginBottom: 12 }}>
        <b>{f.state_text}{f.draft ? '. Draft, needs your rewrite.' : '.'}</b>
        {f.missing.length > 0 && <ul style={{ margin: '4px 0 0 18px' }}>{f.missing.map((m: any) => <li key={m.text}>{m.text}</li>)}</ul>}
        {f.pending && <div>Waiting for {f.pending.approver}. <Link href={`/products/${pid}/approvals`}>See the link to send</Link></div>}
      </div>
      <fieldset disabled={locked} style={{ border: 0, padding: 0 }}>
        <Card title="1. Who is it for?">{(f.options.personas || []).map((p: any) => <label key={p.value} style={{ display: 'block', margin: '4px 0' }}><input type="radio" checked={s.persona === p.value} onChange={() => set({ persona: p.value })} /> <b>{p.label}</b> <span className="small muted">{p.hint}</span></label>)}{f.needs_personas && <div className="callout">No user types exist yet. Add them in Stage 1 first.</div>}</Card>
        <div style={{ height: 12 }} />
        <Card title="2. What do they want to do?" sub="As this person, I want to …"><textarea rows={2} value={s.want} onChange={(e) => set({ want: e.target.value })} style={{ width: '100%' }} />{f.want_draft && !s.want && <div className="small muted">Draft: {f.want_draft} <a onClick={() => set({ want: f.want_draft })} style={{ cursor: 'pointer' }}>use it as a start</a></div>}</Card>
        <div style={{ height: 12 }} />
        <Card title="3. Why does it matter to them?"><textarea rows={2} value={s.benefit} onChange={(e) => set({ benefit: e.target.value })} style={{ width: '100%' }} />{f.benefit_draft && !s.benefit && <div className="small muted">Draft: {f.benefit_draft} <a onClick={() => set({ benefit: f.benefit_draft })} style={{ cursor: 'pointer' }}>use it as a start</a></div>}</Card>
        <div style={{ height: 12 }} />
        <Card title="4. Which requirement does it fulfil?"><select value={s.requirement} onChange={(e) => set({ requirement: e.target.value })}><option value="">Choose the requirement…</option>{(f.options.requirements || []).map((r: any) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></Card>
        <div style={{ height: 12 }} />
        <Card title="5. Which business rules apply? (if any)">{(f.options.rules || []).length ? f.options.rules.map((r: any) => <label key={r.value} style={{ display: 'block' }}><input type="checkbox" checked={s.rules.includes(r.value)} onChange={(e) => set({ rules: e.target.checked ? [...s.rules, r.value] : s.rules.filter((x: string) => x !== r.value) })} /> {r.label}</label>) : <div className="muted small">No business rules have been recorded.</div>}</Card>
        <div style={{ height: 12 }} />
        <Card title="6. How will we know it works?" sub="At least one normal case and one failure case: Given / When / Then.">
          {s.tests.map((t: any, i: number) => (
            <div key={i} className="card" style={{ marginBottom: 8 }}><div className="card-b">
              <div className="row"><b>Test {i + 1}</b><select value={t.kind === 'happy' ? 'happy' : 'negative'} onChange={(e) => setTest(i, { kind: e.target.value })}><option value="happy">Normal case</option><option value="negative">Failure case</option></select>{t.draft && <Badge kind="warn">Draft, needs your rewrite</Badge>}<span className="spacer" /><button className="btn ghost sm" onClick={() => set({ tests: s.tests.filter((_: any, k: number) => k !== i) })}>Remove</button></div>
              <div className="grid g3" style={{ marginTop: 8 }}>{(['given', 'when', 'then'] as const).map((k) => <Field key={k} label={k[0].toUpperCase() + k.slice(1)}><textarea rows={2} value={t[k] || ''} onChange={(e) => setTest(i, { [k]: e.target.value })} /></Field>)}</div>
            </div></div>
          ))}
          <button className="btn sm" onClick={() => set({ tests: [...s.tests, { kind: 'happy', given: '', when: '', then: '' }] })}>Add a normal-case test</button>{' '}
          <button className="btn sm" onClick={() => set({ tests: [...s.tests, { kind: 'negative', given: '', when: '', then: '' }] })}>Add a failure-case test</button>
        </Card>
      </fieldset>
      {act.box}{errs.length > 0 && <div className="err-box"><ul style={{ margin: 0, paddingLeft: 18 }}>{errs.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
      <div className="row" style={{ margin: '12px 0' }}><button className="btn primary" disabled={locked || act.busy} onClick={save}>{locked ? 'This story is approved' : 'Save this story'}</button></div>
      {!locked && (
        <Card title="Approval">
          <p className="small muted" style={{ marginTop: 0 }}>{f.missing.length ? 'Save the story with everything filled in first. A second person then approves it.' : f.pending ? `Waiting for ${f.pending.approver}.` : 'Everything is filled in. A second person must approve it. Nobody approves their own work.'}</p>
          <div className="row"><select value={approver} onChange={(e) => setApprover(e.target.value)}><option value="">Who approves this story?</option>{names.map((n) => <option key={n}>{n}</option>)}</select>
            <button className="btn" disabled={!!f.missing.length || !!f.pending || !approver || act.busy} onClick={() => act.run(async () => { await api(`/stories/${id}/submit`, { method: 'POST', body: { approver }, product: pid }); reload(); })}>Ask them to approve it</button></div>
        </Card>
      )}
    </Page>
  );
}
