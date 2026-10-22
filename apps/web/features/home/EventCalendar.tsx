'use client';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useCalendar } from './client';
import { HOME_COPY as C } from './copy';
import type { CalendarEvent, EventKind } from './types';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOT: Record<EventKind, string> = {
  approval_expires: 'bg-[var(--status-warning-fg)]', gate_decision: 'bg-[var(--status-healthy-fg)]', stage_entered: 'bg-[var(--status-info-fg)]',
  idea_submitted: 'bg-[var(--status-neutral-fg)]', product_created: 'bg-[var(--accent-solid)]',
};
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/** Month grid with a dot on each day that has something dated; click a day to see its list. Dates come from /api/v1/home/calendar. */
export function EventCalendar() {
  const [cursor, setCursor] = useState<{ y: number; m: number } | null>(null);
  const [today, setToday] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => { const n = new Date(); setCursor({ y: n.getFullYear(), m: n.getMonth() }); setToday(iso(n.getFullYear(), n.getMonth(), n.getDate())); }, []);

  const from = cursor ? iso(cursor.y, cursor.m, 1) : null;
  const to = cursor ? iso(cursor.y, cursor.m, new Date(cursor.y, cursor.m + 1, 0).getDate()) : null;
  const { data, error } = useCalendar(from, to);
  const byDay = useMemo(() => { const m = new Map<string, CalendarEvent[]>(); for (const e of data?.events ?? []) m.set(e.date, [...(m.get(e.date) ?? []), e]); return m; }, [data]);

  const lead = cursor ? (new Date(cursor.y, cursor.m, 1).getDay() + 6) % 7 : 0;
  const days = cursor ? new Date(cursor.y, cursor.m + 1, 0).getDate() : 0;
  const prevDays = cursor ? new Date(cursor.y, cursor.m, 0).getDate() : 0;
  const shown = picked ? byDay.get(picked) ?? [] : [];
  const shift = (d: number) => { if (!cursor) return; const x = new Date(cursor.y, cursor.m + d, 1); setCursor({ y: x.getFullYear(), m: x.getMonth() }); setPicked(null); };
  // always six weeks, with the neighbouring months' days dimmed, so the card never changes height
  const cells = Array.from({ length: 42 }, (_, i) => (i < lead ? { n: prevDays - lead + i + 1, out: true } : i - lead < days ? { n: i - lead + 1, out: false } : { n: i - lead - days + 1, out: true }));

  return (
    <section aria-label={C.calendarTitle} className="relative flex h-full min-w-0 flex-col rounded-[var(--card-radius)] border border-[var(--card-border)] bg-[var(--surface)] px-3 py-2.5" style={{ boxShadow: 'var(--card-shadow)' }}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold leading-tight text-[var(--text-heading)]">
          <span className="text-[var(--sd-accent)]">{cursor ? MONTHS[cursor.m] : ' '}</span> <span className="font-normal text-[var(--text-muted)]">{cursor ? cursor.y : ' '}</span>
        </p>
        <div className="flex items-center gap-0.5">
          <button type="button" aria-label="Previous month" className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--surface-muted)]" style={{ minHeight: 0 }} onClick={() => shift(-1)}><ChevronLeft size={16} /></button>
          <button type="button" aria-label="Next month" className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--surface-muted)]" style={{ minHeight: 0 }} onClick={() => shift(1)}><ChevronRight size={16} /></button>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-7 text-center text-[0.625rem] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{WEEKDAYS.map((w) => <span key={w}>{w}</span>)}</div>
      {/* six equal rows share whatever height the numbers beside the calendar need */}
      <div className="mt-1 grid min-h-0 flex-1 grid-cols-7 place-items-center text-center" style={{ rowGap: 0, columnGap: 0, gridTemplateRows: 'repeat(6, minmax(1.5rem, 1fr))' }} aria-busy={!cursor}>
        {cursor && cells.map((c, i) => {
          if (c.out) return <span key={i} className="flex h-6 w-6 items-center justify-center text-xs text-[var(--text-muted)] opacity-40">{c.n}</span>;
          const d = iso(cursor.y, cursor.m, c.n);
          const ev = byDay.get(d);
          return (
            <button key={i} type="button" style={{ minHeight: 0, minWidth: 0, padding: 0 }} onClick={() => setPicked(picked === d ? null : d)} aria-label={`${d}${ev ? `, ${ev.length} event${ev.length > 1 ? 's' : ''}` : ''}`}
              className={`relative flex h-7 w-7 items-center justify-center rounded-full text-xs transition-colors hover:bg-[var(--surface-muted)] ${d === today ? 'bg-[var(--accent-solid)] font-semibold text-white hover:bg-[var(--accent-solid)]' : picked === d ? 'bg-[var(--surface-muted)] font-semibold text-[var(--text-heading)]' : 'text-[var(--text-heading)]'}`}>
              {c.n}
              {ev && <span className="absolute bottom-[2px] flex gap-[2px]">{ev.slice(0, 3).map((e, k) => <i key={k} className={`h-[3px] w-[3px] rounded-full ${d === today ? 'bg-white' : DOT[e.kind]}`} />)}</span>}
            </button>
          );
        })}
      </div>
      {(error || data?.truncated) && <p className="mt-1 text-[11px] text-[var(--text-muted)]">{error ? 'The calendar could not be loaded.' : 'Showing the first 500 events of this month.'}</p>}
      {picked && (
        <div className="absolute inset-x-2 bottom-2 z-10 max-h-[65%] overflow-y-auto rounded-xl border border-[var(--divider)] bg-[var(--surface)] p-3 text-sm shadow-xl">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-muted)]">{picked}</span>
            <button type="button" aria-label="Close" className="rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--surface-muted)]" onClick={() => setPicked(null)}><X size={14} /></button>
          </div>
          <ul className="flex flex-col gap-1.5">
            {shown.length === 0 && <li className="text-[var(--text-muted)]">Nothing on this day.</li>}
            {shown.map((e) => (
              <li key={e.id} className="flex items-start gap-2">
                <i className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[e.kind]}`} />
                <span className="min-w-0">
                  {e.href ? <Link href={e.href} className="hover:underline">{e.title}</Link> : e.title}
                  <span className="block text-xs text-[var(--text-muted)]">{C.eventLabel[e.kind]}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
