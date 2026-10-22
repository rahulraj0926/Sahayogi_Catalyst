import type { ReactNode } from "react";

export function Card({
  title,
  description,
  action,
  children,
  className,
  interactive,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <section
      className={`flex h-full min-w-0 flex-col rounded-[var(--card-radius)] border border-[var(--card-border)] bg-[var(--surface)] p-[var(--card-pad)] ${
        interactive ? "card-interactive" : ""
      } ${className ?? ""}`}
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      {(title || action) && (
        <div className="mb-[var(--space-sm)] flex items-start justify-between gap-2">
          <div>
            {title && <h2 className="text-[length:var(--font-card-title)] font-semibold text-[var(--text-heading)]">{title}</h2>}
            {description && <p className="mt-1 text-[length:var(--font-body)] text-[var(--text-muted)]">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {/* No overflow-hidden here: it used to clip the top of any hovered
          .card-interactive child (translateY + a larger box-shadow both
          cross this wrapper's edge) — children that truly need clipping
          (e.g. DataTable's horizontal scroll) already manage their own
          overflow container. */}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}
