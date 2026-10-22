'use client';
import { useState } from 'react';
import { Badge, Bar, Card, ErrorBox, Loading } from '@/components/ui';
import { useAction } from '@/components/kit';
import { api, useApi } from '@/lib/api';

const VIEWS: [string, string][] = [['ceo', 'CEO'], ['user', 'User'], ['developer', 'Developer'], ['application', 'Application']];
/** Names a person sees for the four levels; the ids are what the server stores. */
const LEVELS: [string, string][] = [['core', 'Biggest'], ['major', 'Big'], ['support', 'Medium'], ['light', 'Small']];

/**
 * The steps of one phase exactly as the lifecycle framework words them, each with how much it counts toward the phase,
 * how far it is, and what shows it is done. The percentage is worked out on the server; nothing here is ticked by hand.
 */
export default function Steps({ pid, num, onChanged }: { pid: string; num: number; onChanged?: () => void }) {
  const fw = useApi<any>(`/lifecycle/framework?phase=${num}`, pid);
  const act = useAction();
  const [open, setOpen] = useState<string | null>(null);
  if (fw.loading && !fw.data) return <Loading />;
  if (fw.error || !fw.data) return <ErrorBox message={fw.error || 'The steps could not be loaded.'} />;
  const phase = fw.data.phases.find((p: any) => p.engine === num);
  if (!phase) return null;
  const changed = () => { fw.reload(); onChanged?.(); };
  const setLevel = (step: string, tier: string) => act.run(async () => { await api('/lifecycle/framework/weights', { method: 'POST', body: { step, tier } }); changed(); });
  const savePoints = (points: Record<string, number>) => act.run(async () => { await api('/lifecycle/framework/weights', { method: 'POST', body: { points } }); changed(); });
  const reset = () => act.run(async () => { await api('/lifecycle/framework/weights', { method: 'POST', body: { reset: true } }); changed(); });

  return (
    <>
      {act.box}
      <Card title={`Framework phase ${phase.n}: ${phase.title}`} sub={phase.n !== num ? `The framework numbers this phase ${phase.n}` : undefined}>
        <p style={{ margin: 0 }}>{phase.objective}</p>
        <details style={{ marginTop: 10 }}>
          <summary className="strong" style={{ cursor: 'pointer' }}>What this phase means for each viewpoint</summary>
          <div className="grid g2" style={{ marginTop: 8, gap: 12 }}>
            {VIEWS.map(([k, label]) => phase.perspectives?.[k] && <div key={k}><div className="strong small">{label}</div><div className="small">{phase.perspectives[k]}</div></div>)}
          </div>
        </details>
      </Card>

      <div style={{ height: 16 }} />
      <Card title="How complete is this phase" sub={`${phase.stepsDone} of ${phase.stepsTotal} steps done`}>
        <div className="kpi"><span className="v">{phase.percent}%</span><span className="l">Bigger steps count for more, so this is not just steps done ÷ steps</span></div>
        <div style={{ margin: '8px 0 12px' }}><Bar pct={phase.percent} /></div>
        <table className="tbl compact"><thead><tr><th>Step size</th><th>Steps</th><th>Counts for</th><th>Done</th></tr></thead><tbody>
          {phase.byTier.map((b: any) => <tr key={b.tier}><td>{b.label}</td><td>{b.steps}</td><td>{b.share}% of the phase</td><td>{b.percent}%</td></tr>)}
        </tbody></table>
        <Levels tiers={fw.data.tiers} busy={act.busy} onSave={savePoints} onReset={reset} />
      </Card>

      <div style={{ height: 16 }} />
      <Card title="Steps in this phase" sub="In the order the framework follows">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {phase.steps.map((s: any) => {
            const isOpen = open === s.id;
            return (
              <div key={s.id} style={{ border: '1px solid var(--divider)', borderRadius: 10, overflow: 'hidden' }}>
                <button type="button" onClick={() => setOpen(isOpen ? null : s.id)} aria-expanded={isOpen}
                  style={{ width: '100%', display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center', padding: '10px 12px', background: 'transparent', border: 0, font: 'inherit', textAlign: 'left', cursor: 'pointer', minHeight: 0 }}>
                  <span className="mono strong">{s.code}</span>
                  <span><span className="strong">{s.title}</span><span className="small muted" style={{ display: 'block' }}>{s.tierLabel} step · counts for {s.share}% of the phase</span></span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 130, justifyContent: 'flex-end' }}><span style={{ width: 70 }}><Bar pct={s.pct} /></span><span className="small" style={{ width: 34, textAlign: 'right' }}>{s.pct}%</span></span>
                </button>
                {isOpen && (
                  <div style={{ padding: '4px 12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div className="row" style={{ gap: 8 }}><Badge>{s.state}</Badge><span className="spacer" />
                      <label className="small muted">How much it counts{' '}
                        <select value={s.tier} disabled={act.busy} onChange={(e) => setLevel(s.id, e.target.value)}>
                          {LEVELS.map(([v, l]) => <option key={v} value={v}>{l}{v === s.defaultTier ? ' (framework)' : ''}</option>)}
                        </select>
                      </label>
                    </div>
                    <Part label="What we do">{s.what}</Part>
                    <Part label="Why it is here">{s.whyHere}</Part>
                    <Part label="Why not somewhere else">{s.whyNotElsewhere}</Part>
                    <Part label="What it produces">{s.output}</Part>
                    {(s.notes || []).map((n: any, i: number) => <Part key={i} label={n.label}>{n.text}</Part>)}
                    <div>
                      <div className="strong small">What shows it is done</div>
                      <ul className="list" style={{ margin: '4px 0 0' }}>
                        {(s.evidence || []).map((e: any, i: number) => (
                          <li key={i} className="small">{e.fraction >= 0.999 ? '✓' : '○'} {e.label}{e.gate === undefined ? ` — ${e.have} of ${e.need}` : ''}</li>
                        ))}
                      </ul>
                      <div className="small muted" style={{ marginTop: 4 }}>A reviewed record counts fully, a draft counts half, sample records count nothing. Unknown stays at 0 until a real record exists.</div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <div style={{ height: 16 }} />
      <Card title="This phase is finished when">
        <p style={{ margin: 0 }}>{phase.exit}</p>
        <p className="small muted" style={{ margin: '8px 0 0' }}>Every phase uses the same step sizes: {fw.data.tiers.map((t: any) => `${t.label} counts ${t.points}`).join(', ')}.</p>
      </Card>
    </>
  );
}

function Part({ label, children }: { label: string; children: string }) {
  return <div><div className="strong small">{label}</div><div className="small" style={{ whiteSpace: 'pre-line' }}>{children}</div></div>;
}

/** Points of the four levels. Behind a small link because most people never need it. */
function Levels({ tiers, busy, onSave, onReset }: { tiers: any[]; busy: boolean; onSave: (p: Record<string, number>) => void; onReset: () => void }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const val = (t: any) => vals[t.tier] ?? String(t.points);
  return (
    <details style={{ marginTop: 12 }}>
      <summary className="small" style={{ cursor: 'pointer' }}>Change how much each step size counts (all phases)</summary>
      <div className="row" style={{ gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
        {tiers.map((t) => (
          <label key={t.tier} className="small">{t.label}{' '}
            <input type="number" min={1} max={100} value={val(t)} style={{ width: 64 }} onChange={(e) => setVals({ ...vals, [t.tier]: e.target.value })} />
          </label>
        ))}
        <button className="btn sm primary" disabled={busy} onClick={() => onSave(Object.fromEntries(tiers.map((t) => [t.tier, Number(val(t))])))}>Save</button>
        <button className="btn sm" disabled={busy} onClick={onReset}>Back to framework</button>
      </div>
    </details>
  );
}
