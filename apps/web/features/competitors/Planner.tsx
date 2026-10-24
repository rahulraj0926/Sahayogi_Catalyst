'use client';
import { useMemo, useState } from 'react';
import { Empty, ErrorBox, Loading } from '@/components/ui';
import { Field, Modal, useAction } from '@/components/kit';
import { api, useApi } from '@/lib/api';
import { AddFeatureModal, PlanCard, PlanRow } from './PlanKit';

const PERIODS: [string, string][] = [['monthly', 'per month'], ['quarterly', 'per quarter'], ['yearly', 'per year'], ['one_time', 'paid once'], ['per_unit', 'per unit'], ['custom', 'custom']];
const money = (a: any, c = 'INR') => (a === undefined || a === null ? 'On request' : `${c === 'INR' ? '₹' : c + ' '}${Number(a).toLocaleString('en-IN')}`);

/** One form for adding a plan and for changing one: name, price, how it is billed and free or not. */
const USERS: [string, string][] = [['single_user', 'One user'], ['multi_user', 'A set number of users'], ['per_user', 'Price is for each user'], ['unlimited_users', 'No limit on users']];
/** "One user", "Up to 3 users" ... said in plain words. */
export const usersText = (p: any) => (p.seat_model === 'single_user' ? 'One user' : p.seat_model === 'multi_user' ? (p.max_users ? `Up to ${p.max_users} user${p.max_users === 1 ? '' : 's'}` : 'Several users') : p.seat_model === 'per_user' ? 'Price is for each user' : p.seat_model === 'unlimited_users' ? 'No limit on users' : 'Users not set');
const num = (x: any) => (x === '' || x === null || x === undefined ? null : Number(x));

/** Put every feature that plan `from` has into plan `to` (the ones `to` already has are skipped). Returns how many were added. */
async function copyFeatures(pid: string, from: string, to: string, all: any[]) {
  const ids = all.filter((f) => f.in_plans.includes(from) && !f.in_plans.includes(to)).map((f) => f.capability_id);
  for (let i = 0; i < ids.length; i += 200) await api('/competitors/our-plans/features', { product: pid, method: 'POST', body: { plan_id: to, capability_ids: ids.slice(i, i + 200), included: true } });
  return ids.length;
}

function PlanForm({ pid, plan, plans = [], all = [], onClose, onDone }: { pid: string; plan?: any; plans?: any[]; all?: any[]; onClose: () => void; onDone: () => void }) {
  // a new plan starts with everything the plan below it has: the dearest plan so far (or the last one added), because a higher plan always includes the lower ones
  const price = (p: any) => (p.is_free ? 0 : Number(p.price_monthly ?? (p.price_yearly != null ? p.price_yearly / 12 : p.amount ?? 0)) || 0);
  const [copyFrom, setCopyFrom] = useState(() => (plan || plans.length === 0 ? '' : [...plans].sort((a, b) => price(a) - price(b)).pop()!.id));
  const [v, setV] = useState({ title: plan?.title || '', monthly: plan?.price_monthly ?? '', yearly: plan?.price_yearly ?? '', seat_model: plan?.seat_model || 'single_user', max_users: plan?.max_users ?? 3, is_free: !!plan?.is_free });
  const act = useAction();
  const set = (k: string, x: any) => setV({ ...v, [k]: x });
  const m = num(v.monthly), y = num(v.yearly);
  // a plan saved with some other way of billing (every 3 months, once) keeps its old price unless a new one is typed
  const oldOnly = !!plan && plan.amount != null && plan.price_monthly == null && plan.price_yearly == null && !!plan.billing_period && !['monthly', 'yearly'].includes(plan.billing_period);
  const hint = m !== null && y !== null && m > 0 ? (y < m * 12 ? `A year costs ${Math.round((1 - y / (m * 12)) * 100)}% less than 12 months.` : y > m * 12 ? 'A year costs more than 12 months, please check.' : 'A year costs the same as 12 months.') : 'Fill in one or both. Leave a box empty if you do not sell it that way.';
  return (
    <Modal title={plan ? `Change ${plan.title}` : 'Add one of our plans'} onClose={onClose}>
      <Field label="Plan name"><input type="text" value={v.title} onChange={(e) => set('title', e.target.value)} placeholder="Starter" /></Field>
      <label className="small row" style={{ gap: 6, marginBottom: 8 }}><input type="checkbox" checked={v.is_free} onChange={(e) => set('is_free', e.target.checked)} />This plan is free</label>
      {!v.is_free && <>
        <div className="row">
          <Field label="Price each month (₹)"><input type="number" min={0} value={v.monthly} onChange={(e) => set('monthly', e.target.value)} placeholder="499" /></Field>
          <Field label="Price for a year (₹)"><input type="number" min={0} value={v.yearly} onChange={(e) => set('yearly', e.target.value)} placeholder="4999" /></Field>
        </div>
        <p className="small muted" style={{ margin: '0 0 10px' }}>{oldOnly ? `This plan is now priced ${money(plan.amount, plan.currency || 'INR')} ${(PERIODS.find(([k]) => k === plan.billing_period)?.[1] || '')}. Fill in a monthly or yearly price to change it.` : hint}</p>
      </>}
      <div className="row">
        <Field label="Who can use one plan"><select value={v.seat_model} onChange={(e) => set('seat_model', e.target.value)}>{USERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        {v.seat_model === 'multi_user' && <Field label="How many users"><input type="number" min={1} value={v.max_users} onChange={(e) => set('max_users', e.target.value)} /></Field>}
      </div>
      {!plan && plans.length > 0 && <Field label="Start with the features of" help="A higher plan includes what the lower one has, so this one starts with all of it. Add more or take some out after."><select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}><option value="">Nothing, start empty</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.title} ({p.feature_count} feature{p.feature_count === 1 ? '' : 's'})</option>)}</select></Field>}
      {act.box}
      <button className="btn primary" disabled={act.busy} onClick={() => act.run(async () => {
        if (!v.title.trim()) throw new Error('Please fill in the plan name.');
        if (v.seat_model === 'multi_user' && !(Number(v.max_users) >= 1)) throw new Error('Please say how many users the plan covers.');
        const free = v.is_free;
        const fields: any = {
          title: v.title.trim(), currency: 'INR', is_free: free,
          price_monthly: free ? null : m, price_yearly: free ? null : y,
          seat_model: v.seat_model, max_users: v.seat_model === 'multi_user' ? Number(v.max_users) : null,
        };
        // the older single price follows the monthly price (or the yearly one) so every other screen keeps working
        if (free || m !== null || y !== null || !oldOnly) { fields.amount = free ? null : m ?? y; fields.billing_period = m !== null ? 'monthly' : y !== null ? 'yearly' : 'monthly'; }
        if (plan) await api(`/items/${plan.id}`, { product: pid, method: 'PATCH', body: { fields } });
        else {
          for (const k of Object.keys(fields)) if (fields[k] === null) delete fields[k];
          const r = await api<any>('/items', { product: pid, method: 'POST', body: { type: 'PricingPlan', fields } });
          if (copyFrom && r?.item?.id) await copyFeatures(pid, copyFrom, r.item.id, all);
        }
        onDone();
      })}>{plan ? 'Save changes' : 'Add plan'}</button>
    </Modal>
  );
}

/** Our own plans: what each plan costs and which of our features it includes. Same plan card and feature list as a competitor's plans. */
export default function Planner({ pid, adding, setAdding }: { pid: string; scope?: string; adding: boolean; setAdding: (v: boolean) => void }) {
  const { data, error, loading, reload } = useApi<any>('/competitors/our-plans', pid, { keep: true });
  const [editing, setEditing] = useState<any>(null);
  const [addingTo, setAddingTo] = useState<any>(null);
  const act = useAction();
  const plans: any[] = data?.plans || [];
  const all: any[] = useMemo(() => data?.features || [], [data]);
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error || 'No data'} />;
  const removePlan = (p: any) => act.run(async () => { if (!(await act.ask(`Delete the plan “${p.title}”? Its features stay on our list.`, 'Delete'))) return; await api(`/items/${p.id}/status`, { product: pid, method: 'POST', body: { status: 'Deprecated' } }); reload(); });
  const takeOut = (p: any, capability_id: string) => act.run(async () => { await api('/competitors/our-plans/features', { product: pid, method: 'POST', body: { plan_id: p.id, capability_id, included: false } }); reload(); });
  return (
    <div className="flex flex-col gap-6">
      {act.box}
      {plans.length === 0 ? <Empty>No plans yet. Add the first one, for example Starter, Business or Enterprise. Then add features to each plan.</Empty> : (
        <PlanRow>
          {plans.map((p) => (
            <PlanCard
              key={p.id}
              title={p.title}
              action={{ label: 'Edit', onClick: () => setEditing(p) }}
              terms={p.is_free ? [{ id: `${p.id}-f`, label: 'Price', value: 'Free' }] : p.price_monthly == null && p.price_yearly == null ? [{ id: `${p.id}-o`, label: PERIODS.find(([k]) => k === p.billing_period)?.[1] || 'Price', value: money(p.amount, p.currency || 'INR') }] : [
                ...(p.price_monthly != null ? [{ id: `${p.id}-m`, label: 'per month', value: money(p.price_monthly, p.currency || 'INR') }] : []),
                ...(p.price_yearly != null ? [{ id: `${p.id}-y`, label: 'per year', value: money(p.price_yearly, p.currency || 'INR') }] : []),
              ]}
              note={usersText(p)}
              features={all.filter((f) => f.in_plans.includes(p.id)).map((f) => ({ key: f.capability_id, name: f.name }))}
              onRemoveFeature={(k) => takeOut(p, k)}
              onAddFeature={() => setAddingTo(p)}
              onDelete={() => removePlan(p)}
              busy={act.busy}
            />
          ))}
        </PlanRow>
      )}

      {adding && <PlanForm pid={pid} plans={plans} all={all} onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} />}
      {editing && <PlanForm pid={pid} plan={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />}
      {addingTo && (
        <AddFeatureModal
          title={`Add features to ${addingTo.title}`}
          copy={plans.filter((p) => p.id !== addingTo.id && p.feature_count > 0).map((p) => ({ key: p.id, label: p.title, count: p.feature_count }))}
          onCopy={(from) => copyFeatures(pid, from, addingTo.id, all)}
          known={all.filter((f) => !f.in_plans.includes(addingTo.id)).map((f) => ({ key: f.capability_id, name: f.name }))}
          onAddKnown={(key) => api('/competitors/our-plans/features', { product: pid, method: 'POST', body: { plan_id: addingTo.id, capability_id: key, included: true } })}
          rivals={{ pid, onAdd: (name) => api('/competitors/our-plans/features/new', { product: pid, method: 'POST', body: { features: [{ name }], plan_ids: [addingTo.id] } }) }}
          onAddNew={(names) => api('/competitors/our-plans/features/new', { product: pid, method: 'POST', body: { features: names.map((name) => ({ name })), plan_ids: [addingTo.id] } })}
          onClose={() => setAddingTo(null)}
          onDone={() => { setAddingTo(null); reload(); }}
        />
      )}
    </div>
  );
}
