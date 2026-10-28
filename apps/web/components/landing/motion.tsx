'use client';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/** True when the person asked their device for less motion. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(m.matches);
    const on = () => setReduced(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** Types the example sentences one after another while `active` and returns what is typed so far. Holds still when motion is reduced. `examples` must not change between renders. */
export function useTyping(examples: string[], active: boolean) {
  const reduced = useReducedMotion();
  const [typed, setTyped] = useState(examples[0] ?? '');
  useEffect(() => {
    if (reduced || !active) { setTyped(examples[0] ?? ''); return; }
    let dead = false;
    let timer: ReturnType<typeof setTimeout>;
    let ex = 0; let ch = 0; let rest = false;
    setTyped('');
    const tick = () => {
      if (dead) return;
      if (rest) { ex = (ex + 1) % examples.length; ch = 0; rest = false; setTyped(''); timer = setTimeout(tick, 400); return; }
      ch++; setTyped(examples[ex].slice(0, ch));
      if (ch >= examples[ex].length) { rest = true; timer = setTimeout(tick, 2200); } else timer = setTimeout(tick, 26 + Math.random() * 36);
    };
    timer = setTimeout(tick, 600);
    return () => { dead = true; clearTimeout(timer); };
  }, [active, reduced, examples]);
  return typed;
}

/** True once the element has come into view (and stays true). */
export function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, seen] as const;
}

/** Fades and lifts its content in when it scrolls into view. `delay` (seconds) staggers neighbours. */
export function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  return <div ref={ref} className={`lp-reveal ${seen ? 'lp-in' : ''} ${className}`} style={{ '--d': `${delay}s` } as CSSProperties}>{children}</div>;
}

/** A number that counts up to `to` when it scrolls into view. Screen readers get the final number at once. */
export function CountUp({ to, ms = 1400 }: { to: number; ms?: number }) {
  const [ref, seen] = useInView<HTMLSpanElement>();
  const reduced = useReducedMotion();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!seen) return;
    if (reduced) { setN(to); return; }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [seen, reduced, to, ms]);
  return <span ref={ref} className="tabular-nums"><span className="sr-only">{to}</span><span aria-hidden>{seen || reduced ? n : 0}</span></span>;
}
