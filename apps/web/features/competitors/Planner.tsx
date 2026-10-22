'use client';
import { Fragment, useState } from 'react';
import Link from 'next/link';
import { Badge, Card, Empty, ErrorBox, Loading } from '@/components/ui';
import { Field, Modal, Pager, useAction, usePaged } from '@/components/kit';
import { api, useApi } from '@/lib/api';
import { LEVEL_LABEL } from './Plans';
import { NumberPick } from './NumberPick';

const PERIODS: [string, string][] = [['monthly', 'per month'], ['quarterly', 'per quarter'], ['yearly', 'per year'], ['one_time', 'paid once'], ['per_unit', 'per unit'], ['custom', 'custom']];
const money = (a: any, c = 'INR') => (a === undefined || a === null ? 'On request' : `${c === 'INR' ? '₹' : c + ' '}${Number(a).toLocaleString('en-IN')}`);

/** One form for adding a plan and for changing one: name, price, how it is billed, free or not, and the competitor level it sits at. */
function PlanForm({ pid, plan, onClose, onDone }: { pid: string; plan?: any; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState({ title: plan?.title || '', amount: plan?.amount ?? '', billing_period: plan?.billing_period || 'monthly', tier_tag: plan?.tier_tag || '', is_free: !!plan?.is_free });
  const act = useAction();
  const set = (k: string, x: any) => setV({ ...v, [k]: x });
  return (
    <Modal title={plan ? `Change ${plan.title}` : 'Add one of our plans'} onClose={onClose}>
      <Field label="Plan name"><input type="text" value={v.title} onChange={(e) => set('title', e.target.value)} placeholder="Starter" /></Field>
      <div className="row"><Field label="Price (rupees)"><input type="number" min={0} value={v.amount} disabled={v.is_free} onChange={(e) => set('amount', e.target.value)} /></Field>
        <Field label="Billed"><select value={v.billing_period} onChange={(e) => set('billing_period', e.target.value)}>{PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field></div>
      <label className="small row" style={{ gap: 6, marginBottom: 8 }}><input type="checkbox" checked={v.is_free} onChange={(e) => set('is_free', e.target.checked)} />This plan is free</label>
      <Field label="Competitor plan level it sits at" help="We compare it with what competitors give at that level."><select value={v.tier_tag} onChange={(e) => set('tier_tag', e.target.value)}><option value="">Not decided</option>{Object.entries(LEVEL_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      {act.box}
      <button className="btn primary" disabled={act.busy} onClick={() => act.run(async () => {
        if (!v.title.trim()) throw new Error('Please fill in the plan name.');
        const price = !v.is_free && v.amount !== '' ? Number(v.amount) : null;
        if (plan) {
          await api(`/items/${plan.id}`, { product: pid, method: 'PATCH', body: { fields: { title: v.title.trim(), billing_period: v.billing_period, is_free: v.is_free, amount: price, tier_tag: v.tier_tag || null } } });
        } else {
          const fields: any = { title: v.title.trim(), currency: 'INR', billing_period: v.billing_period, is_free: v.is_free };
          if (price !== null) fields.amount = price;
          if (v.tier_tag) fields.tier_tag = v.tier_tag;
          await api('/items', { product: pid, method: 'POST', body: { type: 'PricingPlan', fields } });
        }
        onDone();
      })}>{plan ? 'Save changes' : 'Add plan'}</button>
    </Modal>
  );
}

/** Add a feature to our list and choose the plans that include it, in one step. */
function AddFeature({ pid, plans, onClose, onDone }: { pid: string; plans: any[]; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState({ name: '', category: '', description: '' });
  const [inPlans, setInPlans] = useState<string[]>([]);
  const act = useAction();
  return (
    <Modal title="Add a feature" onClose={onClose}>
      <Field label="Feature name"><input type="text" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Approval workflow" /></Field>
      <Field label="Group (optional)" help="Features with the same group are listed together."><input type="text" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} placeholder="Collaboration" /></Field>
      <Field label="What it means (optional)"><textarea rows={2} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
      {plans.length > 0 && <Field label="Include it in these plans">
        <div className="row wrap" style={{ gap: 10 }}>{plans.map((p) => <label key={p.id} className="small row" style={{ gap: 4 }}><input type="checkbox" checked={inPlans.includes(p.id)} onChange={(e) => setInPlans(e.target.checked ? [...inPlans, p.id] : inPlans.filter((x) => x !== p.id))} />{p.title}</label>)}</div>
      </Field>}
      {act.box}
      <button className="btn primary" disabled={act.busy} onClick={() => act.run(async () => {
        if (!v.name.trim()) throw new Error('Please fill in the feature name.');
        const fields: any = { title: v.name.trim() };
        if (v.category.trim()) fields.category = v.category.trim();
        if (v.description.trim()) fields.description = v.description.trim();
        const r = await api<any>('/items', { product: pid, method: 'POST', body: { type: 'Capability', fields } });
        for (const plan_id of inPlans) await api('/competitors/our-plans/features', { product: pid, method: 'POST', body: { plan_id, capability_id: r.item.id, included: true } });
        onDone();
      })}>Add feature</button>
    </Modal>
  );
}

const rupees = (n: any) => (n === null || n === undefined ? '-' : `₹${Math.round(n).toLocaleString('en-IN')}`);

/** What our plan at each level should look like: the average price and the features most competitor plans at that level share. */
function Recommended({ pid, scope, onCreated }: { pid: string; scope?: string; onCreated: () => void }) {
  const [share, setShare] = useState(60);
  const [users, setUsers] = useState(1);
  const { data, error, loading } = useApi<any>(`/competitors/recommended?threshold=${share}&users=${users}${scope ? `&scope=${encodeURIComponent(scope)}` : ''}`, pid, { keep: true });
  const [msg, setMsg] = useState<string | null>(null);
  const act = useAction();
  const levels: any[] = data?.levels || [];
  return (
    <Card title="Recommended from competitors" sub="The average price and the common features of competitor plans at each level" flush>
      <div className="card-b row wrap" style={{ gap: 10, alignItems: 'center' }}>
        <span className="small">A feature is recommended when at least</span>
        <NumberPick value={share} onChange={setShare} presets={[50, 60, 80]} min={1} max={100} label="Share of plans" suffix="%" />
        <span className="small">of the plans include it. Price for</span>
        <NumberPick value={users} onChange={setUsers} presets={[1, 5, 10, 25]} min={1} max={100000} label="Number of users" plural />
      </div>
      {act.box}
      {msg && <div className="callout ok small" style={{ margin: '0 14px 10px' }}>{msg}</div>}
      {loading && !data ? <div className="card-b"><Loading /></div> : error || !data ? <div className="card-b"><ErrorBox message={error || 'No data'} /></div> : levels.length === 0 ? (
        <div className="card-b small muted">{data.note || 'No competitor plan has a level yet.'} Give each competitor plan a level and tick its features in the competitor&apos;s “Plans and prices” tab.</div>
      ) : (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '0 14px 14px', alignItems: 'stretch' }}>
          {levels.map((l) => (
            <div key={l.tier_tag} className="card" style={{ flex: '0 0 270px', minWidth: 0 }}>
              <div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
                <div><div className="strong" style={{ fontSize: 16 }}>{l.label}</div><div className="xs muted">from {l.plans} plan{l.plans === 1 ? '' : 's'} of {l.competitors} competitor{l.competitors === 1 ? '' : 's'}</div></div>
                <div>
                  {l.tier_tag === 'free' ? <div className="strong" style={{ fontSize: 20 }}>Free</div> : l.price.avg_yearly_inr === null ? <div className="small muted">No price to average yet</div> : (
                    <><div className="strong" style={{ fontSize: 20 }}>{rupees(l.price.avg_yearly_inr)} <span className="small muted">per year</span></div>
                      <div className="xs muted">about {rupees(l.price.avg_monthly_inr)} a month · range {rupees(l.price.min_yearly_inr)} to {rupees(l.price.max_yearly_inr)}</div></>)}
                  {l.price.avg_once_inr !== null && <div className="xs muted">Paid once, average {rupees(l.price.avg_once_inr)}</div>}
                </div>
                <div style={{ borderTop: '1px solid var(--divider)', paddingTop: 8, flex: 1 }}>
                  <div className="xs muted" style={{ marginBottom: 4 }}>{l.features.length} recommended feature{l.features.length === 1 ? '' : 's'}{l.builds_on && l.new_features.length > 0 ? ` · ${l.new_features.length} added over ${l.builds_on}` : ''}</div>
                  {l.features.length === 0 ? <div className="xs muted">{l.plans_with_features === 0 ? 'No plan at this level has its features ticked yet.' : 'No feature is common enough at this share.'}</div> : (
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 3 }}>{l.features.map((f: any) => (
                      <li key={f.key} className="small" style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}><span aria-hidden style={{ color: 'var(--ok)' }}>✓</span><span style={{ flex: 1 }}>{f.name}{l.new_features.includes(f.name) && l.builds_on && <> <Badge kind="ok">new</Badge></>}</span><span className="xs muted">{f.count}/{f.of}</span></li>))}</ul>)}
                </div>
                <button className="btn sm primary" disabled={act.busy} onClick={() => act.run(async () => {
                  const r = await api<any>('/competitors/our-plans/from-recommendation', { product: pid, method: 'POST', body: { tier_tag: l.tier_tag, threshold: share, users, scope } });
                  setMsg(`Created “${r.title}” with ${r.features_linked} feature${r.features_linked === 1 ? '' : 's'}.${r.features_not_matched.length ? ` Not added because they are not matched to our feature list yet: ${r.features_not_matched.join(', ')}.` : ''}`);
                  onCreated();
                })}>Make our {l.label} plan from this</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/** Our own feature planning: which of our common features go into which of our plans, beside what competitors give at the same level. */
export default function Planner({ pid, scope }: { pid: string; scope?: string }) {
  const { data, error, loading, reload } = useApi<any>('/competitors/our-plans', pid);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [addingFeature, setAddingFeature] = useState(false);
  const act = useAction();
  const feats: any[] = data?.features || [];
  const pg = usePaged(feats, 10);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error || 'No data'} />;
  const plans: any[] = data.plans;
  const base = `/products/${pid}/competitors`;
  const toggle = (f: any, p: any, included: boolean) => act.run(async () => { await api('/competitors/our-plans/features', { product: pid, method: 'POST', body: { plan_id: p.id, capability_id: f.capability_id, included } }); reload(); });
  const removePlan = (p: any) => act.run(async () => { if (!(await act.ask(`Remove the plan “${p.title}”? Its features are kept on our list.`, 'Remove'))) return; await api(`/items/${p.id}/status`, { product: pid, method: 'POST', body: { status: 'Deprecated' } }); reload(); });
  const setLevel = (p: any, tier_tag: string) => act.run(async () => { await api(`/items/${p.id}`, { product: pid, method: 'PATCH', body: { fields: { tier_tag: tier_tag || null } } }); reload(); });
  return (
    <>
      <div className="callout" style={{ marginBottom: 12 }}><div className="small">Decide which features each of our plans includes. The “Market” column shows how many competitor plans include the feature, so you can see what customers expect before you decide. Set each plan&apos;s level to see what it is missing against competitors at that level.</div></div>
      {act.box}
      <Recommended pid={pid} scope={scope} onCreated={reload} />
      <div style={{ height: 14 }} />
      <div className="row wrap" style={{ marginBottom: 10 }}><span className="small muted">{plans.length} plan{plans.length === 1 ? '' : 's'} · {feats.length} features on our list</span><span className="spacer" /><button className="btn" onClick={() => setAddingFeature(true)}>Add a feature</button><button className="btn primary" onClick={() => setAdding(true)}>Add our plan</button></div>
      {plans.length === 0 ? <Empty>No plans of ours yet. Add the first one, for example Starter, Business and Enterprise.</Empty> : (
        <>
          <div className="grid g3" style={{ marginBottom: 14 }}>
            {plans.map((p) => (
              <Card key={p.id} title={p.title} sub={p.is_free ? 'Free' : `${money(p.amount, p.currency || 'INR')} ${PERIODS.find(([k]) => k === p.billing_period)?.[1] || ''}`}>
                <div className="row" style={{ gap: 6, alignItems: 'center' }}><span className="xs muted">Level</span>
                  <select value={p.tier_tag || ''} onChange={(e) => setLevel(p, e.target.value)} aria-label={`Level of ${p.title}`}><option value="">Not decided</option>{Object.entries(LEVEL_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
                <div className="small" style={{ marginTop: 8 }}><Badge kind={p.feature_count ? 'ok' : 'warn'}>{p.feature_count} feature{p.feature_count === 1 ? '' : 's'}</Badge>{' '}
                  {p.tier_tag && <Badge kind={p.below_market.length ? 'warn' : 'ok'}>{p.below_market.length ? `${p.below_market.length} below market` : 'matches market'}</Badge>}</div>
                <div className="row" style={{ gap: 6, marginTop: 8 }}><button className="btn sm" onClick={() => setEditing(p)}>Change name, price or level</button><button className="btn sm ghost" onClick={() => removePlan(p)}>Remove</button></div>
                {p.below_market.length > 0 && <div className="xs muted" style={{ marginTop: 6 }}>Most competitor {LEVEL_LABEL[p.tier_tag]} plans also include: {p.below_market.slice(0, 6).join(', ')}{p.below_market.length > 6 ? ` and ${p.below_market.length - 6} more` : ''}.</div>}
              </Card>
            ))}
          </div>
          <Card title="Features in each plan" sub="Tick to include" right={<button className="btn sm primary" onClick={() => setAddingFeature(true)}>Add a feature</button>} flush>
            {feats.length === 0 ? <div className="card-b small muted">No features on our list yet. <button className="btn sm" onClick={() => setAddingFeature(true)}>Add a feature</button> or <Link href={`${base}/catalog`}>pick from a starting list</Link>.</div> : (
              <div style={{ overflow: 'auto' }}><table className="tbl compact"><thead><tr><th>Feature</th><th>Market</th>{plans.map((p) => <th key={p.id} className="xs" style={{ textAlign: 'center' }}>{p.title}<div className="muted">{p.feature_count}</div></th>)}</tr></thead><tbody>
                {pg.rows.map((f, i) => (
                  <Fragment key={f.capability_id}>
                  {(i === 0 || (pg.rows[i - 1].category || 'Other') !== (f.category || 'Other')) && <tr><td colSpan={plans.length + 2} className="xs strong" style={{ background: 'var(--surface-muted)' }}>{f.category || 'Other'}</td></tr>}
                  <tr>
                    <td><span className="strong">{f.name}</span>{f.category && <span className="xs muted"> · {f.category}</span>}</td>
                    <td className="small">{f.market ? <Badge kind={f.market.overall_pct >= 80 ? 'ok' : f.market.overall_pct >= 50 ? 'warn' : ''}>{f.market.overall_pct}% of plans</Badge> : <span className="xs muted">no plan lists it</span>}</td>
                    {plans.map((p) => <td key={p.id} style={{ textAlign: 'center' }}><input type="checkbox" aria-label={`${f.name} in ${p.title}`} checked={f.in_plans.includes(p.id)} disabled={act.busy} onChange={(e) => toggle(f, p, e.target.checked)} /></td>)}
                  </tr>
                  </Fragment>
                ))}
              </tbody></table></div>
            )}
            <Pager {...pg} />
          </Card>
        </>
      )}
      {adding && <PlanForm pid={pid} onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} />}
      {editing && <PlanForm pid={pid} plan={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />}
      {addingFeature && <AddFeature pid={pid} plans={plans} onClose={() => setAddingFeature(false)} onDone={() => { setAddingFeature(false); reload(); }} />}
    </>
  );
}
