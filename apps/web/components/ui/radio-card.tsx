import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Card-style radio option — mirrors the reference's `.users-form-typecard`
 *  (icon + title + description, checkmark when active). Use in a group of
 *  RadioCards sharing the same `name`, each with its own `value`/`checked`. */
export function RadioCard({
  name,
  value,
  checked,
  onChange,
  icon,
  title,
  description,
  disabled = false,
  aside,
  className,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Shown but not selectable (e.g. an option that is "coming soon"). */
  disabled?: boolean;
  /** A small badge in the top-right corner, where the checkmark goes when selected. */
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "relative flex items-start gap-3 rounded-xl border border-input bg-background p-4 transition-colors",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        checked ? "border-primary ring-1 ring-primary" : !disabled && "hover:border-foreground/20",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="sr-only"
      />
      {aside && !checked && <span className="absolute right-3 top-3">{aside}</span>}
      {icon && (
        <span className={cn("mt-0.5 shrink-0", checked ? "text-primary" : "text-muted-foreground")}>{icon}</span>
      )}
      <span className={cn("min-w-0", aside && "pr-20")}>
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        {description && <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>}
      </span>
      {checked && (
        <span className="absolute right-3 top-3 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
      )}
    </label>
  );
}
