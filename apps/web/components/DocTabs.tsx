'use client';
import Link from 'next/link';
import { Files, ScrollText } from 'lucide-react';

/** One place for documents: the list of separate documents, or all of them read as one continuous document. */
export function DocTabs({ pid, active }: { pid: string; active: 'list' | 'whole' }) {
  const tab = (on: boolean) => `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${on ? 'bg-[var(--surface)] text-[var(--text-heading)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-heading)]'}`;
  return (
    <div role="tablist" aria-label="Document views" className="mb-3 inline-flex gap-1 rounded-xl bg-[var(--surface-muted)] p-1">
      <Link role="tab" aria-selected={active === 'list'} href={`/products/${pid}/documents`} className={tab(active === 'list')}><Files size={15} />Separate documents</Link>
      <Link role="tab" aria-selected={active === 'whole'} href={`/products/${pid}/doc`} className={tab(active === 'whole')}><ScrollText size={15} />Read as one document</Link>
    </div>
  );
}
