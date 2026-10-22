'use client';
/** Traceability: matrix (default) | rules | gaps | funnel. Route: /trace/<tab>. Prototype: trace.js + trace_views.js */
import { useState } from 'react';
import { Page } from '@/components/ui';
import { Tabs } from '@/components/kit';
import type { FeatureProps } from '../types';
import Matrix from './Matrix';
import Rules from './Rules';
import Gaps from './Gaps';
import Funnel from './Funnel';

export default function Trace(props: FeatureProps) {
  const first = props.args[0];
  const [tab, setTab] = useState(['matrix', 'rules', 'gaps', 'funnel'].includes(first) ? first : 'matrix');
  return (
    <Page title="Traceability">
      <details className="card" style={{ marginBottom: 14 }}>
        <summary style={{ cursor: 'pointer', padding: '12px 18px', fontWeight: 650 }}>What is traceability?</summary>
        <div style={{ padding: '0 18px 16px' }}>
          <p style={{ maxWidth: '78ch', marginBottom: 10 }}>Traceability answers one question: <b>can we prove that everything we promised to build is covered?</b> Each requirement should connect, like a chain, to where it came from and to what shows it is done.</p>
          <ol className="flex flex-wrap items-center gap-2" style={{ listStyle: 'none', padding: 0, margin: '0 0 10px' }}>
            {['Where it came from', 'Requirement', 'User story', 'Acceptance check', 'Flow step'].map((t, i, a) => <li key={t} className="flex items-center gap-2"><span className="badge info">{t}</span>{i < a.length - 1 && <span className="muted">→</span>}</li>)}
          </ol>
          <p className="small muted" style={{ maxWidth: '78ch' }}>A missing link is a <b>gap</b>: for example a requirement nobody wrote a story for, or one with no way to check it. Gaps are found automatically from the saved records, nothing is typed by hand. Fix them before a sign-off so nothing is built without a reason or shipped without a test.</p>
        </div>
      </details>
      <Tabs tabs={[['matrix', 'Requirement links'], ['gaps', 'Gaps to fix'], ['rules', 'Coverage rules'], ['funnel', 'Drop-off']]} value={tab} onChange={setTab} />
      <div style={{ marginTop: 12 }}>
        {tab === 'matrix' && <Matrix pid={props.pid} />}
        {tab === 'rules' && <Rules {...props} />}
        {tab === 'gaps' && <Gaps pid={props.pid} />}
        {tab === 'funnel' && <Funnel pid={props.pid} />}
      </div>
    </Page>
  );
}
