'use client';
import { useRouter } from 'next/navigation';
import { Check, Code2, Cpu, Handshake, Lightbulb, Plus, Star, X } from 'lucide-react';
import { useState } from 'react';
import { Card } from '@/components/dashboard/Card';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { ErrorBox } from '@/components/ui';
import { Field, Modal, useAction } from '@/components/kit';
import { ideaApi, useIdeas, useMe } from './client';
import { HOME_COPY as C } from './copy';
import type { Idea } from './types';

type Dialog = { kind: 'accept' | 'reject'; idea: Idea } | null;

function AcceptForm({ idea, onDone, onClose }: { idea: Idea; onDone: (productSlug: string) => void; onClose: () => void }) {
  const [f, setF] = useState({ name: idea.one_liner.replace(/[.\s]+$/, '').slice(0, 60), owner: idea.requester, kind: idea.kind, mode: 'greenfield', depth_level: 'L2' });
  const act = useAction();
  const go = () => act.run(async () => { const r = await ideaApi.accept(idea.id, f); onDone(r.productSlug); });
  return (
    <Modal title="Make this idea a product" onClose={onClose}>
      <Field label="Product name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <div className="grid g2">
        <Field label="Owner"><input value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} /></Field>
        <Field label="Kind"><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Idea['kind'] })}><option value="software">Software</option><option value="hardware">Hardware</option><option value="service">Service</option></select></Field>
        <Field label="Starting point"><select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}><option value="greenfield">Built from scratch</option><option value="existing_system">Replaces an existing system</option></select></Field>
        <Field label="How thorough?"><select value={f.depth_level} onChange={(e) => setF({ ...f, depth_level: e.target.value })}><option value="L1">Light</option><option value="L2">Standard</option><option value="L3">Thorough</option></select></Field>
      </div>
      {act.box}
      <button className="btn primary" disabled={act.busy || f.name.trim().length < 2} onClick={go}>{act.busy ? 'Creating…' : 'Accept and start'}</button>
    </Modal>
  );
}

function RejectForm({ idea, onDone, onClose }: { idea: Idea; onDone: () => void; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const act = useAction();
  return (
    <Modal title="Reject this idea" onClose={onClose}>
      <p className="mb-2 text-sm">{idea.one_liner}</p>
      <Field label="Why? (the person who sent it will see this)"><textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></Field>
      {act.box}
      <button className="btn primary" disabled={act.busy || reason.trim().length < 3} onClick={() => act.run(async () => { await ideaApi.reject(idea.id, reason.trim()); onDone(); })}>{act.busy ? 'Saving…' : 'Reject idea'}</button>
    </Modal>
  );
}

const initials = (n: string) => n.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
const KIND_ICON = { software: Code2, hardware: Cpu, service: Handshake } as const;

export function IdeasPanel() {
  const ideas = useIdeas();
  const me = useMe();
  const router = useRouter();
  const act = useAction();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [line, setLine] = useState('');
  const canDecide = !!me.data?.canDecideIdeas;
  const add = () => act.run(async () => { await ideaApi.submit(line.trim()); setLine(''); ideas.reload(); });
  const list = ideas.data?.data ?? [];

  return (
    <Card title={`${C.ideasTitle}${ideas.data ? ` (${list.length})` : ''}`}>
      {act.box}
      <div className="mb-3 flex gap-2">
        <input className="h-9 min-w-0 flex-1 rounded-md border border-[var(--card-border)] bg-[var(--surface)] px-3 text-sm" placeholder="Add an idea in one line…" aria-label="New idea" maxLength={200} value={line} onChange={(e) => setLine(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && line.trim().length >= 3 && add()} />
        <button className="btn primary inline-flex items-center gap-1" disabled={act.busy || line.trim().length < 3} onClick={add}><Plus size={14} />Add</button>
      </div>
      {ideas.error && !ideas.data && <ErrorBox message={ideas.error} />}
      {ideas.data && list.length === 0 && <EmptyState title={C.ideasEmpty} />}
      <ul className="-mr-1 flex max-h-[26rem] flex-col gap-2 overflow-y-auto pr-1">
        {list.map((i) => {
          const Kind = KIND_ICON[i.kind] ?? Lightbulb;
          const short = i.status === 'shortlisted';
          return (
            <li key={i.id} className={`flex items-start gap-3 rounded-lg border p-2.5 ${short ? 'border-[var(--status-warning-fg)]/40 bg-[var(--status-warning-bg)]/30' : 'border-[var(--divider)]'}`}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--avatar-bg)] text-[11px] font-semibold text-[var(--avatar-text)]" title={i.requester}>{initials(i.requester)}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug text-[var(--text-heading)]">{i.one_liner}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--text-muted)]">
                  <span className="inline-flex items-center gap-1"><Kind size={12} />{i.kind}</span><span>{i.requester}</span><span>{i.created_on}</span>
                  {short && <span className="inline-flex items-center gap-1 font-medium text-[var(--status-warning-fg)]"><Star size={12} fill="currentColor" />Shortlisted</span>}
                </p>
              </div>
              {canDecide && (
                <span className="flex shrink-0 items-center gap-1">
                  <button className="inline-flex h-8 items-center gap-1 rounded-md bg-[var(--sd-accent)] px-2 text-xs font-semibold text-[var(--sd-accent-ink)]" onClick={() => setDialog({ kind: 'accept', idea: i })}><Check size={14} />Accept</button>
                  <button aria-label={short ? 'Remove from shortlist' : 'Shortlist'} title={short ? 'Remove from shortlist' : 'Shortlist'} className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-[var(--surface-muted)]" onClick={() => act.run(async () => { await ideaApi.shortlist(i.id, !short); ideas.reload(); })}><Star size={15} fill={short ? 'currentColor' : 'none'} /></button>
                  <button aria-label="Reject" title="Reject" className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-[var(--status-critical-bg)] hover:text-[var(--status-critical-fg)]" onClick={() => setDialog({ kind: 'reject', idea: i })}><X size={15} /></button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {!canDecide && list.length > 0 && <p className="mt-2 text-xs text-[var(--text-muted)]">Only the founder can accept or reject an idea.</p>}
      {dialog?.kind === 'accept' && <AcceptForm idea={dialog.idea} onClose={() => setDialog(null)} onDone={(pid) => { setDialog(null); router.push(`/products/${pid}/work`); }} />}
      {dialog?.kind === 'reject' && <RejectForm idea={dialog.idea} onClose={() => setDialog(null)} onDone={() => { setDialog(null); ideas.reload(); }} />}
    </Card>
  );
}
