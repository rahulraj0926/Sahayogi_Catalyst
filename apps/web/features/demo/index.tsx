'use client';
import Link from 'next/link';
import type { FeatureProps } from '../types';
import { Badge, Card, ErrorBox, Loading, Page } from '@/components/ui';
import { useAction } from '@/components/kit';
import { api, useApi } from '@/lib/api';

/** Sign-off walk-through: replays a stage's sign-off step by step on demonstration data. Prototype: demo.js */
export default function Demo({ pid }: FeatureProps) {
  const { data, error, loading, reload } = useApi<any>('/demo', pid);
  const act = useAction();
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error || 'No data'} />;
  const step = data.steps[data.index];
  const go = (path: string, body: any = {}) => act.run(async () => { await api(`/demo/${path}`, { method: 'POST', body, product: pid }); reload(); });
  return (
    <Page title="Sign-off walk-through" sub="Step through the story of one product reaching its first sign-off. It changes demonstration data, so use a demo product.">
      <div className="row" style={{ marginBottom: 12 }}>{data.steps.map((s: any) => <button key={s.id} className={`btn sm ${s.index === data.index ? 'primary' : ''}`} onClick={() => go('goto', { index: s.index })}>{s.index + 1}</button>)}</div>
      {act.box}
      <Card title={`${data.index + 1} of ${data.total}: ${step.title}`}>
        <p>{step.narration}</p>
        {step.watch?.length > 0 && <div className="small">Watch: {step.watch.map((w: string) => <Badge key={w} kind="outline">{w}</Badge>)} <Link href={`/products/${pid}/gates`}>Open the gates</Link></div>}
        {data.last && <pre className="mono xs" style={{ whiteSpace: 'pre-wrap', background: 'var(--panel-2)', padding: 8, borderRadius: 8 }}>{JSON.stringify(data.last, null, 2).slice(0, 1200)}</pre>}
        <div className="row" style={{ marginTop: 10 }}><button className="btn" disabled={data.index === 0 || act.busy} onClick={() => go('back')}>Back</button><button className="btn primary" disabled={data.index >= data.total - 1 || act.busy} onClick={() => go('next')}>Run this step and go on</button><span className="spacer" /><button className="btn danger" disabled={act.busy} onClick={async () => (await act.ask('Reset the walk-through? The product goes back to its starting data.', 'Start again')) && go('reset')}>Start again</button></div>
      </Card>
    </Page>
  );
}
