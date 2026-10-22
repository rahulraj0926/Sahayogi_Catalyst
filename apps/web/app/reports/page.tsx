'use client';
import Link from 'next/link';
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, ChevronLeft, ChevronRight, Clock, Download, Package, Printer, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/dashboard/Card';
import { KPITile } from '@/components/dashboard/KPITile';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { ErrorBox, Loading } from '@/components/ui';
import { useApi } from '@/lib/api';

const TH = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]';
const TD = 'px-3 py-2.5 text-sm text-[var(--text-secondary)]';

/** Small "1 to 5 of 12  < Page 1 of 3 >" bar. Hidden when everything fits on one page. */
function Pager({ total, per, page, onPage }: { total: number; per: number; page: number; onPage: (n: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / per));
  if (total <= per) return null;
  const cur = Math.min(page, pages);
  const b = 'inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--divider)] disabled:opacity-40';
  return (
    <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--divider)] pt-3 text-xs text-[var(--text-muted)]">
      <span>{(cur - 1) * per + 1} to {Math.min(cur * per, total)} of {total}</span>
      <span className="flex items-center gap-2">
        <button type="button" className={b} style={{ minHeight: 0, padding: 0 }} aria-label="Previous page" disabled={cur <= 1} onClick={() => onPage(cur - 1)}><ChevronLeft size={14} /></button>
        <span className="tabular-nums">Page {cur} of {pages}</span>
        <button type="button" className={b} style={{ minHeight: 0, padding: 0 }} aria-label="Next page" disabled={cur >= pages} onClick={() => onPage(cur + 1)}><ChevronRight size={14} /></button>
      </span>
    </div>
  );
}
const slice = <T,>(a: T[], page: number, per: number) => a.slice((Math.max(1, Math.min(page, Math.ceil(a.length / per) || 1)) - 1) * per, Math.max(1, Math.min(page, Math.ceil(a.length / per) || 1)) * per);

type SortKey = 'name' | 'stage_label' | 'days_in_stage' | 'readiness_percent' | 'blocker_count' | 'documents_approved';
const COLS: [SortKey, string][] = [['name', 'Product'], ['stage_label', 'Stage'], ['days_in_stage', 'Days in stage'], ['readiness_percent', 'Ready'], ['blocker_count', 'Blockers'], ['documents_approved', 'Documents']];

/** Portfolio report: funnel, stuck products, throughput, blockers, time owed. Prototype: reports.js (/reports) */
export default function Reports() {
  const [days, setDays] = useState(14);
  const { data: r, error, loading } = useApi<any>(`/portfolio/report?stuck_days=${days}`);
  const [stuckPg, setStuckPg] = useState(1); const [blockPg, setBlockPg] = useState(1); const [timePg, setTimePg] = useState(1); const [prodPg, setProdPg] = useState(1);
  const [q, setQ] = useState(''); const [sort, setSort] = useState<SortKey>('readiness_percent'); const [dir, setDir] = useState<1 | -1>(-1);
  useEffect(() => { setStuckPg(1); }, [days]);
  useEffect(() => { setProdPg(1); }, [q, sort, dir]);
  const products = useMemo(() => {
    const s = q.trim().toLowerCase();
    const l = ((r?.products ?? []) as any[]).filter((p) => !s || `${p.name} ${p.stage_label}`.toLowerCase().includes(s));
    return [...l].sort((a, b) => {
      const x = a[sort], y = b[sort];
      return (typeof x === 'string' ? x.localeCompare(y) : (x ?? 0) - (y ?? 0)) * dir || a.name.localeCompare(b.name);
    });
  }, [r, q, sort, dir]);
  if (loading && !r) return <Loading />;
  if (error || !r) return <ErrorBox message={error || 'No data'} />;
  const max = Math.max(1, ...r.funnel.map((f: any) => f.count));
  const head = (k: SortKey) => { if (sort === k) setDir((d) => (d === 1 ? -1 : 1)); else { setSort(k); setDir(k === 'name' || k === 'stage_label' ? 1 : -1); } };
  const PROD = 10;
  return (
    <div className="flex flex-col gap-[var(--space-md)] pb-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-heading)]">Report</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-[var(--text-muted)]">Stuck after <input type="number" min={1} value={days} onChange={(e) => setDays(Number(e.target.value) || 14)} className="mx-1 h-8 w-16 rounded-md border border-[var(--divider)] bg-[var(--surface)] px-2 text-sm text-[var(--text-heading)]" /> days</label>
          <a className="btn sm inline-flex items-center gap-1" href={`/api/v1/portfolio/report?format=csv&stuck_days=${days}`}><Download size={14} />CSV</a>
          <a className="btn sm inline-flex items-center gap-1" target="_blank" rel="noreferrer" href={`/api/v1/portfolio/report?format=html&stuck_days=${days}`}><Printer size={14} />Printable</a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-[var(--space-md)] md:grid-cols-4">
        <KPITile title="Products" value={r.counts.products} status="info" note="in the portfolio" icon={<Package />} />
        <KPITile title="Sign-offs in 30 days" value={r.throughput.gates_passed_30d} status="healthy" note="stages passed" icon={<CheckCircle2 />} />
        <KPITile title="Stuck products" value={r.stuck.length} status={r.stuck.length ? 'critical' : 'healthy'} note={`no activity for ${r.stuck_after_days}+ days`} icon={<AlertTriangle />} />
        <KPITile title="People's time owed" value={`${r.human_minutes_owed.total} min`} status="neutral" note="listed work still to do" icon={<Clock />} />
      </div>

      <div className="grid grid-cols-1 items-start gap-[var(--space-md)] xl:grid-cols-2">
        <Card title="Where products are">
          <ul className="flex flex-col gap-2.5">
            {r.funnel.map((f: any) => (
              <li key={f.stage} className="flex items-center gap-3">
                <span className="w-44 shrink-0 truncate text-xs text-[var(--text-secondary)]">{f.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-muted)]"><div className="h-full rounded-full bg-[var(--sd-accent)]" style={{ width: `${(f.count / max) * 100}%` }} /></div>
                <b className="w-6 text-right text-sm tabular-nums text-[var(--text-heading)]">{f.count}</b>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Stuck">
          {r.stuck.length === 0 ? <p className="text-sm text-[var(--text-muted)]">Nothing is stuck.</p> : (<>
            <ul className="divide-y divide-[var(--divider)]">
              {slice<any>(r.stuck, stuckPg, 5).map((s: any) => (
                <li key={s.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2"><Link className="text-sm font-semibold" href={`/products/${s.id}`}>{s.name}</Link><StatusBadge status="critical" label={`${s.days_since_activity} days`} /></div>
                  <p className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">{s.stage_label}. {s.what_happens_next}</p>
                </li>
              ))}
            </ul>
            <Pager total={r.stuck.length} per={5} page={stuckPg} onPage={setStuckPg} />
          </>)}
        </Card>
        <Card title="What holds up the most products">
          <div className="-mx-3 overflow-x-auto"><table className="w-full"><tbody className="divide-y divide-[var(--divider)]">
            {slice<any>(r.top_blockers, blockPg, 6).map((b: any) => (
              <tr key={b.criterion}><td className={`${TD} align-top`}>{b.text}<span className="block text-xs text-[var(--text-muted)]">{b.todo}</span></td><td className={`${TD} whitespace-nowrap align-top`}><StatusBadge status="warning" label={`${b.product_count} products`} /></td></tr>
            ))}
          </tbody></table></div>
          <Pager total={r.top_blockers.length} per={6} page={blockPg} onPage={setBlockPg} />
        </Card>
        <Card title="Time owed by people">
          <div className="-mx-3 overflow-x-auto"><table className="w-full"><tbody className="divide-y divide-[var(--divider)]">
            {slice<any>(r.human_minutes_owed.by_person, timePg, 6).map((p: any) => <tr key={p.person}><td className={TD}>{p.person}</td><td className={`${TD} text-right tabular-nums`}>{p.minutes} min</td></tr>)}
          </tbody></table></div>
          <Pager total={r.human_minutes_owed.by_person.length} per={6} page={timePg} onPage={setTimePg} />
        </Card>
      </div>

      <Card title="Products">
        <label className="relative mb-3 block w-64 max-w-full">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product or stage" aria-label="Search products" className="h-9 w-full rounded-lg border border-[var(--divider)] bg-[var(--search-bg)] pr-2 text-sm" style={{ paddingLeft: 34 }} />
        </label>
        <div className="-mx-3 overflow-x-auto">
          <table className="w-full min-w-[44rem]">
            <thead><tr className="border-b border-[var(--divider)]">
              {COLS.map(([k, label]) => (
                <th key={k} className={TH} aria-sort={sort === k ? (dir === 1 ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" onClick={() => head(k)} className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-[var(--text-heading)]" style={{ minHeight: 0, background: 'transparent', border: 0, padding: 0, font: 'inherit', color: sort === k ? 'var(--sd-accent)' : 'inherit' }}>
                    {label}{sort === k && (dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                  </button>
                </th>))}
            </tr></thead>
            <tbody className="divide-y divide-[var(--divider)]">
              {products.length === 0 && <tr><td colSpan={6} className={`${TD} py-8 text-center`}>No product matches that search.</td></tr>}
              {slice<any>(products, prodPg, PROD).map((p: any) => (
                <tr key={p.id} className="hover:bg-[var(--search-bg)]">
                  <td className={TD}><Link href={`/products/${p.id}`} className="font-semibold">{p.name}</Link></td>
                  <td className={TD}>{p.stage_label}</td>
                  <td className={`${TD} tabular-nums`}>{p.days_in_stage}</td>
                  <td className={TD}><span className="flex items-center gap-2"><span className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--surface-muted)]"><span className="block h-full rounded-full bg-[var(--sd-accent)]" style={{ width: `${p.readiness_percent}%` }} /></span><span className="tabular-nums">{p.readiness_percent}%</span></span></td>
                  <td className={`${TD} tabular-nums`}>{p.blocker_count}</td>
                  <td className={`${TD} tabular-nums`}>{p.documents_approved}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager total={products.length} per={PROD} page={prodPg} onPage={setProdPg} />
      </Card>
    </div>
  );
}
