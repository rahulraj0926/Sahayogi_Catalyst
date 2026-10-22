import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUp } from "lucide-react";
import { SampleDataBadge } from "./SampleDataBadge";
import type { StatusLevel } from "./StatusBadge";

const DOT: Record<StatusLevel, string> = {
  healthy: "bg-[var(--status-healthy-fg)]",
  warning: "bg-[var(--status-warning-fg)]",
  critical: "bg-[var(--status-critical-fg)]",
  info: "bg-[var(--status-info-fg)]",
  neutral: "bg-[var(--status-neutral-fg)]",
};

// Black and white like the reference: the number is always the heading colour. Status shows in the note and the screen's own badges, not by tinting the figure.
const VALUE_COLOR: Record<StatusLevel, string> = {
  healthy: "var(--text-heading)",
  warning: "var(--text-heading)",
  critical: "var(--text-heading)",
  info: "var(--text-heading)",
  neutral: "var(--text-heading)",
};

// The hover accent bar uses the same color as the value/status, so the sweep that
// animates in on hover matches the data inside the card.
const ACCENT_COLOR = VALUE_COLOR;

export type TrendDirection = "up" | "down";

function IconChip({ icon, bg, fg }: { icon: ReactNode; bg: string; fg: string }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-lg [&>svg]:h-[55%] [&>svg]:w-[55%]"
      style={{
        background: bg,
        color: fg,
        width: "clamp(1.75rem, 10cqi, 2.125rem)",
        height: "clamp(1.75rem, 10cqi, 2.125rem)",
      }}
    >
      {icon}
    </span>
  );
}

function TrendChip({ direction, value }: { direction: TrendDirection; value: string }) {
  const isUp = direction === "up";
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold ${
        isUp ? "bg-[var(--trend-up-bg)] text-[var(--trend-up-fg)]" : "bg-[var(--trend-down-bg)] text-[var(--trend-down-fg)]"
      }`}
    >
      <ArrowUp size={11} className={isUp ? "" : "rotate-180"} />
      {value}
    </span>
  );
}

export function KPITile({
  title,
  value,
  note,
  status,
  secondary,
  drillHref,
  drillLabel,
  sample,
  trend,
  trendDirection,
  trendValue,
  icon,
  iconBg,
  iconFg,
}: {
  title: string;
  value: ReactNode;
  note?: string;
  status: StatusLevel;
  secondary?: { label: string; value: ReactNode; color: string }[];
  drillHref?: string;
  drillLabel?: string;
  /** True while the figure comes from the dashboard sample-data layer rather
   *  than a real API: shows a visible "Sample data" badge where Setu shows its
   *  refresh timestamp (that timestamp, and Setu's stale-data indicator, belong
   *  to a live-refresh feed Boss does not have). */
  sample?: boolean;
  trend?: ReactNode;
  trendDirection?: TrendDirection;
  trendValue?: string;
  icon?: ReactNode;
  iconBg?: string;
  iconFg?: string;
}) {
  const className = `card-interactive tap-pop no-underline hover:no-underline group relative flex h-full min-w-0 flex-col gap-[clamp(0.25rem,2cqi,0.5rem)] overflow-hidden rounded-[var(--card-radius)] border border-[var(--card-border)] bg-[var(--surface)] p-[clamp(0.625rem,3.5cqi,0.875rem)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
    drillHref ? "cursor-pointer" : ""
  }`;
  const style = {
    boxShadow: "var(--card-shadow)",
    containerType: "inline-size",
    "--tw-ring-color": ACCENT_COLOR[status],
  } as React.CSSProperties;

  const content = (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-1 origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100"
        style={{ background: "var(--text-heading)" }}
      />

      {/* Row 1 — title first (fills the row, wraps to max 2 lines), icon aligned right */}
      <div className="flex items-start justify-between gap-[clamp(0.5rem,3cqi,0.75rem)]">
        <p
          title={title}
          className="min-w-0 flex-1 font-semibold leading-tight text-[var(--text-muted)] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden"
          style={{ fontSize: "clamp(0.8125rem, 4.5cqi, 0.9375rem)" }}
        >
          {title}
        </p>
        {icon ? (
          <IconChip icon={icon} bg={iconBg ?? "var(--search-bg)"} fg={iconFg ?? "var(--text-secondary)"} />
        ) : (
          <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${DOT[status]}`} />
        )}
      </div>

      {/* Row 2 — value (semantic color) with the trend chip tucked right beside it.
          flex-1 + items-center vertically centers the value in the space between
          the title and the bottom row (top-to-bottom), while staying left-aligned. */}
      <div className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className="font-bold leading-none tracking-tight tabular-nums"
          style={{ color: VALUE_COLOR[status], fontSize: "clamp(1.375rem, 10cqi, 2rem)" }}
        >
          {value}
        </span>
        {trend ?? (trendDirection && trendValue ? <TrendChip direction={trendDirection} value={trendValue} /> : null)}
      </div>

      {/* Row 3 — supporting note/secondary on the left, timestamp on the SAME line
          aligned to it (items-end). Pinned to the card bottom (mt-auto) so this row
          lines up across every card; cards are compact so the gap above stays small. */}
      {/* flex-wrap + basis: on a narrow tile the Sample-data badge drops under the note instead of squeezing it. */}
      <div className="mt-auto flex flex-wrap items-end justify-between gap-x-2 gap-y-1 pt-1">
        <div className="min-w-0 flex-1 basis-[6rem]">
          {note && (
            <p className="text-[clamp(0.75rem,4cqi,0.875rem)] leading-snug text-[var(--text-muted)] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
              {note}
            </p>
          )}
          {secondary && secondary.length > 0 && (
            // flex-nowrap (not flex-wrap): a second line here makes this tile
            // taller than its row siblings, and the grid's default row-stretch
            // then forces every sibling in that row to match — truncate each
            // label instead of ever wrapping to a second line.
            <div className="flex flex-nowrap items-center gap-x-2 overflow-hidden">
              {secondary.map((s) => (
                <span key={s.label} className="flex min-w-0 shrink items-center gap-1 text-[clamp(0.75rem,4cqi,0.875rem)] text-[var(--text-muted)]">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: s.color }} />
                  <span className="shrink-0 font-semibold" style={{ color: s.color }}>{s.value}</span>
                  <span className="truncate">{s.label}</span>
                </span>
              ))}
            </div>
          )}
        </div>
        {sample && <SampleDataBadge />}
      </div>
    </>
  );

  if (drillHref) {
    return (
      <Link href={drillHref} aria-label={drillLabel ?? `${title} — view detail`} className={className} style={style}>
        {content}
      </Link>
    );
  }

  return (
    <div className={className} style={style}>
      {content}
    </div>
  );
}
