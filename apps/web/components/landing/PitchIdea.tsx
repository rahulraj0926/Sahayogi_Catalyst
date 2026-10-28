'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Cpu, Handshake, Laptop, Lightbulb, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useState, type CSSProperties } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { actor, api, errorMessage, setActor } from '@/lib/api';
import type { Idea } from '@/features/home/types';
import { Brand } from './Brand';
import { Journey, type JourneyStep } from './Journey';
import { Burst, PitchOrb, PLANETS } from './PitchOrb';
import { PitchSky } from './PitchSky';
import { useReducedMotion, useTyping } from './motion';
import { MY_IDEA_KEY, WARP_KEY } from './public';
import { markSignedIn } from './signed-in';
import './landing.css';

const useBeforePaint = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const KINDS: [Idea['kind'], string, LucideIcon][] = [['software', 'Software', Laptop], ['hardware', 'Hardware', Cpu], ['service', 'Service', Handshake]];

const EXAMPLES = [
  'An assistant on WhatsApp that drafts replies to tax notices for small shops',
  'A booking app for neighbourhood clinics with text reminders',
  'A portal where dealers register warranty claims in minutes',
];
const REBUILD_EXAMPLES = [
  'Replace our old stock register with one that works on phones',
  'Move our paper service log into one shared system',
  'Rebuild the dealer portal so orders stop getting lost',
];

/** A short nudge under the box that changes as the sentence grows. */
const coach = (n: number) => (n === 0 ? 'Start with one sentence.' : n < 12 ? 'Keep going…' : n < 40 ? 'Nice. Who is it for?' : n < 81 ? 'Getting clear. What does it fix?' : 'That is a clear idea. Take it to Innovation when you are ready.');

/** Where an idea stands once it has gone to the CEO: pitched, innovation, the CEO's decision, their product. */
function Tracker({ idea, onAgain }: { idea: Idea; onAgain: () => void }) {
  const decided = idea.status === 'promoted' || idea.status === 'rejected';
  const steps: JourneyStep[] = [
    { label: 'Pitched', note: idea.created_on, state: 'done' },
    { label: 'Innovation', note: `${(idea.competitors ?? []).length} real rivals checked`, state: 'done' },
    { label: idea.status === 'rejected' ? 'Declined' : idea.status === 'shortlisted' ? 'Shortlisted by the CEO' : idea.status === 'promoted' ? 'Approved by the CEO' : 'Waiting for the CEO', note: idea.decided_by && decided ? `by ${idea.decided_by}` : '', state: decided ? 'done' : 'now', tone: idea.status === 'rejected' ? 'critical' : undefined },
    { label: 'Your product', note: idea.status === 'promoted' ? 'Ready' : '', state: idea.status === 'promoted' ? 'done' : 'next' },
  ];
  return (
    <div className="lp-rise rounded-2xl border border-[var(--divider)] bg-[var(--surface)] p-5 sm:p-6" style={{ boxShadow: 'var(--card-shadow)' }}>
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Your idea</p>
      <p className="mt-1 text-xl font-semibold leading-snug">{idea.one_liner}</p>
      <div className="mt-6"><Journey steps={steps} label="Where your idea stands" /></div>
      {idea.status === 'promoted' && idea.product_id && (
        <div className="relative mt-6 rounded-xl p-4" style={{ background: 'var(--status-healthy-bg)' }}>
          <Burst n={16} radius={90} />
          <p className="font-semibold" style={{ color: 'var(--status-healthy-fg)' }}>Approved. Your idea is now a product.</p>
          <Button asChild className="mt-3"><Link href={`/products/${idea.product_id}`} onClick={markSignedIn}>Open my product<ArrowRight size={16} /></Link></Button>
        </div>
      )}
      {idea.status === 'rejected' && (
        <div className="mt-6 rounded-xl p-4" style={{ background: 'var(--status-critical-bg)' }}>
          <p className="font-semibold" style={{ color: 'var(--status-critical-fg)' }}>The CEO declined this idea.</p>
          {idea.reject_reason && <p className="mt-1 text-sm" style={{ color: 'var(--status-critical-fg)' }}>Reason: {idea.reject_reason}</p>}
        </div>
      )}
      {!decided && <p className="mt-6 text-sm text-[var(--text-secondary)]">You can close this page. Open it again on this computer to see the decision.</p>}
      <button type="button" onClick={onAgain} className="mt-5 text-sm font-medium text-[var(--sd-accent)]" style={{ minHeight: 0, background: 'transparent', border: 0, padding: 0 }}>Pitch another idea</button>
    </div>
  );
}

/**
 * The page a new person lands on after "Pitch it". One sentence opens the rest of the form; a click takes the idea to Innovation,
 * where the problem and real rivals are added before the CEO sees anything.
 */
export function PitchIdea() {
  const router = useRouter();
  const params = useSearchParams();
  const reduced = useReducedMotion();
  const rebuild = params.get('rebuild') === '1';
  const [name, setName] = useState('');
  const [line, setLine] = useState(() => (params.get('idea') ?? '').slice(0, 200)); // the landing page's idea box passes its words along
  const [kind, setKind] = useState<Idea['kind']>('software');
  const [busy, setBusy] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mine, setMine] = useState<Idea | null>(null);
  const [ready, setReady] = useState(false);
  const [unveil, setUnveil] = useState(false);
  useEffect(() => { setName(actor()); }, []);
  useBeforePaint(() => { // arriving from the landing page's "Pitch it": the colour that filled the screen there fades away here
    try { if (sessionStorage.getItem(WARP_KEY)) { sessionStorage.removeItem(WARP_KEY); setUnveil(true); } } catch { /* storage blocked */ }
  }, []);

  const typed = useTyping(rebuild ? REBUILD_EXAMPLES : EXAMPLES, line === '');
  const len = line.trim().length;
  const lit = Math.min(PLANETS, Math.floor(len / 9));
  const open = len >= 3;

  const refresh = useCallback(async (id: string) => {
    try {
      const found = await api<Idea>(`/ideas/${encodeURIComponent(id)}`);
      if (found.status === 'innovation') { router.replace(`/ideas/${encodeURIComponent(found.id)}`); return; } // still being prepared: carry on there
      setMine(found);
    } catch (e) {
      if (typeof e === 'object' && e !== null && 'status' in e && (e as { status?: number }).status === 404) {
        setMine(null);
        try { localStorage.removeItem(MY_IDEA_KEY); } catch { /* storage blocked */ }
      } // any other failure: keep what is on screen; the next check tries again
    }
  }, [router]);
  useEffect(() => {
    let id: string | null = null;
    try { id = localStorage.getItem(MY_IDEA_KEY); } catch { /* storage blocked */ }
    if (!id) { setReady(true); return; }
    refresh(id).finally(() => setReady(true));
  }, [refresh]);
  useEffect(() => {
    if (!mine || mine.status === 'promoted' || mine.status === 'rejected') return;
    const t = setInterval(() => refresh(mine.id), 15000);
    return () => clearInterval(t);
  }, [mine, refresh]);

  const send = async () => {
    const n = name.trim(); const one = line.trim();
    if (n.length < 2) { setErr('Type your name first.'); return; }
    if (one.length < 3) { setErr('Write your idea in a few words.'); return; }
    setBusy(true); setErr(null);
    try {
      setActor(n);
      const idea = await api<Idea>('/ideas', { method: 'POST', body: { one_liner: one, kind, draft: true, ...(rebuild ? { text: 'This idea replaces a system that exists today.' } : {}) } });
      try { localStorage.setItem(MY_IDEA_KEY, idea.id); } catch { /* storage blocked */ }
      if (!reduced) { setLaunching(true); await new Promise((r) => setTimeout(r, 1000)); } // the idea lifts off before Innovation opens
      router.push(`/ideas/${encodeURIComponent(idea.id)}`);
    } catch (e) { setErr(errorMessage(e)); setBusy(false); setLaunching(false); }
  };

  const placeholder = rebuild ? 'For example: Replace our old stock register with one that works on phones' : 'For example: An assistant on WhatsApp that drafts replies to tax notices for small shops';
  const idle = line === '' && !reduced;

  return (
    <div className="workspace-root relative isolate min-h-dvh overflow-x-hidden bg-[var(--shell-bg)] text-[var(--text-heading)]">
      <PitchSky />
      {unveil && !reduced && <div className="lp-unveil" aria-hidden onAnimationEnd={() => setUnveil(false)} />}
      <header className="border-b border-[var(--divider)]">
        <div className="mx-auto flex h-[3.75rem] w-full max-w-[66rem] items-center justify-between gap-3 px-5">
          <Brand />
          <Link href="/welcome" className="text-sm text-[var(--text-secondary)] no-underline hover:text-[var(--text-heading)]">Back to Catalyst</Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[44rem] px-5 py-10 sm:py-14">
        {!ready ? <div className="h-48 animate-pulse rounded-2xl bg-[var(--surface-muted)]" /> : mine ? <Tracker idea={mine} onAgain={() => { setMine(null); try { localStorage.removeItem(MY_IDEA_KEY); } catch { /* storage blocked */ } }} /> : (
          <>
            <div className="lp-rise flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h1 className="flex items-center gap-3 text-[clamp(1.75rem,4vw,2.5rem)] font-bold tracking-tight"><Lightbulb size={30} style={{ color: 'var(--status-warning-fg)' }} />{rebuild ? 'Pitch a rebuild' : 'Pitch your idea'}</h1>
                <p className="mt-2 text-[var(--text-secondary)]">{rebuild ? 'Say which system you want to replace. ' : ''}One sentence is enough to start. Next you add the problem and real rivals.</p>
              </div>
              <PitchOrb lit={lit} launching={launching} />
            </div>
            <form onSubmit={(e) => { e.preventDefault(); send(); }} className={`lp-rise mt-6 rounded-2xl border border-[var(--divider)] bg-[var(--surface)] p-5 transition-opacity sm:p-6 ${open ? '' : 'lp-glow'} ${launching ? 'opacity-60' : ''}`} style={{ boxShadow: 'var(--card-shadow)', '--d': '.12s' } as CSSProperties}>
              <div className="grid gap-2">
                <Label htmlFor="pi-line">{rebuild ? 'What do you want to replace, and why?' : 'What is your idea?'}</Label>
                <div className="relative">
                  <textarea id="pi-line" rows={3} maxLength={200} value={line} onChange={(e) => setLine(e.target.value)} autoFocus
                    placeholder={idle ? '' : placeholder}
                    className="w-full resize-none rounded-md border border-[var(--divider)] bg-[var(--surface)] px-3 py-2 text-base outline-none focus:border-[var(--sd-accent)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--sd-accent)_18%,transparent)]" />
                  {idle && <span aria-hidden className="pointer-events-none absolute left-3 right-3 top-2 text-base text-[var(--text-muted)]">{typed}</span>}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p role="status" aria-live="polite" className="text-xs font-medium text-[var(--sd-accent)]">{coach(len)}</p>
                  <p className="text-xs text-[var(--text-muted)]">{line.length} of 200</p>
                </div>
              </div>
              {/* the rest of the form opens once there is a sentence */}
              <div className={`grid transition-[grid-template-rows,opacity] duration-500 ease-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`} inert={!open}>
                <div className="overflow-hidden">
                  <div className="grid gap-5 pt-5">
                    <div className="grid gap-2">
                      <span className="text-sm font-medium">What kind of product is it?</span>
                      <div role="group" aria-label="Kind of product" className="flex flex-wrap gap-2">
                        {KINDS.map(([v, l, Icon]) => (
                          <button key={`${v}-${kind === v}`} type="button" aria-pressed={kind === v} onClick={() => setKind(v)} className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-sm font-medium ${kind === v ? 'lp-pop border-[var(--sd-accent)] bg-[var(--sd-accent-soft)] text-[var(--sd-accent)]' : 'border-[var(--divider)] text-[var(--text-secondary)]'}`} style={{ minHeight: 0 }}><Icon size={15} />{l}</button>
                        ))}
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="pi-name">Your name</Label>
                      <Input id="pi-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
                    </div>
                    {err && <p role="alert" className="text-sm" style={{ color: 'var(--status-critical-fg)' }}>{err}</p>}
                    <Button type="submit" size="lg" className="lp-cta" disabled={busy || len < 3}>{busy ? (launching ? 'Launching…' : 'Starting…') : <>Take it to Innovation<ArrowRight size={16} /></>}</Button>
                  </div>
                </div>
              </div>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
