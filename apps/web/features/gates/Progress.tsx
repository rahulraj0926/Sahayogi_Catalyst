'use client';
import { Card, ErrorBox } from '@/components/ui';
import { useApi } from '@/lib/api';

/**
 * The one place that explains the percentages. Every step counts the same: there are no weights.
 * The worked example uses the phase the product is in, so the numbers match what the person sees on that phase's page.
 */
export default function Progress({ pid, current }: { pid: string; current?: number }) {
  const n = Number.isInteger(current) ? (current as number) : 0;
  const fw = useApi<any>(`/lifecycle/framework?phase=${n}`, pid);
  const phase = fw.data?.phases?.find((p: any) => p.engine === n);
  const sum = phase ? Math.round(phase.steps.reduce((a: number, s: any) => a + s.fraction, 0) * 10) / 10 : 0;
  return (
    <div id="progress" style={{ marginTop: 16 }}>
      <Card title="How progress is counted">
        <ul className="list" style={{ margin: 0 }}>
          <li><b>Complete</b> (on each phase page): how much of the phase's work exists in the product.</li>
          <li><b>Ready for sign-off</b> (on this page): how many of the required checks pass. It decides whether the phase can be signed off.</li>
        </ul>
        <div className="strong" style={{ marginTop: 14 }}>How "Complete" is worked out</div>
        <ol className="list" style={{ margin: '4px 0 0' }}>
          <li>Each phase has a list of steps. Every step counts the same. There are no big or small steps.</li>
          <li>A step looks at the records it needs. A reviewed or approved record counts fully, a draft counts half, a sample record counts nothing.</li>
          <li>The step's percentage is the average of what it needs. The phase's percentage is the average of its steps.</li>
          <li>Nothing is ticked by hand: the numbers move only when real records are added or reviewed.</li>
        </ol>
        {fw.error && <ErrorBox message={fw.error} />}
        {phase && (
          <p className="small muted" style={{ margin: '12px 0 0' }}>
            Example, phase {n}: it has {phase.stepsTotal} steps, {phase.stepsDone} done and {phase.stepsInProgress} started. Added up they come to {sum} out of {phase.stepsTotal}, so the phase is {phase.percent}% complete.
          </p>
        )}
      </Card>
    </div>
  );
}
