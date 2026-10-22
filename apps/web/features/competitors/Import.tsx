'use client';
import { useRef, useState } from 'react';
import { Badge } from '@/components/ui';
import { Field, Modal, Pager, useAction, usePaged } from '@/components/kit';
import { actor, api, clearApiCache } from '@/lib/api';

const LEVEL_LABEL: Record<string, string> = { free: 'Free', entry: 'Entry', mid: 'Mid', top: 'Top', enterprise: 'Enterprise' };
const PERIOD: Record<string, string> = { month: 'a month', quarter: 'a quarter', year: 'a year', one_time: 'once' };
const SEAT: Record<string, string> = { single_user: 'one user', multi_user: 'shared', per_user: 'per user', unlimited_users: 'no limit' };
const money = (a: number | null, c: string, quote: boolean) => (quote ? 'on request' : a === null ? '-' : `${c === 'INR' ? '₹' : c + ' '}${Number(a).toLocaleString('en-IN')}`);

async function send(pid: string, file: File, o: { commit: boolean; overwrite: boolean; createFeatures: boolean; competitor?: string; tier?: string; scope?: string }) {
  const url = `/api/v1/competitors/import?name=${encodeURIComponent(file.name)}&commit=${o.commit ? 1 : 0}&overwrite=${o.overwrite ? 1 : 0}&create_features=${o.createFeatures ? 1 : 0}&product=${encodeURIComponent(pid)}${o.competitor ? `&competitor=${encodeURIComponent(o.competitor)}` : ''}${o.tier ? `&tier=${encodeURIComponent(o.tier)}` : ''}${o.scope ? `&scope=${encodeURIComponent(o.scope)}` : ''}`;
  let res: Response;
  try { res = await fetch(url, { method: 'POST', headers: { 'x-actor': actor(), 'content-type': file.type || 'application/octet-stream' }, body: file }); } catch { throw new Error('Cannot reach the server.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `The file could not be read (${res.status}).`);
  if (o.commit) clearApiCache();
  return data;
}

/** What an import found or did: the same picture before and after saving. */
export function ImportSummary({ r, saved }: { r: any; saved: boolean }) {
  const pg = usePaged<any>(r.plan_rows || [], 10);
  const c = r.competitors; const verb = saved ? '' : 'will be ';
  return (
    <>
      <div className="grid g4" style={{ marginBottom: 10, gap: 8 }}>
        {[[c.created, `new competitor${c.created === 1 ? '' : 's'}`, `${c.existing} already here`], [r.plans.created + r.plans.existing, 'plans', `${r.plans.created} new`], [r.prices.created, `new price${r.prices.created === 1 ? '' : 's'}`, `${r.prices.existing} already here`], [r.features.plan_links, 'plan features', r.features.catalog_created ? `${r.features.catalog_created} new on our list` : 'all on our list']].map(([v, l, h]: any) => (
          <div key={l} className="card"><div className="card-b" style={{ padding: '8px 12px' }}><div className="strong" style={{ fontSize: 20 }}>{v}</div><div className="small">{l}</div><div className="xs muted">{h}</div></div></div>))}
      </div>
      <div className="xs muted" style={{ marginBottom: 8 }}>{(r.sheets || []).map((s: any) => `${s.name}: ${s.kind === 'unknown' ? 'not understood' : s.kind} (${s.used} of ${s.rows} rows)`).join(' · ')}</div>
      {r.error_count > 0 && <div className="callout bad small" style={{ marginBottom: 8 }}><b>{r.error_count} row{r.error_count === 1 ? '' : 's'} {verb}left out:</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{r.errors.slice(0, 6).map((e: any, i: number) => <li key={i}>{e.sheet}, row {e.row}: {e.message}</li>)}</ul></div>}
      {r.warnings.length > 0 && <div className="callout warn small" style={{ marginBottom: 8 }}><ul style={{ margin: 0, paddingLeft: 18 }}>{r.warnings.slice(0, 8).map((w: string, i: number) => <li key={i}>{w}</li>)}</ul></div>}
      {r.assumptions.length > 0 && <div className="callout small" style={{ marginBottom: 8 }}><b>Assumed where the file was silent:</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{r.assumptions.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul></div>}
      {(r.plan_rows || []).length > 0 && (
        <div style={{ overflow: 'auto' }}>
          <table className="tbl compact"><thead><tr><th>Competitor</th><th>Plan</th><th>Level</th><th>Users</th><th>Prices</th><th>Features</th><th /></tr></thead><tbody>
            {pg.rows.map((p, i) => (
              <tr key={i}>
                <td>{p.competitor}</td><td>{p.plan}{p.product && <div className="xs muted">{p.product}</div>}</td>
                <td>{p.level ? <>{LEVEL_LABEL[p.level]}{p.level_guessed && <> <Badge kind="warn">guessed</Badge></>}</> : <span className="muted">none</span>}</td>
                <td className="small">{p.seat_model ? SEAT[p.seat_model] : <span className="muted">not stated</span>}{p.max_users ? `, up to ${p.max_users}` : ''}</td>
                <td className="small">{p.terms.length ? p.terms.map((t: any) => `${money(t.amount, t.currency, t.quote)} ${PERIOD[t.period] || t.period}`).join(' · ') : <span className="muted">none</span>}</td>
                <td className="small">{p.features}</td>
                <td><Badge kind={p.state === 'new' ? 'ok' : p.state === 'no price' ? 'bad' : ''}>{p.state}</Badge></td>
              </tr>))}
          </tbody></table>
          <Pager {...pg} />
        </div>)}
      {(r.plan_rows || []).length === 0 && r.competitor_names.length > 0 && (
        <div className="small">{r.competitor_names.slice(0, 40).map((x: any) => <Badge key={x.name}>{x.name}{x.tier ? ` · ${x.tier}` : ''}</Badge>)}{r.competitor_names.length > 40 && ` and ${r.competitor_names.length - 40} more`}</div>)}
    </>
  );
}

/**
 * Add plans from an Excel or CSV file: pick the file, look at what it would add, then confirm. Nothing is saved before the last button.
 * Used inside "Add a competitor" (a new company) and on a competitor's own page (`fixedCompetitor`: the plans go to that company).
 */
export function FileImport({ pid, hasModules, fixedCompetitor, onClose, onDone }: { pid: string; hasModules?: boolean; fixedCompetitor?: string; onClose: () => void; onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [r, setR] = useState<any>(null);
  const [saved, setSaved] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [createFeatures, setCreateFeatures] = useState(true);
  const [competitor, setCompetitor] = useState(fixedCompetitor || '');
  const [tier, setTier] = useState('');
  const [moduleName, setModuleName] = useState('');
  const act = useAction();
  const opts = (o: any = {}) => ({ overwrite, createFeatures, competitor, tier, scope: moduleName, ...o });
  const check = (f: File, o: any = {}) => act.run(async () => { setR(null); setR(await send(pid, f, { commit: false, ...opts(o) })); });
  const tpl = (kind: string) => `/api/v1/competitors/import/template?kind=${kind}&product=${encodeURIComponent(pid)}`;
  return (
    <>
      {!saved && (
        <>
          <div className="small" style={{ marginBottom: 10 }}>
            {fixedCompetitor ? <>The plans in the file are added to <b>{fixedCompetitor}</b>.</> : 'The file can list companies, their plans and prices, and what each plan includes.'} You see what would be added first, and nothing is saved until you press the last button.
          </div>
          {!fixedCompetitor && (
            <div className="grid g2" style={{ marginBottom: 10, gap: 8 }}>
              <Field label="Which company is the file about?" help="Only needed if the file has no company column. Leave empty and the name is read from the top line of the file."><input value={competitor} placeholder="e.g. Tally" onChange={(e) => setCompetitor(e.target.value)} onBlur={() => { if (file) check(file); }} /></Field>
              <Field label="How close a rival are they?" help="Tier 1 is closest to our customers. Used only for companies the file does not give a tier for."><select value={tier} onChange={(e) => { setTier(e.target.value); if (file) check(file, { tier: e.target.value }); }}><option value="">Not set</option><option value="Tier 1">Tier 1 - very close</option><option value="Tier 2">Tier 2 - nearby</option><option value="Tier 3">Tier 3 - further away</option><option value="Substitute">Substitute</option></select></Field>
              {hasModules && <Field label="Which module do they compete with?" help="For example CRM or Payroll. Leave empty if the file already has a Module column."><input value={moduleName} placeholder="e.g. Finance & Accounting" onChange={(e) => setModuleName(e.target.value)} onBlur={() => { if (file) check(file); }} /></Field>}
            </div>)}
          <input ref={input} type="file" accept=".csv,.tsv,.txt,.xlsx,.xlsm" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); check(f); } e.target.value = ''; }} />
          <div className="row" style={{ gap: 8, marginBottom: 8 }}><button className="btn primary" disabled={act.busy} onClick={() => input.current?.click()}>{file ? 'Choose another file' : 'Choose an Excel or CSV file'}</button>{file && <span className="small">{file.name}</span>}</div>
          <div className="row wrap small" style={{ gap: 10, marginBottom: 6 }}>
            <span className="muted">Not sure how to lay it out? Download a blank sheet:</span>
            <a href={tpl('plans')}>Plans and prices</a>{!fixedCompetitor && <a href={tpl('tiers')}>List of companies by tier</a>}<a href={tpl('features')}>What each plan includes</a>
          </div>
        </>)}
      {act.box}
      {act.busy && <div className="small muted">Reading the file…</div>}
      {r && <ImportSummary r={r} saved={saved} />}
      {r && !saved && (
        <>
          <div style={{ marginTop: 10 }}>
            <label className="small row" style={{ gap: 6 }}><input type="checkbox" checked={createFeatures} onChange={(e) => { setCreateFeatures(e.target.checked); if (file) check(file, { createFeatures: e.target.checked }); }} />Also add features that are not on our feature list yet</label>
            <label className="small row" style={{ gap: 6 }}><input type="checkbox" checked={overwrite} onChange={(e) => { setOverwrite(e.target.checked); if (file) check(file, { overwrite: e.target.checked }); }} />Replace details that are already filled in (otherwise only blanks are filled)</label>
          </div>
          <div className="row" style={{ marginTop: 12, gap: 8 }}>
            <button className="btn primary" disabled={act.busy || !file} onClick={() => act.run(async () => { const res = await send(pid, file!, { commit: true, ...opts() }); setR(res); setSaved(true); })}>Add these to my list</button>
            <button className="btn" onClick={onClose}>Cancel</button>
          </div>
        </>)}
      {saved && <div className="row" style={{ marginTop: 12 }}><span className="small" style={{ color: 'var(--ok)' }}>Saved.</span><span className="spacer" /><button className="btn primary" onClick={onDone}>Done</button></div>}
    </>
  );
}

/** The same thing in its own window, for a competitor's page. */
export function ImportDialog({ pid, hasModules, fixedCompetitor, onClose, onDone }: { pid: string; hasModules?: boolean; fixedCompetitor?: string; onClose: () => void; onDone: () => void }) {
  return (
    <Modal title={fixedCompetitor ? `Add plans to ${fixedCompetitor} from a file` : 'Add plans from a file'} onClose={onClose}>
      <FileImport pid={pid} hasModules={hasModules} fixedCompetitor={fixedCompetitor} onClose={onClose} onDone={onDone} />
    </Modal>
  );
}

const EMPTY_PLAN = { plan: '', level: '', licence: '', max: '', month: '', year: '', once: '', features: '', quote: false };

export function AddCompetitor({ pid, scopes, hasModules, defaultScope, onClose, onDone }: { pid: string; scopes: string[]; hasModules?: boolean; defaultScope?: string; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<'type' | 'file'>('type');
  const [f, setF] = useState<any>({ title: '', kind: 'direct', tier: 'T2', website: '', positioning: '', scopes: defaultScope || '', currency: 'INR', gst: '' });
  const [plans, setPlans] = useState<any[]>([{ ...EMPTY_PLAN }]);
  const [res, setRes] = useState<any>(null);
  const act = useAction();
  const setPlan = (i: number, k: string, v: string) => setPlans(plans.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  const used = plans.filter((p) => p.plan.trim() || p.month || p.year || p.once || p.quote);
  const rows = () => {
    const base = { Competitor: f.title.trim(), Tier: f.tier, Kind: f.kind, Website: f.website.trim(), Positioning: f.positioning.trim(), Module: f.scopes.trim() };
    const list = used.length ? used : [{ ...EMPTY_PLAN }];
    return list.map((p) => ({ ...base, Plan: p.plan.trim(), Level: p.level, Licence: p.licence, 'Max users': p.max, 'Monthly price': p.quote ? 'Contact sales' : p.month, 'Yearly price': p.quote ? '' : p.year, 'Lifetime price': p.quote ? '' : p.once, Currency: f.currency, 'GST included': f.gst, Features: p.features }));
  };
  return (
    <Modal title="Add a competitor" onClose={res ? onDone : onClose}>
      {!res && (
        <div className="seg" role="group" aria-label="How to add" style={{ marginBottom: 12 }}>
          <button type="button" className={mode === 'type' ? 'on' : ''} onClick={() => setMode('type')}>Type it in</button>
          <button type="button" className={mode === 'file' ? 'on' : ''} onClick={() => setMode('file')}>Add plans from an Excel / CSV file</button>
        </div>)}
      {!res && mode === 'file' ? <FileImport pid={pid} hasModules={hasModules} onClose={onClose} onDone={onDone} /> : res ? (
        <>
          <div className="callout ok small" style={{ marginBottom: 8 }}>{res.competitors.created ? `${f.title} was added.` : `${f.title} was already there; only blank details were filled in.`}</div>
          <div className="small">{res.prices.created} price{res.prices.created === 1 ? '' : 's'} and {res.features.plan_links} plan feature{res.features.plan_links === 1 ? '' : 's'} saved.</div>
          {res.warnings.length > 0 && <ul className="small" style={{ paddingLeft: 18 }}>{res.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul>}
          <div className="row" style={{ marginTop: 12 }}><span className="spacer" /><button className="btn primary" onClick={onDone}>Done</button></div>
        </>
      ) : (
        <>
          <Field label="Name *"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <div className="grid g2"><Field label="Tier" help="Tier 1 is closest to our customers."><select value={f.tier} onChange={(e) => setF({ ...f, tier: e.target.value })}><option value="T1">Tier 1</option><option value="T2">Tier 2</option><option value="T3">Tier 3</option><option value="S">Substitute</option></select></Field>
            <Field label="Kind"><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="direct">Direct</option><option value="indirect">Indirect</option><option value="alternative">Alternative / substitute</option></select></Field></div>
          <div className="grid g2"><Field label="Website"><input value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} /></Field>
            {hasModules ? <Field label="Which module do they compete with?" help="For example CRM or Payroll. Leave empty if they compete with the whole product. Separate several with commas."><input list="comp-scopes" value={f.scopes} onChange={(e) => setF({ ...f, scopes: e.target.value })} placeholder="Whole product" /></Field> : <span />}</div>
          <datalist id="comp-scopes">{scopes.map((s) => <option key={s} value={s} />)}</datalist>
          <Field label="How they position themselves"><textarea rows={2} value={f.positioning} onChange={(e) => setF({ ...f, positioning: e.target.value })} /></Field>

          <div className="strong" style={{ margin: '12px 0 4px' }}>Plans <span className="small muted">(optional, add them later if you prefer)</span></div>
          <div className="row wrap small" style={{ gap: 12, marginBottom: 8 }}>
            <label>Currency <select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>{['INR', 'USD', 'EUR', 'GBP'].map((x) => <option key={x}>{x}</option>)}</select></label>
            <label>Prices include GST <select value={f.gst} onChange={(e) => setF({ ...f, gst: e.target.value })}><option value="">Not stated</option><option value="yes">Yes</option><option value="no">No</option></select></label>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {plans.map((p, i) => (
              <div key={i} className="card"><div className="card-b" style={{ padding: 10, display: 'grid', gap: 8 }}>
                <div className="row wrap" style={{ gap: 8 }}>
                  <input style={{ flex: '1 1 130px', minWidth: 0 }} placeholder="Plan name, e.g. Standard" aria-label="Plan name" value={p.plan} onChange={(e) => setPlan(i, 'plan', e.target.value)} />
                  <select aria-label="Plan level" value={p.level} onChange={(e) => setPlan(i, 'level', e.target.value)}><option value="">Level: work out from name</option>{Object.entries(LEVEL_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                  {plans.length > 1 && <button className="btn xs danger" type="button" onClick={() => setPlans(plans.filter((_, j) => j !== i))}>Remove</button>}
                </div>
                <div className="row wrap" style={{ gap: 8 }}>
                  <select aria-label="Users covered" value={p.licence} onChange={(e) => setPlan(i, 'licence', e.target.value)}><option value="">Users: not stated</option><option value="single user">One user per licence</option><option value="multi user">Several users share one</option><option value="per user">Priced per user</option><option value="unlimited">No limit on users</option></select>
                  <input type="number" min={1} style={{ width: 100 }} placeholder="Max users" aria-label="Most users" value={p.max} onChange={(e) => setPlan(i, 'max', e.target.value)} />
                </div>
                <div className="row wrap" style={{ gap: 8 }}>
                  <input type="number" min={0} style={{ width: 120 }} disabled={p.quote} placeholder="Per month" aria-label="Price per month" value={p.month} onChange={(e) => setPlan(i, 'month', e.target.value)} />
                  <input type="number" min={0} style={{ width: 120 }} disabled={p.quote} placeholder="Per year" aria-label="Price per year" value={p.year} onChange={(e) => setPlan(i, 'year', e.target.value)} />
                  <input type="number" min={0} style={{ width: 120 }} disabled={p.quote} placeholder="Paid once" aria-label="Price paid once" value={p.once} onChange={(e) => setPlan(i, 'once', e.target.value)} />
                  <label className="small row" style={{ gap: 6 }}><input type="checkbox" checked={p.quote} onChange={(e) => setPlans(plans.map((x, j) => (j === i ? { ...x, quote: e.target.checked } : x)))} />No public price (contact sales)</label>
                </div>
                <textarea rows={2} placeholder="Features this plan includes, separated by semicolons (Invoicing; GST filing; Email support)" aria-label="Features" value={p.features} onChange={(e) => setPlan(i, 'features', e.target.value)} />
              </div></div>))}
          </div>
          <button className="btn sm" type="button" style={{ marginTop: 8 }} onClick={() => setPlans([...plans, { ...EMPTY_PLAN }])}>Add another plan</button>
          {act.box}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn primary" disabled={!f.title.trim() || act.busy} onClick={() => act.run(async () => {
              const bad = used.find((p) => !p.plan.trim());
              if (bad) throw new Error('Please give each plan a name.');
              const noPrice = used.find((p) => !p.month && !p.year && !p.once && !p.quote);
              if (noPrice) throw new Error(`Please give "${noPrice.plan}" a price, or tick "No public price".`);
              setRes(await api('/competitors/bulk', { product: pid, method: 'POST', body: { rows: rows(), commit: true } }));
            })}>Add</button>
            <button className="btn" onClick={onClose}>Cancel</button>
          </div>
        </>)}
    </Modal>
  );
}
