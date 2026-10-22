import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Compact radio option for a level/rank choice among a few values (e.g. an
 *  access level) — the reference's lighter "radio pill" treatment, distinct from
 *  RadioCard's bigger icon+description card used for a fundamental binary
 *  classification. Group a few RadioPills sharing the same `name`. */
export function RadioPillGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap gap-2", className)}>{children}</div>;
}

export function RadioPill({
  name,
  value,
  checked,
  onChange,
  label,
  className,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        checked ? "border-primary bg-primary text-primary-foreground" : "border-input text-muted-foreground hover:bg-accent",
        className,
      )}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="sr-only" />
      {label}
    </label>
  );
}
