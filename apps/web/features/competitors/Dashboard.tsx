'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, LayoutGrid, List, Search } from 'lucide-react';
import { Empty, ErrorBox, Loading } from '@/components/ui';
import { Pager, usePaged } from '@/components/kit';
import { api, clearApiCache, useApi } from '@/lib/api';
import { THREAT_COLOR, tint } from './Overview';
import { suggestThreat } from './overviewBlocks';

const TIER_KEYS = ['T1', 'T2', 'T3', 'S', 'unassigned'];
const HUES = ['#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#f43f5e', '#6366f1', '#06b6d4'];
export const hueOf = (s: string) => HUES[[...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % HUES.length];
/** Same rule as the server: "People & Payroll" and "people and payroll" are one module. */
const key = (s: unknown) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '');

const KIND: Record<string, string> = { direct: 'Direct competitor', indirect: 'Indirect competitor', alternative: 'Alternative', in_house: 'In-house' };
const host = (w?: string) => String(w || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');

/** "Updated today", "Updated 3 days ago", or the date once it is older than a month. */
export function ago(day?: string | null) {
  if (!day) return 'Not updated yet';
  const days = Math.floor((Date.now() - new Date(day).getTime()) / 86400000);
  if (Number.isNaN(days)) return String(day);
  if (days <= 0) return 'Updated today';
  if (days === 1) return 'Updated yesterday';
  if (days < 31) return `Updated ${days} days ago`;
  return `Updated ${new Date(day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

/**
 * Competitors: every competitor in one searchable list. A product built from modules also gets a list of its parts on the left,
 * each with the number of competitors recorded for it (0 means nobody is covered yet). A competitor tied to no part competes with the whole product and is listed under every part.
 */
export default function Dashboard({ pid, scope, onScope, onAdd }: { pid: string; scope: string; onScope: (v: string) => void; onAdd: () => void }) {
  const { data, error, loading, reload } = useApi<any>('/competitors/tiers', pid, { keep: true });
  const parts = useApi<any>('/competitors/scopes', pid);
  const people = useApi<any>('/items?type=Competitor&limit=5000', pid);
  const lines = useApi<any>('/competitors/product-lines', pid);
  const [view, setView] = useState<'list' | 'cards'>('list');
  useEffect(() => { try { if (localStorage.getItem('sd_comp_view') === 'cards') setView('cards'); } catch { /* storage blocked */ } }, []);
  const pickView = (v: 'list' | 'cards') => { setView(v); try { localStorage.setItem('sd_comp_view', v); } catch { /* storage blocked */ } };
  const more = new Map<string, any>(((people.data?.items as any[]) || []).map((x) => [x.id, x]));
  const sells = new Map<string, string[]>(((lines.data as any[]) || []).map((x) => [x.id, (x.product_lines || []).map((l: any) => l.product_name).filter(Boolean)]));
  const [q, setQ] = useState('');
  const [pq, setPq] = useState('');
  const [sort, setSort] = useState<'name' | 'recent'>('name');
  const [sampling, setSampling] = useState(false);
  const [err, setErr] = useState('');
  const all: any[] = data ? TIER_KEYS.flatMap((t) => data.tiers[t] || []) : [];
  const scopesOf = (c: any): string[] => (Array.isArray(c.scopes) ? c.scopes : []);
  const modules: { name: string; n: number }[] = (parts.data?.has_modules ? (parts.data.scopes as any[]) : []).map((s) => ({ name: s.name, n: all.filter((c) => scopesOf(c).some((x) => key(x) === key(s.name))).length }));
  const hasParts = modules.length > 0;
  const scoped = hasParts && scope ? all.filter((c) => scopesOf(c).length === 0 || scopesOf(c).some((x) => key(x) === key(scope))) : all;
  const order = (a: any, b: any) => (sort === 'recent' ? String(b.last_update || '').localeCompare(String(a.last_update || '')) : 0) || String(a.title).localeCompare(String(b.title));
  const mix = (['direct', 'indirect', 'alternative', 'in_house'] as const).map((k) => [k, scoped.filter((c) => (c.kind || 'direct') === k).length] as const).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${KIND[k].replace(' competitor', '').toLowerCase()}`).join(' · ');
  const shown = scoped
    .filter((c) => !q || `${c.title} ${c.positioning || ''}`.toLowerCase().includes(q.toLowerCase()))
    .map((c) => ({ ...c, _whole: !!scope && hasParts && scopesOf(c).length === 0 }))
    .sort((a, b) => Number(a._whole) - Number(b._whole) || order(a, b));
  const pg = usePaged<any>(shown, 10);
  const addSample = async () => { setErr(''); setSampling(true); try { await api('/competitors/sample', { method: 'POST', product: pid }); clearApiCache(); reload(); parts.reload(); } catch (e: any) { setErr(String(e?.message || e)); } setSampling(false); };
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error || 'No data'} />;
  const base = `/products/${pid}/competitors`;
  const pick = (v: string) => { onScope(v); pg.setPage(1); };
  const railParts = modules.filter((m) => !pq || m.name.toLowerCase().includes(pq.toLowerCase()));
  const uncovered = modules.filter((m) => m.n === 0).length;

  if (!all.length && !hasParts) {
    return (
      <Empty>
        No competitors yet.
        <div className="row wrap" style={{ marginTop: 10, justifyContent: 'center' }}>
          <button className="btn primary" onClick={onAdd}>Add a competitor</button>
          <button type="button" className="btn" disabled={sampling} onClick={addSample} title="Adds nine invented companies so you can see how this page works. Safe to press twice.">{sampling ? 'Adding…' : 'Add sample competitors (fictional)'}</button>
        </div>
        {err && <div className="small" style={{ color: 'var(--bad)', marginTop: 6 }}>{err}</div>}
      </Empty>
    );
  }

  const rail = (
    <>
      <div className="screen-lg:hidden" style={{ marginBottom: 10 }}>
        <select value={scope} onChange={(e) => pick(e.target.value)} aria-label="Part of our product" style={{ width: '100%' }}>
          <option value="">All competitors ({all.length})</option>
          {modules.map((m) => <option key={m.name} value={m.name}>{m.name} ({m.n})</option>)}
        </select>
      </div>
      <nav aria-label="Parts of our product" className="hidden w-60 shrink-0 screen-lg:block">
        <div>
          <div className="border-b border-[var(--divider)] px-3 py-2.5">
            <div className="strong" style={{ fontSize: 13 }}>Parts of our product</div>
            <div className="xs muted">{uncovered ? `${uncovered} of ${modules.length} have no competitor yet` : `All ${modules.length} have a competitor`}</div>
          </div>
          {modules.length > 10 && (
            <label className="relative block border-b border-[var(--divider)] p-2">
              <Search size={14} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input type="search" value={pq} onChange={(e) => setPq(e.target.value)} placeholder="Find a part" aria-label="Find a part of our product" className="h-8 w-full rounded-md border border-[var(--divider)] bg-[var(--search-bg)] pr-2 text-sm" style={{ paddingLeft: 30 }} />
            </label>)}
          <ul className="m-0 max-h-[60vh] list-none overflow-y-auto p-1.5">
            {[{ name: '', n: all.length }, ...railParts].map((m) => {
              const on = (scope || '') === m.name;
              return (
                <li key={m.name || 'all'}>
                  <button type="button" onClick={() => pick(m.name)} aria-current={on ? 'true' : undefined}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors ${on ? 'bg-[var(--sd-accent-soft)] font-semibold text-[var(--sd-accent)]' : 'text-[var(--text-secondary)] hover:bg-[var(--search-bg)]'}`} style={{ minHeight: 0 }}>
                    <span className="min-w-0 flex-1 truncate">{m.name || 'All competitors'}</span>
                    {m.name && m.n === 0 ? <span className="shrink-0 rounded-full px-1.5 text-[10px] font-semibold leading-4" style={{ color: 'var(--warn)', background: 'color-mix(in srgb, var(--warn) 15%, transparent)' }} title="No competitor recorded for this part yet">none yet</span> : <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-muted)]">{m.n}</span>}
                  </button>
                </li>);
            })}
            {railParts.length === 0 && <li className="px-2 py-1.5 text-[12px] text-[var(--text-muted)]">No part matches.</li>}
          </ul>
        </div>
      </nav>
    </>
  );

  const list = (
    <section className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[11rem] flex-1">
          <div className="whitespace-nowrap text-xl font-semibold tracking-tight text-[var(--text-heading)]">{scoped.length} competitor{scoped.length === 1 ? '' : 's'}{hasParts && scope ? ` for ${scope}` : ''}</div>
          {mix && <div className="mt-0.5 text-[13px] text-[var(--text-muted)]">{mix}</div>}
        </div>
        <label className="relative block w-full screen-lg:w-52">
          <Search size={14} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input type="search" value={q} onChange={(e) => { setQ(e.target.value); pg.setPage(1); }} placeholder="Search competitors" aria-label="Search competitors" className="h-9 w-full rounded-lg border border-[var(--divider)] bg-[var(--search-bg)] pr-2 text-sm" style={{ paddingLeft: 32 }} />
        </label>
        <div className="seg" role="group" aria-label="How to show">
          <button type="button" className={view === 'list' ? 'on' : ''} onClick={() => pickView('list')} aria-label="List" title="List" style={{ padding: '5px 9px' }}><List size={15} /></button>
          <button type="button" className={view === 'cards' ? 'on' : ''} onClick={() => pickView('cards')} aria-label="Cards" title="Cards" style={{ padding: '5px 9px' }}><LayoutGrid size={15} /></button>
        </div>
        <div className="seg" role="group" aria-label="Order">
          <button type="button" className={sort === 'name' ? 'on' : ''} onClick={() => setSort('name')}>A to Z</button>
          <button type="button" className={sort === 'recent' ? 'on' : ''} onClick={() => setSort('recent')}>Recently updated</button>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="loading">
          {q ? `No competitor matches “${q}”.` : hasParts && scope ? `No competitor is recorded for ${scope} yet.` : 'No competitors yet.'}
          {!q && <div className="row wrap" style={{ marginTop: 10, justifyContent: 'center' }}><button className="btn primary" onClick={onAdd}>Add a competitor{hasParts && scope ? ` for ${scope}` : ''}</button></div>}
        </div>
      ) : (
        <ul role="list" className={view === 'cards' ? 'm-0 grid list-none gap-3 pt-5' : 'm-0 list-none p-0'} style={view === 'cards' ? { gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))' } : undefined}>
          {pg.rows.map((c: any, i: number) => {
            const hue = hueOf(String(c.title));
            const mine = scopesOf(c);
            const extra = more.get(c.id) || {};
            const company = [extra.legal_name && extra.legal_name !== c.title ? extra.legal_name : '', host(extra.website)].filter(Boolean).join(' · ');
            const made: string[] = sells.get(c.id) || [];
            const threat = suggestThreat(c.tier, extra.segment_overlap);
            const facts: [string, string][] = ([['Started', extra.founded_year ? String(extra.founded_year) : ''], ['People', extra.size_band ? String(extra.size_band) : ''], ['Head office', extra.hq_country ? String(extra.hq_country) : '']] as [string, string][]).filter(([, v]) => v);
            const threatBadge = threat ? <span className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[12px] font-semibold" style={{ background: tint(THREAT_COLOR[threat]), color: THREAT_COLOR[threat] }} title="Worked out from tier and overlap">{threat} threat</span> : null;
            const avatar = <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-lg font-semibold ${view === 'cards' ? 'h-11 w-11 text-lg' : 'h-10 w-10 text-base'}`} style={{ color: hue, background: `color-mix(in srgb, ${hue} 15%, transparent)` }}>{String(c.title).charAt(0).toUpperCase()}</span>;
            const kind = <span className="badge">{KIND[c.kind] || 'Competitor'}</span>;
            const parts = mine.length === 0 ? <span className="badge">Whole product</span> : <>{mine.slice(0, view === 'cards' ? 3 : 2).map((s) => <span key={s} className="badge">{s}</span>)}{mine.length > (view === 'cards' ? 3 : 2) && <span className="xs muted">+{mine.length - (view === 'cards' ? 3 : 2)}</span>}</>;
            return (
              <li key={c.id}>
                {c._whole && (i === 0 || !pg.rows[i - 1]._whole) && <div className={`bg-[var(--search-bg)] px-4 py-1.5 text-[12px] text-[var(--text-muted)] ${view === 'cards' ? 'col-span-full mb-1 rounded-md' : 'border-b border-[var(--divider)]'}`}>These compete with the whole product, so they count for {scope} too</div>}
                {view === 'cards' ? (
                  <Link href={`${base}/${c.id}`} className="group flex h-full flex-col gap-2.5 rounded-xl border border-[var(--divider)] p-4 no-underline transition-colors hover:border-[var(--sd-accent)] hover:no-underline">
                    <span className="flex items-center gap-3">
                      {avatar}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold text-[var(--text-heading)]">{c.title}</span>
                        <span className="block truncate text-[12px] text-[var(--text-muted)]">{[(KIND[c.kind] || 'Competitor').replace(' competitor', ''), company].filter(Boolean).join(' · ')}</span>
                      </span>
                    </span>
                    {c.positioning && <span className="line-clamp-2 text-[13px] text-[var(--text-secondary)]">{c.positioning}</span>}
                    {facts.length > 0 && <span className="grid grid-cols-3 gap-2 border-t border-[var(--divider)] pt-2.5 text-[12px]">{facts.map(([l, v]) => <span key={l} className="min-w-0"><span className="block text-[11px] text-[var(--text-muted)]">{l}</span><span className="block truncate font-medium text-[var(--text-heading)]" title={v}>{v}</span></span>)}</span>}
                    {made.length > 0 && <span className="text-[12px] text-[var(--text-muted)]"><span className="font-medium text-[var(--text-secondary)]">Sells </span>{made.slice(0, 3).join(', ')}{made.length > 3 ? ` +${made.length - 3}` : ''}</span>}
                    {hasParts && mine.length > 0 && <span className="flex flex-wrap items-center gap-1">{parts}</span>}
                    <span className="mt-auto flex items-center justify-between gap-2 pt-1 text-[12px] text-[var(--text-muted)]">{threatBadge}<span>{ago(c.last_update)}</span></span>
                  </Link>
                ) : (
                  <Link href={`${base}/${c.id}`} className="group flex items-center gap-3 border-b border-[var(--divider)] px-4 py-3 no-underline transition-colors hover:bg-[var(--search-bg)] hover:no-underline">
                    {avatar}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2"><span className="truncate text-[15px] font-semibold text-[var(--text-heading)]">{c.title}</span><span className="hidden screen-lg:inline-flex">{kind}</span></span>
                      <span className="block truncate text-[13px] text-[var(--text-muted)]">{[company, made.length ? `Sells ${made.slice(0, 3).join(', ')}${made.length > 3 ? ` +${made.length - 3}` : ''}` : ''].filter(Boolean).join(' · ') || 'Company not added'}</span>
                      <span className="block truncate text-[13px] text-[var(--text-secondary)]">{c.positioning || 'No description yet.'}</span>
                      {facts.length > 0 && <span className="block truncate text-[12px] text-[var(--text-muted)]">{facts.map(([l, v], i) => <span key={l}>{i > 0 && ' · '}{l} <span className="text-[var(--text-secondary)]">{v}</span></span>)}</span>}
                      <span className="block truncate text-[12px] text-[var(--text-muted)] screen-lg:hidden">{ago(c.last_update)}</span>
                    </span>
                    {hasParts && <span className="hidden shrink-0 items-center gap-1 screen-lg:flex">{parts}</span>}
                    <span className="hidden w-40 shrink-0 flex-col items-end gap-1 text-right text-[13px] text-[var(--text-muted)] screen-lg:flex">{threatBadge}<span>{ago(c.last_update)}</span></span>
                    <ChevronRight size={16} aria-hidden className="shrink-0 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5" />
                  </Link>
                )}
              </li>);
          })}
        </ul>)}
      <div className="[&_.pager]:border-t-0! [&_.pager]:px-0! [&_.pager]:pt-5!"><Pager {...pg} /></div>
    </section>
  );

  return hasParts ? <div className="screen-lg:flex screen-lg:items-start screen-lg:gap-4">{rail}{list}</div> : list;
}
