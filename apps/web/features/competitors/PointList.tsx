'use client';
/**
 * A numbered list of points. Each point has a short heading and the details under it; add, change or remove one at a time,
 * and each change is saved straight away. The title bar (name on the left, "+ Add" on the right) belongs to this list too.
 * Stored as plain text with one point per line, written "Heading: details". A line with no heading is just details.
 */
import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { useAction } from '@/components/kit';

export type Point = { head: string; text: string };
const LINE = /^([^:.]{1,40}):\s+(.+)$/;

export const toPoints = (text: unknown): Point[] =>
  String(text ?? '').split(/\n+/).map((l) => l.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim()).filter(Boolean).map((l) => {
    const m = l.match(LINE);
    return m ? { head: m[1].trim(), text: m[2].trim() } : { head: '', text: l };
  });
export const fromPoints = (points: Point[]) => points.map((p) => (p.head ? `${p.head}: ${p.text}` : p.text)).join('\n');

const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim();
// a heading has no colon or full stop, so that it can be told apart from the details when read back
const cleanHead = (s: string) => oneLine(s).replace(/[:.]/g, '').trim().slice(0, 40);

type Props = { title: string; tone: string; one: string; points: Point[]; onChange: (next: Point[]) => Promise<void>};

export default function PointList({ title, tone, one, points, onChange }: Props) {
  const [at, setAt] = useState<number | 'new' | null>(null);
  const [head, setHead] = useState('');
  const [text, setText] = useState('');
  const act = useAction();
  const close = () => { setAt(null); setHead(''); setText(''); };
  const open = (i: number | 'new') => { const p = i === 'new' ? { head: '', text: '' } : points[i]; setHead(p.head); setText(p.text); setAt(i); };
  const run = (next: Point[], then: () => void) => act.run(async () => { await onChange(next); then(); });
  const save = () => {
    const p = { head: cleanHead(head), text: oneLine(text) };
    if (!p.text) return;
    if (at === 'new') return run([...points, p], close);
    if (at === null) return;
    run(points.map((x, i) => (i === at ? p : x)), close);
  };
  const form = (
    <div className="flex min-w-0 flex-1 flex-col gap-2" onKeyDown={(e) => { if (e.key === 'Escape') close(); }}>
      <input autoFocus type="text" className="w-full" value={head} maxLength={40} aria-label={`Heading of the ${one}`} placeholder="Heading, for example Price" onChange={(e) => setHead(e.target.value)} />
      <textarea rows={2} className="w-full" value={text} aria-label={`Details of the ${one}`} placeholder="Details"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); } }} />
      <div className="flex gap-2">
        <button type="button" className="btn sm primary" disabled={act.busy || !oneLine(text)} onClick={save}>{at === 'new' ? 'Add' : 'Save'}</button>
        <button type="button" className="btn sm" onClick={close}>Cancel</button>
      </div>
    </div>
  );
  // the number sits in a fixed column and is as tall as the first line of the point, so every number lines up with its heading
  const row = 'grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3';
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <h3 className="m-0 flex-1 text-[18px] font-bold text-[var(--text-heading)]">{title}</h3>
        {at !== 'new' && <button type="button" className="text-[14px] font-semibold text-[var(--sd-accent)]" aria-label={`Add a ${one}`} onClick={() => open('new')}>+ Add</button>}
      </div>
      <ol className="m-0 flex list-none flex-col gap-4 p-0">
        {points.map((p, i) => (
          <li key={`${i}-${p.head}-${p.text}`} className={row}>
            <span aria-hidden className="grid h-6 w-6 place-items-center rounded-full text-[12px] font-bold" style={{ background: `color-mix(in srgb, ${tone} 16%, transparent)`, color: tone }}>{i + 1}</span>
            {at === i ? form : (
              <div className="flex min-w-0 items-start gap-3">
                <div className="min-w-0 flex-1">
                  {p.head && <div className="text-[15px] font-bold leading-6 text-[var(--text-heading)]">{p.head}</div>}
                  <div className={p.head ? 'text-[14px] leading-snug text-[var(--text-secondary)]' : 'text-[14px] leading-6 text-[var(--text-heading)]'}>{p.text.charAt(0).toUpperCase() + p.text.slice(1)}</div>
                </div>
                <span className="flex shrink-0 gap-2 leading-6">
                  <button type="button" className="grid h-6 w-6 place-items-center text-[var(--text-muted)] hover:text-[var(--text-heading)]" aria-label={`Edit ${one} ${i + 1}`} title="Edit" onClick={() => open(i)}><Pencil size={14} /></button>
                  <button type="button" className="grid h-6 w-6 place-items-center text-[var(--text-muted)] hover:text-[var(--status-critical-fg)]" aria-label={`Remove ${one} ${i + 1}`} title="Remove" disabled={act.busy} onClick={() => run(points.filter((_, j) => j !== i), close)}><Trash2 size={14} /></button>
                </span>
              </div>
            )}
          </li>
        ))}
        {at === 'new' && (
          <li className={row}>
            <span aria-hidden className="grid h-6 w-6 place-items-center rounded-full text-[12px] font-bold" style={{ background: `color-mix(in srgb, ${tone} 16%, transparent)`, color: tone }}>{points.length + 1}</span>
            {form}
          </li>
        )}
      </ol>
      {points.length === 0 && at !== 'new' && <p className="m-0 text-[14px] text-[var(--text-muted)]">Nothing here yet.</p>}
      {act.box}
    </div>
  );
}
