"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { EmptyState } from "./EmptyState";

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  className?: string;
};

/**
 * Setu's DataTable (sortable headers, paging, optional expandable rows, row
 * click), without its per-column filter menus: the dashboard declares no
 * `filterConfig` anywhere, so that half of Setu's component (six files of
 * filter UI) would be dead code here.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  pageSize = 8,
  renderExpanded,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  onRowClick,
  textClassName = "text-xs",
}: {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  pageSize?: number;
  renderExpanded?: (row: T) => ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: T) => void;
  textClassName?: string;
}) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const sortValue = columns.find((c) => c.key === sortKey)?.sortValue;
    if (!sortValue) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = sortValue(a);
      const bv = sortValue(b);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(clampedPage * pageSize, clampedPage * pageSize + pageSize);

  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  function toggleSort(column: Column<T>) {
    if (!column.sortValue) return;
    if (sortKey === column.key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(column.key);
      setSortDir("asc");
    }
  }

  return (
    <div className="overflow-hidden rounded-[var(--card-radius)] border border-[var(--card-border)] bg-[var(--surface)]">
      <div className="overflow-x-auto">
        <table className={`w-full min-w-[35rem] text-left ${textClassName}`}>
          <thead>
            <tr className="border-b border-[var(--divider)] bg-[var(--search-bg)]/70">
              {renderExpanded && <th className="w-8 px-2.5 py-1.5" />}
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`group px-2.5 py-1.5 font-semibold text-[var(--role-text)] ${column.className ?? ""}`}
                >
                  <span className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleSort(column)}
                      disabled={!column.sortValue}
                      className={`inline-flex items-center gap-1 ${column.sortValue ? "cursor-pointer" : "cursor-default"}`}
                    >
                      {column.header}
                      {sortKey === column.key && (
                        <span aria-hidden="true">{sortDir === "asc" ? "↑" : "↓"}</span>
                      )}
                    </button>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => {
              const key = getRowKey(row);
              const isExpanded = expanded === key;
              return (
                <Fragment key={key}>
                  <tr
                    onClick={() => {
                      if (renderExpanded) setExpanded(isExpanded ? null : key);
                      onRowClick?.(row);
                    }}
                    className={`border-b border-[var(--divider)] transition-colors last:border-b-0 ${
                      renderExpanded || onRowClick ? "tap-pop cursor-pointer hover:bg-[var(--search-bg)]" : ""
                    }`}
                  >
                    {renderExpanded && (
                      <td className="px-2.5 py-1.5 text-[var(--role-text)]">
                        <span
                          className={`inline-block transition-transform ${isExpanded ? "rotate-90" : ""}`}
                        >
                          &rsaquo;
                        </span>
                      </td>
                    )}
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={`px-2.5 py-1.5 text-[var(--text-secondary)] ${column.className ?? ""}`}
                      >
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                  {renderExpanded && isExpanded && (
                    <tr className="border-b border-[var(--divider)] bg-[var(--search-bg)]/60">
                      <td colSpan={columns.length + 1} className="px-6 py-3">
                        {renderExpanded(row)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <div className="flex items-center justify-between border-t border-[var(--divider)] px-2.5 py-1.5 text-xs text-[var(--role-text)]">
          <span>
            Page {clampedPage + 1} of {pageCount}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={clampedPage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="tap-pop rounded-md border border-[var(--divider)] px-2 py-1 transition-colors hover:bg-[var(--search-bg)] disabled:opacity-40 disabled:hover:bg-transparent"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={clampedPage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              className="tap-pop rounded-md border border-[var(--divider)] px-2 py-1 transition-colors hover:bg-[var(--search-bg)] disabled:opacity-40 disabled:hover:bg-transparent"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
