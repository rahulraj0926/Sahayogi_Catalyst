'use client';
/**
 * The Notes tab of one competitor: coloured sticky notes like the Notes page. Add one at the top; remove one with the cross.
 * Each note is a CompetitorNote tied to this competitor, so it is kept apart from the notes about the product or the tool
 * and the Notes page can later tell the three kinds apart.
 */
import { useState } from 'react';
import { X } from 'lucide-react';
import { fmtDate, useAction, useConfirm } from '@/components/kit';
import { actor, api } from '@/lib/api';
import { STICKY_COLORS, STICKY_TILT, stickyHash } from '@/components/notes/StickyBoard';
import { Card } from '@/components/dashboard/Card';

const today = () => new Date().toISOString().slice(0, 10);

export default function NotesCard({ c, notes, onSaved }: { c: any; notes: any[]; onSaved: () => void }) {
  const [text, setText] = useState<string | null>(null);
  const [ask, dialog] = useConfirm();
  const act = useAction();
  const add = () => {
    const t = (text || '').trim();
    if (!t) return;
    act.run(async () => {
      const r = await api<any>('/items', { method: 'POST', body: { type: 'CompetitorNote', fields: { title: `${c.title}: ${t.slice(0, 60)}`, text: t, date: today(), author: actor(), importance: 'medium' } } });
      await api('/links', { method: 'POST', body: { type: 'note_on', source: r.item.id, target: c.id } });
      setText(null); onSaved();
    });
  };
  const newest = notes.slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return (
    <Card title={`Notes about ${c.title}`} className="@container" action={text === null ? <button type="button" className="text-[14px] font-semibold text-[var(--sd-accent)]" onClick={() => setText('')}>+ Add</button> : undefined}>
      {dialog}
      {act.box}
      {text !== null && (
        <div className={`mb-4 flex max-w-sm flex-col gap-2 rounded-md border p-3 shadow-sm ${STICKY_COLORS[0]}`}>
          <textarea autoFocus rows={3} className="w-full" style={{ background: 'transparent', color: 'inherit' }} value={text} aria-label="New note" placeholder="What did you notice?"
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setText(null); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); add(); } }} />
          <div className="flex gap-2">
            <button type="button" className="btn sm primary" disabled={act.busy || !text.trim()} onClick={add}>Save</button>
            <button type="button" className="btn sm" onClick={() => setText(null)}>Cancel</button>
          </div>
        </div>
      )}
      {newest.length === 0 && text === null ? <p className="m-0 text-[14px] text-[var(--text-muted)]">No notes yet.</p> : (
        <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 @md:grid-cols-2 @3xl:grid-cols-3 @6xl:grid-cols-4">
          {newest.map((n) => {
            const h = stickyHash(n.id);
            return (
              <li key={n.id} className={`group relative flex flex-col gap-2 rounded-md border p-3 shadow-sm transition-transform hover:rotate-0 ${STICKY_COLORS[h % STICKY_COLORS.length]} ${STICKY_TILT[h % STICKY_TILT.length]}`}>
                <p className="m-0 min-w-0 whitespace-pre-wrap break-words pr-5 text-sm leading-snug">{n.text}</p>
                <div className="mt-auto text-[11px] opacity-80">{[n.author || n.created_by, fmtDate(n.date || n.created_at)].filter(Boolean).join(' · ')}</div>
                <button type="button" aria-label="Remove this note" title="Remove" disabled={act.busy}
                  className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/10 opacity-60 hover:opacity-100 dark:bg-white/15"
                  onClick={async () => { if (await ask('Remove this note? It stays in history but is no longer shown.', 'Remove')) act.run(async () => { await api(`/items/${n.id}/status`, { method: 'POST', body: { status: 'Retired' } }); onSaved(); }); }}><X size={13} /></button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
