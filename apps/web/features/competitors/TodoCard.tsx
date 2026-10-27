'use client';
/**
 * The To do card on a competitor's Overview. It keeps its own list on screen and saves in the background, so ticking, adding,
 * rewording or removing a to-do changes only this card and never redraws the rest of the page.
 * Two kinds of lines: the built-in checks (done by themselves once the details exist) and the ones people add.
 * Any line can be reworded or removed; a built-in one is only hidden, so it can never be lost for good.
 */
import { memo, useEffect, useRef, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Card } from '@/components/dashboard/Card';
import { useAction } from '@/components/kit';
import { api } from '@/lib/api';

type Built = { key: string; label: string; auto: boolean };
type Line = { key: string; label: string; done: boolean; auto: boolean; mine: boolean };
const list = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);
const asMap = (v: unknown) => Object.fromEntries(list(v).map((s) => { const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1)]; }));

function TodoCard({ id, builtIn, done: doneIn, mine: mineIn, hidden: hiddenIn, renamed: renamedIn, onSaved }: { id: string; builtIn: Built[]; done: unknown; mine: unknown; hidden: unknown; renamed: unknown; onSaved: () => void }) {
  const [done, setDone] = useState<string[]>(list(doneIn));
  const [mine, setMine] = useState<string[]>(list(mineIn));
  const [hidden, setHidden] = useState<string[]>(list(hiddenIn));
  const [renamed, setRenamed] = useState<Record<string, string>>(asMap(renamedIn));
  const [text, setText] = useState('');
  const [edit, setEdit] = useState<{ key: string; text: string } | null>(null);
  const [showDone, setShowDone] = useState(false);
  const act = useAction();
  const pending = useRef(0);

  // follow the server again once nothing of ours is waiting to be saved (for example after the page was changed elsewhere)
  const sig = JSON.stringify([doneIn, mineIn, hiddenIn, renamedIn]);
  useEffect(() => {
    if (pending.current > 0) return;
    setDone(list(doneIn)); setMine(list(mineIn)); setHidden(list(hiddenIn)); setRenamed(asMap(renamedIn));
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (next: { done?: string[]; mine?: string[]; hidden?: string[]; renamed?: Record<string, string> }) => {
    const d = next.done ?? done; const m = next.mine ?? mine; const h = next.hidden ?? hidden; const r = next.renamed ?? renamed;
    if (next.done) setDone(d); if (next.mine) setMine(m); if (next.hidden) setHidden(h); if (next.renamed) setRenamed(r);
    const one = (a: string[]) => (a.length ? a : '');
    pending.current++;
    act.run(async () => {
      try { await api(`/items/${id}`, { method: 'PATCH', body: { fields: { todo_done: one(d), todo_items: one(m), todo_hidden: one(h), todo_renamed: one(Object.entries(r).map(([k, v]) => `${k}=${v}`)) } } }); }
      finally { pending.current--; if (pending.current === 0) onSaved(); }
    });
  };

  const lines: Line[] = [
    ...builtIn.filter((b) => !hidden.includes(b.key)).map((b) => ({ key: b.key, label: renamed[b.key] || b.label, done: b.auto || done.includes(b.key), auto: b.auto, mine: false })),
    ...mine.map((t) => ({ key: `my:${t}`, label: t, done: done.includes(`my:${t}`), auto: false, mine: true })),
  ];
  const open = lines.filter((x) => !x.done); const finished = lines.filter((x) => x.done);

  const tick = (x: Line, on: boolean) => save({ done: on ? [...done, x.key] : done.filter((k) => k !== x.key) });
  const add = () => { const t = text.trim(); setText(''); if (t && !mine.includes(t)) save({ mine: [...mine, t] }); };
  const remove = (x: Line) => (x.mine ? save({ mine: mine.filter((t) => `my:${t}` !== x.key), done: done.filter((k) => k !== x.key) }) : save({ hidden: [...hidden, x.key] }));
  const reword = (x: Line, label: string) => {
    const t = label.trim(); setEdit(null);
    if (!t || t === x.label) return;
    if (x.mine) { if (mine.includes(t)) return; save({ mine: mine.map((m) => (`my:${m}` === x.key ? t : m)), done: done.map((k) => (k === x.key ? `my:${t}` : k)) }); } else save({ renamed: { ...renamed, [x.key]: t } });
  };

  const row = (x: Line) => (
    <li key={x.key} className="group flex items-center gap-2 py-0.5 text-[13px]">
      {edit?.key === x.key ? (
        <span className="row" style={{ gap: 6, flex: 1 }}>
          <input autoFocus value={edit.text} onChange={(e) => setEdit({ key: x.key, text: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') reword(x, edit.text); if (e.key === 'Escape') setEdit(null); }} aria-label="Edit this to-do" style={{ flex: 1, minWidth: 0 }} />
          <button type="button" className="btn xs primary" disabled={!edit.text.trim()} onClick={() => reword(x, edit.text)}>Save</button>
          <button type="button" className="btn xs" onClick={() => setEdit(null)}>Cancel</button>
        </span>
      ) : (
        <>
          <input type="checkbox" checked={x.done} disabled={x.auto} onChange={(e) => tick(x, e.target.checked)} aria-label={x.label} title={x.auto ? 'Done by itself once the details are filled in' : undefined} />
          <span className="min-w-0 flex-1" style={{ textDecoration: x.done ? 'line-through' : 'none', opacity: x.done ? 0.6 : 1 }}>{x.label}</span>
          <span className="flex shrink-0 gap-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
            <button type="button" aria-label={`Edit ${x.label}`} title="Edit" className="text-[var(--text-muted)] hover:text-[var(--text-heading)]" onClick={() => setEdit({ key: x.key, text: x.label })}><Pencil size={14} /></button>
            <button type="button" aria-label={`Remove ${x.label}`} title="Remove" className="text-[var(--text-muted)] hover:text-[var(--bad)]" onClick={() => remove(x)}><Trash2 size={14} /></button>
          </span>
        </>
      )}
    </li>
  );

  return (
    <Card title="To do" action={<span className="text-[13px] text-[var(--text-muted)]">{finished.length} / {lines.length} done</span>}>
      {act.box}
      {open.length === 0 && <div className="small muted" style={{ marginBottom: 6 }}>Nothing left to do.</div>}
      <ul className="m-0 grid list-none gap-y-1 p-0">{open.map(row)}</ul>
      {finished.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <button type="button" className="btn xs ghost" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>{showDone ? 'Hide' : 'Show'} {finished.length} done</button>
          {showDone && <ul className="m-0 mt-1 grid list-none gap-y-1 p-0">{finished.map(row)}</ul>}
        </div>
      )}
      <form className="row mt-auto" style={{ gap: 6, paddingTop: 12 }} onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a to-do" aria-label="Add a to-do" style={{ flex: 1, minWidth: 0 }} />
        <button type="submit" className="btn sm primary" disabled={!text.trim()}>Add</button>
      </form>
    </Card>
  );
}

export default memo(TodoCard);
