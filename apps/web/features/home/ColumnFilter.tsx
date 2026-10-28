'use client';
import { Check, Filter } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export type FilterOption = { value: string; label: string };

/**
 * A table column heading with its own filter. The funnel shows when you point at the heading (and stays lit while a filter is on);
 * clicking it opens the choices right under the heading. `multi` lets several values be ticked, they are kept as a comma list.
 */
export function ColumnHead({ label, children, active, sort, align = 'left', className = '' }: { label: string; children?: ReactNode; active?: boolean; sort?: ReactNode; align?: 'left' | 'right'; className?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLTableCellElement>(null);
  /** The choices float over the page (fixed), so a table's own scroll area never clips them or needs spare room below. */
  const toggle = () => { const r = ref.current?.getBoundingClientRect(); if (r) setPos({ top: r.bottom + 4, left: align === 'right' ? Math.max(8, r.right - 224) : Math.min(r.left, window.innerWidth - 232) }); setOpen((o) => !o); };
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <th ref={ref} className={`group/th relative whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] ${className}`}>
      <span className="inline-flex items-center gap-1">
        {sort ?? label}
        {children && (
          <button type="button" aria-label={`Filter ${label}`} aria-expanded={open} onClick={toggle}
            className={`inline-flex h-5 w-5 items-center justify-center rounded transition-opacity hover:bg-[var(--surface-muted)] focus-visible:opacity-100 ${active ? 'bg-[var(--sd-accent-soft)] text-[var(--sd-accent)] opacity-100' : 'opacity-0 group-hover/th:opacity-100'}`}>
            <Filter size={12} />
          </button>
        )}
      </span>
      {open && children && (
        <div role="dialog" aria-label={`${label} filter`} style={{ position: 'fixed', top: pos?.top, left: pos?.left }} className={`z-50 max-h-[min(32rem,calc(100dvh-8rem))] w-56 overflow-y-auto rounded-lg border border-[var(--divider)] bg-[var(--surface)] p-1.5 text-left text-sm font-normal normal-case tracking-normal text-[var(--text-secondary)] shadow-xl`}>
          {children}
        </div>
      )}
    </th>
  );
}

const ROW = 'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--surface-muted)]';

/** Choose one or several values; `value` is a comma list. */
export function OptionList({ options, value, onChange, multi = true, anyLabel = 'Any' }: { options: FilterOption[]; value: string; onChange: (v: string) => void; multi?: boolean; anyLabel?: string }) {
  const picked = value ? value.split(',') : [];
  const toggle = (v: string) => onChange(multi ? (picked.includes(v) ? picked.filter((x) => x !== v) : [...picked, v]).join(',') : (picked[0] === v ? '' : v));
  return (
    <ul className="max-h-64 overflow-y-auto">
      <li><button type="button" className={ROW} onClick={() => onChange('')}><span className="w-4">{picked.length === 0 && <Check size={14} />}</span>{anyLabel}</button></li>
      {options.map((o) => (
        <li key={o.value}><button type="button" className={ROW} onClick={() => toggle(o.value)}>
          <span className={`flex h-4 w-4 shrink-0 items-center justify-center ${multi ? 'rounded border border-[var(--divider)]' : ''} ${picked.includes(o.value) ? 'bg-[var(--sd-accent)] text-[var(--sd-accent-ink)]' : ''}`}>{picked.includes(o.value) && <Check size={12} />}</span>
          <span className="min-w-0 flex-1 truncate">{o.label}</span>
        </button></li>
      ))}
    </ul>
  );
}
