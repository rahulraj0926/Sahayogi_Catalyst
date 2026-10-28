'use client';
import Link from 'next/link';
import { ArrowRight, ChevronDown, Lightbulb } from 'lucide-react';
import { useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { ChatVsProof, CometArt, IdeaArt, PlanetArt, ProductArt, RebuildArt, RocketArt, StepPipeline } from './Art';
import { Brand } from './Brand';
import { HeroPitch } from './HeroPitch';
import { SignInDialog } from './SignInDialog';
import { STEPS } from './StepPanels';
import { TourStrip } from './TourStrip';
import facts from './facts.json';
import { CountUp, Reveal } from './motion';
import { clearIfSignedOut } from './signed-in';
import './landing.css';

const PITCH = 'Pitch your idea';

/** For now the landing page shows only the Pitch button. Set to false to bring the headline, pipeline and sections back (all of that code is still below). */
const ONLY_PITCH = false;

const PATHS: { title: string; line: string; cta: string; href: string; art: ReactNode }[] = [
  { title: 'I have an idea', line: 'Pitch it, then make the case.', cta: PITCH, href: '/ideas/new', art: <IdeaArt /> },
  { title: 'I am building a product', line: 'Sign in. Go straight to it.', cta: 'Sign in', href: '', art: <ProductArt /> },
  { title: 'I am rebuilding a system', line: 'Keep, fix or drop each part.', cta: 'Pitch a rebuild', href: '/ideas/new?rebuild=1', art: <RebuildArt /> },
];

/* Every number here is counted from the engine's own data; a test (landing-facts.test.ts) fails if one drifts. */
const STATS = [
  { n: STEPS.length, l: 'steps, idea to launch' },
  { n: facts.gateChecks, l: 'gate checks' },
  { n: facts.qualityGates, l: 'quality gates' },
  { n: facts.linkRules, l: 'link checks' },
];

const FAQ = [
  { q: 'Why not just ask a chat assistant?', a: 'A chat gives a draft. Catalyst keeps who approved it and which facts it rests on.' },
  { q: 'Who decides if my idea goes ahead?', a: 'The CEO. They approve it, ask for more, or decline it with a reason.' },
  { q: 'How much do I type?', a: 'One sentence to start. After that you review what the assistant proposes.' },
];

const TAPE = ['Competitor check', 'CEO checkpoint', 'Evidence with sources', 'Approvals by named people', 'Change tracking', 'Ten quality gates', 'Proof page', 'Hand-over to developers', 'Rebuilds of old systems'];

const wrap = 'mx-auto w-full max-w-[66rem] px-5';
const H2 = 'text-center text-[clamp(1.5rem,3vw,2.125rem)] font-bold tracking-tight';

function Eyebrow({ children }: { children: string }) {
  return <p className="mb-2 text-center text-xs font-semibold uppercase tracking-[0.14em] text-[var(--sd-accent)]">{children}</p>;
}

export function Landing() {
  const [signIn, setSignIn] = useState(false);
  useEffect(() => { clearIfSignedOut(); }, []);

  const spot = (e: ReactPointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
  };

  if (ONLY_PITCH) {
    return (
      <div className="workspace-root relative isolate flex min-h-dvh flex-col overflow-hidden bg-[var(--shell-bg)] text-[var(--text-heading)]">
        <div className="lp-aurora" aria-hidden><i className="lp-blob a" /><i className="lp-blob b" /><i className="lp-blob c" /></div>
        <div className="lp-dots" aria-hidden />
        <header className={`${wrap} flex h-[3.75rem] shrink-0 items-center justify-between gap-3`}>
          <Brand />
          <button type="button" onClick={() => setSignIn(true)} className="h-9 whitespace-nowrap rounded-md border border-[var(--divider)] px-4 text-sm font-medium text-[var(--text-heading)] hover:bg-[var(--surface-muted)]" style={{ minHeight: 0 }}>Sign in</button>
        </header>
        <main className="flex flex-1 items-center justify-center pb-24"><HeroPitch /></main>
        <SignInDialog open={signIn} onOpenChange={setSignIn} />
      </div>
    );
  }

  return (
    <div className="workspace-root min-h-dvh bg-[var(--shell-bg)] text-[var(--text-heading)]">
      <header className="sticky top-0 z-40 border-b border-[var(--divider)] bg-[var(--shell-bg)]/85 backdrop-blur">
        <div className={`${wrap} flex h-[3.75rem] items-center justify-between gap-3`}>
          <Brand />
          <nav aria-label="Page sections" className="hidden items-center gap-6 whitespace-nowrap text-sm text-[var(--text-secondary)] lg:flex">
            {[['#how', 'How it works'], ['#path', 'Choose your path'], ['#why', 'Why Catalyst'], ['#faq', 'Questions']].map(([href, label]) => (
              <a key={href} href={href} className="text-[var(--text-secondary)] no-underline hover:text-[var(--text-heading)]">{label}</a>
            ))}
          </nav>
          <button type="button" onClick={() => setSignIn(true)} className="h-9 whitespace-nowrap rounded-md border border-[var(--divider)] px-4 text-sm font-medium text-[var(--text-heading)] hover:bg-[var(--surface-muted)]" style={{ minHeight: 0 }}>Sign in</button>
        </div>
      </header>

      <main>
        <section className="relative isolate overflow-hidden" onPointerMove={spot}>
          <div className="lp-aurora" aria-hidden><i className="lp-blob a" /><i className="lp-blob b" /><i className="lp-blob c" /></div>
          <div className="lp-dots" aria-hidden />
          <div className="lp-spot" aria-hidden />
          <div className="pointer-events-none absolute inset-0 hidden lg:block" aria-hidden>
            <div className="lp-float absolute left-[5%] top-[16%]" style={{ '--d': '0s', '--r': '-6deg' } as CSSProperties}><PlanetArt /></div>
            <div className="lp-float absolute right-[6%] top-[20%]" style={{ '--d': '1.4s', '--r': '6deg' } as CSSProperties}><CometArt /></div>
          </div>
          <div className={`${wrap} relative pb-10 pt-14 text-center sm:pt-20`}>
            <h1 className="lp-rise text-[clamp(2.75rem,8vw,5.25rem)] font-bold leading-[1.02] tracking-tight">Sahayogi <span className="lp-name">Catalyst</span></h1>
            <p className="lp-rise mt-3 text-[clamp(1.25rem,2.6vw,1.75rem)] font-medium tracking-tight" style={{ '--d': '.1s' } as CSSProperties}>From idea to proof.</p>
            <p className="lp-rise mt-2 text-base text-[var(--text-secondary)]" style={{ '--d': '.18s' } as CSSProperties}>The assistant drafts. People decide.</p>
            <div className="lp-rise mt-9" style={{ '--d': '.28s' } as CSSProperties}><HeroPitch /></div>
            <div className="lp-rise mt-12 sm:mt-14" style={{ '--d': '.45s' } as CSSProperties}><StepPipeline /></div>
          </div>
        </section>

        <div className="lp-marquee relative overflow-hidden border-y border-[var(--divider)] bg-[var(--surface)] py-3" aria-hidden style={{ WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)', maskImage: 'linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)' }}>
          <div className="lp-marquee-track flex w-max">
            {[...TAPE, ...TAPE].map((t, i) => (
              <span key={i} className="inline-flex items-center gap-2 pr-10 text-sm text-[var(--text-secondary)]"><span className="h-1.5 w-1.5 rounded-full bg-[var(--sd-accent)]" />{t}</span>
            ))}
          </div>
        </div>

        <section id="how" className={`${wrap} scroll-mt-20 pb-14 pt-16`}>
          <Reveal><Eyebrow>How it works</Eyebrow><h2 className={H2}>Nine steps. One checkpoint each.</h2><p className="mb-8 mt-2 text-center text-sm text-[var(--text-muted)]">Sample screens from a made-up product. The check counts are real.</p></Reveal>
          <TourStrip />
        </section>

        <section className={`${wrap} pb-16`}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {STATS.map((s, k) => (
              <Reveal key={s.l} delay={k * 0.08}>
                <div className="rounded-2xl border border-[var(--divider)] bg-[var(--surface)] p-5 text-center">
                  <p className="lp-name text-[clamp(2.25rem,4.5vw,3.25rem)] font-bold leading-none tracking-tight"><CountUp to={s.n} /></p>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">{s.l}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section id="path" className={`${wrap} scroll-mt-20 pb-16`}>
          <Reveal><Eyebrow>Choose your path</Eyebrow><h2 className={H2}>Pick your way in</h2></Reveal>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {PATHS.map((p, k) => (
              <Reveal key={p.title} delay={k * 0.1} className="h-full">
                <div className="lp-card flex h-full flex-col rounded-2xl border border-[var(--divider)] bg-[var(--surface)] p-4" style={{ boxShadow: 'var(--card-shadow)' }}>
                  <div className="mb-4 h-36 overflow-hidden rounded-xl bg-[var(--surface-muted)]/60 p-2">{p.art}</div>
                  <h3 className="px-1 text-lg font-semibold">{p.title}</h3>
                  <p className="mt-1 px-1 text-sm text-[var(--text-secondary)]">{p.line}</p>
                  <div className="mt-auto px-1 pt-5">
                    {p.href
                      ? <Link href={p.href} className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--divider)] px-4 text-sm font-semibold text-[var(--text-heading)] no-underline hover:bg-[var(--surface-muted)]">{p.cta}<ArrowRight size={15} /></Link>
                      : <button type="button" onClick={() => setSignIn(true)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--divider)] px-4 text-sm font-semibold text-[var(--text-heading)] hover:bg-[var(--surface-muted)]" style={{ minHeight: 0 }}>{p.cta}<ArrowRight size={15} /></button>}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section id="why" className={`${wrap} scroll-mt-20 pb-16`}>
          <Reveal><Eyebrow>Why Catalyst</Eyebrow><h2 className={`${H2} mb-8`}>A chat gives a draft. Catalyst gives proof.</h2></Reveal>
          <Reveal delay={0.1}><ChatVsProof /></Reveal>
        </section>

        <section id="faq" className={`${wrap} scroll-mt-20 pb-16`}>
          <Reveal>
            <div className="mx-auto max-w-[40rem] divide-y divide-[var(--divider)] rounded-2xl border border-[var(--divider)] bg-[var(--surface)]">
              {FAQ.map((f) => (
                <details key={f.q} className="group px-5 py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-base font-medium"><span>{f.q}</span><ChevronDown size={18} className="shrink-0 text-[var(--text-muted)] transition-transform group-open:rotate-180" /></summary>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">{f.a}</p>
                </details>
              ))}
            </div>
          </Reveal>
        </section>

        <section className={`${wrap} pb-20`}>
          <Reveal>
            <div className="relative isolate overflow-hidden rounded-3xl bg-[var(--accent-solid)] px-6 py-14 text-center text-white">
              <i className="lp-blob a" aria-hidden style={{ width: '18rem', height: '18rem', left: '-4rem', top: '-7rem', opacity: 0.5 }} />
              <i className="lp-blob b" aria-hidden style={{ width: '16rem', height: '16rem', right: '-3rem', bottom: '-8rem', opacity: 0.5 }} />
              <div className="lp-float pointer-events-none absolute bottom-3 right-10 hidden md:block" aria-hidden style={{ '--d': '0.6s', '--r': '8deg' } as CSSProperties}><RocketArt /></div>
              <h2 className="relative text-[clamp(1.5rem,3.4vw,2.25rem)] font-bold tracking-tight">Have an idea? Pitch it.</h2>
              <div className="relative mt-6 flex flex-wrap justify-center gap-3">
                <Link href="/ideas/new" className="lp-cta inline-flex h-11 items-center gap-2 rounded-lg bg-white px-6 text-base font-semibold text-[#0B1B3B] no-underline hover:bg-white/90 hover:no-underline"><Lightbulb size={18} />{PITCH}</Link>
                <button type="button" onClick={() => setSignIn(true)} className="inline-flex h-11 items-center rounded-lg border border-white/35 px-5 text-base font-medium text-white hover:bg-white/10" style={{ minHeight: 0, background: 'transparent' }}>Sign in</button>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-[var(--divider)] py-6">
        <div className={`${wrap} flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--text-muted)]`}>
          <span>Sahayogi Catalyst</span>
          <span className="flex gap-5"><Link href="/ideas/new" className="text-[var(--text-muted)] no-underline hover:text-[var(--text-heading)]">{PITCH}</Link><button type="button" onClick={() => setSignIn(true)} className="hover:text-[var(--text-heading)]" style={{ minHeight: 0, background: 'transparent', border: 0, padding: 0 }}>Sign in</button></span>
        </div>
      </footer>

      <SignInDialog open={signIn} onOpenChange={setSignIn} />
    </div>
  );
}
