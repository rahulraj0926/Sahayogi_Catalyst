'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { FeatureProps } from '../types';
import { Badge, Card, Empty, ErrorBox, Loading, Page } from '@/components/ui';
import { useAction } from '@/components/kit';
import { actor, api, useApi } from '@/lib/api';

const GROUPS: [string, string, string][] = [
  ['CompetitorCapability', 'What competitors can do', 'Each rating needs a second person to look at the source.'],
  ['PricePoint', 'What competitors charge', 'Each price needs a second person to look at the price list or page.'],
  ['Evidence', 'Customer words and other evidence', 'Until checked they do not count as evidence at the sign-off.'],
  ['Opportunity', 'Opportunities', 'Look at the opportunity and the evidence behind it.'],
];
const same = (a?: string, b?: string) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

function Row({ pid, it, me, onDone }: { pid: string; it: any; me: string; onDone: () => void }) {
  const [note, setNote] = useState('');
  const act = useAction();
  const mine = [it.entered_by, it.proposed_by].some((n) => n && same(n, me));
  const f = it.fields || {};
  const what = it.type === 'CompetitorCapability' ? `${it.parent ? it.parent.title + ': ' : ''}${f.capability_tag || it.title} — rated ${f.level || 'not rated'}`
    : it.type === 'PricePoint' ? `${it.parent ? it.parent.title + ': ' : ''}${f.plan || it.title} — ${f.amount ?? ''} ${f.currency || ''}${f.unit ? ' per ' + f.unit : ''}` : it.title;
  const go = (path: 'verify' | 'reject') => act.run(async () => {
    if (note.trim().length < 3) throw new Error(path === 'verify' ? 'Write where you checked it (a few words are enough).' : 'Write why it is not right (a few words).');
    await api(`/agent/${path}/${it.id}`, { method: 'POST', body: { note: note.trim() }, product: pid }); onDone();
  });
  return (
    <div className="grid g2" style={{ padding: '12px 0', borderTop: '1px solid var(--line)', alignItems: 'start' }}>
      <div>
        <div className="strong">{what}</div>
        {it.quote && <div className="small" style={{ borderLeft: '3px solid var(--line-2)', paddingLeft: 8, margin: '4px 0' }}>“{it.quote}”</div>}
        {it.source_text && <div className="xs muted">Where it came from: {it.source_text}</div>}
        {(it.evidence || []).map((e: any) => <div key={e.id} className="xs muted">Source: <a href={e.url} target="_blank" rel="noopener">{e.title}</a> (grade {e.grade})</div>)}
        <div className="xs muted" style={{ marginTop: 3 }}>{it.origin === 'human' ? `Typed in by ${it.entered_by || 'someone'}` : `Found by an assistant${it.proposed_by ? ' for ' + it.proposed_by : ''}`} · <Link href={`/products/${pid}/item/${it.id}`}>{it.id}</Link> <Badge kind="warn">waiting for a second person</Badge></div>
      </div>
      <div>
        {mine ? <div className="small muted"><b>You entered this.</b> A different person has to check it. Switch “Acting as” at the top.</div> : (
          <>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Where did you check it? One line is enough" style={{ width: '100%', marginBottom: 6 }} />
            <div className="row"><button className="btn primary sm" disabled={act.busy} onClick={() => go('verify')}>Check this</button><button className="btn ghost sm" disabled={act.busy} onClick={() => go('reject')}>Not right</button></div>
            {act.box}
          </>
        )}
      </div>
    </div>
  );
}

/** Things to check: every fact an assistant or one person entered waits for a second person. Prototype: cw_checks.js */
export default function Checks({ pid }: FeatureProps) {
  const q = useApi<any>('/agent/queue', pid);
  const ck = useApi<any>('/agent/checked', pid);
  if (q.loading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox message={q.error || 'No data'} />;
  const me = actor();
  const items: any[] = q.data.items;
  const reload = () => { q.reload(); ck.reload(); };
  const other = items.filter((i) => !GROUPS.some((g) => g[0] === i.type));
  return (
    <Page title="Things to check" sub="A different person checks each fact. Until then it does not count." right={<span className="small muted">Acting as {me}</span>}>
      <div className="callout" style={{ marginBottom: 12 }}>{items.length ? `${items.length} ${items.length === 1 ? 'thing is' : 'things are'} waiting for a second person. You cannot check what you typed in yourself.` : 'Nothing is waiting for a second person.'}</div>
      {[...GROUPS, ['*', 'Other', 'Anything else an assistant supplied.'] as [string, string, string]].map(([t, title, help]) => {
        const list = t === '*' ? other : items.filter((i) => i.type === t);
        if (!list.length) return null;
        return <Card key={t} title={title} sub={`${list.length} · ${help}`}>{list.map((it) => <Row key={it.id} pid={pid} it={it} me={me} onDone={reload} />)}</Card>;
      })}
      <div style={{ height: 12 }} />
      <Card title="Already checked" sub={`${ck.data?.items?.length || 0}`} flush>
        {!ck.data?.items?.length ? <Empty>Nothing checked yet.</Empty> : <table className="tbl compact"><tbody>{ck.data.items.map((i: any) => <tr key={i.id}><td><Link href={`/products/${pid}/item/${i.id}`}>{i.title}</Link><div className="xs muted">{i.type}</div></td><td className="small">Entered by {i.entered_by}</td><td className="small">Checked by {i.verified_by} on {i.verified_on}{i.verified_note ? `: ${i.verified_note}` : ''}</td></tr>)}</tbody></table>}
      </Card>
    </Page>
  );
}
