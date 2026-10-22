/**
 * Visible marker for any figure that is NOT backed by a real API yet. Styled
 * like Setu's small status pills (the warning tone, same as its stale-data
 * indicator) so it reads as a caution rather than decoration. Used on the page
 * header and on every sample-filled tile/chart — a customer must never be able
 * to mistake these numbers for their own.
 */
export function SampleDataBadge({ title = "Illustrative sample data — not your figures" }: { title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-[var(--status-warning-bg)] px-2 py-0.5 text-[0.625rem] font-medium leading-none text-[var(--status-warning-fg)]"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1" />
        <path d="M5 4.4V7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="5" cy="2.9" r="0.6" fill="currentColor" />
      </svg>
      Sample data
    </span>
  );
}
