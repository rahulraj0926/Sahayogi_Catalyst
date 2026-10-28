'use client';
import { Lightbulb } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useReducedMotion } from './motion';

/** One small planet for each of the nine steps. */
export const PLANETS = 9;
/* The planets turn from the accent colour to green as the steps rise, like the icons on the landing page. */
const hue = (i: number) => `color-mix(in srgb, var(--status-healthy-fg) ${Math.round((i / (PLANETS - 1)) * 100)}%, var(--sd-accent))`;

const RINGS = [{ r: 34, n: 4, turn: 0.4, cls: 'lp-orbit-a' }, { r: 51, n: 5, turn: 1.1, cls: 'lp-orbit-b' }];
let counted = 0;
const RING_PLANETS = RINGS.map(({ r, n, turn }) => Array.from({ length: n }, (_, j) => {
  const a = (j / n) * Math.PI * 2 + turn;
  return { i: counted++, x: 60 + Math.cos(a) * r, y: 60 + Math.sin(a) * r };
}));

/** A burst of small sparks from the middle of its parent. Nothing for people who asked for less motion. */
export function Burst({ n = 14, radius = 70 }: { n?: number; radius?: number }) {
  const reduced = useReducedMotion();
  if (reduced) return null;
  return (
    <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2">
      {Array.from({ length: n }, (_, k) => {
        const a = (k / n) * Math.PI * 2;
        const r = radius * (0.7 + (k % 3) * 0.15);
        return <span key={k} className="lp-spark absolute -ml-[3px] -mt-[3px] h-1.5 w-1.5 rounded-full" style={{ background: hue(k % PLANETS), '--dx': `${Math.cos(a) * r}px`, '--dy': `${Math.sin(a) * r}px` } as CSSProperties} />;
      })}
    </span>
  );
}

/**
 * A small glowing idea with nine planets around it, one per step. As the sentence grows the idea glows brighter and more planets light up;
 * when the idea is sent it lifts off in a burst of sparks.
 */
export function PitchOrb({ lit, launching }: { lit: number; launching: boolean }) {
  const reduced = useReducedMotion();
  const p = Math.min(1, lit / PLANETS);
  return (
    <div className={`relative h-28 w-28 shrink-0 sm:h-32 sm:w-32 ${launching && !reduced ? 'lp-lifting' : ''}`} aria-hidden>
      <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full">
        {RINGS.map((ring, k) => (
          <g key={ring.r} className={reduced ? undefined : ring.cls}>
            <circle cx={60} cy={60} r={ring.r} fill="none" strokeWidth={1} strokeDasharray="2 5" style={{ stroke: 'var(--divider)' }} />
            {RING_PLANETS[k].map((pl) => {
              const on = pl.i < lit;
              return <circle key={pl.i} cx={pl.x} cy={pl.y} r={on ? 4.6 : 3.4} strokeWidth={1} style={{ fill: on ? hue(pl.i) : 'var(--surface-muted)', stroke: on ? 'none' : 'var(--divider)', transition: 'fill .3s ease' }} />;
            })}
          </g>
        ))}
      </svg>
      <div className={`absolute inset-0 m-auto flex h-12 w-12 items-center justify-center rounded-full ${lit >= PLANETS && !reduced ? 'lp-orb-ready' : ''}`}
        style={{ background: 'var(--status-warning-bg)', color: 'var(--status-warning-fg)', boxShadow: `0 0 ${10 + p * 26}px color-mix(in srgb, var(--status-warning-fg) ${15 + p * 35}%, transparent)`, transition: 'box-shadow .4s ease' }}>
        <Lightbulb size={22} />
      </div>
      {launching && <Burst />}
    </div>
  );
}
