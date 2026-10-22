"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { AIChatSidebar } from "./AIChatSidebar";
import { AIConversationPanel } from "./AIConversationPanel";
import type { AssistantMode, ChatStatus, Conversation } from "./types";

function getFlexBasis(mode: AssistantMode) {
  if (mode === "closed") return "0px";
  // Compact keeps this width whether or not its internal history pane is open —
  // history shares the docked box instead of growing it. Fullscreen ignores this
  // (flexGrow: 1 below).
  return "clamp(20rem,28vw,26rem)";
}

export function AssistantRegion({
  mode,
  available = true,
  conversations,
  activeId,
  activeConversation,
  activeStatus,
  onSelect,
  onNewChat,
  onSend,
  onRegenerate,
  onExpand,
  onCollapse,
  onClose,
}: {
  mode: AssistantMode;
  available?: boolean;
  conversations: Conversation[];
  activeId: string | null;
  activeConversation: Conversation | null;
  activeStatus: ChatStatus;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onSend: (text: string) => void;
  onRegenerate: () => void;
  onExpand: () => void;
  onCollapse: () => void;
  onClose: () => void;
}) {
  // Fullscreen sidebar open/collapsed — independent of compact history, never exits fullscreen.
  const [fullscreenHistoryCollapsed, setFullscreenHistoryCollapsed] = useState(false);
  // Compact (docked) history pane — shares the docked box's fixed width, closed by default.
  const [compactHistoryOpen, setCompactHistoryOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const historyRoot = useRef<HTMLDivElement>(null);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const isFullscreen = mode === "fullscreen";
  const isCompact = mode === "compact";

  // History is always closed the next time the assistant is reopened.
  useEffect(() => {
    if (mode === "closed") setCompactHistoryOpen(false);
  }, [mode]);

  // Escape closes the docked panel (fullscreen has its own Collapse / Close buttons).
  useEffect(() => {
    if (!isCompact) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {if(compactHistoryOpen){setCompactHistoryOpen(false);}else onClose();}
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isCompact, compactHistoryOpen, onClose]);

  function handleSelect(id: string) {
    onSelect(id);
    setMobileHistoryOpen(false);
    if (isCompact) setCompactHistoryOpen(false);
  }

  function handleNewChat() {
    onNewChat();
    setMobileHistoryOpen(false);
    if (isCompact) setCompactHistoryOpen(false);
  }

  function handleToggleCompactHistory() {
    setHistoryQuery("");
    setCompactHistoryOpen((v) => !v);
  }

  return (
    <div
      role="complementary"
      aria-label="Sahayogi assistant"
      data-assistant-mode={mode}
      aria-hidden={mode === "closed"}
      // Closed, the region is still mounted at zero width: inert keeps its controls out of the tab order.
      inert={mode === "closed" ? true : undefined}
      className={`flex h-full min-w-0 overflow-hidden transition-[flex-grow,flex-basis] duration-300 ease-out ${
        isCompact ? "fixed inset-0 z-50 screen-lg:relative screen-lg:inset-auto screen-lg:z-auto border-l border-[var(--divider)] shadow-[-0.5rem_0_1.5rem_rgba(15,23,42,0.06)]" : ""
      }`}
      style={{
        flexGrow: isFullscreen ? 1 : 0,
        flexBasis: getFlexBasis(mode),
        flexShrink: 0,
      }}
    >
      {isCompact && compactHistoryOpen && (
        <div ref={historyRoot} role="dialog" aria-label="Chat history" className="absolute right-2 top-12 z-[60] flex max-h-[calc(100%-4rem)] w-[min(320px,calc(100%-16px))] flex-col overflow-hidden rounded-[10px] border border-[var(--divider)] bg-[var(--surface)] text-[var(--text-heading)] shadow-xl">
          <div className="flex items-center justify-between px-2.5 py-2"><h2 className="text-[13px] font-semibold">Conversation history</h2><button type="button" aria-label="Close history" onClick={()=>setCompactHistoryOpen(false)} className="flex h-8 w-8 items-center justify-center"><X size={16} /></button></div>
          <label className="mx-2.5 mb-2 flex items-center gap-2 rounded-md border border-[var(--input-border)] p-2"><Search size={14} /><input autoFocus aria-label="Find conversation" value={historyQuery} onChange={event=>setHistoryQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-xs outline-none" /></label>
          <div className="min-h-0 overflow-y-auto px-2 pb-2">
            {conversations.filter(item=>item.title.toLocaleLowerCase().includes(historyQuery.toLocaleLowerCase())).map(item=><button type="button" key={item.id} aria-current={item.id===activeId ? "true" : undefined} onClick={()=>handleSelect(item.id)} className="block w-full rounded-md px-2.5 py-2 text-left text-sm hover:bg-[var(--search-bg)]">{item.title}</button>)}
            {!conversations.length && <p className="px-2.5 py-3 text-xs text-[var(--text-muted)]">No conversation history is available.</p>}
          </div>
        </div>
      )}

      {isFullscreen && (
        <div className="hidden h-full screen-lg:flex">
          <AIChatSidebar
            available={available}
            variant="rail"
            conversations={conversations}
            activeId={activeId}
            collapsed={fullscreenHistoryCollapsed}
            onToggleCollapse={() => setFullscreenHistoryCollapsed((v) => !v)}
            onSelect={handleSelect}
            onNewChat={handleNewChat}
          />
        </div>
      )}

      <AIConversationPanel
        variant={isFullscreen ? "workspace" : "docked"}
        conversation={activeConversation}
        active={mode !== "closed"}
        available={available}
        onPrimaryAction={isFullscreen ? onCollapse : onExpand}
        onToggleHistory={!isFullscreen ? handleToggleCompactHistory : undefined}
        historyOpen={compactHistoryOpen}
        onClose={onClose}
        onNewChat={onNewChat}
        onSend={onSend}
        onRegenerate={onRegenerate}
        status={activeStatus}
        onToggleMobileHistory={isFullscreen ? () => setMobileHistoryOpen(true) : undefined}
      />

      {isFullscreen && mobileHistoryOpen && (
        <div className="fixed inset-0 z-50 flex screen-lg:hidden">
          <div aria-hidden="true" onClick={() => setMobileHistoryOpen(false)} className="absolute inset-0 bg-black/30" />
          <div className="relative h-full w-[80%] max-w-[18rem] shadow-2xl">
            <AIChatSidebar
            available={available}
              variant="rail"
              conversations={conversations}
              activeId={activeId}
              collapsed={false}
              onToggleCollapse={() => setMobileHistoryOpen(false)}
              onSelect={handleSelect}
              onNewChat={handleNewChat}
            />
          </div>
        </div>
      )}
    </div>
  );
}
