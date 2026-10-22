import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

/** Setu's DrillLink: a link to the screen a figure drills into. With no
 *  `className` it is the small "label →" link; with one it is a bare styled
 *  Link (the "Modules at a Glance" tiles). */
export function DrillLink({
  href,
  params,
  children,
  className,
  style,
}: {
  href: string;
  params?: Record<string, string>;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const query = params ? `?${new URLSearchParams(params).toString()}` : "";
  return (
    <Link
      href={`${href}${query}`}
      style={style}
      className={
        className ??
        "tap-pop inline-flex items-center gap-1 text-xs font-medium text-[var(--icon-btn-navy)] transition-transform hover:underline hover:translate-x-0.5"
      }
    >
      {children}
      {!className && <span aria-hidden="true">&rarr;</span>}
    </Link>
  );
}
