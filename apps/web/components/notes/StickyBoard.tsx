'use client';
import Link from 'next/link';
import { Check, GripVertical, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

export type StickyNote = { key: string; id: string; text: string; categories: string[]; by?: string; at?: string; done: boolean; productId?: string; productName?: string; route?: string };

export const STICKY_COLORS = [
  'bg-yellow-100 text-yellow-950 border-yellow-300 dark:bg-yellow-900/40 dark:text-yellow-50 dark:border-yellow-700/60',
  'bg-pink-100 text-pink-950 border-pink-300 dark:bg-pink-900/40 dark:text-pink-50 dark:border-pink-700/60',
  'bg-sky-100 text-sky-950 border-sky-300 dark:bg-sky-900/40 dark:text-sky-50 dark:border-sky-700/60',
  'bg-green-100 text-green-950 border-green-300 dark:bg-green-900/40 dark:text-green-50 dark:border-green-700/60',
  'bg-violet-100 text-violet-950 border-violet-300 dark:bg-violet-900/40 dark:text-violet-50 dark:border-violet-700/60',
];
export const STICKY_TILT = ['-rotate-1', 'rotate-1', 'rotate-0', '-rotate-[0.5deg]', 'rotate-[0.5deg]'];
export const stickyHash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const KEY = 'sahayogi.notes.order';

function loadOrder(): string[] { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
function saveOrder(o: string[]) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* storage blocked: the order just is not remembered */ } }

/** Sticky notes in two lanes. Drag a note to the other lane to mark it dealt with (or open again); drag within a lane to arrange. The arrangement is remembered in this browser only. */
export function StickyBoard({ notes, onDone, busy }: { notes: StickyNote[]; onDone: (n: StickyNote, done: boolean) => void | Promise<void>; busy?: boolean }) {
  const [order, setOrder] = useState<string[]>([]);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  useEffect(() => setOrder(loadOrder()), []);

  const sorted = useMemo(() => {
    const pos = new Map(order.map((k, i) => [k, i]));
    return notes.slice().sort((a, b) => (pos.get(a.key) ?? 1e6) - (pos.get(b.key) ?? 1e6));
  }, [notes, order]);
  const lanes = { open: sorted.filter((n) => !n.done), done: sorted.filter((n) => n.done) };

  function place(dragKey: string, beforeKey: string | null, lane: 'open' | 'done') {
    const n = notes.find((x) => x.key === dragKey);
    if (!n) return;
    if (n.done !== (lane === 'done')) void onDone(n, lane === 'done');
    const keys = sorted.map((x) => x.key).filter((k) => k !== dragKey);
    const at = beforeKey ? keys.indexOf(beforeKey) : keys.length;
    keys.splice(at < 0 ? keys.length : at, 0, dragKey);
    setOrder(keys); saveOrder(keys);
  }

  const Lane = ({ id, title, hint, list }: { id: 'open' | 'done'; title: string; hint: string; list: StickyNote[] }) => (
    <section aria-label={title} onDragOver={(e) => { e.preventDefault(); setOver(id); }} onDragLeave={() => setOver((o) => (o === id ? null : o))}
      onDrop={(e) => { e.preventDefault(); if (drag) place(drag, null, id); setDrag(null); setOver(null); }}
      className={`flex min-h-[14rem] min-w-0 flex-col rounded-[var(--card-radius)] border border-dashed p-3 transition-colors ${over === id ? 'border-[var(--sd-accent)] bg-[var(--sd-accent-soft)]' : 'border-[var(--divider)] bg-[var(--surface-muted)]/50'}`}>
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--text-heading)]">{title} <span className="font-normal text-[var(--text-muted)]">{list.length}</span></h2>
        <span className="text-xs text-[var(--text-muted)]">{hint}</span>
      </header>
      {list.length === 0 ? <p className="m-auto text-sm text-[var(--text-muted)]">{id === 'open' ? 'No open notes.' : 'Drop a note here when it is dealt with.'}</p> : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {list.map((n) => {
            const h = stickyHash(n.productId || n.key);
            return (
              <li key={n.key} draggable onDragStart={(e) => { setDrag(n.key); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', n.key); }} onDragEnd={() => { setDrag(null); setOver(null); }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (drag && drag !== n.key) place(drag, n.key, id); setDrag(null); setOver(null); }}
                className={`group relative flex cursor-grab flex-col gap-2 rounded-md border p-3 shadow-sm transition-transform hover:z-10 hover:rotate-0 hover:shadow-md active:cursor-grabbing ${STICKY_COLORS[h % STICKY_COLORS.length]} ${STICKY_TILT[h % STICKY_TILT.length]} ${n.done ? 'opacity-70' : ''} ${drag === n.key ? 'opacity-40' : ''}`}>
                <div className="flex items-start gap-1.5">
                  <GripVertical size={14} aria-hidden className="mt-0.5 shrink-0 opacity-40" />
                  <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm leading-snug">{n.text}</p>
                </div>
                {n.categories.length > 0 && <div className="flex flex-wrap gap-1">{n.categories.map((c) => <span key={c} className="rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-medium dark:bg-white/15">{c}</span>)}</div>}
                <div className="mt-auto flex items-end justify-between gap-2 text-[11px] opacity-80">
                  <span className="min-w-0">
                    {n.productName && (n.productId ? <Link href={`/products/${n.productId}`} className="block truncate font-semibold underline-offset-2 hover:underline" style={{ color: 'inherit' }}>{n.productName}</Link> : <span className="block truncate font-semibold">{n.productName}</span>)}
                    <span className="block truncate">{[n.by, String(n.at || '').slice(0, 10)].filter(Boolean).join(' · ')}</span>
                  </span>
                  <button type="button" disabled={busy} onClick={() => onDone(n, !n.done)} aria-label={n.done ? 'Open this note again' : 'Mark this note as dealt with'} title={n.done ? 'Open again' : 'Dealt with'}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/10 hover:bg-black/20 disabled:opacity-50 dark:bg-white/15 dark:hover:bg-white/25">
                    {n.done ? <RotateCcw size={14} /> : <Check size={14} />}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  return (
    <div className="grid grid-cols-1 gap-[var(--space-md)] xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Lane id="open" title="Open" hint="Drag to arrange, or to the right when done" list={lanes.open} />
      <Lane id="done" title="Dealt with" hint="Drag back to open again" list={lanes.done} />
    </div>
  );
}
