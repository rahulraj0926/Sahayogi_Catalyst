'use client';
import { useEffect, useRef } from 'react';
import { useReducedMotion } from './motion';

/* Fixed positions, so the server and the browser draw the same sky. */
const STARS = Array.from({ length: 48 }, (_, i) => ({
  x: (i * 37 + 11) % 100, y: (i * 53 + 7) % 100, size: 1.5 + (i % 4) * 0.7,
  delay: (i % 9) * 0.55, dur: 3 + (i % 5), warm: i % 7 === 0, near: i % 3 === 0,
}));

/** A quiet night sky behind the pitch page: soft colour clouds and twinkling stars that drift a little as the pointer moves. */
export function PitchSky() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (reduced || !el) return;
    const move = (e: PointerEvent) => {
      el.style.setProperty('--sx', String(e.clientX / window.innerWidth - 0.5));
      el.style.setProperty('--sy', String(e.clientY / window.innerHeight - 0.5));
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, [reduced]);

  const drift = (depth: number) => ({ transform: `translate(calc(var(--sx, 0) * ${depth}px), calc(var(--sy, 0) * ${depth}px))` });
  const stars = (near: boolean) => STARS.filter((s) => s.near === near).map((s, k) => (
    <i key={k} className={`lp-star ${s.warm ? 'warm' : ''}`} style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size, ['--dl' as string]: `${s.delay}s`, ['--dur' as string]: `${s.dur}s` }} />
  ));

  return (
    <div ref={ref} className="lp-sky" aria-hidden>
      <div className="lp-sky-layer" style={drift(-12)}><div className="lp-aurora"><i className="lp-blob a" /><i className="lp-blob b" /><i className="lp-blob c" /></div></div>
      <div className="lp-sky-layer" style={drift(-8)}>{stars(false)}</div>
      <div className="lp-sky-layer" style={drift(-22)}>{stars(true)}</div>
    </div>
  );
}
