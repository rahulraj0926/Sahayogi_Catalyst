import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-[var(--space-sm)] rounded-xl border border-dashed border-[var(--card-border)] bg-[var(--surface)] px-6 py-16 text-center">
      {icon ?? <Inbox size={40} color="#D1D5DB" />}
      <div>
        <p className="text-sm font-semibold text-[var(--text-secondary)]">{title}</p>
        {description && (
          <p className="mt-1 max-w-sm text-sm text-[var(--role-text)]">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
