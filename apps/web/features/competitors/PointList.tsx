'use client';
/**
 * A numbered list of points, one thing per line. Add a point, change one, or remove one; each change is saved straight away.
 * Stored as plain text with one point per line, so older notes written as a block of lines still show up as points.
 * A point written as "Price: cheaper for small teams" shows "Price" as the title and the rest underneath.
 */
import { useState } from 'react';
import { useAction } from '@/components/kit';

export const toPoints = (text: unknown): string[] =>
  String(text ?? '').split(/\n+/).map((l) => l.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim()).filter(Boolean);

function Text({ line }: { line: string }) {
  const m = line.match(/^([^:.]{2,40}):\s+(.+)$/);
  return (
    <span className="min-w-0 flex-1 leading-snug">
      <span className="block text-[15px] font-bold text-[var(--text-heading)]">{m ? m[1] : line}</span>
      {m && <span className="mt-0.5 block text-[14px] text-[var(--text-secondary)]">{m[2].charAt(0).toUpperCase() + m[2].slice(1)}</span>}
    </span>
  );
}

type Props = { points: string[]; tone: string; one: string; onChange: (next: string[]) => Promise<void> };

export default function PointList({ points, tone, one, onChange }: Props) {
  const [editAt, setEditAt] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const act = useAction();
  const clean = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim();
  const run = (next: string[], then: () => void) => act.run(async () => { await onChange(next); then(); });
  const saveEdit = () => {
    const v = clean(draft);
    if (editAt === null) return;
    if (!v) return run(points.filter((_, i) => i !== editAt), () => setEditAt(null));
    if (v === points[editAt]) return setEditAt(null);
    run(points.map((p, i) => (i === editAt ? v : p)), () => setEditAt(null));
  };
  const saveNew = () => {
    const v = clean(draft);
    if (!v) return;
    // stays open with an empty box, so the next point can be typed straight away
    run([...points, v], () => setDraft(''));
  };
  const box = (onSave: () => void, onCancel: () => void, label: string, saveLabel: string) => (
    <div className="flex flex-col gap-2">
      <textarea autoFocus rows={2} className="w-full" value={draft} aria-label={label} placeholder={label}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSave(); } else if (e.key === 'Escape') onCancel(); }} />
      <div className="flex gap-2">
        <button type="button" className="btn sm primary" disabled={act.busy || (!clean(draft) && editAt === null)} onClick={onSave}>{saveLabel}</button>
        <button type="button" className="btn sm" onClick={onCancel}>{adding ? 'Done' : 'Cancel'}</button>
      </div>
    </div>
  );
  return (
    <div>
      {points.length > 0 && (
        <ol className="m-0 flex list-none flex-col gap-3.5 p-0">
          {points.map((p, i) => (
            <li key={`${i}-${p}`} className="flex gap-3">
              <span aria-hidden className="mt-px grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-bold" style={{ background: `color-mix(in srgb, ${tone} 16%, transparent)`, color: tone }}>{i + 1}</span>
              {editAt === i ? (
                <div className="min-w-0 flex-1">{box(saveEdit, () => setEditAt(null), `Change ${one}`, 'Save')}</div>
              ) : (
                <>
                  <Text line={p} />
                  <span className="flex shrink-0 gap-3 text-[13px]">
                    <button type="button" className="text-[var(--text-muted)] hover:text-[var(--text-heading)]" aria-label={`Edit ${one} ${i + 1}`} onClick={() => { setAdding(false); setDraft(p); setEditAt(i); }}>Edit</button>
                    <button type="button" className="text-[var(--text-muted)] hover:text-[var(--status-critical-fg)]" aria-label={`Remove ${one} ${i + 1}`} disabled={act.busy} onClick={() => run(points.filter((_, j) => j !== i), () => {})}>Remove</button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ol>
      )}
      {act.box}
      {adding ? (
        <div className={points.length ? 'mt-4' : ''}>{box(saveNew, () => { setAdding(false); setDraft(''); }, `Write a ${one}`, 'Add')}</div>
      ) : (
        <button type="button" className={`text-[14px] font-semibold text-[var(--sd-accent)] ${points.length ? 'mt-4' : ''}`} onClick={() => { setEditAt(null); setDraft(''); setAdding(true); }}>+ Add {one}</button>
      )}
    </div>
  );
}
