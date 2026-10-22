'use client';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { EmbedContext, ErrorBox } from '@/components/ui';
import { useApi } from '@/lib/api';
import { byId } from '@/features/registry';
import type { Hub } from './groups';

/**
 * One page for a whole sidebar entry. Every screen that belongs to it is a section here, with a plain one-line explanation.
 * A section opens when you tap it (or when the address says ?open=<section>) and shows the real screen, not a copy of it.
 */
export function HubPage({ pid, hub, query }: { pid: string; hub: Hub; query: URLSearchParams }) {
  const pf = useApi<any>('/portfolio');
  const mode = pf.data?.products?.find((p: any) => p.id === pid || p.slug === pid)?.mode;
  const inbox = useApi<any>(hub.key === 'people' ? '/inbox?status=proposed' : null, pid);
  const appr = useApi<any>(hub.key === 'people' ? '/approvals' : null, pid);
  const sections = hub.sections.filter((s) => !s.onlyMode || s.onlyMode === mode);
  const waiting: Record<string, number> = { inbox: inbox.data?.counts?.proposed || 0, approvals: (appr.data?.for_you?.length || 0) + (appr.data?.waiting?.length || 0) };
  const want = query.get('open');
  const [open, setOpen] = useState<Record<string, boolean>>(() => ({ [want && sections.some((s) => s.id === want) ? want : sections[0].id]: true }));
  const peopleOpen = (id: string) => (hub.key === 'people' && want === null && (waiting[id] || 0) > 0);
  return (
    <div className="flex flex-col gap-3 pb-4">
      <header>
        <h1 className="text-xl font-semibold text-[var(--text-heading)]">{hub.label}</h1>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">{hub.hint}.</p>
      </header>
      {sections.map((s) => {
        const F = byId(s.id)?.component;
        const on = open[s.id] ?? peopleOpen(s.id);
        const n = waiting[s.id] || 0;
        return (
          <section key={s.id} id={`sec-${s.id}`} className="rounded-xl border border-[var(--divider)] bg-[var(--surface)]">
            <button type="button" aria-expanded={on} onClick={() => setOpen((o) => ({ ...o, [s.id]: !on }))}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-[var(--search-bg)]" style={{ minHeight: 0 }}>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text-heading)]">{s.label}{n > 0 && <span className="rounded-full bg-[var(--sd-accent)] px-1.5 text-[10px] font-semibold leading-4 text-[var(--sd-accent-ink)]">{n}</span>}</span>
                <span className="block text-xs text-[var(--text-muted)]">{s.plain}</span>
              </span>
              <ChevronDown size={16} className={`shrink-0 text-[var(--text-muted)] transition-transform ${on ? 'rotate-180' : ''}`} />
            </button>
            {on && <div className="border-t border-[var(--divider)] px-4 py-3">
              {F ? <EmbedContext.Provider value><F pid={pid} args={[]} query={query} /></EmbedContext.Provider> : <ErrorBox message={`The screen “${s.id}” is missing.`} />}
            </div>}
          </section>
        );
      })}
    </div>
  );
}
