'use client';
import { type LucideIcon, BadgeCheck, FileSearch, Flag, FlaskConical, Hammer, LayoutTemplate, Lightbulb, ListChecks, MessageSquare, Radar, Rocket, ShieldCheck, Sprout, Target } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useReducedMotion } from './motion';

/* Everything here is drawn for this page: flat shapes in the theme's own colours, so it follows light and dark. */

const fill = (v: string, extra?: CSSProperties): CSSProperties => ({ fill: `var(${v})`, ...extra });
const stroke = (v: string): CSSProperties => ({ stroke: `var(${v})` });
const idx = (i: number) => ({ '--i': i }) as CSSProperties;

/* ---------- the pipeline: nine steps stacked upward, joined by one dotted line ---------- */

const STEPS_ART: { Icon: LucideIcon; label: string; carries: string }[] = [
  { Icon: Lightbulb, label: 'Idea', carries: 'problem' },
  { Icon: Target, label: 'MVP', carries: 'scope' },
  { Icon: ListChecks, label: 'Requirements', carries: 'stories' },
  { Icon: LayoutTemplate, label: 'Design', carries: 'screens' },
  { Icon: Hammer, label: 'Build', carries: 'code' },
  { Icon: FlaskConical, label: 'Test', carries: 'results' },
  { Icon: ShieldCheck, label: 'Quality check', carries: 'verdict' },
  { Icon: Rocket, label: 'Launch', carries: 'release' },
  { Icon: Sprout, label: 'Learn', carries: '' },
];

const N = STEPS_ART.length;
const VB_W = 300;
const VB_H = 592;
const X = 150; // every step sits on the same vertical line, with Idea at the bottom and Learn at the top
const PITCH = 64;
const TRIP = 18; // seconds for one run, including the rest at the end
const TRAVEL = 0.8; // the share of those seconds spent travelling
const T0 = 2.4; // seconds before the first run, while the pipeline connects itself

const px = () => X;
const py = (i: number) => VB_H - 40 - PITCH * i;
/* The icons shift slowly from the accent colour to green as the steps rise. */
const hue = (i: number) => `color-mix(in srgb, var(--status-healthy-fg) ${Math.round((i / (N - 1)) * 100)}%, var(--sd-accent))`;

/* A dotted line that climbs from step to step with a small wiggle between them. Every piece is the same length, and the light only ever moves upward. */
const ROUTE = `M ${X} ${py(0)} ${Array.from({ length: N - 1 }, (_, i) => `C ${X + 11} ${py(i) - PITCH * 0.3}, ${X - 11} ${py(i + 1) + PITCH * 0.3}, ${X} ${py(i + 1)}`).join(' ')}`;

/** One clock drives the light, the lit step and the word between steps, so they always agree. Null while the light has not started. */
function lightAt(seconds: number): { p: number; o: number } | null {
  const t = seconds - T0;
  if (t < 0) return null;
  const c = (t % TRIP) / TRIP;
  const p = Math.min(1, c / TRAVEL); // how far up the line, 0 to 1
  const o = c < 0.03 ? c / 0.03 : c < 0.9 ? 1 : c < 0.97 ? 1 - (c - 0.9) / 0.07 : 0; // fades in, rests at the top, fades out
  return { p, o };
}

export function StepPipeline() {
  const reduced = useReducedMotion();
  const dot = useRef<SVGGElement>(null);
  const line = useRef<SVGPathElement>(null);
  const [view, setView] = useState({ lit: -1, chip: -1 }); // the step the light is on, and the stretch of line it is travelling
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;

  useEffect(() => {
    if (reduced) return;
    const start = performance.now();
    let last = '';
    const tick = () => {
      const s = lightAt((performance.now() - start) / 1000);
      const g = dot.current;
      const path = line.current;
      if (g && path) {
        g.setAttribute('opacity', s ? String(s.o) : '0');
        if (s) { const pt = path.getPointAtLength(s.p * path.getTotalLength()); g.setAttribute('transform', `translate(${pt.x} ${pt.y})`); }
      }
      const shown = !!s && s.o > 0.2;
      const at = shown ? s.p * (N - 1) : -1;
      const lit = shown && Math.abs(at - Math.round(at)) < 0.4 ? Math.round(at) : -1;
      const chip = shown && s.p < 1 ? Math.floor(at) : -1;
      const key = `${lit}:${chip}`;
      if (key !== last) { last = key; setView({ lit, chip }); }
    };
    const timer = setInterval(tick, 33);
    return () => clearInterval(timer);
  }, [reduced]);

  return (
    <div className="relative mx-auto w-full max-w-[22rem]" style={{ aspectRatio: `${VB_W} / ${VB_H}` }} role="img" aria-label={`An idea climbs through nine steps, from the bottom to the top: ${STEPS_ART.map((s) => s.label).join(', ')}`}>
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <mask id="lp-pipe-mask" maskUnits="userSpaceOnUse" x={0} y={0} width={VB_W} height={VB_H}>
            <path d={ROUTE} className="lp-pipe-reveal" pathLength={1} fill="none" stroke="#fff" strokeWidth={26} strokeLinecap="round" />
          </mask>
        </defs>
        <g mask="url(#lp-pipe-mask)">
          <path d={ROUTE} fill="none" strokeWidth={14} strokeLinecap="round" style={{ stroke: 'color-mix(in srgb, var(--sd-accent) 8%, transparent)' }} />
          <path ref={line} d={ROUTE} fill="none" strokeWidth={3} strokeLinecap="round" strokeDasharray="0.1 10" style={stroke('--sd-accent')} />
        </g>
        {!reduced && (
          <g ref={dot} opacity={0} transform={`translate(${X} ${py(0)})`}>
            <circle r={13} style={{ fill: 'color-mix(in srgb, var(--sd-accent) 22%, transparent)' }} />
            <circle r={5} style={fill('--sd-accent')} />
          </g>
        )}
      </svg>
      {STEPS_ART.map((s, i) => {
        const on = view.lit === i;
        return (
          <div key={s.label}>
            <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: pct(px(), VB_W), top: pct(py(i), VB_H) }}>
              <div className="lp-appear relative" style={{ '--i': i } as CSSProperties}>
                <span className="flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] bg-[var(--surface)]"
                  style={{ transition: on ? 'all .2s ease-out' : 'none', borderColor: on ? 'var(--sd-accent)' : `color-mix(in srgb, ${hue(i)} 45%, var(--divider))`, background: on ? 'color-mix(in srgb, var(--sd-accent) 14%, var(--surface))' : undefined, color: hue(i), transform: on ? 'scale(1.1)' : 'none', boxShadow: on ? '0 0 0 4px color-mix(in srgb, var(--sd-accent) 30%, transparent), 0 0 16px color-mix(in srgb, var(--sd-accent) 40%, transparent)' : 'var(--card-shadow)' }}><s.Icon className="h-5 w-5" /></span>
              </div>
            </div>
            <span className="absolute -translate-y-1/2 whitespace-nowrap text-sm font-medium text-[var(--text-secondary)]" style={{ left: `calc(${pct(px(), VB_W)} + 2.1rem)`, top: pct(py(i), VB_H) }}>{s.label}</span>
            {s.carries && (
              <span className="absolute -translate-x-full -translate-y-1/2 whitespace-nowrap rounded-full border border-[var(--divider)] bg-[var(--surface)] px-2 py-0.5 text-[0.6875rem] font-medium text-[var(--sd-accent)]" aria-hidden
                style={{ transition: view.chip === i ? 'opacity .2s ease-out, transform .2s ease-out' : 'none', opacity: view.chip === i ? 1 : 0, left: `calc(${pct(px(), VB_W)} - 1rem)`, top: pct(py(i) - PITCH / 2, VB_H) }}>{s.carries}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- pictures for the hero and the closing band ---------- */

/** A small ringed planet. Drifts beside the headline. */
export function PlanetArt() {
  return (
    <svg viewBox="0 0 100 100" className="h-24 w-24" aria-hidden>
      <g transform="rotate(-18 50 54)">
        <path d="M6 54 A44 11 0 0 1 94 54" fill="none" strokeWidth={3} strokeLinecap="round" style={{ stroke: 'color-mix(in srgb, var(--chart-5) 50%, transparent)' }} />
        <circle cx="50" cy="52" r="26" style={{ fill: 'color-mix(in srgb, var(--chart-1) 36%, var(--surface))' }} />
        <path d="M27 45 q23 -7 46 0" fill="none" strokeWidth={4} strokeLinecap="round" style={{ stroke: 'color-mix(in srgb, var(--chart-1) 60%, var(--surface))' }} />
        <path d="M26 59 q24 8 48 0" fill="none" strokeWidth={3} strokeLinecap="round" style={{ stroke: 'color-mix(in srgb, var(--chart-1) 50%, var(--surface))' }} />
        <path d="M6 54 A44 11 0 0 0 94 54" fill="none" strokeWidth={3} strokeLinecap="round" style={{ stroke: 'color-mix(in srgb, var(--chart-5) 80%, transparent)' }} />
      </g>
      <circle cx="84" cy="20" r="4.5" style={fill('--chart-6', { opacity: 0.8 })} />
    </svg>
  );
}

/** A comet with a soft tail. Drifts on the other side of the headline. */
export function CometArt() {
  return (
    <svg viewBox="0 0 110 110" className="h-24 w-24" aria-hidden>
      <path d="M78 32 Q46 58 10 98" fill="none" strokeWidth={11} strokeLinecap="round" style={{ stroke: 'color-mix(in srgb, var(--status-warning-fg) 16%, transparent)' }} />
      <path d="M78 32 Q50 52 24 84" fill="none" strokeWidth={6} strokeLinecap="round" style={{ stroke: 'color-mix(in srgb, var(--status-warning-fg) 30%, transparent)' }} />
      <circle cx="80" cy="30" r="10" style={{ fill: 'var(--status-warning-bg)', stroke: 'var(--status-warning-fg)' }} strokeWidth={2.5} />
      <g className="lp-twinkle" style={fill('--chart-5')}><circle cx="30" cy="22" r="2.5" style={idx(0)} /><circle cx="96" cy="70" r="2" style={idx(1)} /><circle cx="58" cy="90" r="2.2" style={idx(2)} /></g>
    </svg>
  );
}

/** A rocket for the closing band, which is always blue with white text. */
export function RocketArt() {
  return (
    <svg viewBox="0 0 120 176" className="h-44 w-auto" aria-hidden>
      <g className="lp-flame">
        <path d="M45 112 q15 46 30 0 q-15 12 -30 0z" fill="#FFB020" />
        <path d="M52 112 q8 28 16 0 q-8 7 -16 0z" fill="#FFE08A" />
      </g>
      <path d="M36 90 L12 126 L38 116 Z" fill="rgba(255,255,255,0.7)" />
      <path d="M84 90 L108 126 L82 116 Z" fill="rgba(255,255,255,0.7)" />
      <path d="M60 6 C88 30 94 66 86 112 L34 112 C26 66 32 30 60 6 Z" fill="#fff" />
      <rect x="33" y="98" width="54" height="8" fill="rgba(11,27,59,0.12)" />
      <circle cx="60" cy="56" r="13" fill="#0B1B3B" />
      <circle cx="60" cy="56" r="9" fill="#5AA9FF" />
      <circle cx="56" cy="52" r="3" fill="rgba(255,255,255,0.8)" />
    </svg>
  );
}

/* ---------- three small scenes for the three paths ---------- */

export function IdeaArt() {
  return (
    <svg viewBox="0 0 220 120" className="h-full w-full" aria-hidden>
      <ellipse cx="110" cy="106" rx="86" ry="8" style={fill('--sd-accent-soft')} />
      <g className="lp-rays" strokeWidth={3} strokeLinecap="round" style={stroke('--status-warning-fg')}>
        {Array.from({ length: 7 }, (_, k) => {
          const a = ((-90 + (k - 3) * 28) * Math.PI) / 180;
          return <line key={k} x1={110 + Math.cos(a) * 36} y1={50 + Math.sin(a) * 36} x2={110 + Math.cos(a) * 48} y2={50 + Math.sin(a) * 48} style={idx(k)} />;
        })}
      </g>
      <circle cx="110" cy="50" r="25" strokeWidth={3} style={{ fill: 'var(--status-warning-bg)', stroke: 'var(--status-warning-fg)' }} />
      <path d="M101 52 q9 -13 18 0" fill="none" strokeWidth={2.5} strokeLinecap="round" style={stroke('--status-warning-fg')} />
      <rect x="98" y="75" width="24" height="11" rx="4" style={fill('--status-warning-fg', { opacity: 0.55 })} />
      <rect x="102" y="86" width="16" height="6" rx="3" style={fill('--status-warning-fg', { opacity: 0.4 })} />
      <g transform="rotate(-8 42 82)">
        <rect x="22" y="64" width="40" height="36" rx="5" strokeWidth={1.5} style={{ fill: 'var(--status-info-bg)', stroke: 'var(--status-info-fg)' }} />
        <line x1="29" y1="76" x2="55" y2="76" strokeWidth={2} strokeLinecap="round" style={stroke('--status-info-fg')} /><line x1="29" y1="85" x2="46" y2="85" strokeWidth={2} strokeLinecap="round" style={stroke('--status-info-fg')} />
      </g>
      <g transform="rotate(7 184 80)">
        <rect x="164" y="62" width="40" height="36" rx="5" strokeWidth={1.5} style={{ fill: 'var(--status-healthy-bg)', stroke: 'var(--status-healthy-fg)' }} />
        <path d="M173 81 l6 6 l11 -12" fill="none" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" style={stroke('--status-healthy-fg')} />
      </g>
      <g className="lp-twinkle" style={fill('--chart-5')}><circle cx="38" cy="34" r="3" style={idx(0)} /><circle cx="186" cy="30" r="2.5" style={idx(1)} /><circle cx="168" cy="48" r="2" style={idx(2)} /></g>
    </svg>
  );
}

export function ProductArt() {
  return (
    <svg viewBox="0 0 220 120" className="h-full w-full" aria-hidden>
      <rect x="26" y="12" width="168" height="96" rx="10" strokeWidth={2} style={{ fill: 'var(--surface)', stroke: 'var(--divider)' }} />
      <path d="M26 22 a10 10 0 0 1 10 -10 h148 a10 10 0 0 1 10 10 v8 h-168 z" style={fill('--surface-muted')} />
      <circle cx="38" cy="21" r="2.5" style={fill('--status-critical-fg', { opacity: 0.6 })} /><circle cx="47" cy="21" r="2.5" style={fill('--status-warning-fg', { opacity: 0.6 })} /><circle cx="56" cy="21" r="2.5" style={fill('--status-healthy-fg', { opacity: 0.6 })} />
      {[24, 38, 30, 50].map((h, k) => <rect key={k} className="lp-grow" x={42 + k * 20} y={98 - h} width="12" height={h} rx="3" style={{ ...fill('--sd-accent', { opacity: 0.4 + k * 0.2 }), ...idx(k) }} />)}
      <circle cx="158" cy="64" r="18" fill="none" strokeWidth={7} style={stroke('--surface-muted')} />
      <circle className="lp-ring" cx="158" cy="64" r="18" fill="none" strokeWidth={7} strokeLinecap="round" strokeDasharray="113" transform="rotate(-90 158 64)" style={stroke('--status-healthy-fg')} />
      <circle cx="190" cy="98" r="13" strokeWidth={2.5} style={{ fill: 'var(--status-healthy-bg)', stroke: 'var(--status-healthy-fg)' }} />
      <path d="M184 98 l4 4 l8 -9" fill="none" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" style={stroke('--status-healthy-fg')} />
    </svg>
  );
}

export function RebuildArt() {
  const wins = [[134, 38], [150, 38], [134, 56], [150, 56], [134, 74], [150, 74], [172, 62], [184, 62], [172, 80], [184, 80]];
  return (
    <svg viewBox="0 0 220 120" className="h-full w-full" aria-hidden>
      <line x1="14" y1="106" x2="206" y2="106" strokeWidth={2} strokeLinecap="round" style={stroke('--divider')} />
      <g style={{ opacity: 0.75 }}>
        <rect x="24" y="52" width="46" height="54" strokeWidth={2} strokeDasharray="4 4" style={{ fill: 'var(--status-neutral-bg)', stroke: 'var(--status-neutral-fg)' }} />
        {[[32, 60], [48, 60], [32, 76], [48, 76], [32, 92], [48, 92]].map(([x, y], k) => <rect key={k} x={x} y={y} width="9" height="9" rx="1.5" style={fill('--status-neutral-fg', { opacity: 0.35 })} />)}
      </g>
      <g className="lp-nudge" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" style={stroke('--sd-accent')}><path d="M80 78 h28" /><path d="M100 69 l9 9 l-9 9" /></g>
      <rect x="126" y="28" width="40" height="78" rx="3" strokeWidth={2} style={{ fill: 'var(--status-info-bg)', stroke: 'var(--status-info-fg)' }} />
      <rect x="166" y="52" width="32" height="54" rx="3" strokeWidth={2} style={{ fill: 'var(--status-info-bg)', stroke: 'var(--status-info-fg)' }} />
      {wins.map(([x, y], k) => <rect key={k} className="lp-win" x={x} y={y} width="9" height="9" rx="1.5" style={{ ...fill('--status-healthy-fg'), ...idx(k) }} />)}
    </svg>
  );
}

/* ---------- a chat against Catalyst ---------- */

const PROOFS: { Icon: LucideIcon; label: string }[] = [
  { Icon: BadgeCheck, label: 'Signed' },
  { Icon: FileSearch, label: 'Sourced' },
  { Icon: Flag, label: 'Flagged when it changes' },
  { Icon: Radar, label: 'Compared with real rivals' },
];

export function ChatVsProof() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-2xl border border-dashed border-[var(--divider)] bg-[var(--surface-muted)]/50 p-5">
        <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]"><MessageSquare size={16} />A chat</p>
        <div className="space-y-2.5" aria-hidden>
          {['92%', '78%', '85%', '56%'].map((w, k) => <div key={k} className="lp-skeleton h-3 rounded-full bg-[var(--divider)]" style={{ width: w, ...idx(k) }} />)}
        </div>
        <p className="mt-5 inline-flex rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--text-muted)]">A draft</p>
      </div>
      <div className="rounded-2xl border border-[var(--divider)] bg-[var(--surface)] p-5" style={{ boxShadow: 'var(--card-shadow)' }}>
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--sd-accent)]"><ShieldCheck size={16} />Catalyst</p>
        <ul className="space-y-2">
          {PROOFS.map(({ Icon, label }, k) => (
            <li key={label} className="lp-row flex items-center gap-3 rounded-xl border border-[var(--divider)] px-3 py-2" style={{ '--d': `${0.25 + k * 0.22}s` } as CSSProperties}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: 'var(--status-healthy-bg)', color: 'var(--status-healthy-fg)' }}><Icon size={17} /></span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
              <svg className="lp-check h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" style={stroke('--status-healthy-fg')} aria-hidden><path d="M5 12l5 5L20 7" /></svg>
            </li>
          ))}
        </ul>
        <p className="mt-4 inline-flex rounded-full px-3 py-1 text-xs font-semibold" style={{ background: 'var(--sd-accent-soft)', color: 'var(--sd-accent)' }}>Proof</p>
      </div>
    </div>
  );
}
