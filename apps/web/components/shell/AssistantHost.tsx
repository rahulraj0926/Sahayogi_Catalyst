'use client';
import { useRef, useState } from 'react';
import { api } from '@/lib/api';
import { AssistantRegion } from '@/components/assistant/AssistantRegion';
import { AssistantButton } from '@/components/assistant/AssistantButton';
import type { AssistantMode, ChatStatus, Conversation } from '@/components/assistant/types';

let seq = 0;
const uid = () => `m${Date.now()}-${seq++}`;

/** The assistant panel. Replies come from POST /api/assistant/chat, which answers only from the product's saved records. */
export function useAssistant(pid?: string) {
  const [mode, setMode] = useState<AssistantMode>('closed');
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [status, setStatus] = useState<ChatStatus>('idle');
  const launcher = useRef<HTMLButtonElement>(null);
  const active = convs.find((c) => c.id === activeId) || null;

  async function ask(text: string, convId: string | null) {
    const id = convId || uid();
    const userMsg = { id: uid(), role: 'user' as const, content: text };
    setConvs((cs) => convId ? cs.map((c) => c.id === id ? { ...c, messages: [...c.messages, userMsg] } : c) : [{ id, title: text.slice(0, 40), group: 'Today', messages: [userMsg] }, ...cs]);
    setActiveId(id); setStatus('pending');
    let reply = '';
    try {
      const r = await api<{ reply: string }>('/assistant/chat', { method: 'POST', body: { message: text }, product: pid });
      reply = r.reply;
      setStatus('idle');
    } catch (e: any) { reply = `I could not reach the server (${e?.message || 'error'}).`; setStatus('error'); }
    setConvs((cs) => cs.map((c) => c.id === id ? { ...c, messages: [...c.messages, { id: uid(), role: 'assistant', content: reply }] } : c));
  }
  const lastUser = () => [...(active?.messages || [])].reverse().find((m) => m.role === 'user')?.content;

  const region = (
    <AssistantRegion mode={mode} available conversations={convs} activeId={activeId} activeConversation={active} activeStatus={status}
      onSelect={setActiveId} onNewChat={() => setActiveId(null)} onSend={(t) => ask(t, activeId)} onRegenerate={() => { const t = lastUser(); if (t) ask(t, activeId); }}
      onExpand={() => setMode('fullscreen')} onCollapse={() => setMode('compact')} onClose={() => { setMode('closed'); launcher.current?.focus({ preventScroll: true }); }} />
  );
  const button = mode === 'closed' ? <AssistantButton buttonRef={launcher} onClick={() => setMode('compact')} /> : null;
  return { mode, region, button };
}
