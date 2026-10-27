import * as React from "react"
import Link from "next/link"
import { ChevronRight, ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"

export interface BreadcrumbItem {
  label: string
  href?: string
  /** Shown in place of the label (for example a drop-down). */
  render?: React.ReactNode
}

export interface BreadcrumbsProps extends React.ComponentPropsWithoutRef<"nav"> {
  items: BreadcrumbItem[]
  backHref?: string
  onBackAction?: () => void
  /** Called before a breadcrumb link navigates; it may `preventDefault()` to
   *  hold the navigation (e.g. PageHeader's unsaved-changes guard). */
  onLinkClick?: (event: React.MouseEvent<HTMLAnchorElement>, href: string) => void
}

export function Breadcrumbs({ items, className, backHref, onBackAction, onLinkClick, ...props }: BreadcrumbsProps) {
  if ((!items || items.length === 0) && !backHref && !onBackAction) return null

  return (
    <nav
      aria-label="breadcrumb"
      className={cn("flex items-center text-sm text-[var(--text-muted)]", className)}
      {...props}
    >
      {onBackAction ? (
        <button
          onClick={onBackAction}
          type="button"
          className="mr-5 flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--divider)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-[var(--text-heading)] no-underline shadow-sm transition-colors hover:bg-[var(--search-bg)] hover:no-underline"
          aria-label="Go back"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back</span>
        </button>
      ) : backHref ? (
        <Link
          href={backHref}
          className="mr-5 flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--divider)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-[var(--text-heading)] no-underline shadow-sm transition-colors hover:bg-[var(--search-bg)] hover:no-underline"
          aria-label="Go back"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back</span>
        </Link>
      ) : null}
      {items && items.length > 0 && (
        <ol className="no-scrollbar flex min-w-0 items-center overflow-x-auto whitespace-nowrap">
          {items.map((item, index) => {
            const isLast = index === items.length - 1
            const href = item.href

            return (
              <li key={index} className={cn("flex items-center", isLast ? "min-w-0" : "shrink-0")}>
                {item.render ? (
                  item.render
                ) : isLast || !href ? (
                  <span
                    className={cn(
                      "truncate",
                      isLast ? "font-semibold text-[var(--text-heading)]" : "text-[var(--text-muted)]"
                    )}
                    aria-current={isLast ? "page" : undefined}
                  >
                    {item.label}
                  </span>
                ) : (
                  <Link
                    href={href}
                    className="truncate text-[var(--text-muted)] no-underline transition-colors hover:text-[var(--text-heading)] hover:no-underline"
                    onClick={onLinkClick ? (event) => onLinkClick(event, href) : undefined}
                  >
                    {item.label}
                  </Link>
                )}
                {!isLast && (
                  <ChevronRight aria-hidden className="mx-1.5 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] opacity-60" />
                )}
              </li>
            )
          })}
        </ol>
      )}
    </nav>
  )
}
