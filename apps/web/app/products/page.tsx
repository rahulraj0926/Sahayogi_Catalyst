'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, ChevronDown, LayoutGrid, List, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ErrorBox, Loading } from '@/components/ui';
import { PHASE_SHORT } from '@/components/shell/groups';
import { HOME_COPY as C } from '@/features/home/copy';
import { useProducts } from '@/features/home/client';
import { DEFAULT_FILTERS } from '@/features/home/ProductsTable';
import { NewProduct } from '@/features/home/NewProduct';
import { nextOf } from '@/features/home/nextStep';
import type { HomeProduct } from '@/features/home/types';

type View = 'grid' | 'list';
const KIND_LABEL: Record<string, string> = { software: 'Software', service: 'Service', hardware: 'Hardware' };
const HEALTH_COLOR: Record<string, string> = { on_track: 'var(--status-healthy-fg)', attention: 'var(--status-warning-fg)', blocked: 'var(--status-critical-fg)', idle: 'var(--status-neutral-fg)' };
const HUES = ['#6366f1', '#10b981', '#f97316', '#ec4899', '#3b82f6', '#8b5cf6', '#14b8a6', '#eab308'];
const PAGE = { grid: 9, list: 10 };
const tint = (c: string, n = 16) => `color-mix(in srgb, ${c} ${n}%, transparent)`;

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const hue = (n: string) => HUES[[...n].reduce((s, c) => s + c.charCodeAt(0), 0) % HUES.length];

function Tile({ name, size = 40 }: { name: string; size?: number }) {
  const h = hue(name);
  return <span aria-hidden className="flex shrink-0 items-center justify-center rounded-xl text-sm font-bold" style={{ width: size, height: size, background: tint(h, 16), color: h }}>{initials(name)}</span>;
}
function Person({ name }: { name: string }) {
  return name
    ? <span className="inline-flex min-w-0 items-center gap-2 text-sm text-[var(--text-heading)]"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--avatar-bg)] text-[11px] font-semibold">{name.charAt(0).toUpperCase()}</span><span className="truncate">{name}</span></span>
    : <span className="text-sm text-[var(--text-muted)]">No owner yet</span>;
}
function Health({ h }: { h: string }) {
  const c = HEALTH_COLOR[h] || HEALTH_COLOR.idle;
  return <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ color: c, background: tint(c, 14) }}><span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />{C.healthLabel[h] || h}</span>;
}
/** The 13 phases as small segments: signed-off ones filled, the current one lit up. */
function PhaseBar({ phase, ready }: { phase: number; ready: number }) {
  return (
    <div className="flex gap-[3px]" role="img" aria-label={`Phase ${phase} of 12, ${ready}% ready`}>
      {Array.from({ length: 13 }, (_, i) => (
        <span key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-muted)]">
          <span className="block h-full rounded-full" style={{ width: i < phase ? '100%' : i === phase ? `${Math.max(ready, 12)}%` : '0%', background: i < phase ? 'var(--status-healthy-fg)' : 'var(--sd-accent)' }} />
        </span>))}
    </div>
  );
}

/** The one filter: every phase of the lifecycle (Phase 0 to Phase 12), with its choices in a small menu under the button. */
const PHASE_OPTIONS = PHASE_SHORT.map((name, n) => ({ value: String(n), label: `Phase ${n}: ${name}` }));
function PhaseFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); };
  }, [open]);
  const cur = PHASE_OPTIONS.find((o) => o.value === value);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors"
        style={{ minHeight: 0, borderColor: cur ? 'var(--sd-accent)' : 'var(--divider)', background: cur ? 'var(--sd-accent-soft)' : 'var(--surface)', color: cur ? 'var(--sd-accent)' : 'var(--text-secondary)' }}>
        Phases{cur && <b className="font-semibold">: {cur.label}</b>}<ChevronDown size={14} />
      </button>
      {open && (
        <ul role="listbox" aria-label="Phases" className="absolute left-0 top-full z-30 mt-1 max-h-80 w-60 overflow-y-auto rounded-lg border border-[var(--divider)] bg-[var(--surface)] p-1 text-sm shadow-xl">
          {[{ value: '', label: 'All phases' }, ...PHASE_OPTIONS].map((o) => (
            <li key={o.value}><button type="button" role="option" aria-selected={o.value === value} onClick={() => { onChange(o.value); setOpen(false); }}
              className={`flex w-full items-center rounded-md px-2.5 py-1.5 text-left hover:bg-[var(--surface-muted)] ${o.value === value ? 'font-semibold text-[var(--sd-accent)]' : 'text-[var(--text-heading)]'}`} style={{ minHeight: 0 }}>{o.label}</button></li>))}
        </ul>)}
    </div>
  );
}

function GridCard({ p }: { p: HomeProduct }) {
  return (
    <Link href={`/products/${p.slug}`} className="group flex flex-col gap-3 rounded-2xl border border-[var(--card-border)] bg-[var(--surface)] p-4 no-underline transition-all hover:-translate-y-0.5 hover:shadow-lg" style={{ boxShadow: 'var(--card-shadow)' }}>
      <div className="flex items-start justify-between gap-3">
        <Tile name={p.name} />
        <span className="rounded-full bg-[var(--surface-muted)] px-2.5 py-0.5 text-xs text-[var(--text-secondary)]">{KIND_LABEL[p.kind] || p.kind}</span>
      </div>
      <div className="min-w-0">
        <h3 className="truncate text-base font-semibold text-[var(--text-heading)] group-hover:text-[var(--sd-accent)]">{p.name}</h3>
        <p className="line-clamp-2 min-h-[2.5rem] text-sm text-[var(--text-muted)]">{p.oneLiner || 'No description yet.'}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <PhaseBar phase={p.phase.id} ready={p.readinessPercent} />
        <div className="flex items-baseline justify-between text-xs text-[var(--text-muted)]"><span>Phase {p.phase.id}: {p.phase.short}</span><span>{p.daysInStage !== null ? `${p.daysInStage} days` : ''}</span></div>
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-[var(--divider)] pt-3"><Person name={p.owner} /><Health h={p.health} /></div>
    </Link>
  );
}

const COLS = 'grid-cols-[minmax(14rem,2.2fr)_minmax(11rem,1.6fr)_minmax(8rem,1fr)_4rem_7.5rem_minmax(12rem,1.8fr)]';
function ListRow({ p }: { p: HomeProduct }) {
  const router = useRouter(); const n = nextOf(p);
  return (
    <li>
      <div role="link" tabIndex={0} onClick={() => router.push(`/products/${p.slug}`)} onKeyDown={(e) => e.key === 'Enter' && router.push(`/products/${p.slug}`)}
        className={`grid cursor-pointer items-center gap-4 border-b border-[var(--divider)] px-4 py-3 transition-colors last:border-b-0 hover:bg-[var(--search-bg)] ${COLS}`}>
        <div className="flex min-w-0 items-center gap-3"><Tile name={p.name} size={36} /><div className="min-w-0"><Link href={`/products/${p.slug}`} onClick={(e) => e.stopPropagation()} className="block truncate text-sm font-semibold text-[var(--text-heading)] hover:text-[var(--sd-accent)]">{p.name}</Link><p className="truncate text-xs text-[var(--text-muted)]">{p.oneLiner}</p></div></div>
        <div className="min-w-0"><PhaseBar phase={p.phase.id} ready={p.readinessPercent} /><p className="mt-1 truncate text-xs text-[var(--text-muted)]">Phase {p.phase.id}: {p.phase.short}{p.daysInStage !== null ? `, ${p.daysInStage} days` : ''}</p></div>
        <Person name={p.owner} />
        <span className="text-sm font-semibold tabular-nums text-[var(--text-heading)]">{p.readinessPercent}%</span>
        <Health h={p.health} />
        <span className="line-clamp-2 text-xs text-[var(--sd-accent)]">{n.text}{n.min ? ` · ${n.min} min` : ''}</span>
      </div>
    </li>
  );
}

/** Every product, as cards or as rows, with a search box and a phase filter. Most ready first, then by name. */
export default function Products() {
  const { data, error, loading } = useProducts({ ...DEFAULT_FILTERS, sort: 'readiness', order: 'desc', page: 1 }, 100);
  const [view, setView] = useState<View>('grid');
  const [q, setQ] = useState(''); const [phase, setPhase] = useState(''); const [page, setPage] = useState(1); const [adding, setAdding] = useState(false);
  useEffect(() => { try { const v = localStorage.getItem('sd_products_view'); if (v === 'grid' || v === 'list') setView(v); } catch { /* storage blocked */ } }, []);
  useEffect(() => { setPage(1); }, [q, phase, view]);
  const pick = (v: View) => { setView(v); try { localStorage.setItem('sd_products_view', v); } catch { /* storage blocked */ } };

  const all = data?.data ?? [];
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all
      .filter((p) => (!phase || String(p.phase.id) === phase) && (!s || `${p.name} ${p.oneLiner} ${p.owner}`.toLowerCase().includes(s)))
      .sort((a, b) => b.readinessPercent - a.readinessPercent || a.name.localeCompare(b.name));
  }, [all, q, phase]);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  const per = PAGE[view]; const pages = Math.max(1, Math.ceil(rows.length / per)); const cur = Math.min(page, pages);
  const shown = rows.slice((cur - 1) * per, cur * per);
  const searching = !!(q.trim() || phase);
  const clear = () => { setQ(''); setPhase(''); };

  return (
    <div className="flex flex-col gap-4 pb-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-heading)]">Products</h1>
        </div>
        <button type="button" className="btn primary inline-flex items-center gap-1.5" onClick={() => setAdding(true)}><Plus size={16} />Add product</button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product and owner" aria-label="Search product and owner" className="h-9 w-80 max-w-full rounded-lg border border-[var(--divider)] bg-[var(--search-bg)] pr-2 text-sm" style={{ paddingLeft: 34 }} />
        </label>
        <PhaseFilter value={phase} onChange={setPhase} />
        <span className="ml-auto flex items-center gap-2">
          <div role="group" aria-label="View" className="inline-flex gap-1 rounded-lg bg-[var(--surface-muted)] p-1">
            {([['grid', LayoutGrid, 'Grid'], ['list', List, 'List']] as const).map(([v, Icon, label]) => (
              <button key={v} type="button" aria-pressed={view === v} aria-label={`${label} view`} title={`${label} view`} onClick={() => pick(v)} className={`flex h-7 w-8 items-center justify-center rounded-md ${view === v ? 'bg-[var(--surface)] text-[var(--text-heading)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-heading)]'}`} style={{ minHeight: 0, border: 0, padding: 0 }}><Icon size={16} /></button>))}
          </div>
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--divider)] px-6 py-14 text-center">
          <p className="text-base font-semibold text-[var(--text-heading)]">{all.length === 0 ? 'No products yet' : 'No product matches your search or phase'}</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{all.length === 0 ? 'Add the first product to start its 13 phases.' : 'Try another name or phase, or clear them.'}</p>
          {searching ? <button type="button" className="btn sm mt-4" onClick={clear}>Clear search and phase</button> : <button type="button" className="btn primary sm mt-4" onClick={() => setAdding(true)}>Add product</button>}
        </div>
      ) : view === 'grid' ? (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{shown.map((p) => <li key={p.id} className="flex"><div className="flex w-full flex-col [&>a]:h-full"><GridCard p={p} /></div></li>)}</ul>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--card-border)] bg-[var(--surface)]" style={{ boxShadow: 'var(--card-shadow)' }}>
          <div className="min-w-[60rem]">
            <div className={`grid items-center gap-4 border-b border-[var(--divider)] bg-[var(--surface-muted)] px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] ${COLS}`}><span>Product</span><span>Progress</span><span>Owner</span><span>Ready</span><span>Health</span><span>Next step</span></div>
            <ul>{shown.map((p) => <ListRow key={p.id} p={p} />)}</ul>
          </div>
        </div>
      )}

      {rows.length > per && (
        <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>{(cur - 1) * per + 1} to {Math.min(cur * per, rows.length)} of {rows.length}</span>
          <span className="flex items-center gap-2"><button type="button" className="btn sm" disabled={cur <= 1} onClick={() => setPage(cur - 1)}>Previous</button><span className="tabular-nums">Page {cur} of {pages}</span><button type="button" className="btn sm inline-flex items-center gap-1" disabled={cur >= pages} onClick={() => setPage(cur + 1)}>Next<ArrowRight size={12} /></button></span>
        </div>)}
      {adding && <NewProduct onClose={() => setAdding(false)} />}
    </div>
  );
}
