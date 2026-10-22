'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Effort, Queue, Sources } from './Experts';
import Dashboard from './Dashboard';
import Profile from './Profile';
import Catalog from './Catalog';
import Plans from './Plans';
import Planner from './Planner';
import { AddCompetitor } from './Import';
import type { FeatureProps } from '../types';
import { NumberPick } from './NumberPick';
import { Badge, Card, Empty, ErrorBox, Loading, Page } from '@/components/ui';
import { Pager, fmtDate, usePaged } from '@/components/kit';
import { useApi } from '@/lib/api';

const LEVEL_TONE: Record<string, string> = { strong: 'ok', parity: 'ok', partial: 'warn', absent: 'bad', unknown: '' };

const VIEWS = ['list', 'plans', 'grid', 'catalog', 'planner', 'prices', 'compare', 'sources', 'queue', 'effort'];

/** Competitors. The sidebar (components/shell/groups.ts, competitorGroups) picks the view: /competitors is the dashboard, /competitors/<view> one of the lists, /competitors/<id> one profile. Prototype: cw_list.js, cw_compare.js, cw_profile.js, competitors_grid.js */
export default function Competitors({ pid, args, query }: FeatureProps) {
  const view = args[0] || 'dashboard';
  const isView = VIEWS.includes(view) || view === 'dashboard';
  const [scope, setScope] = useScope(pid);
  const [adding, setAdding] = useState(false);
  const [rev, setRev] = useState(0);
  const scopes = useApi<any>(isView ? '/competitors/scopes' : null, pid);
  if (!isView) return <Profile pid={pid} id={args[0]} query={query} />;
  const TITLE: Record<string, string> = { dashboard: 'Competitors dashboard', list: 'All competitors', plans: 'Plans and features', planner: 'Plans and features', grid: 'Compare competitors', catalog: 'Our feature list', prices: 'Prices', compare: 'Compare side by side', sources: 'Sources and evidence', queue: 'Verification queue', effort: 'Effort and cost' };
  const names: string[] = (scopes.data?.scopes || []).map((s: any) => s.name);
  const scoped = ['dashboard', 'list', 'grid', 'plans', 'planner'].includes(view);
  const hasModules = !!scopes.data?.has_modules;
  const done = () => { setAdding(false); scopes.reload(); setRev((n) => n + 1); };
  const right = (
    <span className="row wrap" style={{ gap: 8 }}>
      {scoped && hasModules && names.length > 0 && (
        <label className="small row" style={{ gap: 6 }}>Showing
          <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Part of our product">
            <option value="">Whole product</option>{(scopes.data?.scopes || []).map((s: any) => <option key={s.name} value={s.name}>{s.name}{s.competitors ? ` (${s.competitors})` : ''}</option>)}
          </select></label>)}
      {['dashboard', 'list'].includes(view) && <button className="btn primary" onClick={() => setAdding(true)}>Add a competitor</button>}
    </span>
  );
  return (
    <Page title={TITLE[view]} right={right}>
      <div key={rev}>
        {view === 'dashboard' && <Dashboard pid={pid} scope={scope} onScope={setScope} onAdd={() => setAdding(true)} />}
        {view === 'list' && <List pid={pid} scope={scope} />}
        {view === 'grid' && <Grid pid={pid} scope={scope} />}
        {view === 'plans' && <Plans pid={pid} scope={scope} initial={query.get('c') || undefined} />}
        {view === 'planner' && <Planner pid={pid} scope={scope} />}
        {view === 'catalog' && <Catalog pid={pid} />}
        {view === 'prices' && <Prices pid={pid} />}
        {view === 'compare' && <Compare pid={pid} />}
        {view === 'sources' && <Sources pid={pid} />}
        {view === 'queue' && <Queue pid={pid} />}
        {view === 'effort' && <Effort pid={pid} />}
      </div>
      {adding && <AddCompetitor pid={pid} scopes={names} hasModules={hasModules} defaultScope={scope} onClose={() => setAdding(false)} onDone={done} />}
    </Page>
  );
}

/** Which part of our product the competitor pages are about, remembered per product in this browser. */
function useScope(pid: string): [string, (v: string) => void] {
  const key = `sd_comp_scope_${pid}`;
  const [scope, set] = useState('');
  useEffect(() => { try { set(localStorage.getItem(key) || ''); } catch { /* storage blocked */ } }, [key]);
  return [scope, (v: string) => { set(v); try { if (v) localStorage.setItem(key, v); else localStorage.removeItem(key); } catch { /* storage blocked */ } }];
}

const TIER_LABEL: Record<string, string> = { T1: 'Tier 1', T2: 'Tier 2', T3: 'Tier 3', S: 'Substitute', unassigned: 'No tier yet' };

function List({ pid, scope }: { pid: string; scope: string }) {
  const { data, error, loading } = useApi<any>(`/competitors/tiers${scope ? `?scope=${encodeURIComponent(scope)}` : ''}`, pid);
  const [q, setQ] = useState(''); const [tier, setTier] = useState('');
  const flat: any[] = data ? Object.keys(TIER_LABEL).flatMap((t) => (data.tiers[t] || []).map((x: any) => ({ ...x, _tier: t }))) : [];
  const list = flat.filter((x) => (!q || x.title.toLowerCase().includes(q.toLowerCase())) && (!tier || x._tier === tier));
  const pg = usePaged(list, 10);
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error || 'No data'} />;
  const tabs: [string, string][] = [['', 'All'], ...Object.entries(TIER_LABEL).filter(([t]) => (data.tiers[t] || []).length).map(([t, l]): [string, string] => [t, l])];
  return (
    <>
      <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 10 }}>
        <input type="search" placeholder="Search competitors" aria-label="Search competitors" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
        <div className="seg" role="group" aria-label="Tier">{tabs.map(([t, l]) => <button key={t} type="button" className={tier === t ? 'on' : ''} onClick={() => setTier(t)}>{l}</button>)}</div>
      </div>
      <section className="card">
        {list.length === 0 ? <Empty>{flat.length ? 'No competitor matches.' : 'No competitors yet. Add the first one, or import a list from Excel.'}</Empty> : (
          <table className="tbl"><thead><tr><th>Competitor</th><th>Tier</th><th>Part of our product</th><th>Prices</th><th>Last updated</th></tr></thead><tbody>{pg.rows.map((x) => (
            <tr key={x.id}><td><Link className="strong" href={`/products/${pid}/competitors/${x.id}`}>{x.title}</Link></td>
              <td className="small">{TIER_LABEL[x._tier]}</td>
              <td className="small">{(x.scopes || []).length ? x.scopes.map((s: string) => <Badge key={s}>{s}</Badge>) : <span className="muted">Whole product</span>}</td>
              <td className="small">{x.prices || <span className="muted">none</span>}</td>
              <td className="small">{x.last_update ? fmtDate(x.last_update) : <span className="muted">Not yet</span>}</td></tr>
          ))}</tbody></table>)}
        <Pager {...pg} />
      </section>
    </>
  );
}

const LEVEL_OPTIONS: [string, string][] = [['free', 'Free'], ['entry', 'Entry (basic)'], ['mid', 'Mid'], ['top', 'Top'], ['enterprise', 'Enterprise']];
const rs = (n: any) => (n === null || n === undefined ? null : `₹${Math.round(n).toLocaleString('en-IN')}`);
const SEATS: Record<string, string> = { single_user: 'One user per licence', multi_user: 'Several users share one', per_user: 'Per user', unlimited_users: 'No user limit' };

/** Competitors side by side at one plan level (Free first): one column per plan with its price, and a tick for each feature it includes. A company with no Free plan is shown by its Entry plan, marked as such; one with neither is only listed underneath. */
function Grid({ pid, scope }: { pid: string; scope: string }) {
  const sq = scope ? `&scope=${encodeURIComponent(scope)}` : '';
  const [level, setLevel] = useState('free');
  const [users, setUsers] = useState(1);
  const [q, setQ] = useState('');
  const list = useApi<any>(`/competitors/plans?x=1${sq}`, pid);
  const cmp = useApi<any>(`/competitors/compare-plans?level=${level}&users=${users}${level === 'free' ? '&fallback=entry' : ''}${sq}`, pid, { keep: true });
  const rows = ((cmp.data?.features || []) as any[]).filter((f: any) => !q || (f.tag || f.name).toLowerCase().includes(q.toLowerCase()));
  const pg = usePaged<any>(rows, 10);
  if (list.loading) return <Loading />;
  if (list.error || !list.data) return <ErrorBox message={list.error || 'No data'} />;
  const comps: any[] = list.data.competitors;
  if (!comps.length) return <Empty>No competitors yet.</Empty>;
  const base = `/products/${pid}/competitors`;
  const cols: any[] = cmp.data?.columns || [];
  return (
    <>
      <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 10 }}>
        <div className="seg" role="group" aria-label="Plan level">{LEVEL_OPTIONS.map(([k, l]) => <button key={k} type="button" className={level === k ? 'on' : ''} onClick={() => setLevel(k)}>{l}</button>)}</div>
        <span className="small muted">Price for</span><NumberPick value={users} onChange={setUsers} presets={[1, 5, 10, 25]} min={1} max={100000} label="Number of users" plural />
        <input type="search" placeholder="Search features" aria-label="Search features" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 200 }} />
        <span className="spacer" /><Link className="btn" href={`${base}/catalog`}>Match feature names</Link>
      </div>
      {(cmp.loading && !cmp.data ? <Loading /> : cmp.error || !cmp.data ? <ErrorBox message={cmp.error || 'No data'} /> : cols.length === 0 ? (
        <Empty>No competitor has a plan tagged {cmp.data.label} yet. Give each plan a level in the competitor&apos;s “Plans and prices” tab.</Empty>
      ) : (
        <Card flush>
          <div style={{ overflow: 'auto' }}><table className="tbl compact">
            <thead><tr><th>{cmp.data.label} plans</th>{cols.map((c: any) => <th key={c.key} className="xs" style={{ textAlign: 'center' }}><Link href={`${base}/${c.competitor.id}`}>{c.competitor.title}</Link><div className="muted">{c.plan}</div>{c.shown_as_label && <div><Badge kind="warn">{c.shown_as_label} plan</Badge></div>}</th>)}</tr></thead>
            <tbody>
              <tr><td className="strong">Price per year</td>{cols.map((c: any) => <td key={c.key} className="strong" style={{ textAlign: 'center' }}>{rs(c.yearly_inr) ?? <span className="muted">-</span>}{c.once_inr !== null && <div className="xs muted">{rs(c.once_inr)} once</div>}</td>)}</tr>
              <tr><td className="small">Users covered</td>{cols.map((c: any) => <td key={c.key} className="xs" style={{ textAlign: 'center' }}>{c.seat_model ? SEATS[c.seat_model] : <span className="muted">Not stated</span>}{c.max_users ? `, up to ${c.max_users}` : ''}</td>)}</tr>
              {pg.rows.map((f: any) => <tr key={f.key}><td className="strong">{f.name}<div className="xs muted">{f.count} of {cols.length}</div></td>{cols.map((c: any) => <td key={c.key} style={{ textAlign: 'center' }}>{c.feature_keys.includes(f.key) ? <span aria-label="included" style={{ color: 'var(--ok)' }}>✓</span> : <span className="muted" aria-label="not included">-</span>}</td>)}</tr>)}
              <tr><td className="strong">Features included</td>{cols.map((c: any) => <td key={c.key} className="strong" style={{ textAlign: 'center' }}>{c.feature_count}</td>)}</tr>
            </tbody>
          </table></div>
          <Pager {...pg} />
          {cmp.data.fallback_used > 0 && <div className="card-b xs muted">{cmp.data.fallback_used} competitor{cmp.data.fallback_used === 1 ? ' has' : 's have'} no {cmp.data.label} plan, so {cmp.data.fallback_used === 1 ? 'its' : 'their'} {cmp.data.fallback_label} plan is shown instead (marked above).</div>}
          {cmp.data.without_plan.length > 0 && <div className="card-b xs muted">Left out, no {cmp.data.label}{cmp.data.fallback_label ? ` or ${cmp.data.fallback_label}` : ''} plan: {cmp.data.without_plan.map((x: any) => x.title).join(', ')}.</div>}
          {cmp.data.columns_with_features < cols.length && <div className="card-b xs muted">{cols.length - cmp.data.columns_with_features} plan{cols.length - cmp.data.columns_with_features === 1 ? '' : 's'} above {cols.length - cmp.data.columns_with_features === 1 ? 'has' : 'have'} no features ticked yet.</div>}
        </Card>
      ))}
    </>
  );
}

function Prices({ pid }: { pid: string }) {
  const { data, error, loading } = useApi<any>('/competitors/prices', pid);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error || 'No data'} />;
  if (!data.groups.length) return <Empty>No prices recorded yet.</Empty>;
  return (
    <>
      <div className="small muted" style={{ marginBottom: 8 }}>Rates as of {data.fx.date}: 1 USD = ₹{data.fx.USD}, 1 EUR = ₹{data.fx.EUR}</div>
      {data.groups.map((g: any) => (
        <Card key={g.key} title={`${g.unit} · ${g.price_type} · ${g.billing_model} · ${g.tax_basis}`} flush>
          <table className="tbl compact"><thead><tr><th>Competitor</th><th>Plan</th><th>Price</th><th>In INR</th><th>Captured</th><th>State</th></tr></thead><tbody>
            {g.rows.map((r: any) => <tr key={r.id}><td><Link href={`/products/${pid}/competitors/${r.competitor.id}`}>{r.competitor.title}</Link></td><td>{r.plan}</td><td>{r.currency} {r.amount}</td><td>₹{Math.round(r.amount_inr).toLocaleString('en-IN')}</td><td className="small muted">{r.captured_on} ({r.ageDays} d)</td><td><Badge kind={r.counted ? 'ok' : 'warn'}>{r.counted ? 'counted' : r.freshness !== 'fresh' ? r.freshness : 'not counted'}</Badge></td></tr>)}
          </tbody></table>
        </Card>
      ))}
    </>
  );
}

function Compare({ pid }: { pid: string }) {
  const [ours, setOurs] = useState(true);
  const [users, setUsers] = useState(10);
  const { data, error, loading } = useApi<any>(`/competitors/compare?include_ours=${ours}&users=${users}`, pid);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error || 'No data'} />;
  const cols: any[] = data.columns;
  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}><label><input type="checkbox" checked={ours} onChange={(e) => setOurs(e.target.checked)} /> Include our product</label><label className="small muted">Users for per-user prices <input type="number" min={1} value={users} onChange={(e) => setUsers(Number(e.target.value) || 1)} style={{ width: 80 }} /></label></div>
      <Card title="Profile" flush><div style={{ overflow: 'auto' }}><table className="tbl compact"><thead><tr><th />{cols.map((c) => <th key={c.id}>{c.title}<div className="xs muted">{c.tier}</div></th>)}</tr></thead><tbody>
        {data.profile_rows.map((r: any) => <tr key={r.field}><td className="muted">{r.label}</td>{cols.map((c) => <td key={c.id}>{(() => { const v = r.values[c.id]; const x = v && typeof v === 'object' && 'value' in v ? v.value : v; return Array.isArray(x) ? x.join(', ') : x ?? ''; })()}</td>)}</tr>)}
      </tbody></table></div></Card>
      <div style={{ height: 12 }} />
      <Card title="Capabilities" flush><div style={{ overflow: 'auto' }}><table className="tbl compact"><thead><tr><th>Capability</th><th>Weight</th>{cols.map((c) => <th key={c.id}>{c.title}</th>)}</tr></thead><tbody>
        {data.capability_rows.map((r: any) => <tr key={r.tag}><td className="strong">{r.tag}</td><td>{r.importance}</td>{cols.map((c) => { const x = r.cells[c.id]; return <td key={c.id}>{x ? <Badge kind={LEVEL_TONE[x.level || x.rating] ?? ''}>{x.level || x.rating}</Badge> : ''}</td>; })}</tr>)}
      </tbody></table></div></Card>
      <div style={{ height: 12 }} />
      <Card title="Prices (excluding GST, in INR)" flush><table className="tbl compact"><thead><tr><th>Competitor</th><th>Plan</th><th>Amount</th><th>Group</th><th>12 months</th><th>36 months</th><th>State</th></tr></thead><tbody>
        {data.price_rows.map((r: any) => <tr key={r.id}><td>{r.competitor}</td><td>{r.plan}</td><td>{r.currency} {r.amount} / {r.unit}</td><td className="small">{r.group}</td><td>{r.cost_12m_inr ? `₹${Math.round(r.cost_12m_inr).toLocaleString('en-IN')}` : ''}</td><td>{r.cost_36m_inr ? `₹${Math.round(r.cost_36m_inr).toLocaleString('en-IN')}` : ''}</td><td><Badge kind={r.counted ? 'ok' : 'warn'}>{r.counted ? 'counted' : r.freshness}</Badge></td></tr>)}
      </tbody></table></Card>
      <ul className="small muted">{(data.rules || []).map((r: string) => <li key={r}>{r}</li>)}</ul>
      <a className="btn sm" href={`/api/v1/competitors/compare?include_ours=${ours}&users=${users}&format=csv&product=${pid}`}>Download CSV</a>
    </>
  );
}

