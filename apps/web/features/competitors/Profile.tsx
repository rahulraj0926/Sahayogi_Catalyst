'use client';
/** One competitor on one page: overview (editable), prices, capabilities, files, notes, sources. Prototype: cw_profile.js */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { Badge, Card, Empty, ErrorBox, Loading, Page } from '@/components/ui';
import { Field, Modal, Tabs, useAction, useConfirm, fmtDate } from '@/components/kit';
import { actor, api, useApi } from '@/lib/api';
import { VerifyDialog } from './Experts';
import { useAssist } from '../files/Extras';
import Plans from './Plans';
import { ImportDialog } from './Import';
import { ago, hueOf } from './Dashboard';
import { filled, F } from './profileFields';
import Overview from './Overview';
import NotesCard from './NotesCard';
import { CARD } from './overviewStyle';
import { uploadFiles } from './FilesCard';

const niceDate = (d?: string) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const sp = (s?: string) => String(s ?? '').replace(/_/g, ' ');
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const money = (a: any, c = 'INR') => (a === undefined || a === null ? '' : `${c === 'INR' ? 'Rs' : c} ${Number(a).toLocaleString('en-IN')}`);


/** Change a competitor's name. */
function RenameCompetitor({ c, onClose, onDone }: { c: any; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(c.title || '');
  const act = useAction();
  return (
    <Modal title={`Rename ${c.title}`} onClose={onClose}>
      <Field label="Name"><input type="text" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) e.currentTarget.form?.requestSubmit(); }} /></Field>
      {act.box}
      <button className="btn primary" disabled={act.busy || !name.trim() || name.trim() === c.title} onClick={() => act.run(async () => { await api(`/items/${c.id}`, { method: 'PATCH', body: { fields: { title: name.trim() } } }); onDone(); })}>Save</button>
    </Modal>
  );
}

const TIER_TAGS: [string, string][] = [['', 'Not tagged'], ['free', 'Free'], ['entry', 'Entry'], ['mid', 'Mid'], ['top', 'Top'], ['enterprise', 'Enterprise']];

function AddPrice({ pid, c, lines, onClose, onDone }: { pid: string; c: any; lines: any[]; onClose: () => void; onDone: () => void }) {
  const units = useApi<any>('/price-units', pid);
  const [v, setV] = useState<any>({ plan: '', amount: '', currency: 'INR', for: '', price_type: 'list', tax_basis: 'incl_gst', tier_tag: '', line: '', seat_model: '', max_users: '' });
  const act = useAction();
  const choices: any[] = (units.data?.choices || []).filter((x: any) => !x.usage || units.data?.sells_usage !== false);
  const set = (k: string, x: any) => setV({ ...v, [k]: x });
  return (
    <Modal title={`Add a plan for ${c.title}`} onClose={onClose}>
      <Field label="Name of the plan or product"><input type="text" value={v.plan} onChange={(e) => set('plan', e.target.value)} placeholder="Pro plan" /></Field>
      <div className="row"><Field label="Amount"><input type="number" min={0} value={v.amount} onChange={(e) => set('amount', e.target.value)} /></Field><Field label="Currency"><select value={v.currency} onChange={(e) => set('currency', e.target.value)}>{['INR', 'USD', 'EUR', 'GBP'].map((x) => <option key={x}>{x}</option>)}</select></Field></div>
      <Field label="What is the price for?" help="This decides how the cost is scaled in comparisons."><select value={v.for} onChange={(e) => set('for', e.target.value)}><option value="">Choose one</option>{choices.map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}</select></Field>
      {lines.length > 0 && <Field label="Which product is this plan of?" help="Product lines keep one company's different products apart."><select value={v.line} onChange={(e) => set('line', e.target.value)}><option value="">The company in general</option>{lines.map((l) => <option key={l.id} value={l.id}>{l.product_name}</option>)}</select></Field>}
      <Field label="Who does one licence cover?" help="Many vendors sell a single-user licence and a dearer multi-user one. This decides how the cost grows with the number of users."><select value={v.seat_model} onChange={(e) => set('seat_model', e.target.value)}><option value="">Not stated</option><option value="single_user">One user (or PC) per licence</option><option value="multi_user">Several users share one licence</option><option value="per_user">Priced for each user</option><option value="unlimited_users">No limit on users</option></select></Field>
      {v.seat_model === 'multi_user' && <Field label="Most users it covers (if stated)"><input type="number" min={1} value={v.max_users} onChange={(e) => set('max_users', e.target.value)} /></Field>}
      <Field label="Plan level" help="Lets plans of different companies be compared: Free, Entry, Mid, Top or Enterprise."><select value={v.tier_tag} onChange={(e) => set('tier_tag', e.target.value)}>{TIER_TAGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <Field label="What kind of price is it?"><select value={v.price_type} onChange={(e) => set('price_type', e.target.value)}>{['list', 'mrp', 'street', 'dealer', 'distributor', 'oem', 'quote', 'tender_award', 'promo'].map((x) => <option key={x} value={x}>{sp(x)}</option>)}</select></Field>
      <Field label="Does that price include GST?"><select value={v.tax_basis} onChange={(e) => set('tax_basis', e.target.value)}><option value="incl_gst">Includes GST</option><option value="excl_gst">Excludes GST</option><option value="not_applicable">No GST applies</option></select></Field>
      {act.box}
      <button className="btn primary" disabled={act.busy} onClick={() => act.run(async () => {
        const f = choices.find((x) => x.v === v.for);
        const miss = [v.amount === '' && 'the amount', !f && 'what the price is for'].filter(Boolean);
        if (miss.length) throw new Error(`Please fill in ${miss.join(' and ')}.`);
        const fields = { title: `${c.title} ${v.plan || f.label}`, plan: v.plan, amount: Number(v.amount), currency: v.currency, price_type: v.price_type, tax_basis: v.tax_basis, captured_on: today(), ...(v.tier_tag ? { tier_tag: v.tier_tag } : {}), ...(v.seat_model ? { seat_model: v.seat_model } : {}), ...(v.seat_model === 'multi_user' && v.max_users !== '' ? { max_users: Number(v.max_users) } : {}), ...f.f };
        const r = await api<any>('/items', { method: 'POST', body: { type: 'PricePoint', fields } });
        await api('/links', { method: 'POST', body: { type: 'contains', source: v.line || c.id, target: r.item.id } });
        onDone();
      })}>Add price</button>
      <div className="small muted" style={{ marginTop: 6 }}>Today&apos;s date is saved as the date you captured it. Add source and date details in its row later.</div>
    </Modal>
  );
}

function AddProductLine({ c, onClose, onDone }: { c: any; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState<any>({ product_name: '', description: '', url: '', product_type: 'saas' });
  const act = useAction();
  const set = (k: string, x: any) => setV({ ...v, [k]: x });
  return (
    <Modal title={`Add a product of ${c.title}`} onClose={onClose}>
      <Field label="Product name" help="One company can sell several products, each with its own plans and prices."><input type="text" value={v.product_name} onChange={(e) => set('product_name', e.target.value)} placeholder="Cloud edition" /></Field>
      <Field label="What kind of product is it?"><select value={v.product_type} onChange={(e) => set('product_type', e.target.value)}>{['saas', 'desktop', 'hybrid', 'api_service', 'marketplace', 'open_source', 'other'].map((x) => <option key={x} value={x}>{sp(x)}</option>)}</select></Field>
      <Field label="Web page (optional)"><input type="text" value={v.url} onChange={(e) => set('url', e.target.value)} /></Field>
      <Field label="Short description (optional)"><textarea rows={2} value={v.description} onChange={(e) => set('description', e.target.value)} /></Field>
      {act.box}
      <button className="btn primary" disabled={act.busy} onClick={() => act.run(async () => {
        if (!v.product_name.trim()) throw new Error('Please fill in the product name.');
        const fields: any = { title: `${c.title} ${v.product_name.trim()}`, product_name: v.product_name.trim(), product_type: v.product_type };
        if (v.url.trim()) fields.url = v.url.trim();
        if (v.description.trim()) fields.description = v.description.trim();
        const r = await api<any>('/items', { method: 'POST', body: { type: 'CompetitorProductLine', fields } });
        await api('/links', { method: 'POST', body: { type: 'contains', source: c.id, target: r.item.id } });
        onDone();
      })}>Add product</button>
    </Modal>
  );
}

function Candidates({ att, c, onClose, onDone }: { att: any; c: any; onClose: () => void; onDone: () => void }) {
  const [r, setR] = useState<any>(null); const [err, setErr] = useState<string | null>(null);
  const [state, setState] = useState<Record<string, string>>({}); const [over, setOver] = useState<Record<string, boolean>>({});
  useEffect(() => { api<any>(`/attachments/${att.id}/suggest`, { method: 'POST', body: {} }).then(setR).catch((e) => setErr(e.message)); }, [att.id]);
  const cands: any[] = r?.candidates || [];
  return (
    <Modal title={`Candidates found in ${att.filename}`} onClose={onClose}>
      <div className="callout warn small" style={{ marginBottom: 10 }}>These come from simple pattern matching, not from the assistant, and can be wrong. Anything you accept is saved as a draft that still needs checking.</div>
      {err && <ErrorBox message={err} />}{!r && !err && <Loading />}
      {r && cands.length === 0 && <Empty>No prices or company facts were found with simple pattern matching. Try asking the assistant instead, or add them by hand.</Empty>}
      {cands.map((cd) => {
        const isPrice = cd.kind === 'price_point'; const f = cd.fields || {};
        const canOver = !isPrice && cd.field && filled(c[cd.field]) && JSON.stringify(c[cd.field]) !== JSON.stringify(f[cd.field]);
        return (
          <div key={cd.id} className="callout" style={{ marginBottom: 8 }}>
            <div className="row wrap"><Badge>{isPrice ? 'Price' : 'Company fact'}</Badge><b>{isPrice ? `${f.plan || 'Price'}: ${money(f.amount, f.currency)} ${f.unit || ''}` : `${F[cd.field]?.label || cd.field}: ${Array.isArray(f[cd.field]) ? f[cd.field].join(', ') : f[cd.field]}`}</b>
              <span className="spacer" /><button className="btn sm primary" disabled={!!state[cd.id]} onClick={async () => { try { const res = await api<any>(`/attachments/${att.id}/accept`, { method: 'POST', body: { candidates: [cd], competitor_id: c.id, overwrite: !!over[cd.id] } }); const done = (res.created || []).length || (res.updated || []).length; setState({ ...state, [cd.id]: done ? 'Added' : 'Skipped' }); if (done) onDone(); } catch (e: any) { setErr(e.message); } }}>{state[cd.id] || 'Accept'}</button></div>
            <blockquote style={{ margin: '4px 0' }}>{cd.quote}</blockquote>
            <div className="small muted">Found at: {cd.location?.label || 'the file'}</div>
            {(cd.assumptions || []).length > 0 && <div className="small" style={{ color: 'var(--warn)' }}>Guessed: {cd.assumptions.join('; ')}</div>}
            {canOver && <label className="small"><input type="checkbox" checked={!!over[cd.id]} onChange={(e) => setOver({ ...over, [cd.id]: e.target.checked })} /> Replace what we have now ({Array.isArray(c[cd.field]) ? c[cd.field].join(', ') : String(c[cd.field])})</label>}
          </div>
        );
      })}
    </Modal>
  );
}

const GOALS: [string, string][] = [['competitor_profile', 'Find company facts'], ['competitor_prices', 'Find prices'], ['capabilities', 'Find capabilities']];

export default function Profile({ pid, id, query }: { pid: string; id: string; query: URLSearchParams }) {
  const { data, error, loading, reload } = useApi<any>(`/competitors/${id}/profile`, pid);
  const cat = useApi<any>('/competitors/catalog', pid);
  const [tab, setTab] = useState(['overview', 'prices', 'files', 'notes', 'sources'].includes(query.get('tab') || '') ? query.get('tab')! : 'overview');
  const [addPrice, setAddPrice] = useState(false);
  const [fromFile, setFromFile] = useState(false);
  const [addLine, setAddLine] = useState(false);
  const [verify, setVerify] = useState<any>(null);
  const [cand, setCand] = useState<any>(null);
  const [ask, dialog] = useConfirm();
  const assist = useAssist(pid);
  const act = useAction();
  const [newFeature, setNewFeature] = useState('');
  const [newTag, setNewTag] = useState(''); const [newNote, setNewNote] = useState(''); const [naWhy, setNaWhy] = useState<string | null>(null);
  const [assistMsg, setAssistMsg] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [showDone, setShowDone] = useState(false); const [newTodo, setNewTodo] = useState(''); const [editTodo, setEditTodo] = useState<{ i: number; text: string } | null>(null);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error || 'Not found'} />;
  const c = data.item;
  // everything below belongs to this competitor: the server has already picked it out
  const myLines: any[] = data.product_lines || [];
  const myPrices: any[] = data.prices || [];
  const myCaps: any[] = data.capabilities || [];
  const myNotes: any[] = data.notes || [];
  const myFiles: any[] = data.files || [];
  const allTags: string[] = data.capability_tags || [];
  const mapOf: Record<string, { capability_id: string; link_id: string }> = cat.data?.mapping || {};
  const features: { id: string; name: string; aliases: string[] }[] = cat.data?.capabilities || [];
  const guess = (name: string) => { const n = name.trim().toLowerCase(); return n ? features.find((f) => f.name.toLowerCase() === n || (f.aliases || []).some((a) => a.toLowerCase() === n)) : undefined; };
  const refreshAll = () => { reload(); cat.reload(); };
  const unchecked = (p: any) => p.verification === 'unverified' || (p.origin === 'human' && !p.verified_by && p.verification !== 'verified' && p.verification !== 'rejected');
  const checks = [
    { done: filled(c.website), label: 'Add their website' }, { done: filled(c.positioning), label: 'Say in a line how they compete' },
    { done: filled(c.target_customers), label: 'Say who they sell to' }, { done: filled(c.strengths) && filled(c.weaknesses), label: 'Note their strengths and weaknesses' },
    { done: filled(c.founded_year) && filled(c.hq_country) && filled(c.size_band), label: 'Add company facts (founded, head office, size)' },
    { done: myPrices.length > 0 || filled(c.pricing_na_reason), label: myPrices.length ? 'Prices recorded' : 'Add at least one price, or say why there is none' },
    { done: myCaps.length > 0, label: myCaps.length ? 'Capabilities rated' : 'Rate what they can do' },
    { done: myFiles.length > 0, label: 'Upload a source file (deck, price list, PDF)' },
    { done: !!c.last_reviewed_on && !(c.review_by && c.review_by < today()), label: c.last_reviewed_on ? 'Review is overdue. Mark it reviewed' : 'Mark as reviewed once it looks right' },
  ];
  const server = data.completeness;
  const pct = server ? server.score : Math.round((checks.filter((x) => x.done).length / checks.length) * 100);
  const toggleTodo = (key: string, on: boolean) => { const cur = new Set<string>(Array.isArray(c.todo_done) ? c.todo_done : []); if (on) cur.add(key); else cur.delete(key); patch(id, { todo_done: cur.size ? [...cur] : '' }); };
  const myTodos: string[] = Array.isArray(c.todo_items) ? c.todo_items : [];
  const doneSet = new Set<string>(Array.isArray(c.todo_done) ? c.todo_done : []);
  const saveTodos = (items: string[], done: Set<string>) => patch(id, { todo_items: items.length ? items : '', todo_done: done.size ? [...done] : '' });
  const addTodo = () => { const t = newTodo.trim(); if (!t || myTodos.includes(t)) { setNewTodo(''); return; } setNewTodo(''); saveTodos([...myTodos, t], doneSet); };
  const removeTodo = (i: number) => { const d = new Set(doneSet); d.delete(`my:${myTodos[i]}`); saveTodos(myTodos.filter((_, j) => j !== i), d); };
  const renameTodo = (i: number, text: string) => { const t = text.trim(); if (!t) return; const d = new Set(doneSet); if (d.delete(`my:${myTodos[i]}`)) d.add(`my:${t}`); setEditTodo(null); saveTodos(myTodos.map((x, j) => (j === i ? t : x)), d); };
  type Todo = { key: string; label: string; done: boolean; auto: boolean; mine?: number };
  const todoAll: Todo[] = [
    ...((server?.items || []) as any[]).map((x) => ({ key: x.key, label: x.label, done: !!x.done, auto: !!x.auto })),
    ...myTodos.map((t, i) => ({ key: `my:${t}`, label: t, done: doneSet.has(`my:${t}`), auto: false, mine: i })),
  ];
  const todoOpen = todoAll.filter((x) => !x.done); const todoDone = todoAll.filter((x) => x.done);
  const todoRow = (x: Todo) => (
    <li key={x.key} className="flex items-center gap-2 py-0.5 text-[13px]">
      {x.mine !== undefined && editTodo?.i === x.mine ? (
        <span className="row" style={{ gap: 6, flex: 1 }}>
          <input autoFocus value={editTodo.text} onChange={(e) => setEditTodo({ i: x.mine!, text: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') renameTodo(x.mine!, editTodo.text); if (e.key === 'Escape') setEditTodo(null); }} aria-label="Edit this to-do" style={{ flex: 1, minWidth: 0 }} />
          <button type="button" className="btn xs primary" disabled={act.busy || !editTodo.text.trim()} onClick={() => renameTodo(x.mine!, editTodo.text)}>Save</button>
          <button type="button" className="btn xs" onClick={() => setEditTodo(null)}>Cancel</button>
        </span>
      ) : (
        <>
          <input type="checkbox" checked={x.done} disabled={x.auto || act.busy} onChange={(e) => toggleTodo(x.key, e.target.checked)} aria-label={x.label} title={x.auto ? 'Done by itself once the details are filled in' : undefined} />
          <span className="min-w-0 flex-1" style={{ textDecoration: x.done ? 'line-through' : 'none', opacity: x.done ? 0.6 : 1 }}>{x.label}</span>
          {x.mine !== undefined && <><button type="button" className="btn xs ghost" onClick={() => setEditTodo({ i: x.mine!, text: x.label })}>Edit</button><button type="button" className="btn xs ghost" disabled={act.busy} onClick={() => removeTodo(x.mine!)}>Remove</button></>}
        </>)}
    </li>
  );
  const patch = (iid: string, fields: any) => act.run(async () => { await api(`/items/${iid}`, { method: 'PATCH', body: { fields } }); refreshAll(); });
  const runAssist = (a: any, goal: string, label: string) => act.run(async () => {
    const r = await assist.run(a.id, { goal, target: c.id });
    if (r) setAssistMsg(`${a.filename}: ${(r.added || []).length} proposals added to the review inbox${(r.rejected_hallucinations || []).length ? `, ${r.rejected_hallucinations.length} thrown away (quote not in the file)` : ''}${(r.dropped || []).length ? `, ${r.dropped.length} incomplete` : ''}. Nothing is saved until you accept it there.`);
  });
  return (
    <Page title={c.title} right={<>
      <button type="button" className="btn sm" onClick={() => setRenaming(true)}>Rename</button>
      <button type="button" className="btn sm danger" disabled={act.busy} onClick={async () => { if (await ask(`Delete “${c.title}” with its plans, ratings and notes? It is kept in history but no longer counted.`, 'Delete')) act.run(async () => { await api(`/items/${id}/status`, { method: 'POST', body: { status: 'Retired' } }); router.push(`/products/${pid}/competitors`); }); }}>Delete</button>
    </>}>
      {dialog}{assist.dialog}{act.box}
      <div className="mb-3">
        <div className="min-w-0">
        {editDesc !== null ? (
          <div className="max-w-[70ch]">
            <textarea autoFocus rows={3} className="w-full" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Say in a line how they compete" aria-label="Description" />
            <div className="mt-2 flex gap-2">
              <button type="button" className="btn sm primary" disabled={act.busy} onClick={() => act.run(async () => { await api(`/items/${id}`, { method: 'PATCH', body: { fields: { positioning: editDesc.trim() || null } } }); setEditDesc(null); refreshAll(); })}>Save</button>
              <button type="button" className="btn sm" onClick={() => setEditDesc(null)}>Cancel</button>
            </div>
          </div>
        ) : (
          <p className="m-0 max-w-[70ch] text-[15px] text-[var(--text-heading)]">
            {c.positioning || <span className="text-[var(--text-muted)]">No description yet.</span>}
            <button type="button" className="ml-2 text-[13px] text-[var(--text-muted)] hover:text-[var(--text-heading)]" onClick={() => setEditDesc(c.positioning || '')}>{c.positioning ? 'Edit' : 'Add one'}</button>
          </p>
        )}
        {c.website && <a className="mt-1 inline-block text-[13px]" href={/^https?:/.test(c.website) ? c.website : `https://${c.website}`} target="_blank" rel="noopener noreferrer">{c.website}</a>}
        <div className="mt-1 text-[12px] text-[var(--text-muted)]">Added {c.created_at ? niceDate(c.created_at) : 'on an unknown date'}{c.created_by ? ` by ${c.created_by}` : ''}. Changed {(() => { const t = ago(c.updated_at || c.created_at).replace('Updated ', ''); return t; })()}.</div>
        </div>
      </div>
      <div role="tablist" className="no-scrollbar mb-4 flex gap-1 overflow-x-auto rounded-[var(--card-radius)] border border-[var(--card-border)] bg-[var(--surface)] p-1.5 [box-shadow:var(--card-shadow)]">
        {([['overview', 'Overview'], ['prices', `Plans & pricing${myPrices.length ? ` (${myPrices.length})` : ''}`], ['files', `Files${myFiles.length ? ` (${myFiles.length})` : ''}`], ['notes', `Notes${myNotes.length ? ` (${myNotes.length})` : ''}`], ['sources', 'Sources']] as [string, string][]).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`whitespace-nowrap rounded-lg border-0 px-4 py-2 text-[14px] transition-colors ${tab === id ? 'bg-[var(--sd-accent-soft)] font-bold text-[var(--sd-accent)]' : 'bg-transparent font-medium text-[var(--text-muted)] hover:text-[var(--text-heading)]'}`} style={{ minHeight: 0 }}>{label}</button>))}
      </div>
      <div>
        {tab === 'overview' && (
          <Overview c={c} pid={pid} onAddProduct={() => setAddLine(true)} lines={myLines} files={myFiles} notes={myNotes} onSaved={refreshAll}
            kind={<select value={c.kind || ''} aria-label="Type" disabled={act.busy} onChange={(e) => patch(id, { kind: e.target.value })} style={{ height: 28, minHeight: 0, padding: '0 6px', fontSize: 13 }}>{!c.kind && <option value="">Not set</option>}{([['direct', 'Direct competitor'], ['indirect', 'Indirect competitor'], ['alternative', 'Alternative'], ['in_house', 'In-house'], ['adjacent_entrant', 'New entrant from nearby'], ['open_source', 'Open source'], ['aspirational', 'Aspirational']] as [string, string][]).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}
            todo={(<>
            {/* Anyone who can edit this page can add, rename and remove to-dos. Who may do that is decided later with the access rules. */}
            <section className={`@container flex h-full min-w-0 flex-col p-6 ${CARD}`}><div className="flex min-h-0 flex-1 flex-col">
              <div className="mb-4 flex items-baseline gap-2"><h3 className="m-0 flex-1 text-[18px] font-bold text-[var(--text-heading)]">To do</h3><span className="text-[13px] text-[var(--text-muted)]">{todoDone.length} / {todoAll.length} done</span></div>
              {todoOpen.length === 0 && <div className="small muted" style={{ marginBottom: 6 }}>Nothing left to do.</div>}
              <ul className="m-0 list-none p-0" style={{ display: 'grid', gap: 2 }}>{todoOpen.map(todoRow)}</ul>
              {todoDone.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <button type="button" className="btn xs ghost" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>{showDone ? 'Hide' : 'Show'} {todoDone.length} done</button>
                  {showDone && <ul className="m-0 mt-1 list-none p-0" style={{ display: 'grid', gap: 2 }}>{todoDone.map(todoRow)}</ul>}
                </div>)}
              <form className="row mt-auto" style={{ gap: 6, paddingTop: 12 }} onSubmit={(e) => { e.preventDefault(); addTodo(); }}>
                <input value={newTodo} onChange={(e) => setNewTodo(e.target.value)} placeholder="Add a to-do" aria-label="Add a to-do" style={{ flex: 1, minWidth: 0 }} />
                <button type="submit" className="btn sm primary" disabled={act.busy || !newTodo.trim()}>Add</button>
              </form>
            </div></section>
          </>)} />
        )}
        {tab === 'prices' && (
          <div className="stack">
            <div className="flex flex-wrap items-center gap-2">
              <span className="spacer" />
              <a className="btn" href={`/api/v1/competitors/export?id=${encodeURIComponent(id)}&product=${encodeURIComponent(pid)}`} title="Download this competitor's plans as an Excel / CSV file">Download plans</a>
              <button className="btn" onClick={() => setFromFile(true)} title="Fill in plans from an Excel / CSV file">Import from a file</button>
              <button className="btn primary" onClick={() => setAddPrice(true)}>Add a plan</button>
            </div>
            <Plans key={myPrices.map((p) => `${p.id}${p.tier_tag || ''}${p.seat_model || ''}`).join()} pid={pid} fixedId={id} onChanged={refreshAll} records={myPrices} isUnchecked={unchecked} onCheck={(ids, label) => setVerify({ ids, label })} />
            <Card title="No price published?">
              <textarea rows={2} style={{ width: '100%' }} value={naWhy ?? c.pricing_na_reason ?? ''} onChange={(e) => setNaWhy(e.target.value)} placeholder="Price on request only" />
              <button className="btn sm" style={{ marginTop: 6 }} onClick={() => patch(id, { pricing_na_reason: (naWhy ?? c.pricing_na_reason ?? '').trim() })}>Save</button>
            </Card>
          </div>
        )}
        {tab === 'files' && (
          <Card title="Source files" right={<>
            <input ref={fileInput} type="file" multiple hidden onChange={(e) => { const fl = e.target.files; if (fl && fl.length) act.run(async () => { await uploadFiles(Array.from(fl), id, pid); refreshAll(); }); e.target.value = ''; }} />
            <button type="button" className="btn sm primary" disabled={act.busy} onClick={() => fileInput.current?.click()}>{act.busy ? 'Uploading…' : 'Upload a file'}</button>
          </>}>
            {assistMsg && <div className="callout ok" style={{ marginBottom: 8 }}>{assistMsg} <Link href={`/products/${pid}/inbox`}>Open the review inbox</Link></div>}
            {myFiles.length === 0 ? <Empty>No files yet. Use “Upload a file” for a price list, deck or PDF.</Empty> : myFiles.map((a) => (
              <div key={a.id} className="row wrap" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <div style={{ flex: 1 }}><div className="strong">{a.filename}</div><div className="small muted">{Math.round(a.size_bytes / 1024)} KB · uploaded {a.uploaded_on} by {a.uploaded_by}</div><Badge kind={a.extracted_text_status === 'ok' ? 'ok' : 'warn'}>{a.extracted_text_status}</Badge></div>
                <Link className="btn sm" href={`/products/${pid}/files/${a.id}`}>Open in viewer</Link>
                {GOALS.map(([g, l]) => <button key={g} className="btn sm" onClick={() => runAssist(a, g, l)}>{l}</button>)}
                <button className="btn sm" onClick={() => setCand(a)}>Show simple candidates (no assistant)</button>
                <a className="btn sm" href={`/api/v1/attachments/${a.id}/download?product=${encodeURIComponent(pid)}`}>Download</a>
                <button className="btn sm danger" onClick={async () => { if (await ask(`Remove ${a.filename} from this competitor? The file stays in history but is no longer listed.`, 'Remove')) act.run(async () => { await api(`/attachments/${a.id}`, { method: 'DELETE' }); refreshAll(); }); }}>Remove</button>
              </div>
            ))}
          </Card>
        )}
        {tab === 'notes' && <NotesCard c={c} notes={myNotes} onSaved={refreshAll} />}
        {tab === 'sources' && <SourcesTab c={c} links={data.links} pid={pid} onSaved={refreshAll} />}
      </div>
      {addLine && <AddProductLine c={c} onClose={() => setAddLine(false)} onDone={() => { setAddLine(false); refreshAll(); }} />}
      {fromFile && <ImportDialog pid={pid} fixedCompetitor={c.title} onClose={() => setFromFile(false)} onDone={() => { setFromFile(false); refreshAll(); }} />}
      {addPrice && <AddPrice pid={pid} c={c} lines={myLines} onClose={() => setAddPrice(false)} onDone={() => { setAddPrice(false); refreshAll(); }} />}
      {renaming && <RenameCompetitor c={c} onClose={() => setRenaming(false)} onDone={() => { setRenaming(false); refreshAll(); }} />}
      {verify && <VerifyDialog ids={verify.ids} label={verify.label} onClose={() => setVerify(null)} onDone={() => { setVerify(null); refreshAll(); }} />}
      {cand && <Candidates att={cand} c={c} onClose={() => setCand(null)} onDone={refreshAll} />}
    </Page>
  );
}

/** When the competitor was last checked and when to check it next, then the evidence behind what we know. */
function SourcesTab({ c, links, pid, onSaved }: { c: any; links: any[]; pid: string; onSaved: () => void }) {
  const ev = useApi<any>('/items?type=Evidence&limit=5000', pid);
  const act = useAction();
  const ids = new Set(links.map((l) => l.other));
  const list = ((ev.data?.items as any[]) || []).filter((e) => ids.has(e.id));
  const save = (fields: Record<string, unknown>) => act.run(async () => { await api(`/items/${c.id}`, { method: 'PATCH', body: { fields } }); onSaved(); });
  const overdue = !!c.review_by && c.review_by < today();
  return (
    <>
    <Card title="Review">
      {act.box}
      <div className="row wrap" style={{ gap: 24 }}>
        <span><span className="muted">Last checked </span><b>{c.last_reviewed_on ? fmtDate(c.last_reviewed_on) : 'not yet'}</b></span>
        <label className="row" style={{ gap: 8 }}><span className="muted">Next review</span><input type="date" value={c.review_by || ''} disabled={act.busy} onChange={(e) => { if (e.target.value) save({ review_by: e.target.value }); }} style={{ height: 30, minHeight: 0 }} />{overdue && <span style={{ color: 'var(--status-warning-fg)' }}>overdue</span>}</label>
        <button type="button" className="btn sm primary" disabled={act.busy} onClick={() => save({ last_reviewed_on: today(), review_by: addDays(today(), 90) })}>Checked today</button>
      </div>
    </Card>
    <Card title="Sources" flush>
      {list.length === 0 ? <Empty>No evidence is linked to this competitor yet. Evidence is added when a file or web page is used for a price or capability.</Empty> : (
        <table className="tbl compact"><thead><tr><th>ID</th><th>Evidence</th><th>Grade</th><th>Retrieved</th></tr></thead><tbody>
          {list.map((e) => <tr key={e.id}><td><Link href={`/products/${pid}/item/${e.id}`}>{e.id}</Link></td><td>{e.url ? <a href={e.url} target="_blank" rel="noopener noreferrer">{e.title}</a> : e.title}</td><td><Badge kind="info">{e.grade || '?'}</Badge></td><td>{fmtDate(e.retrieved_on)}</td></tr>)}
        </tbody></table>
      )}
    </Card>
    </>
  );
}
