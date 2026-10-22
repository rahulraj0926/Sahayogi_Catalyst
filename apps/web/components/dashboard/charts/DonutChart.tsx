export type DonutSlice = { label: string; value: number; color: string };

export function DonutChart({
  data,
  size = 148,
  centerLabel = "total",
  legend = true,
}: {
  data: DonutSlice[];
  size?: number;
  centerLabel?: string;
  legend?: boolean;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
  const twoCol = data.length > 4;

  // Pure SVG ring, drawn on a fixed 0-100 viewBox so it scales losslessly at
  // any size/zoom via CSS width/height — no JS measurement, no ResizeObserver.
  const strokeWidth = 20;
  const radius = 50 - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;
  const gapAngle = data.length > 1 ? 3 : 0; // deg of breathing room between slices

  const segments = data.map((d, i) => {
    const fraction = (d.value / total) * 360;
    const startDeg = data.slice(0, i).reduce((sum, p) => sum + (p.value / total) * 360, 0);
    const sweep = Math.max(fraction - gapAngle, 0);
    const dash = (sweep / 360) * circumference;
    return { ...d, dash, gap: circumference - dash, rotate: startDeg };
  });

  return (
    <div className={`flex items-center justify-center gap-[var(--space-lg)] py-1 ${legend ? "w-full flex-wrap" : "shrink-0"}`}>
      <div className="relative shrink-0" style={{ width: `${size / 16}rem`, height: `${size / 16}rem` }}>
        <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-label="Donut chart">
          {segments.map((s) => (
            <circle
              key={s.label}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth={strokeWidth}
              strokeLinecap="butt"
              strokeDasharray={`${s.dash} ${s.gap}`}
              transform={`rotate(${s.rotate - 90} 50 50)`}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-lg font-bold leading-none text-[var(--text-heading)]">{total}</span>
          <span className="mt-0.5 text-[0.625rem] text-[var(--text-muted)]">{centerLabel}</span>
        </div>
      </div>
      {legend && (
        <ul className={`grid gap-x-4 gap-y-1.5 ${twoCol ? "grid-cols-2" : "grid-cols-1"}`}>
          {data.map((d) => (
            <li key={d.label} className="flex items-center gap-2 text-xs text-[var(--role-text)]">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
              <span className="truncate">{d.label}</span>
              <span className="font-semibold text-[var(--text-secondary)]">{d.value}</span>
              <span className="text-[0.625rem] text-[var(--text-muted)]">({Math.round((d.value / total) * 100)}%)</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
