'use client';
import { Check } from 'lucide-react';

export type JourneyStep = { label: string; note?: string; state: 'done' | 'now' | 'next'; tone?: 'critical' };

const TONES = {
  done: { bg: 'var(--status-healthy-bg)', fg: 'var(--status-healthy-fg)' },
  critical: { bg: 'var(--status-critical-bg)', fg: 'var(--status-critical-fg)' },
  now: { bg: 'var(--status-warning-bg)', fg: 'var(--status-warning-fg)' },
  next: { bg: 'var(--surface-muted)', fg: 'var(--text-muted)' },
};

/** Where an idea stands: numbered steps joined by a dotted line that is green where the idea has already been. */
export function Journey({ steps, label }: { steps: JourneyStep[]; label: string }) {
  return (
    <ol className={`grid gap-y-5 ${steps.length === 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`} aria-label={label}>
      {steps.map((s, k) => {
        const tone = s.state === 'done' ? (s.tone === 'critical' ? TONES.critical : TONES.done) : TONES[s.state];
        return (
          <li key={s.label} className="min-w-0 pr-3">
            <div className="flex items-center gap-2">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${s.state === 'now' ? 'lp-ping' : ''}`} style={{ background: tone.bg, color: tone.fg }}>
                {s.state === 'done' ? <Check size={14} /> : k + 1}
              </span>
              {k < steps.length - 1 && <span aria-hidden className="hidden h-0 flex-1 border-t-2 border-dotted sm:block" style={{ borderColor: s.state === 'done' ? 'var(--status-healthy-fg)' : 'var(--divider)' }} />}
            </div>
            <span className={`mt-2 block text-sm ${s.state === 'now' ? 'font-semibold' : 'font-medium'}`}>{s.label}</span>
            {s.note && <span className="block text-xs text-[var(--text-muted)]">{s.note}</span>}
          </li>
        );
      })}
    </ol>
  );
}
