'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge, Card, Empty, ErrorBox, Loading } from '@/components/ui';
import { Pager, useAction, usePaged } from '@/components/kit';
import { api, useApi } from '@/lib/api';

export const LEVEL_LABEL: Record<string, string> = { free: 'Free', entry: 'Entry', mid: 'Mid', top: 'Top', enterprise: 'Enterprise' };
export const SEAT_LABEL: Record<string, string> = { single_user: 'One user per licence', multi_user: 'Several users share one', per_user: 'Per user', unlimited_users: 'No user limit' };
const PERIOD: Record<string, string> = { month: 'month', quarter: '3 months', year: 'year', one_time: 'lifetime' };
const money = (a: any, c = 'INR') => (a === undefined || a === null ? '' : `${c === 'INR' ? '₹' : c + ' '}${Number(a).toLocaleString('en-IN')}`);
const LEVEL_TONE: Record<string, string> = { strong: 'ok', parity: 'ok', partial: 'warn', absent: 'bad', unknown: '' };

/** One competitor at a time: how many plans it sells, what each costs for each term, and which of our common features each plan includes. */
export default function Plans({ pid, initial, fixedId, scope }: { pid: string; initial?: string; fixedId?: string; scope?: string }) {
  const list = useApi<any>(`/competitors/plans${scope ? `?scope=${encodeURIComponent(scope)}` : ''}`, pid);
  const [pick, setId] = useState(initial || '');
  const id = fixedId || pick;
  const first = list.data?.competitors?.[0]?.id || '';
  useEffect(() => { if (!fixedId && !pick && first) setId(first); }, [fixedId, pick, first]);
  const det = useApi<any>(id ? `/competitors/plans?competitor=${encodeURIComponent(id)}` : null, pid);
  const [onlyUsed, setOnlyUsed] = useState(true);
  const act = useAction();
  const feats: any[] = (det.data?.features || []).filter((f: any) => !onlyUsed || f.in_plans.length > 0);
  const pg = usePaged(feats, 10);
  if (list.loading) return <Loading />;
  if (list.error || !list.data) return <ErrorBox message={list.error || 'No data'} />;
  const comps: any[] = list.data.competitors;
  if (!comps.length) return <Empty>No competitors yet. Add the first one from “All competitors”.</Empty>;
  const d = det.data;
  const base = `/products/${pid}/competitors`;
  const toggle = (f: any, plan: any, included: boolean) => act.run(async () => {
    await api('/competitors/plans/features', { product: pid, method: 'POST', body: { competitor: id, price_ids: plan.price_ids, ...(f.capability_id ? { capability_id: f.capability_id } : { rating_id: f.rating_id }), included } });
    det.reload(); list.reload();
  });
  return (
    <>
      <div className="row wrap" style={{ marginBottom: 12, gap: 10, alignItems: 'center' }}>
        {!fixedId && <><label className="small" htmlFor="plans-competitor">Competitor</label>
        <select id="plans-competitor" value={id} onChange={(e) => setId(e.target.value)}>
          {comps.map((c) => <option key={c.id} value={c.id}>{c.title}{c.tier ? ` (${c.tier})` : ''} · {c.plan_count} plan{c.plan_count === 1 ? '' : 's'}</option>)}
        </select>
        {d && <Link className="btn sm" href={`${base}/${id}?tab=prices`}>Edit prices</Link>}</>}
        <span className="spacer" />
        <label className="small row" style={{ gap: 6 }}><input type="checkbox" checked={onlyUsed} onChange={(e) => setOnlyUsed(e.target.checked)} />Only features some plan includes</label>
      </div>
      {act.box}
      {det.loading && !d ? <Loading /> : det.error || !d ? <ErrorBox message={det.error || 'No data'} /> : (
        <>
          <div className="grid g4" style={{ marginBottom: 14 }}>
            <Card title="Plans"><div className="strong" style={{ fontSize: 22 }}>{d.summary.plans}</div></Card>
            <Card title="Features in some plan"><div className="strong" style={{ fontSize: 22 }}>{d.summary.features_in_some_plan}</div><div className="xs muted">of {d.summary.features_listed} on our list</div></Card>
            <Card title="Plans with no features listed"><div className="strong" style={{ fontSize: 22 }}>{d.summary.plans_without_features}</div></Card>
          </div>
          {d.plans.length === 0 ? <Empty>{d.competitor.title} has no prices yet. <Link href={`${base}/${id}?tab=prices`}>Add the first price</Link>.</Empty> : (
            <>
              <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 6, marginBottom: 14, alignItems: 'stretch' }}>
                {d.plans.map((p: any) => {
                  const inc = d.features.filter((f: any) => f.in_plans.includes(p.key));
                  return (
                    <div key={p.key} className="card" style={{ flex: '0 0 250px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                      <div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
                        <div>
                          <div className="strong" style={{ fontSize: 16 }}>{p.plan}</div>
                          <div className="xs muted">{[p.tier_tag ? LEVEL_LABEL[p.tier_tag] : 'No level yet', p.product].filter(Boolean).join(' · ')}</div>
                        </div>
                        <div className="stack" style={{ gap: 2 }}>
                          {p.terms.map((t: any) => <div key={t.id} className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}><span className="muted">{PERIOD[t.period] || t.period}</span><span className="strong">{t.price_type === 'quote' ? 'On request' : money(t.amount, t.currency)}</span></div>)}
                        </div>
                        <div className="xs muted">{p.seat_model ? SEAT_LABEL[p.seat_model] : 'Users: not stated'}{p.max_users ? `, up to ${p.max_users}` : ''}</div>
                        <div style={{ borderTop: '1px solid var(--divider)', paddingTop: 8 }}>
                          <div className="xs muted" style={{ marginBottom: 4 }}>{inc.length} feature{inc.length === 1 ? '' : 's'} included</div>
                          {inc.length === 0 ? <div className="xs muted">None ticked yet. Tick them in the table below.</div> : (
                            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 3 }}>{inc.map((f: any) => <li key={f.key} className="small" style={{ display: 'flex', gap: 6 }}><span aria-hidden style={{ color: 'var(--ok)' }}>✓</span><span>{f.name}</span></li>)}</ul>)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <Card title="Tick what each plan includes" sub="Tick a box to say the plan includes that feature" flush>
                {feats.length === 0 ? <div className="card-b small muted">{d.features.length === 0 ? <>No features on our list yet. <Link href={`${base}/catalog`}>Add some</Link>.</> : 'No plan includes a feature yet. Untick “Only features some plan includes” to see all of them and start ticking.'}</div> : (
                  <div style={{ overflow: 'auto' }}><table className="tbl compact"><thead><tr><th>Feature</th><th>Rated</th>{d.plans.map((p: any) => <th key={p.key} className="xs" style={{ textAlign: 'center' }}>{p.plan}<div className="muted">{p.feature_count}</div></th>)}</tr></thead><tbody>
                    {pg.rows.map((f) => (
                      <tr key={f.key}>
                        <td><span className="strong">{f.name}</span>{f.category && <span className="xs muted"> · {f.category}</span>}{f.their_name && f.their_name !== f.name && <div className="xs muted">they call it: {f.their_name}</div>}</td>
                        <td>{f.level ? <Badge kind={LEVEL_TONE[f.level] as any}>{f.level}</Badge> : <span className="xs muted">no row</span>}</td>
                        {d.plans.map((p: any) => <td key={p.key} style={{ textAlign: 'center' }}><input type="checkbox" aria-label={`${f.name} in ${p.plan}`} checked={f.in_plans.includes(p.key)} disabled={act.busy} onChange={(e) => toggle(f, p, e.target.checked)} /></td>)}
                      </tr>
                    ))}
                  </tbody></table></div>
                )}
                <Pager {...pg} />
              </Card>
              <div className="xs muted" style={{ marginTop: 8 }}>Ticking a feature applies to every term of the plan (monthly, yearly, lifetime). If {d.competitor.title} has no row for the feature yet, an empty one is created so it can be rated later.</div>
            </>
          )}
        </>
      )}
    </>
  );
}
