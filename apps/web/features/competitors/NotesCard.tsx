'use client';
/**
 * The Notes tab of one competitor: the same sticky-note board as the Notes page (bold, italic, tick boxes, pin, delete), saved on the server.
 * Each note is a CompetitorNote tied to this competitor, so it is kept apart from the notes about the product or the tool
 * and the Notes page can later tell the three kinds apart. `html` holds the note as written, `text` the same note as plain words.
 */
import { useAction, useConfirm } from '@/components/kit';
import { actor, api } from '@/lib/api';
import { NoteBoard, toneFor, type BoardNote } from '@/components/notes/MyNotes';
import { Card } from '@/components/dashboard/Card';

const today = () => new Date().toISOString().slice(0, 10);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** The note as plain words: line breaks kept, tags dropped. */
const plainOf = (html: string) => { const d = document.createElement('div'); d.innerHTML = html.replace(/<br\s*\/?>/gi, '\n'); return (d.textContent || '').trim(); };

export default function NotesCard({ c, notes, onSaved }: { c: any; notes: any[]; onSaved: () => void }) {
  const [ask, dialog] = useConfirm();
  const act = useAction();
  const run = (fn: () => Promise<unknown>) => act.run(async () => { await fn(); onSaved(); });
  const board: BoardNote[] = notes.slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .map((n) => ({ id: n.id, html: n.html || esc(String(n.text || '')).replace(/\n/g, '<br>'), tone: toneFor(n.id), pinned: !!n.pinned }));
  const edit = (id: string, html: string) => run(() => api(`/items/${id}`, { method: 'PATCH', body: { fields: { html, text: plainOf(html) } } }));
  return (
    <Card title={`Notes about ${c.title}`} className="@container">
      {dialog}
      {act.box}
      <NoteBoard notes={board} busy={act.busy}
        onAdd={(html) => run(async () => {
          const text = plainOf(html);
          const r = await api<any>('/items', { method: 'POST', body: { type: 'CompetitorNote', fields: { title: `${c.title}: ${text.slice(0, 60)}`, text, html, date: today(), author: actor(), importance: 'medium' } } });
          await api('/links', { method: 'POST', body: { type: 'note_on', source: r.item.id, target: c.id } });
        })}
        onEdit={edit}
        onPin={(id) => run(() => api(`/items/${id}`, { method: 'PATCH', body: { fields: { pinned: !notes.find((n) => n.id === id)?.pinned } } }))}
        onRemove={async (id) => { if (await ask('Remove this note? It stays in history but is no longer shown.', 'Remove')) run(() => api(`/items/${id}/status`, { method: 'POST', body: { status: 'Retired' } })); }} />
    </Card>
  );
}
