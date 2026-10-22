"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type TrendSeries = { key: string; label: string; color: string; data: number[] };

function TrendTooltip({
  active,
  payload,
  label,
  series,
  formatValue,
}: {
  active?: boolean;
  payload?: { dataKey: string; value: number }[];
  label?: string;
  series: TrendSeries[];
  formatValue: (n: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[8rem] rounded-lg border border-[var(--divider)] bg-[var(--surface)] p-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-[var(--text-heading)]">{label}</p>
      {series.map((s) => {
        const entry = payload.find((p) => p.dataKey === s.key);
        if (!entry) return null;
        return (
          <p key={s.key} className="flex items-center justify-between gap-3 text-[var(--role-text)]">
            <span className="flex items-center gap-1.5">
              <span className="h-[2px] w-3 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
            <span className="font-semibold text-[var(--text-secondary)]">{formatValue(entry.value)}</span>
          </p>
        );
      })}
    </div>
  );
}

export function AreaTrendChart({
  series,
  xLabels,
  heightClassName = "h-[clamp(9rem,24vh,15rem)]",
  className = "",
  formatValue = String,
}: {
  series: TrendSeries[];
  xLabels: string[];
  /** Override the plot area's responsive height (defaults to the standard clamp). */
  heightClassName?: string;
  /** Extra classes on the outer wrapper (e.g. "flex-1 min-h-0" to grow inside a flex card). */
  className?: string;
  /** Formats a value in the hover tooltip (e.g. currency). Defaults to the raw number. */
  formatValue?: (n: number) => string;
}) {
  const chartData = useMemo(
    () =>
      xLabels.map((label, i) => {
        const row: Record<string, string | number> = { label };
        series.forEach((s) => {
          row[s.key] = s.data[i] ?? 0;
        });
        return row;
      }),
    [xLabels, series],
  );

  // Show roughly 6 x-axis labels: first, last, and evenly spaced in between.
  const n = xLabels.length;
  const xTickIndexes = useMemo(() => {
    const count = Math.min(6, n);
    if (count <= 1) return [0];
    return Array.from({ length: count }, (_, i) => Math.round((i / (count - 1)) * (n - 1)));
  }, [n]);

  return (
    <div className={`flex flex-col gap-[var(--space-sm)] ${className}`}>
      <div className={`w-full ${heightClassName}`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              {series.map((s) => (
                <linearGradient key={s.key} id={`areaTrendGradient-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" vertical={false} />
            <XAxis
              dataKey="label"
              ticks={xTickIndexes.map((i) => xLabels[i] ?? "")}
              tick={{ fontSize: 10, fill: "var(--text-muted)" }}
              axisLine={{ stroke: "var(--divider)" }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--text-muted)" }}
              axisLine={false}
              tickLine={false}
              width={28}
              allowDecimals={false}
            />
            <Tooltip content={<TrendTooltip series={series} formatValue={formatValue} />} cursor={{ stroke: "var(--divider)" }} />
            {series.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                fill={`url(#areaTrendGradient-${s.key})`}
                dot={false}
                activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-xs text-[var(--role-text)]">
            <span className="h-[2px] w-3 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
