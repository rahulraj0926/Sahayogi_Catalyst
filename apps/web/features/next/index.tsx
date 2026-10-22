'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { FeatureProps } from '../types';
import { Badge, Empty, ErrorBox, Loading, Page } from '@/components/ui';
import { Pager, usePaged } from '@/components/kit';
import { PHASE_SHORT } from '@/components/shell/groups';
import { go, useApi } from '@/lib/api';

const KIND: Record<string, string> = { data_request: 'Answer a question', agent_task: 'Ask the research assistant', verification: 'Second-person check', stale_refresh: 'Refresh an old value', suspect_review: 'Second look', attestation: 'Sign-off', document_approval: 'Approve a document' };

/** What to do next: everything that unblocks a sign-off, best value per minute first. Prototype: overview.js (journey), nextactions */
export default function Next({ pid }: FeatureProps) {
  const [kind, setKind] = useState('');
  const { data, error, loading } = useApi<any>(`/next-actions?limit=100${kind ? `&kind=${kind}` : ''}`, pid);
  const pg = usePaged<any>(data?.actions ?? [], 10);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error || 'No data'} />;
  const kinds = Object.entries(data.by_kind) as [string, number][];
  return (
    <Page title="Next steps">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3" style={{ marginBottom: 14 }}>
        <div><div style={{ fontSize: 26, fontWeight: 700 }} className="tabular">{data.total}</div><div className="xs muted">things to do</div></div>
        <div><div style={{ fontSize: 26, fontWeight: 700 }} className="tabular">{data.minutes_total} min</div><div className="xs muted">of people&rsquo;s time</div></div>
        <div><div style={{ fontSize: 26, fontWeight: 700 }}>Phase {data.product.stage_gate}: {PHASE_SHORT[data.product.stage_gate] || ''}</div><div className="xs muted">the sign-off in front of you</div></div>
      </div>
      {data.what_happens_next && <div className="callout" style={{ marginBottom: 14 }}>{data.what_happens_next}</div>}
      <div className="seg" role="group" aria-label="Type" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        <button className={kind === '' ? 'on' : ''} onClick={() => setKind('')}>All</button>
        {kinds.map(([k, n]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{KIND[k] || k}</button>)}
      </div>
      <section className="card">
        {data.actions.length === 0 ? <Empty>Nothing to do right now.</Empty> : (
          <ul>
            {pg.rows.map((a: any, i: number) => (
              <li key={a.id} className="flex items-center gap-4" style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
                <span className="tabular muted" style={{ width: 26, textAlign: 'right' }}>{(pg.page - 1) * pg.per + i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="strong">{a.plain_title || a.title}</div>
                  {a.why && <div className="small muted" style={{ maxWidth: '80ch' }}>{a.why}</div>}
                  <div className="xs muted" style={{ marginTop: 3 }}>{KIND[a.kind] || a.kind} · about {a.minutes} min · phase {a.phase}{(a.blocks || []).length ? ` · clears ${a.blocks.length} ${a.blocks.length === 1 ? 'check' : 'checks'}` : ''}</div>
                </div>
                <Badge kind="outline">{a.value_per_minute}/min</Badge>
                <Link className="btn sm primary" href={go(pid, a.route?.ui)}>Do it</Link>
              </li>
            ))}
          </ul>
        )}
        <Pager {...pg} />
      </section>
    </Page>
  );
}
