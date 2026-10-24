'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';

export interface SwitchItem { slug: string; name: string; readiness?: number }

/**
 * The product's name as the page title, as a drop-down that jumps to another product.
 * It keeps the same screen (or the same phase) when the other product has it.
 */
export function ProductSwitcher({ name, pid, items, path, compact }: { name: string; pid: string; items: SwitchItem[]; path: string; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  const list = useMemo(() => items.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())), [items, q]);
  const go = (slug: string) => {
    const rest = path.replace(/^\/products\/[^/]+/, '').split('?')[0];
    const m = /^\/(phase\/\d+|[a-z-]+)/.exec(rest);
    let keep = m && !/^\/(work|item)/.test(rest) ? `/${m[1]}` : '';
    // inside Competitors keep the screen (Plans, Our plans, Compare…) but not a single competitor, which belongs to one product
    const view = /^\/competitors\/([a-z-]+)$/.exec(rest);
    if (view) keep = `/competitors/${view[1]}`;
    setOpen(false); setQ(''); router.push(`/products/${slug}${keep}`);
  };
  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => { const r = box.current?.getBoundingClientRect(); if (r) setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 280)) }); setOpen((o) => !o); }}
        aria-haspopup="listbox" aria-expanded={open} title="Switch product"
        className={compact ? 'flex max-w-[14rem] items-center gap-1 rounded-md border-0 bg-transparent px-1.5 py-0.5 text-xs font-medium text-[var(--text-heading)] transition-colors hover:bg-[var(--search-bg)]' : '-ml-2 flex max-w-full items-center gap-2 rounded-lg border-0 bg-transparent px-2 py-0.5 text-xl font-semibold text-[var(--text-heading)] transition-colors hover:bg-[var(--search-bg)]'} style={{ minHeight: 0 }}>
        {compact ? <span className="truncate">{name}</span> : <h1 className="m-0 truncate text-xl font-semibold">{name}</h1>}
        <ChevronsUpDown size={compact ? 12 : 16} className="shrink-0 text-[var(--text-muted)]" />
      </button>
      {open && (
        <div role="listbox" aria-label="Switch product" style={{ top: pos.top, left: pos.left }} className="fixed z-50 w-[17rem] max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-[var(--divider)] bg-[var(--surface)] text-sm shadow-xl">
          <label className="flex items-center gap-2 border-b border-[var(--divider)] px-3 py-2">
            <Search size={14} className="text-[var(--text-muted)]" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a product" className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm outline-none" style={{ minHeight: 0 }} />
          </label>
          <ul className="max-h-72 overflow-y-auto p-1">
            {list.length === 0 && <li className="px-3 py-2 text-sm text-[var(--text-muted)]">No product matches.</li>}
            {list.map((p) => {
              const cur = p.slug === pid;
              return (
                <li key={p.slug}>
                  <button type="button" role="option" aria-selected={cur} onClick={() => go(p.slug)}
                    className={`flex w-full items-center gap-2 rounded-lg border-0 bg-transparent px-2.5 py-1.5 text-left text-[13px] hover:bg-[var(--search-bg)] ${cur ? 'font-semibold text-[var(--sd-accent)]' : 'text-[var(--text-heading)]'}`} style={{ minHeight: 0 }}>
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    {typeof p.readiness === 'number' && <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{p.readiness}%</span>}
                    {cur && <Check size={14} />}
                  </button>
                </li>);
            })}
          </ul>
          <Link href="/products" onClick={() => setOpen(false)} className="block border-t border-[var(--divider)] px-3 py-2 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-heading)]">All products</Link>
        </div>
      )}
    </div>
  );
}
