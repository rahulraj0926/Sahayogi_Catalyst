"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Mic, Paperclip, Maximize2, Minimize2, X, PanelLeft, History, SquarePen, ArrowUp, AudioLines } from "lucide-react";
import type { ChatStatus, Conversation } from "./types";
import { LoadingDots } from "./LoadingDots";

export function AIConversationPanel({
  variant,
  conversation,
  status,
  active,
  available = true,
  onPrimaryAction,
  onToggleHistory,
  onNewChat,
  onClose,
  onSend,
  onRegenerate,
  onToggleMobileHistory,
}: {
  variant: "docked" | "workspace";
  conversation: Conversation | null;
  status: ChatStatus;
  /** The assistant is open: the message input takes focus when this turns true. */
  active: boolean;
  available?: boolean;
  onPrimaryAction: () => void;
  onToggleHistory?: () => void;
  onNewChat?: () => void;
  /** The history dropdown overlays the conversation without changing its geometry. */
  historyOpen?: boolean;
  onClose: () => void;
  onSend: (text: string) => void;
  onRegenerate: () => void;
  onToggleMobileHistory?: () => void;
}) {
  const [message, setMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const isWorkspace = variant === "workspace";
  const widthClass = isWorkspace ? "mx-auto w-full max-w-3xl" : "w-full";

  useEffect(() => {
    if (active && available) inputRef.current?.focus();
  }, [active,available]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [conversation?.messages.length, status]);

  function handleSend(text: string) {
    const trimmed = text.trim();
    if (!trimmed || !available) return;
    onSend(trimmed);
    setMessage("");
  }


  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--surface)]">
      {/* Header */}
      <div className="flex min-w-0 shrink-0 items-center justify-between gap-2 border-b border-[var(--divider)] px-3 py-2">
          <>
            <div className="flex min-w-0 flex-1 items-center gap-2"><Image src="/bot-icon.svg" alt="" width={24} height={32} className={`h-7 w-auto ${isWorkspace && !conversation ? "hidden" : ""}`} /><span className={`min-w-0 flex-1 truncate text-sm font-semibold ${isWorkspace && !conversation ? "invisible" : ""}`}>Sahayogi</span>
              {!isWorkspace && onToggleHistory && (
                <button
                  type="button"
                  title="Open chat history"
                  aria-label="Open chat history"
                  onClick={onToggleHistory}
                  className="tap-pop flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--search-bg)]"
                >
                  <History size={17} />
                </button>
              )}
              {isWorkspace && onToggleMobileHistory && (
                <button
                  type="button"
                  title="Chat history"
                  aria-label="Open chat history"
                  onClick={onToggleMobileHistory}
                  className="tap-pop flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--search-bg)] screen-lg:hidden"
                >
                  <PanelLeft size={16} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1">{onNewChat && <button type="button" title="New chat" aria-label="New chat" disabled={!available} onClick={onNewChat} className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] disabled:opacity-40"><SquarePen size={17} /></button>}
              <button
                type="button"
                title={isWorkspace ? "Collapse" : "Expand"}
                aria-label={isWorkspace ? "Collapse assistant" : "Expand assistant"}
                onClick={onPrimaryAction}
                className="tap-pop flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--search-bg)]"
              >
                {isWorkspace ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>

              <button
                type="button"
                title="Close"
                onClick={onClose}
                aria-label="Close assistant"
                className="tap-pop flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--search-bg)]"
              >
                <X size={16} />
              </button>
            </div>
          </>
      </div>

      {/* Body */}
      <div ref={scrollRef} className="flex flex-1 flex-col overflow-y-auto px-3">
        <div className={`flex flex-1 flex-col ${widthClass}`}>
          {!conversation ? (
            <div className={`flex flex-1 flex-col py-4 ${isWorkspace ? "items-center justify-center text-center" : "items-start justify-start"}`}>
              {isWorkspace && <Image src="/bot-icon.svg" alt="" width={72} height={96} className="mb-5 h-24 w-auto" priority />}
              <h2 className={`${isWorkspace ? "text-xl font-medium" : "text-sm font-semibold"} text-[var(--text-heading)]`}>How can I help?</h2>

              {<div className={`mt-4 grid w-full grid-cols-1 gap-2 min-[576px]:grid-cols-2 ${isWorkspace ? "max-w-[480px]" : ""}`}>{["Explain these numbers", "Review a document", "Help me investigate", "Summarise a conversation"].map(prompt=><button type="button" key={prompt} disabled={!available} onClick={()=>{setMessage(prompt);inputRef.current?.focus();}} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--card-border)] px-2.5 py-2.5 text-left text-[11px] text-[var(--text-secondary)] hover:bg-[var(--search-bg)] disabled:opacity-60"><span>{prompt}</span><span aria-hidden="true">↗</span></button>)}</div>}
              <p className="mt-3 text-[10px] text-[var(--text-muted)]">{available ? "Ask about your workspace." : "The assistant is not connected yet."}</p>
            </div>
          ) : (
            <div className="flex flex-1 flex-col gap-3 py-4">
              {conversation.messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-[0_1px_0.25rem_rgba(15,23,42,0.06)] ${
                      m.role === "user"
                        ? "bg-gradient-to-br from-[var(--assistant-action-from)] to-[var(--assistant-action-to)] text-white"
                        : "bg-[var(--surface)] text-[var(--text-heading)]"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}

              {status === "pending" && (
                <div className="flex justify-start">
                  <div className="rounded-2xl bg-[var(--surface)] px-3 py-1 shadow-[0_1px_0.25rem_rgba(15,23,42,0.06)]">
                    <LoadingDots />
                  </div>
                </div>
              )}

              {status === "error" && (
                <div className="flex justify-start">
                  <div className="flex max-w-[85%] flex-col items-start gap-2 rounded-2xl border border-[var(--status-critical-fg)]/20 bg-[var(--status-critical-bg)] px-4 py-2.5 text-sm text-[var(--status-critical-fg)]">
                    <span>Unable to generate a response.</span>
                    <button
                      type="button"
                      onClick={onRegenerate}
                      className="tap-pop rounded-full border border-[var(--status-critical-fg)]/30 px-3 py-1 text-xs font-medium text-[var(--status-critical-fg)] transition-colors hover:bg-[var(--status-critical-fg)]/10"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Composer geometry follows the approved shared shell; provider actions remain gated. */}
      <div className="shrink-0 border-t border-[var(--divider)] bg-[var(--surface)] px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className={`rounded-xl border border-[var(--input-border)] bg-[var(--surface)] p-2 ${widthClass}`}>
          <textarea ref={inputRef} rows={2} disabled={!available} value={message} onChange={event => setMessage(event.target.value)} onKeyDown={event => {if(event.key === "Enter" && !event.shiftKey && status !== "pending"){event.preventDefault();handleSend(message);}}} placeholder={available ? "Message Sahayogi…" : "Assistant unavailable"} aria-label="Message" className="block min-h-12 max-h-36 w-full resize-none bg-transparent px-1 text-base leading-6 text-[var(--text-heading)] outline-none placeholder:text-[var(--search-placeholder)]" />
          <div className="mt-1 flex items-center gap-1">
            <button type="button" aria-label="Attach a file" disabled title="File upload is not connected" className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] disabled:opacity-40"><Paperclip size={17} /></button>
            <button type="button" aria-label="Voice input" disabled title="Voice service is not connected" className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] disabled:opacity-40"><Mic size={17} /></button>
            {<button type="button" title="Regenerate response" aria-label="Regenerate response" onClick={onRegenerate} disabled={!available || status === "pending" || !conversation?.messages.length} className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] disabled:opacity-40"><AudioLines size={17} /></button>}
            <button type="button" title="Send" aria-label="Send message" onClick={() => handleSend(message)} disabled={!available || !message.trim() || status === "pending"} className="ml-auto flex h-[34px] w-[34px] items-center justify-center rounded-lg bg-[var(--accent-solid)] text-[var(--text-on-accent)] disabled:opacity-40"><ArrowUp size={18} /></button>
          </div>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-[var(--text-muted)]">AI can make mistakes. Check important information.</p>
      </div>
    </div>
  );
}
