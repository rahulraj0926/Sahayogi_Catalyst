import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

/** The search box used on the lists: a magnifier inside the box and room for it before the text. `className` sets the width. */
export function SearchField({ value, onChange, placeholder, label, className }: { value: string; onChange: (v: string) => void; placeholder: string; label?: string; className?: string }) {
  return (
    <label className={cn('relative block', className)}>
      <Search size={15} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label || placeholder} className="h-9 w-full rounded-lg border border-[var(--divider)] bg-[var(--search-bg)] pr-2 text-sm" style={{ paddingLeft: 34 }} />
    </label>
  );
}
