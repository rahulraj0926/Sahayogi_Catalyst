'use client';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Reveal } from './motion';
import { Panel, STEPS } from './StepPanels';

/** One sample screen of the product, tilting a little toward the pointer. */
function TourCard({ i }: { i: number }) {
  const tilt = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 9}deg`);
    e.currentTarget.style.setProperty('--rx', `${-((e.clientY - r.top) / r.height - 0.5) * 9}deg`);
  };
  const rest = (e: ReactPointerEvent<HTMLDivElement>) => { e.currentTarget.style.setProperty('--ry', '0deg'); e.currentTarget.style.setProperty('--rx', '0deg'); };
  return (
    <div className="lp-tilt h-full rounded-2xl border border-[var(--divider)] bg-[var(--surface)] p-4" style={{ boxShadow: 'var(--card-shadow)' }} onPointerMove={tilt} onPointerLeave={rest}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--sd-accent-soft)] text-xs font-bold text-[var(--sd-accent)]">{i + 1}</span>{STEPS[i].name}
        </span>
        {STEPS[i].who && <span className="inline-flex items-center gap-1.5 text-[0.6875rem] font-medium text-[var(--status-warning-fg)]"><span className="h-1.5 w-1.5 rotate-45 bg-current" aria-hidden />{STEPS[i].who}</span>}
      </div>
      <div className="rounded-xl bg-[var(--surface-muted)]/60 p-3">
        <div className="min-h-[8.5rem] rounded-lg border border-[var(--divider)] bg-[var(--surface)] p-3"><Panel i={i} /></div>
      </div>
      <p className="mt-2.5 px-1 text-xs text-[var(--text-muted)]">{STEPS[i].checks} checks to pass</p>
    </div>
  );
}

/** The nine steps as nine sample screens. A short name and who decides is all the text each one carries. */
export function TourStrip() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {STEPS.map((s, i) => <Reveal key={s.name} delay={(i % 3) * 0.1} className="h-full"><TourCard i={i} /></Reveal>)}
    </div>
  );
}
