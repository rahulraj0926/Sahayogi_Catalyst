'use client';
import { Check, Circle, Pencil, X } from 'lucide-react';
import type { ReactNode } from 'react';
import facts from './facts.json';

const WHO: Record<string, string> = {
  'Idea': '', 'MVP': 'Sponsor approves', 'Requirements': 'Product lead signs', 'Design': 'Leads sign', 'Build': 'Tech lead signs',
  'Test': 'QA lead signs', 'Quality check': 'Owner signs off', 'Launch': 'Sponsor approves', 'Learn': 'Product lead decides',
};

/** The nine steps as the landing page shows them: a short name, who decides at its checkpoint, and how many real checks it holds (facts.json, kept in line with the engine by a test). */
export const STEPS: { name: string; who: string; checks: number }[] = Object.entries(facts.stepChecks).map(([name, checks]) => ({ name, who: WHO[name], checks }));

const Chip = ({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'info' }) => {
  const c = { neutral: 'var(--status-neutral', good: 'var(--status-healthy', warn: 'var(--status-warning', info: 'var(--status-info' }[tone];
  return <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ background: `${c}-bg)`, color: `${c}-fg)` }}>{children}</span>;
};

const Label = ({ children }: { children: string }) => <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{children}</p>;

const Tick = ({ done }: { done: boolean }) => (done ? <Check size={15} style={{ color: 'var(--status-healthy-fg)' }} /> : <Circle size={15} className="text-[var(--text-muted)]" />);

const Checklist = ({ title, rows }: { title: string; rows: [string, boolean][] }) => (
  <div className="flex flex-col gap-1.5">
    <Label>{title}</Label>
    {rows.map(([t, done]) => <div key={t} className="flex items-center gap-2 text-sm text-[var(--text-heading)]"><Tick done={done} />{t}</div>)}
  </div>
);

/** One sample screen per step. The words and numbers on them are examples, not real data. */
export function Panel({ i }: { i: number }) {
  if (i === 0) return (
    <div className="flex flex-col gap-1.5">
      <Label>Idea card</Label>
      <p className="text-base font-semibold leading-snug text-[var(--text-heading)]">WhatsApp helper for GST notices</p>
      <p className="text-sm text-[var(--text-secondary)]">For small shop owners</p>
      <div className="mt-1 flex flex-wrap gap-1.5"><Chip tone="info">4 rivals checked</Chip><Chip tone="warn">Waiting for the CEO</Chip></div>
    </div>
  );
  if (i === 1) return (
    <div className="flex flex-col gap-1.5">
      <Label>First release · MVP</Label>
      {([['Read the notice', 'In', 'good'], ['Draft a reply', 'In', 'good'], ['Filing reminders', 'Later', 'neutral']] as const).map(([n, t, tone]) => (
        <div key={n} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--divider)] px-2.5 py-1.5">
          <span className="truncate text-sm font-medium text-[var(--text-heading)]">{n}</span><Chip tone={tone}>{t}</Chip>
        </div>
      ))}
    </div>
  );
  if (i === 2) return (
    <div className="flex flex-col gap-2">
      <Label>Requirement, drafted</Label>
      <p className="text-sm font-semibold leading-snug text-[var(--text-heading)]">Every draft names the notice section it answers.</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium" style={{ background: 'var(--status-healthy-bg)', color: 'var(--status-healthy-fg)' }}><Check size={12} />Keep</span>
        <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)]"><Pencil size={12} />Fix</span>
        <span className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium" style={{ background: 'var(--status-critical-bg)', color: 'var(--status-critical-fg)' }}><X size={12} />Drop</span>
      </div>
    </div>
  );
  if (i === 3) return <Checklist title="Design pack" rows={[['Screens and states', true], ['Data model', true], ['API contracts', true], ['Security notes', false]]} />;
  if (i === 4) return (
    <div className="flex flex-col gap-2">
      <Label>Stories built</Label>
      <p className="text-base font-semibold leading-snug text-[var(--text-heading)]">7 of 9</p>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]"><div className="h-full rounded-full" style={{ width: '78%', background: 'var(--sd-accent)' }} /></div>
      <div className="flex flex-wrap gap-1.5"><Chip tone="good">Reviewed</Chip><Chip>Tests pass</Chip></div>
    </div>
  );
  if (i === 5) return (
    <div className="flex flex-col gap-2">
      <Label>Test results</Label>
      <div className="grid grid-cols-6 gap-1">
        {Array.from({ length: 6 }, (_, k) => (
          <span key={k} className="flex h-7 items-center justify-center rounded-md text-[0.6875rem] font-semibold" style={k < 5 ? { background: 'var(--status-healthy-bg)', color: 'var(--status-healthy-fg)' } : { background: 'var(--surface-muted)', color: 'var(--text-muted)' }}>{k < 5 ? <Check size={12} /> : k + 1}</span>
        ))}
      </div>
      <p className="text-xs text-[var(--text-secondary)]">5 of 6 checks passed</p>
    </div>
  );
  if (i === 6) return <Checklist title="Verdict" rows={[['Access is safe', true], ['No serious security finding', true], ['Accepted by the owner', true], ['Ready to release', false]]} />;
  if (i === 7) return (
    <div className="flex flex-col gap-1.5">
      <Label>Proof page</Label>
      <p className="text-base font-semibold leading-snug text-[var(--text-heading)]">Release 1</p>
      <p className="text-sm text-[var(--text-secondary)]">38 requirements · 38 tests passed</p>
      <div className="mt-1 flex flex-wrap gap-1.5"><Chip tone="good">Signed off</Chip><Chip>Shareable link</Chip></div>
    </div>
  );
  return (
    <div className="flex flex-col gap-1.5">
      <Label>What users said</Label>
      <p className="text-base font-semibold leading-snug text-[var(--text-heading)]">3 changes planned</p>
      <p className="text-sm text-[var(--text-secondary)]">From 12 notes</p>
      <div className="mt-1 flex flex-wrap gap-1.5"><Chip tone="info">Feeds the next idea</Chip></div>
    </div>
  );
}
