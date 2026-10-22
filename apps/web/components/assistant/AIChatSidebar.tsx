"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Plus, PanelLeftClose, PanelLeftOpen, MessageSquare } from "lucide-react";
import { CHAT_GROUP_ORDER } from "./constants";
import type { Conversation } from "./types";

type IconTooltip = { title: string; top: number; left: number; placement: "right" | "left" } | null;

export function AIChatSidebar({
  variant = "rail",
  open = true,
  available = true,
  conversations,
  activeId,
  collapsed,
  onToggleCollapse,
  onSelect,
  onNewChat,
}: {
  /** "rail": standalone collapsible sidebar (fullscreen). "embedded": fixed-proportion
   *  pane sharing the docked chatbot's own width (compact history) — no collapse state. */
  variant?: "rail" | "embedded";
  /** Embedded only: animates the pane's width in/out inward, chat reflows alongside it. */
  open?: boolean;
  available?: boolean;
  conversations: Conversation[];
  activeId: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelect: (id: string) => void;
  onNewChat: () => void;
}) {
  const isEmbedded = variant === "embedded";
  // Icon-only whenever there's no room for names: always for the embedded (compact)
  // pane, and for the fullscreen rail once it's collapsed. Rail expanded/open keeps
  // full names, unchanged.
  const iconOnly = isEmbedded || collapsed;
  const grouped = CHAT_GROUP_ORDER.map((group) => ({
    group,
    items: conversations.filter((c) => c.group === group),
  })).filter((g) => g.items.length > 0);

  // Icon-only rows render their hover/focus name through a fixed-position portal to
  // <body> so it escapes the rail's own overflow-hidden/overflow-auto clipping and
  // floats above the whole UI instead of being trapped inside the narrow panel.
  const [tooltip, setTooltip] = useState<IconTooltip>(null);

  function showTooltip(e: React.SyntheticEvent<HTMLButtonElement>, title: string) {
    const rect = e.currentTarget.getBoundingClientRect();
    const estimatedWidth = 220;
    const fitsRight = rect.right + 8 + estimatedWidth <= window.innerWidth;
    setTooltip({
      title,
      top: Math.min(Math.max(rect.top + rect.height / 2, 20), window.innerHeight - 20),
      left: fitsRight ? rect.right + 8 : rect.left - 8,
      placement: fitsRight ? "right" : "left",
    });
  }

  function hideTooltip() {
    setTooltip(null);
  }

  return (
    <aside
      aria-label="Chat history"
      aria-hidden={isEmbedded && !open}
      inert={isEmbedded && !open ? true : undefined}
      className={`flex h-full shrink-0 flex-col overflow-hidden border-r border-[var(--divider)] bg-[var(--assistant-sidebar-bg)] transition-[width] duration-300 ease-out ${
        isEmbedded ? (open ? "w-[48px]" : "w-0 border-r-0") : collapsed ? "w-[48px]" : "w-[200px]"
      }`}
    >
      <div
        className={`flex h-full flex-col transition-opacity duration-200 ease-out ${
          isEmbedded && !open ? "opacity-0" : "opacity-100"
        }`}
      >
        <div className={`flex flex-col gap-2 p-3 ${iconOnly ? "items-center" : "items-stretch"}`}>
          <div className={`flex items-center gap-2 ${iconOnly ? "justify-center" : "justify-between"}`}>
            {!iconOnly && (
              <button
                type="button"
                disabled={!available}
                onClick={onNewChat}
                title="New chat"
                aria-label="Start a new chat"
                className="tap-pop flex h-8 min-w-0 items-center gap-1.5 rounded-full border border-[var(--assistant-border)] bg-[var(--surface)] px-3.5 text-sm font-medium text-[var(--text-heading)] shadow-[0_1px_0.25rem_rgba(15,23,42,0.06)] transition-colors hover:bg-[var(--assistant-hover)]"
              >
                <Plus size={16} className="shrink-0" />
                <span className="truncate">New chat</span>
              </button>
            )}
            {!isEmbedded && (
              <button
                type="button"
                title={collapsed ? "Expand chat history" : "Collapse chat history"}
                aria-label={collapsed ? "Expand chat history" : "Collapse chat history"}
                onClick={onToggleCollapse}
                className="tap-pop flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--search-bg)]"
              >
                {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
              </button>
            )}
          </div>
          {iconOnly && (
            <button
              type="button"
              disabled={!available}
                onClick={onNewChat}
              title="New chat"
              aria-label="Start a new chat"
              className="tap-pop flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--search-bg)]"
            >
              <Plus size={16} />
            </button>
          )}
        </div>

        <nav className="mt-3 flex-1 overflow-y-auto px-2 pb-3">
          {!conversations.length && !iconOnly && <p className="px-2 text-xs text-[var(--text-muted)]">No conversation history is available.</p>}
          {iconOnly
            ? grouped.flatMap(({ items }) => items).map((c) => {
                const isActive = c.id === activeId;
                return (
                  <div key={c.id} className="mb-0.5 flex justify-center">
                    <button
                      type="button"
                      aria-label={c.title}
                      aria-current={isActive ? "true" : undefined}
                      onClick={() => onSelect(c.id)}
                      onMouseEnter={(e) => showTooltip(e, c.title)}
                      onMouseLeave={hideTooltip}
                      onFocus={(e) => showTooltip(e, c.title)}
                      onBlur={hideTooltip}
                      className={`tap-pop flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                        isActive
                          ? "bg-[var(--surface)] text-[var(--text-heading)] shadow-[0_1px_0.25rem_rgba(15,23,42,0.06)]"
                          : "text-[var(--text-secondary)] hover:bg-[var(--search-bg)]"
                      }`}
                    >
                      <MessageSquare size={15} />
                    </button>
                  </div>
                );
              })
            : grouped.map(({ group, items }) => (
                <div key={group} className="mb-3">
                  <p className="px-2 pb-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    {group}
                  </p>
                  <div className="flex flex-col gap-0.5">
                    {items.map((c) => {
                      const isActive = c.id === activeId;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          title={c.title}
                          aria-label={c.title}
                          aria-current={isActive ? "true" : undefined}
                          onClick={() => onSelect(c.id)}
                          className={`tap-pop flex items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors ${
                            isActive
                              ? "bg-[var(--surface)] font-medium text-[var(--text-heading)] shadow-[0_1px_0.25rem_rgba(15,23,42,0.06)]"
                              : "text-[var(--text-secondary)] hover:bg-[var(--search-bg)]"
                          }`}
                        >
                          <MessageSquare size={15} className="shrink-0" />
                          <span className="truncate">{c.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
        </nav>
      </div>

      {tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="tooltip"
            className="chat-icon-tooltip pointer-events-none fixed z-[1000] w-max max-w-[13rem] break-words rounded-md border border-[var(--divider)] bg-[var(--surface)] px-2 py-1 text-xs font-medium text-[var(--text-heading)] shadow-[0_0.25rem_0.75rem_rgba(15,23,42,0.15)]"
            style={{
              top: tooltip.top,
              left: tooltip.left,
              transform: tooltip.placement === "right" ? "translateY(-50%)" : "translate(-100%, -50%)",
            }}
          >
            {tooltip.title}
          </div>,
          document.body
        )}
    </aside>
  );
}
