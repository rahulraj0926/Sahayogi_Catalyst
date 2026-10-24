'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Badge, Empty, ErrorBox, Loading } from '@/components/ui';
import { Field, Modal, useAction } from '@/components/kit';
import { api, useApi } from '@/lib/api';
import { CopyBar, FeatureBar, FeatureGrid, PlanCard, PlanRow, useBulkTicks, type Filters } from './PlanKit';

export const SEAT_LABEL: Record<string, string> = { single_user: 'One user per licence', multi_user: 'Several users share one', per_user: 'Per user', unlimited_users: 'No user limit' };
const PERIOD: Record<string, string> = { month: 'month', quarter: '3 months', year: 'year', one_time: 'lifetime' };
const money = (a: any, c = 'INR') => (a === undefined || a === null ? '' : `${c === 'INR' ? '₹' : c + ' '}${Number(a).toLocaleString('en-IN')}`);

/** Change the name of one plan (every term of it keeps its own price). */
function RenamePlan({ pid, plan, onClose, onDone }: { pid: string; plan: any; onClose: () => void; onDone: (name: string) => void }) {
  const [name, setName] = useState(plan.plan || '');
  const act = useAction();
  return (
    <Modal title={`Rename ${plan.plan}`} onClose={onClose}>
      <Field label="Plan name"><input type="text" autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
      {act.box}
      <button className="btn primary" disabled={act.busy || !name.trim()} onClick={() => act.run(async () => {
        for (const id of plan.price_ids) await api(`/items/${id}`, { product: pid, method: 'PATCH', body: { fields: { plan: name.trim() } } });
        onDone(name.trim());
      })}>Save</button>
    </Modal>
  );
}

/** One competitor at a time: what each plan costs and which of our features each plan includes. Ticking is instant and can be done in bulk. */
export default function Plans({ pid, initial, fixedId, scope, onChanged, records, isUnchecked, onCheck, actions }: { actions?: ReactNode; pid: string; initial?: string; fixedId?: string; scope?: string; onChanged?: () => void; records?: any[]; isUnchecked?: (r: any) => boolean; onCheck?: (ids: string[], label: string) => void }) {
  const list = useApi<any>(`/competitors/plans${scope ? `?scope=${encodeURIComponent(scope)}` : ''}`, pid, { keep: true });
  const [pick, setId] = useState(initial || '');
  const id = fixedId || pick;
  const first = list.data?.competitors?.[0]?.id || '';
  useEffect(() => { if (!fixedId && !pick && first) setId(first); }, [fixedId, pick, first]);
  const det = useApi<any>(id ? `/competitors/plans?competitor=${encodeURIComponent(id)}` : null, pid, { keep: true });
  const d = det.data;
  const act = useAction();
  const plans: any[] = d?.plans || [];

  // names changed on this screen show at once, before the server answers
  const [names, setNames] = useState<Record<string, string>>({});
  const sig = d ? `${d.competitor?.id}|${plans.map((p: any) => p.key).join(',')}` : '';
  useEffect(() => { setNames({}); setFilters({}); }, [sig]);
  const nameOf = (key: string) => names[key] ?? plans.find((p) => p.key === key)?.plan ?? '';

  const bulk = useBulkTicks({
    initial: d ? Object.fromEntries(d.features.map((f: any) => [f.key, f.in_plans])) : null,
    sig, fkey: (f) => f.key, colName: nameOf, onStart: act.clear,
    send: async (col, fs, included) => {
      const plan = plans.find((p) => p.key === col);
      await api('/competitors/plans/features', { product: pid, method: 'POST', body: { competitor: id, price_ids: plan?.price_ids, features: fs.map((f) => (f.capability_id ? { capability_id: f.capability_id } : { rating_id: f.rating_id })), included } });
    },
  });

  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [filters, setFilters] = useState<Filters>({});
  const [rename, setRename] = useState<any>(null);
  const [hl, setHl] = useState({ from: '', to: '' });
  // inside each group the features some plan has come first, then the ones no plan has (decided from what the server last said, so rows do not jump while you tick)
  const feats: any[] = useMemo(() => (d?.features || []).slice().sort((a: any, b: any) => (a.category || '~').localeCompare(b.category || '~') || (b.in_plans.length > 0 ? 1 : 0) - (a.in_plans.length > 0 ? 1 : 0) || a.name.localeCompare(b.name)), [d]);
  const groups = useMemo(() => [...new Set(feats.map((f: any) => f.category || 'Other'))] as string[], [feats]);
  const shown = useMemo(() => feats.filter((f: any) => {
    if (group && (f.category || 'Other') !== group) return false;
    if (q && !`${f.name} ${f.category || ''}`.toLowerCase().includes(q.toLowerCase())) return false;
    for (const [col, mode] of Object.entries(filters)) if (bulk.has(f, col) !== (mode === 'in')) return false;
    return true;
  }), [feats, group, q, filters, bulk.ticks]); // eslint-disable-line react-hooks/exhaustive-deps

  if (list.loading && !list.data) return <Loading />;
  if (list.error || !list.data) return <ErrorBox message={list.error || 'No data'} />;
  const comps: any[] = list.data.competitors;
  if (!comps.length) return <Empty>No competitors yet. Add the first one from “Competitors”.</Empty>;
  const base = `/products/${pid}/competitors`;

  const removePlan = (p: any) => act.run(async () => {
    if (!(await act.ask(`Delete the plan “${p.plan}” with all of its prices? It is kept in history but no longer counted.`, 'Delete'))) return;
    for (const pidn of p.price_ids) await api(`/items/${pidn}/status`, { product: pid, method: 'POST', body: { status: 'Retired' } });
    onChanged?.(); det.reload(); list.reload();
  });
  /** Who checked the saved prices behind a plan, with a button to check them. */
  const checkLine = (p: any) => {
    if (!records) return null;
    const rs = records.filter((r) => p.price_ids.includes(r.id));
    const todo = rs.filter((r) => (isUnchecked ? isUnchecked(r) : false) || r.status === 'Draft');
    const who = Array.from(new Set(rs.map((r) => r.verified_by).filter(Boolean)));
    const old = rs.some((r) => r._freshness && r._freshness !== 'fresh');
    return (
      <div className="flex flex-wrap items-center gap-2">
        {rs.some((r) => r.status === 'Disputed') ? <Badge kind="bad">Disputed</Badge> : todo.length === 0 ? <Badge kind="ok">{who.length ? `Checked by ${who.join(', ')}` : 'Checked'}</Badge> : <Badge kind="warn">Not checked yet</Badge>}
        {todo.length > 0 && onCheck && <button type="button" className="text-[13px] font-medium text-[var(--sd-accent)]" onClick={() => onCheck(todo.map((r) => r.id), `${p.plan}: ${p.terms.map((t: any) => `${t.price_type === 'quote' ? 'On request' : money(t.amount, t.currency)} / ${PERIOD[t.period] || t.period}`).join(', ')}`)}>Mark as checked</button>}
        {old && <span className="text-xs text-[var(--text-muted)]">Price may be out of date</span>}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {!fixedId && (
        <div className="row wrap" style={{ gap: 10, alignItems: 'center' }}>
          <label className="small" htmlFor="plans-competitor">Competitor</label>
          <select id="plans-competitor" value={id} onChange={(e) => setId(e.target.value)}>
            {comps.map((c) => <option key={c.id} value={c.id}>{c.title} · {c.plan_count} plan{c.plan_count === 1 ? '' : 's'}</option>)}
          </select>
          {d && <Link className="btn sm" href={`${base}/${id}?tab=prices`}>Edit prices</Link>}
        </div>
      )}
      {act.box}
      {fixedId && (
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="m-0 mr-auto text-[15px] font-semibold text-[var(--text-heading)]">{d ? `${plans.length} plan${plans.length === 1 ? '' : 's'}` : ''}</h2>
          {actions}
        </div>
      )}
      {det.loading && !d ? <Loading /> : det.error || !d ? <ErrorBox message={det.error || 'No data'} /> : plans.length === 0 ? (
        <Empty>{d.competitor.title} has no plans yet. {fixedId ? 'Use “Add a plan” above.' : <Link href={`${base}/${id}?tab=prices`}>Add the first plan</Link>}</Empty>
      ) : (
        <>
          <PlanRow>
            {plans.map((p: any) => (
              <PlanCard
                key={p.key}
                title={nameOf(p.key)}
                sub={p.product}
                action={{ label: 'Rename', onClick: () => setRename(p) }}
                terms={p.terms.map((t: any) => ({ id: t.id, label: PERIOD[t.period] || t.period, value: t.price_type === 'quote' ? 'On request' : money(t.amount, t.currency) }))}
                note={`${p.seat_model ? SEAT_LABEL[p.seat_model] : 'Users not stated'}${p.max_users ? `, up to ${p.max_users}` : ''}`}
                extra={checkLine(p)}
                features={feats.filter((f) => bulk.has(f, p.key)).map((f) => ({ key: f.key, name: f.name }))}
                onRemoveFeature={(k) => { const f = feats.find((x) => x.key === k); if (f) bulk.apply(p.key, [f], false); }}
                onDelete={() => removePlan(p)}
                busy={act.busy}
              />
            ))}
          </PlanRow>

          <section>
            <FeatureBar title="Compare plan features" q={q} setQ={setQ} group={group} setGroup={setGroup} groups={groups} />
            {feats.length === 0 ? <p className="text-sm text-[var(--text-muted)]">No features on our list yet. <Link href={`${base}/catalog`}>Add some</Link>.</p> : (
              <>
                <CopyBar
                  plans={plans.map((p) => ({ key: p.key, label: nameOf(p.key) }))}
                  msg={bulk.msg}
                  onUndo={bulk.undo}
                  onPick={(from, to) => setHl((h) => (h.from === from && h.to === to ? h : { from, to }))}
                  news={(from, to) => feats.filter((f) => bulk.has(f, from) && !bulk.has(f, to)).length}
                  onCopy={(from, to) => bulk.apply(to, feats.filter((f) => bulk.has(f, from)), true, `Added everything ${nameOf(from)} has to ${nameOf(to)}.`)}
                />
                <FeatureGrid rows={shown} total={feats.length} cols={plans.map((p) => ({ key: p.key, label: nameOf(p.key) }))} has={bulk.has} apply={(c, fs, on) => bulk.apply(c, fs, on)} fkey={(f) => f.key} count={(c) => bulk.count(c, feats)} showGroups={groups.length > 1}
                  filters={filters} setFilter={(c, v) => setFilters((f) => { const n = { ...f }; if (v) n[c] = v; else delete n[c]; return n; })} onClear={() => setFilters({})} hl={hl} />
              </>
            )}
          </section>
        </>
      )}
      {rename && <RenamePlan pid={pid} plan={rename} onClose={() => setRename(null)} onDone={(name) => { setNames((n) => ({ ...n, [rename.key]: name })); setRename(null); onChanged?.(); }} />}
    </div>
  );
}
