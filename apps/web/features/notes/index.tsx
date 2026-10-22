'use client';
import { useState } from 'react';
import type { FeatureProps } from '../types';
import { Card, ErrorBox, Loading, Page } from '@/components/ui';
import { StickyBoard, type StickyNote } from '@/components/notes/StickyBoard';
import { Field, useAction } from '@/components/kit';
import { api, useApi } from '@/lib/api';

/** Notes people left about the tool itself ("Something wrong here?"). Prototype: feedback.js */
export default function Notes({ pid }: FeatureProps) {
  const { data, error, loading, reload } = useApi<any>('/feedback', pid);
  const [text, setText] = useState('');
  const [cats, setCats] = useState<string[]>([]);
  const act = useAction();
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error || 'No data'} />;
  return (
    <Page title="Notes you left" sub={`${data.open} open of ${data.total}. Tell us when something is confusing, missing or broken.`}>
      <Card title="Leave a note">
        <Field label="What is wrong or missing?"><textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} style={{ width: '100%' }} /></Field>
        <div className="row wrap" style={{ marginBottom: 8 }}>{data.categories.map((c: string) => <label key={c}><input type="checkbox" checked={cats.includes(c)} onChange={(e) => setCats(e.target.checked ? [...cats, c] : cats.filter((x) => x !== c))} /> {c}</label>)}</div>
        {act.box}
        <button className="btn primary" disabled={!text.trim() || act.busy} onClick={() => act.run(async () => { await api('/feedback', { method: 'POST', body: { text: text.trim(), categories: cats, route: window.location.pathname, product: pid, width: window.innerWidth }, product: pid }); setText(''); setCats([]); reload(); })}>Save the note</button>
      </Card>
      <div style={{ height: 12 }} />
      <StickyBoard busy={act.busy} notes={data.notes.map((n: any): StickyNote => ({ key: n.id, id: n.id, text: n.text, categories: n.categories || [], by: n.by || n.actor, at: n.at || n.created_at, done: !!n.done, route: n.route }))}
        onDone={(n, done) => act.run(async () => { await api(`/feedback/${n.id}/done`, { method: 'POST', body: { done }, product: pid }); reload(); })} />
    </Page>
  );
}
