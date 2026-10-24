'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Bot, ChevronLeft, ChevronRight, CircleAlert, FileCheck2, ListChecks, Search, Timer, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ErrorBox, Loading } from '@/components/ui';
import { api, go, useApi } from '@/lib/api';
import { PHASE_SHORT } from '@/components/shell/groups';
import { ColumnHead, OptionList } from '@/features/home/ColumnFilter';

type Prio = 'high' | 'medium' | 'low';
type Task = { productId: string; productName: string; owner: string; id: string; title: string; why: string; minutes: number; route?: any; kind: string; phase: number | null; blocks: number; doer: string; score: number; prio: Prio; rank: number };

const PRIO: Record<Prio, { label: string; color: string; weight: number }> = {
  high: { label: 'High', color: 'var(--status-critical-fg)', weight: 3 },
  medium: { label: 'Medium', color: 'var(--status-warning-fg)', weight: 2 },
  low: { label: 'Low', color: 'var(--status-neutral-fg)', weight: 1 },
};
const KIND: Record<string, string> = { data_request: 'Answer a question', document_approval: 'Approve a document', agent_task: 'Assistant task', verification: 'Verify a fact', suspect_review: 'Review a change', stale_refresh: 'Refresh a value' };
const PER = 10;
let TASK_CACHE: Task[] | null = null; // kept while the app is open, so coming back to this page is instant

const taskRoute = (t: Task) => (t.id?.startsWith('ITEM:') ? `/products/${t.productId}/item/${t.id.slice(5)}` : t.id?.startsWith('DOC:') ? `/products/${t.productId}/documents/${t.id.slice(4)}` : t.route?.session && t.id ? `/products/${t.productId}/work/${t.route.session}` : go(t.productId, t.route?.ui));
const when = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);
/** How much sign-off progress a task unlocks per minute of effort. A task that blocks no sign-off is never "high". */
const priorityOf = (score: number, blocks: number): Prio => { const p: Prio = score >= 2 ? 'high' : score >= 1 ? 'medium' : 'low'; return !blocks && p === 'high' ? 'medium' : p; };
const tint = (c: string) => `color-mix(in srgb, ${c} 14%, transparent)`;

/** Next actions across every product, as one table you can filter from its column headings. Acting on a task happens on its own page. */
export default function Tasks() {
  const router = useRouter();
  const portfolio = useApi<any>('/portfolio');
  const [tasks, setTasks] = useState<Task[] | null>(TASK_CACHE);
  const [waiting, setWaiting] = useState(0);
  const error: string | null = null;
  const [prio, setPrio] = useState('all'); const [product, setProduct] = useState('all'); const [phase, setPhase] = useState('all'); const [kind, setKind] = useState('all');
  const [quick, setQuick] = useState(false); const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: 'prio' | 'time' | 'product'; dir: 1 | -1 }>({ key: 'prio', dir: 1 });
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!portfolio.data) return;
    const products = (portfolio.data.products as any[]).filter((p) => !p.archived);
    let live = true; const parts: Task[][] = []; let left = products.length; setWaiting(left);
    products.forEach((p, i) => {
      api<any>('/next-actions?limit=8', { product: p.id })
        .then((r) => (r.actions || []).map((a: any): Task => {
          const score = Number(a.value_per_minute) || 0; const blocks = (a.blocks || []).length;
          return { productId: p.id, productName: p.name, owner: p.owner || '', id: a.id, title: a.plain_title || a.title, why: a.why || a.detail || '', minutes: a.minutes || 0, route: a.route, kind: a.kind, phase: typeof a.phase === 'number' ? a.phase : null, blocks, doer: a.owner_kind || '', score, prio: priorityOf(score, blocks), rank: a.rank || 99 };
        }))
        .catch(() => [] as Task[])
        .then((list) => {
          if (!live) return;
          parts[i] = list; left -= 1; setWaiting(left);
          if (left === 0) { const all = parts.flat(); TASK_CACHE = all; setTasks(all); }
          else if (!TASK_CACHE) setTasks(parts.flat()); // show what has arrived so far
        });
    });
    if (products.length === 0) { TASK_CACHE = []; setTasks([]); }
    return () => { live = false; };
  }, [portfolio.data]);
  useEffect(() => { setPage(1); }, [prio, product, phase, kind, quick, q, sort]);

  const all = tasks || [];
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const l = all.filter((t) => (prio === 'all' || t.prio === prio) && (product === 'all' || t.productId === product) && (phase === 'all' || String(t.phase) === phase) && (kind === 'all' || t.kind === kind) && (!quick || t.minutes <= 5) && (!s || `${t.title} ${t.productName} ${t.why} ${t.id}`.toLowerCase().includes(s)));
    const byPrio = (a: Task, b: Task) => PRIO[b.prio].weight - PRIO[a.prio].weight || b.score - a.score || a.rank - b.rank;
    const cmp = sort.key === 'time' ? (a: Task, b: Task) => a.minutes - b.minutes || byPrio(a, b) : sort.key === 'product' ? (a: Task, b: Task) => a.productName.localeCompare(b.productName) || byPrio(a, b) : byPrio;
    return [...l].sort((a, b) => cmp(a, b) * sort.dir);
  }, [all, prio, product, phase, kind, quick, q, sort]);

  if (portfolio.loading || (!tasks && !error)) return <Loading />;
  if (portfolio.error || error) return <ErrorBox message={portfolio.error || error || 'No data'} />;

  const products = [...new Map(all.map((t) => [t.productId, t.productName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const phases = PHASE_SHORT.map((_, n) => n);
  const kinds = [...new Set(all.map((t) => t.kind))];
  const pages = Math.max(1, Math.ceil(rows.length / PER)); const cur = Math.min(page, pages);
  const view = rows.slice((cur - 1) * PER, cur * PER);
  const filtered = prio !== 'all' || product !== 'all' || phase !== 'all' || kind !== 'all' || quick || q.trim() !== '';
  const reset = () => { setPrio('all'); setProduct('all'); setPhase('all'); setKind('all'); setQuick(false); setQ(''); };
  const sortBy = (key: 'prio' | 'time' | 'product') => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 }));

  const nHigh = all.filter((t) => t.prio === 'high').length; const nQuick = all.filter((t) => t.minutes <= 5).length; const nDocs = all.filter((t) => t.kind === 'document_approval').length;
  const tiles = [
    { key: 'all', label: 'Open tasks', n: all.length, note: `across ${products.length} products`, Icon: ListChecks, color: 'var(--sd-accent)', on: !filtered, act: reset },
    { key: 'high', label: 'High priority', n: nHigh, note: 'most progress per minute', Icon: CircleAlert, color: PRIO.high.color, on: prio === 'high' && !quick && kind === 'all', act: () => { reset(); setPrio('high'); } },
    { key: 'quick', label: 'Quick wins', n: nQuick, note: '5 minutes or less', Icon: Timer, color: PRIO.medium.color, on: quick && prio === 'all' && kind === 'all', act: () => { reset(); setQuick(true); } },
    { key: 'docs', label: 'Documents to approve', n: nDocs, note: 'waiting for a decision', Icon: FileCheck2, color: 'var(--status-healthy-fg)', on: kind === 'document_approval' && prio === 'all' && !quick, act: () => { reset(); setKind('document_approval'); } },
  ];
  const SortBtn = ({ k, children }: { k: 'prio' | 'time' | 'product'; children: React.ReactNode }) => (
    <button type="button" onClick={() => sortBy(k)} className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-[var(--text-heading)]" style={{ minHeight: 0, background: 'transparent', border: 0, padding: 0, font: 'inherit' }}>
      {children}{sort.key === k && (sort.dir === 1 ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
    </button>);

  return (
    <div className="flex flex-col gap-4 pb-4">
      <header>
        <div className="flex items-center justify-between gap-3"><h1 className="text-xl font-semibold text-[var(--text-heading)]">Tasks</h1></div>
        {waiting > 0 && <p className="text-sm text-[var(--text-muted)]">{`Loading ${waiting} more ${waiting === 1 ? 'product' : 'products'}…`}</p>}
      </header>

      <div className="grid grid-cols-2 gap-[var(--space-md)] lg:grid-cols-4">
        {tiles.map(({ key, label, n, note, Icon, color, on, act }) => (
          <button key={key} type="button" onClick={act} aria-pressed={on} className="flex flex-col gap-1 rounded-[var(--card-radius)] border bg-[var(--surface)] px-4 py-3 text-left transition-shadow hover:shadow-md"
            style={{ minHeight: 0, borderColor: on ? color : 'var(--card-border)', boxShadow: on ? `0 0 0 3px ${tint(color)}` : 'var(--card-shadow)' }}>
            <span className="flex items-center justify-between text-sm text-[var(--text-secondary)]">{label}<span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: tint(color), color }}><Icon size={15} /></span></span>
            <span className="text-3xl font-bold leading-tight tabular-nums text-[var(--text-heading)]">{n}</span>
            <span className="text-xs text-[var(--text-muted)]">{note}</span>
          </button>))}
      </div>

      <section className="rounded-[var(--card-radius)] border border-[var(--card-border)] bg-[var(--surface)]" style={{ boxShadow: 'var(--card-shadow)' }}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <p className="text-sm text-[var(--text-secondary)]">{filtered ? <><b className="text-[var(--text-heading)]">{rows.length}</b> {rows.length === 1 ? 'task matches' : 'tasks match'}</> : <span className="font-medium text-[var(--text-heading)]">All tasks</span>}</p>
          <div className="flex items-center gap-2">
            {filtered && <button type="button" onClick={reset} className="inline-flex items-center gap-1 text-sm font-medium text-[var(--sd-accent)]" style={{ minHeight: 0, background: 'transparent', border: 0 }}><X size={14} />Clear filters</button>}
            <label className="relative">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks or products" aria-label="Search tasks" className="h-9 w-64 rounded-lg border border-[var(--divider)] bg-[var(--search-bg)] pr-2 text-sm" style={{ paddingLeft: 34 }} />
            </label>
          </div>
        </div>

        <div className="overflow-x-auto border-t border-[var(--divider)]">
          <table className="w-full min-w-[64rem] table-fixed border-collapse text-sm">
            <colgroup><col /><col style={{ width: '13rem' }} /><col style={{ width: '8.5rem' }} /><col style={{ width: '8.5rem' }} /><col style={{ width: '10rem' }} /><col style={{ width: '5rem' }} /><col style={{ width: '10rem' }} /><col style={{ width: '2.25rem' }} /></colgroup>
            <thead className="bg-[var(--surface-muted)]">
              <tr>
                <ColumnHead label="Task" active={!!q} className="pl-4">
                  <label className="relative block"><Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input autoFocus type="search" className="h-9 w-full rounded-md border border-[var(--card-border)] bg-[var(--surface)] pr-2 text-sm" style={{ paddingLeft: 32 }} placeholder="Task or product name" aria-label="Search tasks" value={q} onChange={(e) => setQ(e.target.value)} /></label>
                </ColumnHead>
                <ColumnHead label="Product" active={product !== 'all'} sort={<SortBtn k="product">Product</SortBtn>}>
                  <OptionList multi={false} options={products.map(([value, label]) => ({ value, label }))} value={product === 'all' ? '' : product} onChange={(v) => setProduct(v || 'all')} anyLabel="Any product" />
                </ColumnHead>
                <ColumnHead label="Phase" active={phase !== 'all'}>
                  <OptionList multi={false} options={phases.map((p) => ({ value: String(p), label: `Phase ${p} · ${PHASE_SHORT[p]}` }))} value={phase === 'all' ? '' : phase} onChange={(v) => setPhase(v || 'all')} anyLabel="Any phase" />
                </ColumnHead>
                <ColumnHead label="Priority" active={prio !== 'all'} sort={<SortBtn k="prio">Priority</SortBtn>}>
                  <OptionList multi={false} options={[{ value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }]} value={prio === 'all' ? '' : prio} onChange={(v) => setPrio(v || 'all')} anyLabel="Any priority" />
                </ColumnHead>
                <ColumnHead label="Type" active={kind !== 'all'}>
                  <OptionList multi={false} options={kinds.map((k) => ({ value: k, label: KIND[k] || k }))} value={kind === 'all' ? '' : kind} onChange={(v) => setKind(v || 'all')} anyLabel="Any type" />
                </ColumnHead>
                <ColumnHead label="Time" active={quick} sort={<SortBtn k="time">Time</SortBtn>}>
                  <OptionList multi={false} options={[{ value: 'quick', label: '5 minutes or less' }]} value={quick ? 'quick' : ''} onChange={(v) => setQuick(v === 'quick')} anyLabel="Any length" />
                </ColumnHead>
                <ColumnHead label="Product owner" className="pr-4" />
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {view.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-14 text-center"><p className="text-base font-semibold text-[var(--text-heading)]">{all.length === 0 ? 'Nothing outstanding' : 'No task matches these filters'}</p><p className="mt-1 text-sm text-[var(--text-muted)]">{all.length === 0 ? 'Nothing is waiting on anyone, in any product.' : 'Change a filter, or clear them all.'}</p>{filtered && <button type="button" className="btn sm mt-3" onClick={reset}>Clear filters</button>}</td></tr>)}
              {view.map((t, i) => {
                const P = PRIO[t.prio];
                return (
                  <tr key={`${t.productId}-${t.id}-${i}`} onClick={() => router.push(taskRoute(t))} className="cursor-pointer border-t border-[var(--divider)] hover:bg-[var(--search-bg)]">
                    <td className="overflow-hidden py-2.5 pl-4 pr-3">
                      <div className="flex items-center gap-2">
                        {t.doer.startsWith('AGENT') && <span title="The assistant can do this" className="text-[var(--sd-accent)]"><Bot size={14} /></span>}
                        <Link href={taskRoute(t)} onClick={(e) => e.stopPropagation()} className="truncate font-medium text-[var(--text-heading)] hover:text-[var(--sd-accent)]">{t.title}</Link>
                      </div>
                      {t.why && <p className="truncate text-xs text-[var(--text-muted)]" title={t.why}>{t.why}</p>}
                    </td>
                    <td className="px-3 py-2.5"><Link href={`/products/${t.productId}`} onClick={(e) => e.stopPropagation()} className="font-medium text-[var(--text-heading)] hover:text-[var(--sd-accent)]">{t.productName}</Link></td>
                    <td className="px-3 py-2.5">{t.phase !== null && <span className="rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">{t.phase} {PHASE_SHORT[t.phase]}</span>}</td>
                    <td className="px-3 py-2.5"><span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ color: P.color, background: tint(P.color) }}><span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: P.color }} />{P.label}</span></td>
                    <td className="px-3 py-2.5 text-xs text-[var(--text-secondary)]">{KIND[t.kind] || 'Task'}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-[var(--text-secondary)]">{t.minutes} min</td>
                    <td className="py-2.5 pl-3 pr-4">{t.owner ? <span className="inline-flex items-center gap-2 text-xs text-[var(--text-secondary)]"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--avatar-bg)] text-[11px] font-semibold text-[var(--text-heading)]">{t.owner.charAt(0).toUpperCase()}</span>{t.owner}</span> : <span className="text-xs text-[var(--text-muted)]">No owner</span>}</td>
                    <td className="pr-3 text-[var(--text-muted)]"><ChevronRight size={16} /></td>
                  </tr>);
              })}
            </tbody>
          </table>
        </div>

        {rows.length > PER && (
          <div className="relative z-10 flex items-center justify-between rounded-b-[var(--card-radius)] border-t border-[var(--divider)] bg-[var(--surface)] px-4 py-2.5 text-xs text-[var(--text-muted)]">
            <span>{(cur - 1) * PER + 1} to {Math.min(cur * PER, rows.length)} of {rows.length}</span>
            <span className="flex items-center gap-2">
              <button type="button" className="btn sm inline-flex items-center gap-1" disabled={cur <= 1} onClick={() => setPage(cur - 1)}><ChevronLeft size={13} />Previous</button>
              <span className="tabular-nums">Page {cur} of {pages}</span>
              <button type="button" className="btn sm inline-flex items-center gap-1" disabled={cur >= pages} onClick={() => setPage(cur + 1)}>Next<ChevronRight size={13} /></button>
            </span>
          </div>)}
      </section>
    </div>
  );
}
