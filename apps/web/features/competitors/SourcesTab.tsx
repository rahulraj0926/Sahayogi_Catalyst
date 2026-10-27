'use client';
/**
 * Where we got our facts about one competitor, and when we last checked them.
 * A source is anything we read or watched: a web page, a video, an article, an interview. A document we hold as a file goes on the Files tab.
 * Each one is saved as evidence and linked to the competitor, so a price or capability can point back to it.
 */
import { useState } from 'react';
import Link from 'next/link';
import { Badge, Card, Empty } from '@/components/ui';
import { Field, fmtDate, useAction, useConfirm } from '@/components/kit';
import { api, useApi } from '@/lib/api';

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };

/** What the person picks, and the evidence kind it is saved as. */
const KINDS: [string, string, string][] = [
  ['web', 'Web page', 'web_page'], ['video', 'Video', 'other'], ['article', 'Article or report', 'document'],
  ['interview', 'Interview or call', 'interview'], ['other', 'Other', 'other'],
];
const kindLabel = (e: any) => (/youtube\.com|youtu\.be|vimeo\.com/.test(e.url_or_file || '') ? 'Video' : null) || ({ web_page: 'Web page', document: 'Article or report', interview: 'Interview or call', price_list: 'Price list', datasheet: 'Datasheet', screenshot: 'Screenshot' } as Record<string, string>)[e.kind as string] || 'Other';
const host = (u: string) => { try { return new URL(/^https?:/.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, ''); } catch { return u; } };

function AddSource({ c, onDone, onCancel }: { c: any; onDone: () => void; onCancel: () => void }) {
  const [url, setUrl] = useState(''); const [title, setTitle] = useState(''); const [kind, setKind] = useState('web'); const [note, setNote] = useState('');
  const act = useAction();
  const save = () => act.run(async () => {
    const link = url.trim();
    const evKind = KINDS.find((k) => k[0] === kind)![2];
    const r = await api<any>('/items', { method: 'POST', body: { type: 'Evidence', fields: {
      title: (title.trim() || host(link)).slice(0, 120), kind: evKind, source_class: 'secondary', url_or_file: /^https?:/.test(link) ? link : `https://${link}`,
      retrieved_on: today(), captured: true, content: note.trim() || undefined,
    } } });
    await api('/links', { method: 'POST', body: { type: 'supported_by', source: c.id, target: r.item.id, attrs: { role: 'supports' } } });
    onDone();
  });
  return (
    <div className="mb-4 rounded-md border border-[var(--divider)] p-3">
      <Field label="Link"><input autoFocus type="url" inputMode="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} style={{ width: '100%' }} /></Field>
      <div className="grid gap-3 @md:grid-cols-2">
        <Field label="Name (optional)"><input type="text" placeholder={url.trim() ? host(url.trim()) : 'What to call it'} value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: '100%' }} /></Field>
        <Field label="What is it"><select value={kind} onChange={(e) => setKind(e.target.value)} style={{ width: '100%' }}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      </div>
      <Field label="What it tells us (optional)"><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} style={{ width: '100%' }} /></Field>
      {act.box}
      <div className="row"><button type="button" className="btn sm primary" disabled={act.busy || !url.trim()} onClick={save}>Save source</button><button type="button" className="btn sm" onClick={onCancel}>Cancel</button></div>
    </div>
  );
}

export default function SourcesTab({ c, links, pid, onSaved }: { c: any; links: any[]; pid: string; onSaved: () => void }) {
  const ev = useApi<any>('/items?type=Evidence&limit=5000', pid);
  const act = useAction();
  const [ask, dialog] = useConfirm();
  const [adding, setAdding] = useState(false);
  const ids = new Set(links.map((l) => l.other));
  const list = ((ev.data?.items as any[]) || []).filter((e) => ids.has(e.id) && e.status !== 'Retracted');
  const save = (fields: Record<string, unknown>) => act.run(async () => { await api(`/items/${c.id}`, { method: 'PATCH', body: { fields } }); onSaved(); });
  const overdue = !!c.review_by && c.review_by < today();
  return (
    <>
    {dialog}
    <div className="@container">
    <Card title="Sources" right={!adding && <button type="button" className="btn sm primary" onClick={() => setAdding(true)}>+ Add a source</button>}>
      {act.box}
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-[var(--divider)] pb-4 text-sm">
        <span><span className="text-[var(--text-muted)]">Last checked </span><b>{c.last_reviewed_on ? fmtDate(c.last_reviewed_on) : 'not yet'}</b></span>
        <label className="flex items-center gap-2"><span className="text-[var(--text-muted)]">Next review</span><input type="date" value={c.review_by || ''} disabled={act.busy} onChange={(e) => { if (e.target.value) save({ review_by: e.target.value }); }} style={{ height: 30, minHeight: 0 }} />{overdue && <Badge kind="warn">overdue</Badge>}</label>
        <button type="button" className="btn sm ml-auto" disabled={act.busy} onClick={() => save({ last_reviewed_on: today(), review_by: addDays(today(), 90) })}>Checked today</button>
      </div>
      {adding && <AddSource c={c} onCancel={() => setAdding(false)} onDone={() => { setAdding(false); ev.reload(); onSaved(); }} />}
      {list.length === 0 && !adding ? <Empty>No sources yet. Add a web page, video or article we used. A file we hold, such as a price list or a deck, goes on the Files tab.</Empty> : list.length > 0 && (
        <table className="tbl compact"><thead><tr><th>Source</th><th>Type</th><th>Added</th><th /></tr></thead><tbody>
          {list.map((e) => (
            <tr key={e.id}>
              <td>{e.url_or_file ? <a href={e.url_or_file} target="_blank" rel="noopener noreferrer">{e.title}</a> : <Link href={`/products/${pid}/item/${e.id}`}>{e.title}</Link>}{e.content && <div className="small muted">{e.content}</div>}</td>
              <td><Badge kind="info">{kindLabel(e)}</Badge></td>
              <td>{fmtDate(e.retrieved_on)}</td>
              <td><button type="button" className="btn xs ghost" disabled={act.busy} onClick={async () => { if (await ask(`Remove “${e.title}” from the sources? It stays in history but is no longer listed.`, 'Remove')) act.run(async () => { await api(`/items/${e.id}/status`, { method: 'POST', body: { status: 'Retracted' } }); ev.reload(); onSaved(); }); }}>Remove</button></td>
            </tr>
          ))}
        </tbody></table>
      )}
    </Card>
    </div>
    </>
  );
}
