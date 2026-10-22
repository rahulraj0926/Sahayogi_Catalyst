'use client';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/dashboard/Card';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { ErrorBox } from '@/components/ui';
import { ago } from '@/components/kit';
import { fetchActivity } from './client';
import { HOME_COPY as C } from './copy';
import type { Activity } from './types';

function dayLabel(iso: string) {
  const d = new Date(iso); const t = new Date(); const y = new Date(); y.setDate(t.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  return same(d, t) ? 'Today' : same(d, y) ? 'Yesterday' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Newest-first feed across all products; "Show older" follows the server cursor. */
export function ActivityFeed() {
  const [rows, setRows] = useState<Activity[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (cursor?: string) => {
    setBusy(true);
    try {
      const page = await fetchActivity(cursor);
      setRows((old) => (cursor && old ? [...old, ...page.data] : page.data));
      setNext(page.next); setError(null);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const groups = useMemo(() => {
    const out: { day: string; items: Activity[] }[] = [];
    for (const a of rows ?? []) { const d = dayLabel(a.at); const last = out[out.length - 1]; if (last && last.day === d) last.items.push(a); else out.push({ day: d, items: [a] }); }
    return out;
  }, [rows]);

  return (
    <Card title="Recent activity" description="What people did, newest first." action={<button type="button" aria-label="Refresh activity" title="Refresh" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-muted)]" onClick={() => load()} disabled={busy}><RefreshCw size={15} className={busy ? 'animate-spin' : ''} /></button>}>
      {error && <ErrorBox message={error} />}
      {rows && rows.length === 0 && <EmptyState title={C.activityEmpty} />}
      <div className="-mr-1 max-h-[26rem] overflow-y-auto pr-1">
        {groups.map((g) => (
          <section key={g.day} className="mb-3 last:mb-0">
            <h3 className="sticky top-0 z-10 bg-[var(--surface)] pb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{g.day}</h3>
            <ul className="relative ml-4 flex flex-col gap-3 border-l border-[var(--divider)] pl-5">
              {g.items.map((a) => (
                <li key={a.id} className="relative text-sm">
                  <span aria-hidden className="absolute -left-[1.6875rem] top-1 flex h-3 w-3 items-center justify-center rounded-full border-2 border-[var(--surface)] bg-[var(--sd-accent)]" />
                  <p className="leading-snug text-[var(--text-secondary)]">{a.actor && !String(a.text).startsWith(a.actor) && <b className="font-semibold text-[var(--text-heading)]">{a.actor} </b>}{a.text}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-[var(--text-muted)]">
                    <Link href={`/products/${a.productSlug}`} className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 font-medium hover:underline" style={{ color: 'inherit' }}>{a.productName}</Link>
                    <time dateTime={a.at} title={a.at}>{ago(a.at)}</time>
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {!rows && busy && <div className="h-32 animate-pulse rounded-md bg-[var(--surface-muted)]" />}
        {next && <button type="button" className="btn sm mt-2 self-start" disabled={busy} onClick={() => load(next)}>{busy ? 'Loading…' : 'Show older'}</button>}
      </div>
    </Card>
  );
}
