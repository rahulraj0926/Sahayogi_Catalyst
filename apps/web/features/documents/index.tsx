'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { FeatureProps } from '../types';
import { Badge, Bar, ErrorBox, Loading, Page } from '@/components/ui';
import { useApi } from '@/lib/api';
import { STAGES, STATUS, WHAT } from './labels';
import Reader from './Reader';
import { DocTabs } from '@/components/DocTabs';
import { Pager, usePaged } from '@/components/kit';
import { Menu } from '../doc';
import { PHASE_SHORT } from '@/components/shell/groups';

/** The list of the 30 documents, grouped by the five stages; /documents/<key> opens one. Prototype: documents.js, docreader.js */
export default function Documents({ pid, args }: FeatureProps) {
  if (args[0]) return <Reader pid={pid} docKey={args[0]} />;
  return <List pid={pid} />;
}

function List({ pid }: { pid: string }) {
  const { data, error, loading } = useApi<any>('/documents', pid);
  const [status, setStatus] = useState('all'); const [q, setQ] = useState(''); const [stage, setStage] = useState('all');
  const docs: any[] = data?.documents ?? [];
  const shown = docs.filter((d) => (status === 'all' || d.status === status) && (stage === 'all' || String(d.phase) === stage) && (!q || (d.title + ' ' + (WHAT[d.key] || '') + ' ' + d.key.replace(/_/g, ' ')).toLowerCase().includes(q.toLowerCase())));
  const pg = usePaged(shown, 10);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error || 'No data'} />;
  const avg = docs.length ? Math.round(docs.reduce((m, d) => m + d.completeness, 0) / docs.length) : 0;
  return (
    <Page title="Documents"
      right={<Menu label="Download" items={[{ label: 'HTML (opens in Word)', href: `/api/v1/dossier?format=html&download=1&product=${pid}` }, { label: 'Markdown', href: `/api/v1/dossier?format=md&download=1&product=${pid}` }]} />}>
      <DocTabs pid={pid} active="list" />
      <div className="flex flex-wrap items-center gap-3" style={{ margin: '4px 0 14px' }}>
        <div className="flex items-center gap-2"><div style={{ width: 160 }}><Bar pct={avg} /></div><b className="small">{avg}%</b><span className="small muted">{data.approved} of {data.total} approved</span></div>
        <span className="spacer" />
        <div className="seg" role="group" aria-label="Status">
          {['all', ...Object.keys(STATUS)].map((k) => <button key={k} className={status === k ? 'on' : ''} aria-pressed={status === k} onClick={() => setStatus(k)}>{k === 'all' ? 'All' : STATUS[k].label}</button>)}
        </div>
        <select aria-label="Phase" value={stage} onChange={(e) => setStage(e.target.value)}><option value="all">All phases</option>{PHASE_SHORT.map((n, i) => <option key={i} value={String(i)}>{i}. {n} ({docs.filter((d) => d.phase === i).length})</option>)}</select>
        <input type="search" placeholder="Search documents" aria-label="Search documents" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
      </div>
      <section className="card">
        {shown.length === 0 ? <div className="loading">No document matches. <button className="btn sm" onClick={() => { setStatus('all'); setQ(''); setStage('all'); }}>Show all</button></div> : (
          <table className="tbl">
            <thead><tr><th>Document</th><th>Stage</th><th>Status</th><th style={{ width: 200 }}>Complete</th></tr></thead>
            <tbody>
              {pg.rows.map((d) => (
                <tr key={d.key}>
                  <td><Link className="strong" href={`/products/${pid}/documents/${d.key}`}>{d.title}</Link>{d.changed_since_approval && <span style={{ color: 'var(--warn)' }} title="Changed since it was approved"> !</span>}<div className="xs muted" style={{ maxWidth: '60ch' }}>{WHAT[d.key]}</div></td>
                  <td className="small muted" style={{ whiteSpace: 'nowrap' }}>{d.phase}. {STAGES[d.phase]?.name || PHASE_SHORT[d.phase]}</td>
                  <td><Badge kind={STATUS[d.status]?.kind}>{STATUS[d.status]?.label}</Badge></td>
                  <td><div className="flex items-center gap-2"><div style={{ flex: 1 }}><Bar pct={d.completeness} /></div><b className="small tabular" style={{ width: 34, textAlign: 'right' }}>{d.completeness}%</b></div></td>
                </tr>))}
            </tbody>
          </table>)}
        <Pager {...pg} />
      </section>
    </Page>
  );
}
