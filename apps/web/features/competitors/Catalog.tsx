'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Badge, Card, Empty, ErrorBox, Loading } from '@/components/ui';
import { Field, Modal, Pager, useAction, usePaged } from '@/components/kit';
import { api, useApi } from '@/lib/api';
import { createFeature, mapRatings } from './mapping';

const LEVEL_TONE: Record<string, string> = { strong: 'ok', parity: 'ok', partial: 'warn', absent: 'bad', unknown: '' };

function AddFeature({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState({ name: '', category: '', description: '', aliases: '' });
  const act = useAction();
  const set = (k: string, x: string) => setV({ ...v, [k]: x });
  return (
    <Modal title="Add a feature to our list" onClose={onClose}>
      <Field label="Our name for it" help="One clear name that every competitor's version of this feature is compared under."><input type="text" value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="GST e-invoicing" /></Field>
      <Field label="Group (optional)"><input type="text" value={v.category} onChange={(e) => set('category', e.target.value)} placeholder="Compliance" /></Field>
      <Field label="What it means (optional)" help="Say what counts, so everyone rates the same thing."><textarea rows={2} value={v.description} onChange={(e) => set('description', e.target.value)} /></Field>
      <Field label="Other names for it (optional)" help="Separate with commas. Used to suggest matches."><input type="text" value={v.aliases} onChange={(e) => set('aliases', e.target.value)} /></Field>
      {act.box}
      <button className="btn primary" disabled={act.busy} onClick={() => act.run(async () => {
        if (!v.name.trim()) throw new Error('Please fill in the name.');
        await createFeature(v.name, { category: v.category, description: v.description, aliases: v.aliases.split(',').map((x) => x.trim()).filter(Boolean) });
        onDone();
      })}>Add feature</button>
    </Modal>
  );
}

/** A starting list of features that billing, accounting and inventory products usually share. Edit it before adding: untick what does not apply, add your own. */
const STARTER: [string, string][] = [
  ['GST invoicing and e-invoicing', 'Compliance'], ['E-way bill', 'Compliance'], ['GST return filing', 'Compliance'], ['TDS and TCS', 'Compliance'],
  ['Ledgers and double-entry accounts', 'Accounting'], ['Bank reconciliation', 'Accounting'], ['Financial statements and reports', 'Accounting'], ['Multi-currency', 'Accounting'],
  ['Quotations, sales orders and invoices', 'Sales'], ['Purchase orders and bills', 'Purchases'], ['Payment reminders', 'Sales'],
  ['Stock and inventory tracking', 'Inventory'], ['Multiple godowns or warehouses', 'Inventory'], ['Batch and serial tracking', 'Inventory'], ['Barcode printing and scanning', 'Inventory'],
  ['Payroll', 'People'], ['Multiple users with roles and permissions', 'Access'], ['Multiple companies or branches', 'Access'], ['Audit trail', 'Access'],
  ['Mobile app', 'Platform'], ['Cloud access', 'Platform'], ['Excel import and export', 'Platform'], ['API and integrations', 'Platform'], ['Backup and restore', 'Platform'],
];

function AddCommon({ pid, onClose, onDone }: { pid: string; onClose: () => void; onDone: () => void }) {
  const [on, setOn] = useState<Record<string, boolean>>(Object.fromEntries(STARTER.map(([n]) => [n, true])));
  const [extra, setExtra] = useState('');
  const [result, setResult] = useState<any>(null);
  const act = useAction();
  const picked = STARTER.filter(([n]) => on[n]);
  const own = extra.split('\n').map((x) => x.trim()).filter(Boolean);
  const total = picked.length + own.length;
  return (
    <Modal title="Add common features to every competitor" onClose={onClose}>
      <div className="small muted" style={{ marginBottom: 8 }}>Each feature goes on our list, and every competitor gets an empty row for it, marked &quot;unknown&quot; until someone checks. Nothing is rated for you. Features and rows that already exist are skipped.</div>
      <div style={{ maxHeight: 280, overflow: 'auto', border: '1px solid var(--divider)', borderRadius: 8, padding: 8 }}>
        {STARTER.map(([n, g]) => <label key={n} className="row small" style={{ gap: 8, padding: '2px 0' }}><input type="checkbox" checked={!!on[n]} onChange={(e) => setOn({ ...on, [n]: e.target.checked })} /><span>{n}</span><span className="xs muted">{g}</span></label>)}
      </div>
      <Field label="Your own features (optional)" help="One per line."><textarea rows={3} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Subscription billing" /></Field>
      {act.box}
      {result && <div className="callout ok small" style={{ marginBottom: 8 }}>Added {result.features_added} feature{result.features_added === 1 ? '' : 's'} and {result.rows_added} empty row{result.rows_added === 1 ? '' : 's'} across {result.competitors} competitor{result.competitors === 1 ? '' : 's'}.{result.rows_existing > 0 && ` ${result.rows_existing} already existed.`}</div>}
      {result
        ? <button className="btn primary" onClick={onDone}>Done</button>
        : <button className="btn primary" disabled={act.busy || total === 0} onClick={() => act.run(async () => {
            const features = [...picked.map(([name, category]) => ({ name, category })), ...own.map((name) => ({ name }))];
            setResult(await api<any>('/competitors/catalog/common', { product: pid, method: 'POST', body: { features } }));
          })}>Add {total} feature{total === 1 ? '' : 's'} to all competitors</button>}
    </Modal>
  );
}

/** Our common feature list. Competitors name the same thing differently; every rating is pointed at one feature here so the grid, must-haves and comparisons line up. */
export default function Catalog({ pid }: { pid: string }) {
  const { data, error, loading, reload } = useApi<any>('/competitors/catalog', pid);
  const [adding, setAdding] = useState(false);
  const [common, setCommon] = useState(false);
  const [pick, setPick] = useState<Record<string, string>>({});
  const act = useAction();
  const caps: any[] = data?.capabilities || [];
  const names: any[] = data?.unmapped || [];
  const pgC = usePaged(caps, 10);
  const pgN = usePaged(names, 10);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error || 'No data'} />;
  const base = `/products/${pid}/competitors`;
  const done = async (fn: () => Promise<unknown>) => { await act.run(async () => { await fn(); reload(); }); };
  const n = data.counts;
  return (
    <>
      <div className="callout" style={{ marginBottom: 14 }}>
        <div className="small">Every competitor names features in its own words. Here we keep <b>our</b> list of features, then point each competitor&apos;s name at the one it means. The grid, the must-have list and the comparison use our names, and each rating keeps the competitor&apos;s own name beside it.</div>
      </div>
      {act.box}
      <div className="row wrap" style={{ marginBottom: 10 }}>
        <span className="small muted">{n.capabilities} features on our list · {n.mapped_ratings} ratings matched · {n.unmapped_ratings} not matched yet</span>
        <span className="spacer" /><button className="btn" onClick={() => setCommon(true)}>Add common features to all competitors</button><button className="btn primary" onClick={() => setAdding(true)}>Add a feature</button>
      </div>

      {names.length > 0 && (
        <Card title="Names still to match" sub={`${names.length} different names`} flush>
          <table className="tbl compact"><thead><tr><th>Their name</th><th>Used by</th><th>Our feature</th><th /></tr></thead><tbody>
            {pgN.rows.map((u) => {
              const choice = pick[u.name] ?? u.suggestion?.id ?? '';
              return (
                <tr key={u.name}>
                  <td className="strong">{u.name}<div className="xs muted">{u.rating_ids.length} rating{u.rating_ids.length === 1 ? '' : 's'}</div></td>
                  <td className="small">{u.competitors.map((c: any) => <Link key={c.id} href={`${base}/${c.id}?tab=capabilities`} style={{ marginRight: 8 }}>{c.title}</Link>)}</td>
                  <td>
                    <select value={choice} onChange={(e) => setPick({ ...pick, [u.name]: e.target.value })} aria-label={`Our feature for ${u.name}`}>
                      <option value="">Choose one</option>{caps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {u.suggestion && !pick[u.name] && <div className="xs muted">Suggested: {u.suggestion.name} ({u.suggestion.basis})</div>}
                  </td>
                  <td className="nowrap">
                    <button className="btn xs primary" disabled={!choice || act.busy} onClick={() => done(() => mapRatings(u.rating_ids, choice))}>Match</button>{' '}
                    <button className="btn xs" disabled={act.busy} title="Add this name to our list as a new feature and match it" onClick={() => done(async () => { const id = await createFeature(u.name); await mapRatings(u.rating_ids, id); })}>Add as new feature</button>
                  </td>
                </tr>
              );
            })}
          </tbody></table>
          <Pager {...pgN} />
        </Card>
      )}

      <div style={{ height: 14 }} />
      <Card title="Our feature list" sub={String(caps.length)} flush>
        {caps.length === 0 ? <Empty>No features on our list yet. Add one, or match the names above and add them as new features.</Empty> : (
          <table className="tbl compact"><thead><tr><th>Feature</th><th>Group</th><th>Offered by</th><th>What each competitor calls it</th></tr></thead><tbody>
            {pgC.rows.map((c) => (
              <tr key={c.id}>
                <td><span className="strong">{c.name}</span>{c.description && <div className="xs muted" style={{ maxWidth: '50ch' }}>{c.description}</div>}</td>
                <td className="small">{c.category || <span className="muted">None</span>}</td>
                <td className="small">{c.offered_by} of {c.competitors.length}{c.competitors.length === 0 && <span className="muted"> (none matched yet)</span>}</td>
                <td className="small">{c.competitors.map((x: any) => (
                  <div key={x.id}><Link href={`${base}/${x.id}?tab=capabilities`}>{x.title}</Link>: {x.their_names.join(', ')} <Badge kind={LEVEL_TONE[x.level] as any}>{x.level}</Badge></div>
                ))}</td>
              </tr>
            ))}
          </tbody></table>
        )}
        <Pager {...pgC} />
      </Card>
      {common && <AddCommon pid={pid} onClose={() => setCommon(false)} onDone={() => { setCommon(false); reload(); }} />}
      {adding && <AddFeature onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} />}
    </>
  );
}
