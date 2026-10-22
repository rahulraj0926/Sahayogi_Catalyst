'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Badge, Card, ErrorBox, Loading, Page } from '@/components/ui';
import { Field, useAction } from '@/components/kit';
import { api, useApi } from '@/lib/api';

/** Edit a flow as a plain list of steps. Failure paths get their own "stopped" step and a test. Prototype: flowedit_ui.js */
export default function FlowEditor({ pid, id }: { pid: string; id: string }) {
  const { data: m, error, loading, reload } = useApi<any>(`/flow-edit/${id}`, pid);
  const [f, setF] = useState<any>(null);
  const act = useAction();
  if (loading) return <Loading />;
  if (error || !m) return <ErrorBox message={error || 'Not found'} />;
  const s = f || { title: m.flow.title, goal: m.flow.goal || '', trigger: m.flow.trigger || '', end_text: m.flow.end_text || '', steps: m.steps.map((x: any) => ({ id: x.id, text: x.text, actor: x.actor || '', next: x.next || 'auto', fail: x.fail ? { text: x.fail.text, condition: x.fail.condition || '', test: x.fail.test || '' } : null })) };
  const set = (p: any) => setF({ ...s, ...p });
  const upd = (i: number, p: any) => set({ steps: s.steps.map((x: any, k: number) => (k === i ? { ...x, ...p } : x)) });
  const save = () => act.run(async () => {
    const body = { title: s.title, goal: s.goal, trigger: s.trigger, end_text: s.end_text, steps: s.steps.map((x: any) => ({ id: x.id, text: x.text, actor: x.actor || undefined, next: x.next, fail: x.fail && x.fail.text?.trim() ? x.fail : undefined })) };
    await api(`/flow-edit/${id}`, { method: 'POST', body, product: pid }); setF(null); reload();
  });
  return (
    <Page title={`Edit: ${m.flow.title}`} sub="Describe the steps in plain words, say who does each one and what happens when it goes wrong." right={<span className="row"><Badge kind={m.ok ? 'ok' : 'bad'}>{m.ok ? 'complete' : 'needs work'}</Badge><Link className="btn sm" href={`/products/${pid}/flows/${id}`}>View diagram</Link></span>}>
      {m.problems.length > 0 && <div className="callout warn" style={{ marginBottom: 10 }}><b>Still to fix:</b><ul style={{ margin: '4px 0 0 18px' }}>{m.problems.map((p: any, i: number) => <li key={i}>{typeof p === 'string' ? p : p.text || p.message}</li>)}</ul></div>}
      <Card title="The flow">
        <div className="grid g2"><Field label="Name"><input value={s.title} onChange={(e) => set({ title: e.target.value })} /></Field><Field label="What does it achieve?"><input value={s.goal} onChange={(e) => set({ goal: e.target.value })} /></Field>
          <Field label="What starts it?"><input value={s.trigger} onChange={(e) => set({ trigger: e.target.value })} /></Field><Field label="How does it end well?"><input value={s.end_text} onChange={(e) => set({ end_text: e.target.value })} /></Field></div>
        <div className="small muted">Starts at: {m.start.text}. Ends at: {m.end.text}.</div>
      </Card>
      <div style={{ height: 12 }} />
      <Card title="Steps" sub={`${s.steps.length}`}>
        {s.steps.map((x: any, i: number) => (
          <div key={x.id || i} className="card" style={{ marginBottom: 8 }}><div className="card-b">
            <div className="row"><b>{i + 1}</b><input style={{ flex: 1 }} placeholder="What happens in this step?" value={x.text} onChange={(e) => upd(i, { text: e.target.value })} />
              <input style={{ width: 150 }} placeholder="Who (actor)" list={`actors-${id}`} value={x.actor} onChange={(e) => upd(i, { actor: e.target.value })} />
              <select value={x.next} onChange={(e) => upd(i, { next: e.target.value })}><option value="auto">then the next step</option><option value="end">then it ends</option>{s.steps.filter((o: any) => o.id && o.id !== x.id).map((o: any) => <option key={o.id} value={o.id}>then go to: {o.text.slice(0, 24)}</option>)}</select>
              <button className="btn ghost sm" onClick={() => set({ steps: s.steps.filter((_: any, k: number) => k !== i) })}>Remove</button></div>
            <label className="small"><input type="checkbox" checked={!!x.fail} onChange={(e) => upd(i, { fail: e.target.checked ? { text: '', condition: '', test: '' } : null })} /> What if this goes wrong?</label>
            {x.fail && <div className="grid g3" style={{ marginTop: 6 }}><input placeholder="What happens instead" value={x.fail.text} onChange={(e) => upd(i, { fail: { ...x.fail, text: e.target.value } })} /><input placeholder="When (the condition)" value={x.fail.condition} onChange={(e) => upd(i, { fail: { ...x.fail, condition: e.target.value } })} /><input placeholder="How we test it fails safely" value={x.fail.test} onChange={(e) => upd(i, { fail: { ...x.fail, test: e.target.value } })} /></div>}
          </div></div>
        ))}
        <datalist id={`actors-${id}`}>{(m.actors || []).map((a: string) => <option key={a} value={a} />)}</datalist>
        <button className="btn sm" onClick={() => set({ steps: [...s.steps, { text: '', actor: '', next: 'auto', fail: null }] })}>Add a step</button>
      </Card>
      {act.box}
      <div className="row" style={{ marginTop: 12 }}><button className="btn primary" disabled={act.busy} onClick={save}>Save the flow</button>{f && <button className="btn ghost" onClick={() => setF(null)}>Discard changes</button>}</div>
    </Page>
  );
}
