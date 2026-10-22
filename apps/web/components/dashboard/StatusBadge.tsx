export type StatusLevel = "healthy" | "warning" | "critical" | "info" | "neutral";

const STYLES: Record<StatusLevel, string> = {
  healthy: "bg-[var(--status-healthy-bg)] text-[var(--status-healthy-fg)]",
  warning: "bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]",
  critical: "bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)]",
  info: "bg-[var(--status-info-bg)] text-[var(--status-info-fg)]",
  neutral: "bg-[var(--status-neutral-bg)] text-[var(--status-neutral-fg)]",
};

const DOT: Record<StatusLevel, string> = {
  healthy: "bg-[var(--status-healthy-fg)]",
  warning: "bg-[var(--status-warning-fg)]",
  critical: "bg-[var(--status-critical-fg)]",
  info: "bg-[var(--status-info-fg)]",
  neutral: "bg-[var(--status-neutral-fg)]",
};

export function StatusBadge({
  status,
  label,
}: {
  status: StatusLevel;
  label: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${STYLES[status]}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[status]}`} />
      {label}
    </span>
  );
}

export function StatusDot({ status }: { status: StatusLevel }) {
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${DOT[status]}`} />;
}
