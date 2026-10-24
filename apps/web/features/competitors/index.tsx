'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Effort, Queue, Sources } from './Experts';
import Dashboard from './Dashboard';
import Profile from './Profile';
import Catalog from './Catalog';
import Plans from './Plans';
import Planner from './Planner';
import { AddCompetitor } from './Import';
import type { FeatureProps } from '../types';
import { Badge, Card, Empty, ErrorBox, Loading, Page } from '@/components/ui';

import { useApi } from '@/lib/api';

const LEVEL_TONE: Record<string, string> = { strong: 'ok', parity: 'ok', partial: 'warn', absent: 'bad', unknown: '' };

const VIEWS = ['list', 'plans', 'catalog', 'planner', 'prices', 'compare', 'sources', 'queue', 'effort'];

/** Competitors. /competitors is the one list of every competitor (/list and /grid open the same page), /competitors/<view> one of the other pages, /competitors/<id> one profile. Prototype: cw_list.js, cw_compare.js, cw_profile.js, competitors_grid.js */
export default function Competitors({ pid, args, query }: FeatureProps) {
  const view = args[0] || 'dashboard';
  const isView = VIEWS.includes(view) || view === 'dashboard' || view === 'grid';
  const [scope, setScope] = useScope(pid);
  const [adding, setAdding] = useState(false);
  const [addingPlan, setAddingPlan] = useState(false);
  const [rev, setRev] = useState(0);
  const scopes = useApi<any>(isView ? '/competitors/scopes' : null, pid);
  if (!isView) return <Profile pid={pid} id={args[0]} query={query} />;
  const TITLE: Record<string, string> = { dashboard: 'Competitors', list: 'Competitors', grid: 'Competitors', plans: 'Our plans', planner: 'Our plans', catalog: 'Our feature list', prices: 'Prices', compare: 'Compare side by side', sources: 'Sources and evidence', queue: 'Verification queue', effort: 'Effort and cost' };
  const names: string[] = (scopes.data?.scopes || []).map((s: any) => s.name);
  const scoped = ['plans', 'planner'].includes(view);
  const hasModules = !!scopes.data?.has_modules;
  const done = () => { setAdding(false); scopes.reload(); setRev((n) => n + 1); };
  const right = (
    <span className="row wrap" style={{ gap: 8 }}>
      {scoped && hasModules && names.length > 0 && (
        <label className="small row" style={{ gap: 6 }}>Showing
          <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Part of our product">
            <option value="">Whole product</option>{(scopes.data?.scopes || []).map((s: any) => <option key={s.name} value={s.name}>{s.name}{s.competitors ? ` (${s.competitors})` : ''}</option>)}
          </select></label>)}
      {['dashboard', 'list', 'grid'].includes(view) && <button className="btn primary" onClick={() => setAdding(true)}>Add a competitor</button>}
      {view === 'planner' && <button className="btn primary inline-flex items-center gap-1" onClick={() => setAddingPlan(true)}><Plus size={14} />Add a plan</button>}
    </span>
  );
  return (
    <Page title={TITLE[view]} right={right}>
      <div key={rev}>
        {['dashboard', 'list', 'grid'].includes(view) && <Dashboard pid={pid} scope={scope} onScope={setScope} onAdd={() => setAdding(true)} />}
        {view === 'plans' && <Plans pid={pid} scope={scope} initial={query.get('c') || undefined} />}
        {view === 'planner' && <Planner pid={pid} scope={scope} adding={addingPlan} setAdding={setAddingPlan} />}
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

