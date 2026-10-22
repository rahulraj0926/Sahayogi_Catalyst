"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// JS Date#getDay() is 0=Sunday..6=Saturday; convert to a Monday-first index
// (0=Monday..6=Sunday) so the grid lines up with the Monday-first WEEKDAYS row.
function mondayFirstDay(date: Date) {
  return (date.getDay() + 6) % 7;
}

function buildGrid(year: number, month: number) {
  const firstDay = mondayFirstDay(new Date(year, month, 1));
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells: { day: number; inMonth: boolean }[] = [];
  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, inMonth: true });
  }
  while (cells.length % 7 !== 0 || cells.length < 42) {
    cells.push({ day: cells.length - (firstDay + daysInMonth) + 1, inMonth: false });
  }
  return cells;
}

const NAV_BUTTON_CLASS =
  "tap-pop flex items-center justify-center rounded-[0.625rem] text-[var(--text-muted)] transition-colors hover:bg-[var(--search-bg)] hover:text-[var(--icon-chip-fg)] disabled:pointer-events-none disabled:opacity-40 h-[clamp(1.625rem,7cqi,2rem)] w-[clamp(1.625rem,7cqi,2rem)] [&>svg]:h-[45%] [&>svg]:w-[45%]";

/**
 * Setu's calendar card, made hydration-safe. Setu read `new Date()` in the
 * render body; "use client" components are also rendered on the server, so
 * "today" was evaluated against the server's clock and again against the
 * viewer's, and the highlighted cell / month name diverged whenever they sat
 * on different calendar days. Here `today` and the visible month are resolved
 * AFTER mount: the server and the first client render both emit the same blank
 * 6x7 grid (identical markup, same height, so nothing shifts), and the real
 * month and the viewer's own "today" appear once the browser's date is known.
 * This is the fix first made in the dashboard's earlier CalendarWidget (which
 * this card replaced); CalendarCard.test.tsx carries that regression cover.
 */
export function CalendarCard() {
  const [today, setToday] = useState<Date | null>(null);
  const [cursor, setCursor] = useState<{ year: number; month: number } | null>(null);

  useEffect(() => {
    const now = new Date();
    setToday(now);
    setCursor({ year: now.getFullYear(), month: now.getMonth() });
  }, []);

  function shiftMonth(delta: number) {
    setCursor((c) => {
      if (!c) return c;
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  const ready = today !== null && cursor !== null;
  const cells = ready ? buildGrid(cursor.year, cursor.month) : null;
  const isCurrentMonth = ready && cursor.year === today.getFullYear() && cursor.month === today.getMonth();

  return (
    <div
      className="flex h-full min-h-[15rem] w-full min-w-0 flex-col gap-[clamp(0.5rem,3cqi,0.875rem)] rounded-[var(--card-radius)] border border-[var(--divider)] bg-[var(--surface)] p-3"
      style={{ boxShadow: "var(--card-shadow)", containerType: "inline-size" }}
      aria-label="Calendar"
      aria-busy={!ready}
    >
      <div className="flex shrink-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-bold leading-tight text-[var(--icon-chip-fg)] text-[clamp(0.9375rem,5cqi,1.25rem)]">
            {ready ? MONTH_NAMES[cursor.month] : " "}
          </p>
          <p className="text-[clamp(0.6875rem,3cqi,0.8125rem)] font-medium text-[var(--text-muted)]">{ready ? cursor.year : " "}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {ready && !isCurrentMonth && (
            <button
              type="button"
              onClick={() => setCursor({ year: today.getFullYear(), month: today.getMonth() })}
              className="tap-pop mr-1 rounded-full bg-[var(--icon-chip-bg)] px-2.5 py-1 text-[clamp(0.625rem,2.8cqi,0.6875rem)] font-semibold text-[var(--icon-chip-fg)] transition-colors hover:brightness-95"
            >
              Today
            </button>
          )}
          <button type="button" aria-label="Previous month" disabled={!ready} onClick={() => shiftMonth(-1)} className={NAV_BUTTON_CLASS}>
            <ChevronLeft />
          </button>
          <button type="button" aria-label="Next month" disabled={!ready} onClick={() => shiftMonth(1)} className={NAV_BUTTON_CLASS}>
            <ChevronRight />
          </button>
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-7 text-center">
        {WEEKDAYS.map((w) => (
          <span key={w} className="text-[clamp(0.625rem,3.2cqi,0.8125rem)] font-semibold uppercase tracking-wide text-[var(--text-muted)]/70">
            {w}
          </span>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 text-center">
        {cells
          ? cells.map((cell, i) => {
              const isToday = isCurrentMonth && cell.inMonth && cell.day === today.getDate();
              const isWeekend = i % 7 === 5 || i % 7 === 6;
              return (
                <div key={i} className="flex items-center justify-center">
                  <span
                    className={`tap-pop flex aspect-square items-center justify-center rounded-full font-medium text-[clamp(0.75rem,4cqi,0.875rem)] transition-colors w-[clamp(1.5rem,12cqi,2rem)] ${
                      isToday
                        ? "bg-[var(--accent-solid)] font-semibold text-white shadow-sm"
                        : cell.inMonth
                          ? `cursor-pointer hover:bg-[var(--search-bg)] ${isWeekend ? "text-[var(--text-muted)]" : "text-[var(--text-secondary)]"}`
                          : "text-[var(--divider)]"
                    }`}
                  >
                    {cell.day}
                  </span>
                </div>
              );
            })
          : Array.from({ length: 42 }, (_, i) => (
              <div key={i} className="flex items-center justify-center">
                <span className="aspect-square w-[clamp(1.5rem,12cqi,2rem)]" />
              </div>
            ))}
      </div>
    </div>
  );
}
