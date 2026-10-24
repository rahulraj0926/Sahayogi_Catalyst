'use client';
import { SearchField } from '@/components/ui/search-field';
import { STICKY_COLORS, STICKY_TILT, stickyHash } from '@/components/notes/StickyBoard';
import { Bold, GripVertical, Italic, ListChecks, Pin, PinOff, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

type Note = { id: string; html: string; tone: number; pinned: boolean; at: string };
/** What the board needs to show a note. */
export type BoardNote = { id: string; html: string; tone: number; pinned: boolean; /** a small line under the text, for example who wrote it and when */ meta?: string };
/** A colour for a note that has none of its own, the same every time for the same id. */
export const toneFor = (id: string) => [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % 7;

const KEY = 'sahayogi.mynotes.v2';
// Colours are handed out automatically; a person never has to choose one.
const TONES = [
  'bg-violet-100 text-violet-950 dark:bg-violet-900/45 dark:text-violet-50',
  'bg-yellow-100 text-yellow-950 dark:bg-yellow-900/40 dark:text-yellow-50',
  'bg-pink-100 text-pink-950 dark:bg-pink-900/40 dark:text-pink-50',
  'bg-sky-100 text-sky-950 dark:bg-sky-900/40 dark:text-sky-50',
  'bg-green-100 text-green-950 dark:bg-green-900/40 dark:text-green-50',
  'bg-orange-100 text-orange-950 dark:bg-orange-900/40 dark:text-orange-50',
  'bg-teal-100 text-teal-950 dark:bg-teal-900/40 dark:text-teal-50',
];
export const pickTone = (not?: number) => { let t = Math.floor(Math.random() * TONES.length); if (t === not) t = (t + 1) % TONES.length; return t; };
export const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now() + Math.random()));
const BTN = { minHeight: 0, minWidth: 0, padding: 0 } as const;
const TOOL = 'inline-flex h-7 w-7 items-center justify-center rounded-md opacity-70 transition hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/15';

/** Keep only bold, italic and line breaks; everything else a note might contain (pasted markup, scripts, styles) is dropped. */
function clean(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const walk = (n: Node): string => {
    if (n.nodeType === 3) return (n.textContent || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (n.nodeType !== 1) return '';
    const el = n as HTMLElement; const tag = el.tagName.toLowerCase(); const inner = [...el.childNodes].map(walk).join('');
    if (tag === 'b' || tag === 'strong') return `<b>${inner}</b>`;
    if (tag === 'i' || tag === 'em') return `<i>${inner}</i>`;
    if (tag === 'br') return '<br>';
    if (tag === 'div' || tag === 'p') return `${inner}<br>`;
    return inner;
  };
  return [...doc.body.firstElementChild!.childNodes].map(walk).join('').replace(/(<br>)+$/, '');
}
export const plain = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return (d.textContent || '').trim(); };
function read(): Note[] { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.map((n) => ({ ...n, html: clean(String(n.html || '')) })) : []; } catch { return []; } }

/** Tapping a ☐ / ☑ ticks or unticks it. */
function toggleBox() {
  const sel = window.getSelection(); const node = sel?.anchorNode;
  if (!sel || !node || node.nodeType !== 3) return false;
  const t = node.textContent || ''; const off = sel.anchorOffset;
  const i = [off - 1, off].find((k) => t[k] === '☐' || t[k] === '☑');
  if (i === undefined) return false;
  node.textContent = t.slice(0, i) + (t[i] === '☐' ? '☑' : '☐') + t.slice(i + 1);
  const r = document.createRange(); r.setStart(node, Math.min(off, (node.textContent || '').length)); r.collapse(true); sel.removeAllRanges(); sel.addRange(r);
  return true;
}

function Editor({ html, placeholder, onCommit, onClear, tone, pinned, onPin, grip, className = '', sticky, tilt = '', meta }: {
  html: string; placeholder?: string; tone: number; pinned?: boolean; onPin?: () => void; className?: string; sticky?: boolean; tilt?: string; meta?: string;
  onCommit: (html: string) => void; onClear: () => void; grip?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) ref.current.innerHTML = html; /* set once; the browser owns the text while it is being edited */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const cmd = (c: string) => { ref.current?.focus(); document.execCommand(c); };
  const save = () => { if (ref.current) onCommit(clean(ref.current.innerHTML)); };
  return (
    <div className={`group relative flex min-w-0 flex-col shadow-sm transition-shadow focus-within:shadow-md ${sticky ? `min-h-[11rem] rounded-md border p-3 transition-transform hover:z-10 hover:rotate-0 focus-within:rotate-0 ${STICKY_COLORS[tone % STICKY_COLORS.length]} ${tilt}` : `h-[17rem] rounded-xl p-4 ${TONES[tone % TONES.length]}`} ${className}`}>
      {grip}
      <div ref={ref} contentEditable suppressContentEditableWarning role="textbox" aria-multiline aria-label={placeholder ? 'New note' : 'Note'} data-placeholder={placeholder}
        onBlur={save} onClick={() => { if (toggleBox()) save(); }}
        onPaste={(e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); }}
        onKeyDown={(e) => { if (e.key === 'Escape') (e.target as HTMLElement).blur(); }}
        className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words pr-1 text-[0.95rem] leading-snug outline-none empty:before:opacity-60 empty:before:content-[attr(data-placeholder)]" />
      {meta && <div className="mt-1 text-[11px] opacity-80">{meta}</div>}
      <div className="mt-2 flex items-center gap-0.5" onMouseDown={(e) => e.preventDefault()}>
        <button type="button" style={BTN} className={TOOL} aria-label="Bold" title="Bold" onClick={() => cmd('bold')}><Bold size={15} /></button>
        <button type="button" style={BTN} className={TOOL} aria-label="Italic" title="Italic" onClick={() => cmd('italic')}><Italic size={15} /></button>
        <button type="button" style={BTN} className={TOOL} aria-label="Add a tick box" title="Add a tick box" onClick={() => { ref.current?.focus(); const sel = window.getSelection(); const before = sel?.anchorNode?.nodeType === 3 ? (sel.anchorNode.textContent || '').slice(0, sel.anchorOffset) : ''; if (before && !before.endsWith('\n')) document.execCommand('insertLineBreak'); document.execCommand('insertText', false, '☐ '); }}><ListChecks size={16} /></button>
        {onPin && <button type="button" style={BTN} className={`${TOOL} ${pinned ? '!opacity-100' : ''}`} aria-label={pinned ? 'Unpin note' : 'Pin note'} title={pinned ? 'Unpin' : 'Pin to top'} onClick={onPin}>{pinned ? <PinOff size={15} /> : <Pin size={15} />}</button>}
        {placeholder && <button type="button" onClick={save} className="ml-auto inline-flex items-center gap-1 rounded-md bg-black/80 px-2.5 py-1 text-xs font-semibold text-white hover:bg-black" style={{ minHeight: 0 }}><Plus size={13} />Add note</button>}
        <button type="button" style={BTN} className={`${TOOL} ${placeholder ? '' : 'ml-auto'}`} aria-label={placeholder ? 'Clear' : 'Delete note'} title={placeholder ? 'Clear' : 'Delete'} onClick={() => { if (ref.current && placeholder) ref.current.innerHTML = ''; onClear(); }}><Trash2 size={15} /></button>
      </div>
    </div>
  );
}

/**
 * The sticky-note board: a card to write a new note, then the notes (pinned ones first), with bold, italic, tick boxes, pin and delete on every card.
 * It keeps nothing itself. Personal notes (below) and a competitor's notes both use it and decide where the notes are saved.
 * Dragging a card to rearrange works only when `onMove` is given.
 */
export function NoteBoard({ notes, onAdd, onEdit, onRemove, onPin, onMove, busy, search = true, sticky }: {
  notes: BoardNote[]; busy?: boolean; search?: boolean; /** the tilted paper look with a border (the competitor notes) */ sticky?: boolean;
  onAdd: (html: string, tone: number) => void; onEdit: (id: string, html: string) => void; onRemove: (id: string) => void; onPin: (id: string) => void; onMove?: (from: string, before: string) => void;
}) {
  const [next, setNext] = useState(0);
  const [q, setQ] = useState('');
  const [drag, setDrag] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [fresh, setFresh] = useState(0); // bumps to give the empty card a clean editor after adding
  useEffect(() => { setNext(pickTone()); }, []);
  const add = (html: string) => { if (!plain(html)) return; onAdd(html, next); setNext(pickTone(next)); setFresh((f) => f + 1); };
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s ? notes.filter((n) => plain(n.html).toLowerCase().includes(s)) : notes;
    return [...list.filter((n) => n.pinned), ...list.filter((n) => !n.pinned)];
  }, [notes, q]);
  return (
    <div className="flex flex-col gap-[var(--space-md)]">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn primary inline-flex items-center gap-1.5" disabled={busy} onClick={() => (document.querySelector('[aria-label="New note"]') as HTMLElement | null)?.focus()}><Plus size={16} />Add note</button>
        {search && notes.length > 3 && (
          <SearchField value={q} onChange={setQ} placeholder="Search notes" className="w-full max-w-xs" />
        )}
      </div>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(15.5rem,1fr))] gap-4">
        <li><Editor key={`new-${fresh}`} html="" placeholder="Write your note here, then press Add note" tone={next} sticky={sticky} onCommit={add} onClear={() => undefined} /></li>
        {shown.map((n) => (
          <li key={n.id} draggable={!!onMove && armed === n.id} onDragStart={(e) => { setDrag(n.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', n.id); }} onDragEnd={() => { setDrag(null); setArmed(null); }}
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (drag && onMove) onMove(drag, n.id); setDrag(null); setArmed(null); }} className={drag === n.id ? 'opacity-40' : ''}>
            <Editor html={n.html} tone={n.tone} pinned={n.pinned} onPin={() => onPin(n.id)} sticky={sticky} meta={n.meta} tilt={sticky ? STICKY_TILT[stickyHash(n.id) % STICKY_TILT.length] : ''}
              onCommit={(h) => { if (!plain(h)) onRemove(n.id); else if (h !== n.html) onEdit(n.id, h); }} onClear={() => onRemove(n.id)}
              grip={onMove ? <span aria-label="Drag to rearrange" title="Drag to rearrange" onMouseDown={() => setArmed(n.id)} onMouseUp={() => setArmed(null)} className="absolute right-2 top-2 cursor-grab opacity-0 transition-opacity group-hover:opacity-60 active:cursor-grabbing"><GripVertical size={16} /></span> : undefined} />
          </li>
        ))}
      </ul>
      {notes.length > 0 && shown.length === 0 && <p className="text-sm text-[var(--text-muted)]">No note matches your search.</p>}
    </div>
  );
}

/** Personal sticky notes. They are saved in this browser only: nothing goes to the server, and nobody else sees them. */
export function MyNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let n = read();
    try {
      if (!n.length && !localStorage.getItem(KEY + '.seeded')) {
        const t = new Date().toISOString();
        n = ['<b>Demo:</b> ask Legal to sign off the laws list before the Stage 1 check.', '<b>Demo:</b> re-check the competitor price before the sponsor review.', '<b>Demo:</b> hand-over pack: confirm owner, support contact and rollback steps.'].map((html, i) => ({ id: uid(), html, tone: i, pinned: i === 0, at: t }));
        localStorage.setItem(KEY, JSON.stringify(n)); localStorage.setItem(KEY + '.seeded', '1');
      }
    } catch { /* storage blocked */ }
    setNotes(n); setReady(true);
  }, []);
  const commit = (n: Note[]) => { setNotes(n); try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* storage blocked: notes last until the page is closed */ } };
  const move = (from: string, before: string) => {
    if (from === before) return;
    const m = notes.find((n) => n.id === from); if (!m) return;
    const rest = notes.filter((n) => n.id !== from); const at = rest.findIndex((n) => n.id === before);
    rest.splice(at < 0 ? rest.length : at, 0, m); commit(rest);
  };
  if (!ready) return null;
  return (
    <NoteBoard notes={notes}
      onAdd={(html, tone) => commit([{ id: uid(), html, tone, pinned: false, at: new Date().toISOString() }, ...notes])}
      onEdit={(id, html) => commit(notes.map((n) => (n.id === id ? { ...n, html } : n)))}
      onRemove={(id) => commit(notes.filter((n) => n.id !== id))}
      onPin={(id) => commit(notes.map((x) => (x.id === id ? { ...x, pinned: !x.pinned } : x)))}
      onMove={move} />
  );
}
