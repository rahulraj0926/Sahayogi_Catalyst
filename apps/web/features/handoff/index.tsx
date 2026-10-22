'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { FeatureProps } from '../types';
import { Badge, Card, ErrorBox, Loading, Page } from '@/components/ui';
import { Pager, Stat, useAction, usePaged } from '@/components/kit';
import { api, useApi } from '@/lib/api';

/** Hand over to developers: approved stories become a package. Prototype: handoff.js */
export default function Handoff({ pid, query }: FeatureProps) {
  const { data: o, error, loading, reload } = useApi<any>('/handoff/overview', pid);
  const [sel, setSel] = useState<string | null>(query.get('story'));
  const act = useAction();
  const pg = usePaged<any>(o?.stories ?? [], 8);
  if (loading) return <Loading />;
  if (error || !o) return <ErrorBox message={error || 'No data'} />;
  const S = o.status;
  const post = (path: string, story: string, ok: string) => act.run(async () => { const r = await api<any>(`/handoff/${path}`, { method: 'POST', body: { story }, product: pid }); act.say(ok.replace('{r}', r.handoff?.id || r.receipt_id || '')); reload(); });
  const chosen = sel || o.stories.find((s: any) => s.ready && !s.package_created)?.id || o.stories[0]?.id || null;
  return (
    <Page title="Hand over to developers">
      <div className={`callout ${S.handed_off && !S.outstanding.length ? 'ok' : ''}`} style={{ marginBottom: 14 }}>
        <div className="strong" style={{ fontSize: 17 }}>{S.handed_off ? 'Something has been handed over' : 'Nothing has been handed over yet'}</div>
        <div>{S.headline}</div>
        {S.outstanding.length > 0 && <ul style={{ margin: '6px 0 0 18px' }}>{S.outstanding.map((t: string) => <li key={t}>{t}</li>)}</ul>}
      </div>
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Stat value={`${S.stages_signed} of 13`} label="stages signed off" /><Stat value={`${S.stories_approved} of ${S.stories_total}`} label="stories approved" /><Stat value={S.stories_ready} label="ready for developers" kind="ok" /><Stat value={S.packages} label="packages created" />
      </div>
      {act.box}
      {o.receiver && !o.receiver.configured && o.stories.some((s: any) => s.ready || s.package_created) && <div className="callout" style={{ marginBottom: 12 }}>The developer tool address is not set on this server, so packages cannot be sent from here. Set <span className="mono">HANDOFF_RECEIVER_URL</span> on the API (see docs/PROTOTYPE_README.md). Each package can still be copied from the details below.</div>}
      <Card title="Your stories" flush>
        {o.stories.length === 0 ? <div className="loading">No user stories yet. They are drafted in Stage 3 from your features. <Link href={`/products/${pid}/work`}>Open Work on it</Link></div> : (
          <table className="tbl"><tbody>
            {pg.rows.map((s: any) => {
              const dl = s.delivery;
              const why: string[] = s.state === 'approved' && !s.ready ? s.reasons : (s.missing || []).map((m: any) => m.text);
              return (
                <tr key={s.id}>
                  <td><div className="strong">{s.title}</div>
                    <Badge kind={s.package_created || s.ready ? 'ok' : s.state === 'draft' ? 'warn' : 'info'}>{s.package_created ? 'Handed over' : s.ready ? 'Ready for developers' : s.state_text}</Badge>
                    {dl?.status === 'Delivered' && <> <Badge kind="ok">Delivered to {dl.delivered_to || 'the developer tool'}</Badge> <span className="xs muted">Receipt {dl.receipt_id}</span></>}
                    {dl && ['Failed', 'Rejected'].includes(dl.status) && <div className="small" style={{ color: 'var(--bad)' }}>{dl.error || 'The last send did not work.'}</div>}
                    {why.length > 0 && !s.package_created && <ul className="small muted" style={{ margin: '4px 0 0 18px' }}>{why.map((t) => <li key={t}>{t}</li>)}</ul>}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {s.package_created ? (dl?.status === 'Delivered' ? <span className="small muted">Delivered</span> : <button className="btn primary sm" disabled={act.busy} onClick={() => post('deliver', s.id, 'Sent. Receipt {r}')}>{dl && ['Failed', 'Rejected'].includes(dl.status) ? 'Send again' : 'Send to developer tool'}</button>)
                      : s.ready ? <button className="btn primary sm" disabled={act.busy} onClick={async () => (await act.ask(`Create the hand-over package for "${s.title}"? Any earlier package for this story is replaced.`, 'Create package')) && post('create', s.id, 'Package {r} created')}>Create hand-over package</button>
                      : s.state === 'waiting' ? <Link className="btn sm" href={`/products/${pid}/approvals`}>Waiting for {s.pending?.approver || 'approval'}</Link>
                      : <Link className="btn sm" href={`/products/${pid}/stories/${s.id}`}>{s.state === 'complete' ? 'Ask for approval' : 'Complete this story'}</Link>}
                    <button className="btn ghost sm" style={{ marginLeft: 6 }} onClick={() => setSel(s.id)}>Details</button>
                  </td>
                </tr>
              );
            })}
          </tbody></table>
        )}
        <Pager {...pg} />
      </Card>
      {chosen && <Preview pid={pid} story={chosen} />}
    </Page>
  );
}

function Preview({ pid, story }: { pid: string; story: string }) {
  const { data, error, loading } = useApi<any>(`/handoff/preview?story=${encodeURIComponent(story)}`, pid);
  if (loading) return <Loading />;
  if (error || !data) return <div className="callout warn" style={{ marginTop: 14 }}>{error}</div>;
  const pkg = data.package; const v = data.validation; const p = pkg.package || {};
  const n = (a: any) => (Array.isArray(a) ? a.length : 0);
  const json = JSON.stringify(pkg, null, 2);
  const counts: [string, number][] = [['Tests', n(pkg.acceptance_criteria)], ['Requirements', n(pkg.requirements)], ['Business rules', n(pkg.business_rules)], ['Flow steps', n(pkg.flow_refs)], ['Quality targets', n(pkg.applicable_nfrs)], ['Laws and duties', n(pkg.obligations)], ['Limits', n(pkg.constraints)], ['Other systems', n(pkg.interfaces)], ['Life cycles', n(pkg.state_maps)]];
  return (
    <details className="card" style={{ marginTop: 14, padding: '8px 16px' }} open>
      <summary className="strong" style={{ cursor: 'pointer', padding: 6 }}>Details for experts: what the package holds ({story})</summary>
      <div className="row" style={{ margin: '8px 0' }}><span className="mono">{p.package_id} v{p.package_version}</span><Badge kind={v.valid ? 'ok' : 'bad'}>{v.valid ? 'valid' : 'not valid'}</Badge></div>
      <div className="row wrap" style={{ gap: 18 }}>{counts.map(([l, c]) => <div key={l}><b style={{ fontSize: 20 }}>{c}</b><div className="xs muted">{l}</div></div>)}</div>
      <h3 style={{ margin: '14px 0 6px' }}>Checks</h3>
      {(v.checks || []).map((c: any) => <div key={c.name} className="small"><span style={{ color: `var(--${c.ok ? 'ok' : 'bad'})` }}>{c.ok ? '✓' : '✗'}</span> <span className="mono">{c.name}</span>{!c.ok && <span style={{ color: 'var(--bad)' }}> {c.message}</span>}</div>)}
      <div className="row" style={{ margin: '14px 0 6px' }}><h3 style={{ margin: 0 }}>Exact payload</h3><span className="xs muted">{json.length.toLocaleString('en-IN')} characters</span><span className="spacer" /><button className="btn sm" onClick={() => navigator.clipboard?.writeText(json)}>Copy JSON</button></div>
      <pre className="mono xs" style={{ maxHeight: 340, overflow: 'auto', background: 'var(--panel-2)', padding: 10, borderRadius: 8 }}>{json}</pre>
    </details>
  );
}
