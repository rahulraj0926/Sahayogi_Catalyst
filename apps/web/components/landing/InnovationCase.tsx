'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, ExternalLink, Loader2, Plus, Search, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { actor, api, errorMessage } from '@/lib/api';
import type { Idea, IdeaCompetitor } from '@/features/home/types';
import { Brand } from './Brand';
import { Journey } from './Journey';
import { PitchOrb } from './PitchOrb';
import { PitchSky } from './PitchSky';
import { useReducedMotion } from './motion';
import { MY_IDEA_KEY } from './public';
import './landing.css';

const FIELD = 'w-full rounded-md border border-[var(--divider)] bg-[var(--surface)] px-3 py-2 text-base outline-none focus:border-[var(--sd-accent)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--sd-accent)_18%,transparent)] disabled:opacity-60';
const CARD = 'rounded-2xl border border-[var(--divider)] bg-[var(--surface)] p-5 sm:p-6';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
const when = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); };
const isWeb = (url: string) => /^https?:\/\//i.test(url);
const notFound = (e: unknown) => typeof e === 'object' && e !== null && 'status' in e && (e as { status?: number }).status === 404;

function Rival({ c, onRemove }: { c: IdeaCompetitor; onRemove?: () => void }) {
  const ok = c.check.status === 'verified';
  return (
    <li className="lp-pop flex items-start gap-3 rounded-xl border border-[var(--divider)] p-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: ok ? 'var(--status-healthy-bg)' : 'var(--status-warning-bg)', color: ok ? 'var(--status-healthy-fg)' : 'var(--status-warning-fg)' }}>
        {ok ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 text-sm font-semibold">
          {c.name}
          {isWeb(c.website) && <a href={c.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-[var(--sd-accent)] no-underline">{host(c.website)}<ExternalLink size={11} /></a>}
        </p>
        {c.note && <p className="text-sm text-[var(--text-secondary)]">{c.note}</p>}
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          {ok ? 'Website opened and verified' : 'Website answered but blocks automatic checks'} on {when(c.check.checked_at)}
          {c.check.title && <span className="block truncate">Page title: {c.check.title}</span>}
        </p>
        {c.demo_url && isWeb(c.demo_url) && <a href={c.demo_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[var(--sd-accent)] no-underline">Demo or tour<ExternalLink size={11} /></a>}
      </div>
      {onRemove && <button type="button" aria-label={`Remove ${c.name}`} onClick={onRemove} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-heading)]" style={{ minHeight: 0 }}><X size={14} /></button>}
    </li>
  );
}

/**
 * The Innovation step of one idea. The person who pitched it says what problem it solves and who it is for, adds real rivals
 * (the server opens every website before it is saved), and only then sends the idea to the CEO. Nothing here is made up for them.
 */
export function InnovationCase({ id }: { id: string }) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [idea, setIdea] = useState<Idea | null>(null);
  const [load, setLoad] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [who, setWho] = useState('');
  const [problem, setProblem] = useState('');
  const [whoFor, setWhoFor] = useState('');
  const [demo, setDemo] = useState('');
  const [lastSent, setLastSent] = useState({ problem: '', who_for: '', demo_url: '' });
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [rName, setRName] = useState('');
  const [rSite, setRSite] = useState('');
  const [rNote, setRNote] = useState('');
  const [rDemo, setRDemo] = useState('');
  const [checking, setChecking] = useState(false);
  const [rivalErr, setRivalErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);

  useEffect(() => { setWho(actor()); }, []);

  const fetchIdea = useCallback(async () => {
    try {
      const i = await api<Idea>(`/ideas/${encodeURIComponent(id)}`);
      setIdea(i);
      return i;
    } catch (e) { setLoad(notFound(e) ? 'missing' : 'error'); return null; }
  }, [id]);

  useEffect(() => {
    fetchIdea().then((i) => {
      if (!i) return;
      if (i.status !== 'innovation') { // already with the CEO: show where it stands
        try { localStorage.setItem(MY_IDEA_KEY, i.id); } catch { /* storage blocked */ }
        router.replace('/ideas/new');
        return;
      }
      setProblem(i.problem ?? ''); setWhoFor(i.who_for ?? ''); setDemo(i.demo_url ?? '');
      setLastSent({ problem: i.problem ?? '', who_for: i.who_for ?? '', demo_url: i.demo_url ?? '' });
      setLoad('ready');
    });
  }, [fetchIdea, router]);

  const mine = !!idea && who.trim().toLowerCase() === idea.requester.trim().toLowerCase();
  const editable = mine && idea?.status === 'innovation';
  const now = { problem: problem.trim(), who_for: whoFor.trim(), demo_url: demo.trim() };
  const dirty = now.problem !== lastSent.problem || now.who_for !== lastSent.who_for || now.demo_url !== lastSent.demo_url;

  const persist = useCallback(async () => {
    const values = { problem: problem.trim(), who_for: whoFor.trim(), demo_url: demo.trim() };
    setSaving('saving'); setSaveErr(null);
    try {
      const updated = await api<Idea>(`/ideas/${encodeURIComponent(id)}/innovation`, { method: 'PATCH', body: { problem: values.problem, who_for: values.who_for, demo_url: values.demo_url || null } });
      setIdea(updated); setLastSent(values); setSaving('saved');
    } catch (e) { setSaveErr(errorMessage(e)); setSaving('idle'); throw e; }
  }, [id, problem, whoFor, demo]);

  useEffect(() => {
    if (!editable || !dirty) return;
    const t = setTimeout(() => { persist().catch(() => { /* the message is on screen; typing again retries */ }); }, 900);
    return () => clearTimeout(t);
  }, [editable, dirty, persist]);

  const addRival = async (e: FormEvent) => {
    e.preventDefault();
    if (checking) return;
    setChecking(true); setRivalErr(null);
    try {
      await api<IdeaCompetitor>(`/ideas/${encodeURIComponent(id)}/competitors`, { method: 'POST', body: { name: rName.trim(), website: rSite.trim(), ...(rNote.trim() ? { note: rNote.trim() } : {}), ...(rDemo.trim() ? { demo_url: rDemo.trim() } : {}) } });
      setRName(''); setRSite(''); setRNote(''); setRDemo('');
      await fetchIdea();
    } catch (err) { setRivalErr(errorMessage(err)); } finally { setChecking(false); }
  };

  const removeRival = async (cid: string) => {
    try { setIdea(await api<Idea>(`/ideas/${encodeURIComponent(id)}/competitors/${encodeURIComponent(cid)}`, { method: 'DELETE' })); } catch (err) { setRivalErr(errorMessage(err)); }
  };

  const send = async () => {
    setSending(true); setSendErr(null);
    try {
      if (dirty) await persist();
      await api<Idea>(`/ideas/${encodeURIComponent(id)}/send`, { method: 'POST' });
      try { localStorage.setItem(MY_IDEA_KEY, id); } catch { /* storage blocked */ }
      if (!reduced) { setLaunching(true); await sleep(1000); } // the idea lifts off before the tracker appears
      router.push('/ideas/new');
    } catch (err) { setSendErr(errorMessage(err)); setSending(false); setLaunching(false); }
  };

  const door = idea?.door ?? null;
  const rivals = idea?.competitors ?? [];
  const have = door?.competitors.have ?? rivals.length;
  const need = door?.competitors.need ?? 3;
  const lit = (door?.problem ? 3 : 0) + (door?.who_for ? 3 : 0) + Math.min(3, have);
  const missing = [!door?.problem && 'the problem', !door?.who_for && 'who it is for', have < need && `${need - have} more real ${need - have === 1 ? 'rival' : 'rivals'}`].filter(Boolean) as string[];
  const rise = (d: number) => ({ '--d': `${d}s` }) as CSSProperties;

  return (
    <div className="workspace-root relative isolate min-h-dvh overflow-x-hidden bg-[var(--shell-bg)] text-[var(--text-heading)]">
      <PitchSky />
      <header className="border-b border-[var(--divider)]">
        <div className="mx-auto flex h-[3.75rem] w-full max-w-[66rem] items-center justify-between gap-3 px-5">
          <Brand />
          <Link href="/welcome" className="text-sm text-[var(--text-secondary)] no-underline hover:text-[var(--text-heading)]">Back to Catalyst</Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[46rem] px-5 py-10 sm:py-12">
        {load === 'loading' && <div className="h-64 animate-pulse rounded-2xl bg-[var(--surface-muted)]" />}
        {load === 'missing' && (
          <div className={`${CARD} lp-rise`}>
            <h1 className="text-2xl font-bold tracking-tight">We could not find this idea</h1>
            <p className="mt-2 text-[var(--text-secondary)]">The link may be old. You can pitch it again.</p>
            <Button asChild className="mt-4"><Link href="/ideas/new">Pitch your idea<ArrowRight size={16} /></Link></Button>
          </div>
        )}
        {load === 'error' && <div className={CARD}><p>Something went wrong while opening this idea. Try again in a moment.</p><Button className="mt-3" onClick={() => { setLoad('loading'); fetchIdea().then((i) => setLoad(i ? 'ready' : 'error')); }}>Try again</Button></div>}

        {load === 'ready' && idea && (
          <>
            <div className="lp-rise flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--sd-accent)]">Step 1 · Idea</p>
                <h1 className="mt-1 text-[clamp(1.75rem,4vw,2.5rem)] font-bold tracking-tight">Innovation</h1>
                <p className="mt-2 text-[var(--text-secondary)]">Make the case before the CEO sees it. Everything here is real.</p>
              </div>
              <PitchOrb lit={lit} launching={launching} />
            </div>

            <div className={`${CARD} lp-rise mt-6`} style={{ boxShadow: 'var(--card-shadow)', ...rise(0.08) }}>
              <Journey label="Where your idea stands" steps={[{ label: 'Pitched', note: idea.created_on, state: 'done' }, { label: 'Innovation', note: 'You are here', state: 'now' }, { label: 'CEO decision', state: 'next' }, { label: 'Your product', state: 'next' }]} />
              <p className="mt-5 border-t border-[var(--divider)] pt-4 text-lg font-semibold leading-snug">{idea.one_liner}</p>
            </div>

            {!mine && <p className="mt-4 rounded-xl p-3 text-sm" style={{ background: 'var(--status-warning-bg)', color: 'var(--status-warning-fg)' }}>Only {idea.requester} can change this case.</p>}

            <section className={`${CARD} lp-rise mt-5 grid gap-4`} style={{ boxShadow: 'var(--card-shadow)', ...rise(0.16) }} aria-labelledby="in-problem">
              <h2 id="in-problem" className="text-base font-semibold">The problem</h2>
              <div className="grid gap-2">
                <Label htmlFor="in-prob">What goes wrong today, and for whom?</Label>
                <textarea id="in-prob" rows={3} maxLength={600} value={problem} disabled={!editable} onChange={(e) => setProblem(e.target.value)} className={`${FIELD} resize-y`} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="in-who">Who is it for?</Label>
                <Input id="in-who" maxLength={200} value={whoFor} disabled={!editable} onChange={(e) => setWhoFor(e.target.value)} />
              </div>
              <p role="status" aria-live="polite" className="min-h-4 text-xs text-[var(--text-muted)]">{saveErr ? <span style={{ color: 'var(--status-critical-fg)' }}>{saveErr}</span> : dirty ? 'Saving…' : saving === 'saved' ? 'Saved' : ''}</p>
            </section>

            <section className={`${CARD} lp-rise mt-5`} style={{ boxShadow: 'var(--card-shadow)', ...rise(0.24) }} aria-labelledby="in-rivals">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="in-rivals" className="text-base font-semibold">Real rivals</h2>
                <span className="inline-flex items-center gap-1.5 text-sm font-medium" aria-label={`${have} of ${need} rivals added`}>
                  {Array.from({ length: need }, (_, k) => <span key={k} className="h-2.5 w-2.5 rounded-full transition-colors" style={{ background: k < have ? 'var(--status-healthy-fg)' : 'var(--divider)' }} />)}
                  <span className="ml-1 text-[var(--text-secondary)]">{have} of {need}</span>
                </span>
              </div>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">Add at least {need} products people use today for the same job. We open each website to check that it is real.</p>
              <a href={`https://www.google.com/search?q=${encodeURIComponent(`${idea.one_liner} alternatives`)}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--sd-accent)] no-underline"><Search size={14} />Look for rivals on the web</a>

              {rivals.length > 0 && <ul className="mt-4 grid gap-2" aria-label="Rivals added">{rivals.map((c) => <Rival key={c.id} c={c} onRemove={editable ? () => removeRival(c.id) : undefined} />)}</ul>}

              {editable && (
                <form onSubmit={addRival} className={`relative mt-4 grid gap-3 overflow-hidden rounded-xl border border-dashed border-[var(--divider)] p-4 ${checking ? 'lp-scan' : ''}`}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-1.5"><Label htmlFor="rv-name">Product name</Label><Input id="rv-name" maxLength={80} value={rName} onChange={(e) => setRName(e.target.value)} disabled={checking} /></div>
                    <div className="grid gap-1.5"><Label htmlFor="rv-site">Website</Label><Input id="rv-site" inputMode="url" placeholder="https://" maxLength={300} value={rSite} onChange={(e) => setRSite(e.target.value)} disabled={checking} /></div>
                  </div>
                  <div className="grid gap-1.5"><Label htmlFor="rv-note">What it does <span className="font-normal text-[var(--text-muted)]">Optional</span></Label><Input id="rv-note" maxLength={200} value={rNote} onChange={(e) => setRNote(e.target.value)} disabled={checking} /></div>
                  <div className="grid gap-1.5"><Label htmlFor="rv-demo">Demo or tour link <span className="font-normal text-[var(--text-muted)]">Optional</span></Label><Input id="rv-demo" inputMode="url" maxLength={300} value={rDemo} onChange={(e) => setRDemo(e.target.value)} disabled={checking} /></div>
                  {rivalErr && <p role="alert" className="text-sm" style={{ color: 'var(--status-critical-fg)' }}>{rivalErr}</p>}
                  <div className="flex items-center gap-3">
                    <Button type="submit" variant="outline" disabled={checking || rName.trim().length < 2 || rSite.trim().length < 4}>{checking ? <><Loader2 size={15} className="animate-spin" />Opening the website…</> : <><Plus size={15} />Check and add</>}</Button>
                    {checking && <span className="text-xs text-[var(--text-muted)]">This can take a few seconds.</span>}
                  </div>
                </form>
              )}
            </section>

            <section className={`${CARD} lp-rise mt-5 grid gap-2`} style={{ boxShadow: 'var(--card-shadow)', ...rise(0.32) }}>
              <Label htmlFor="in-demo" className="text-base font-semibold">Your own demo or sketch <span className="text-sm font-normal text-[var(--text-muted)]">Optional</span></Label>
              <p className="text-sm text-[var(--text-secondary)]">A link to a prototype, a video or a drawing that shows your idea.</p>
              <Input id="in-demo" inputMode="url" placeholder="https://" maxLength={300} value={demo} disabled={!editable} onChange={(e) => setDemo(e.target.value)} />
            </section>

            {editable && (
              <div className={`${CARD} lp-rise mt-5`} style={{ boxShadow: 'var(--card-shadow)', ...rise(0.4) }}>
                <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="What is still needed">
                  {[['The problem', !!door?.problem], ['Who it is for', !!door?.who_for], [`${need} real rivals`, have >= need]].map(([t, done]) => (
                    <li key={t as string} className="flex items-center gap-1.5" style={{ color: done ? 'var(--status-healthy-fg)' : 'var(--text-muted)' }}><span className="h-2 w-2 rounded-full" style={{ background: 'currentColor', opacity: done ? 1 : 0.35 }} />{t as string}</li>
                  ))}
                </ul>
                {sendErr && <p role="alert" className="mt-3 text-sm" style={{ color: 'var(--status-critical-fg)' }}>{sendErr}</p>}
                <Button size="lg" className="lp-cta mt-4 w-full" onClick={send} disabled={sending || dirty || !door?.ready}>{sending ? (launching ? 'Launching…' : 'Sending…') : 'Send to the CEO'}<ArrowRight size={16} /></Button>
                {!door?.ready && !dirty && missing.length > 0 && <p className="mt-2 text-center text-xs text-[var(--text-muted)]">Still needed: {missing.join(', ')}.</p>}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
