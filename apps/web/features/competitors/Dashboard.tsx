'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Badge, Card, Empty, ErrorBox, Loading } from '@/components/ui';
import { Pager, usePaged } from '@/components/kit';
import { api, clearApiCache, useApi } from '@/lib/api';
import { NumberPick } from './NumberPick';

const rs = (n: any) => (n === null || n === undefined ? '-' : `₹${Math.round(n).toLocaleString('en-IN')}`);
const BAND: Record<string, { label: string; color: string }> = {
  must: { label: 'Must-have', color: 'var(--ok)' },
  common: { label: 'Common', color: 'var(--sd-accent)' },
  niche: { label: 'Some have it', color: 'var(--sd-muted)' },
};
/** Quick picks only. Every number can also be typed in, and nothing below depends on these lists. */
const SHARES = [50, 60, 80, 100];
const USERS = [1, 5, 10, 25];

function Tile({ value, label, hint }: { value: React.ReactNode; label: string; hint?: string }) {
  return (
    <div className="card" style={{ minWidth: 0 }}>
      <div className="card-b" style={{ padding: '12px 16px' }}>
        <div className="strong" style={{ fontSize: 26, lineHeight: 1.1 }}>{value}</div>
        <div className="small">{label}</div>
        {hint && <div className="xs muted" style={{ marginTop: 2 }}>{hint}</div>}
      </div>
    </div>
  );
}

/** A competitor as a small chip; the thin bar under the name shows how much of its profile is filled in. */
function Chip({ href, c }: { href: string; c: any }) {
  return (
    <Link href={href} title={`${c.plans} plan${c.plans === 1 ? '' : 's'} · ${c.plans_with_features} with features listed · profile ${c.completeness}% complete`} style={{ display: 'inline-flex', flexDirection: 'column', gap: 3, padding: '6px 10px', border: '1px solid var(--divider)', borderRadius: 8, textDecoration: 'none', minWidth: 0, maxWidth: '100%' }}>
      <span className="strong" style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
      <span aria-hidden style={{ height: 3, borderRadius: 99, background: 'var(--surface-muted)' }}><span style={{ display: 'block', width: `${Math.max(4, c.completeness)}%`, height: 3, borderRadius: 99, background: c.completeness >= 70 ? 'var(--ok)' : c.completeness >= 35 ? 'var(--warn)' : 'var(--bad)' }} /></span>
    </Link>
  );
}

/** Where we stand: how much has been analysed, the features most competitors share, what we should build, and what that is likely to cost. */
export default function Dashboard({ pid, scope, onScope, onAdd }: { pid: string; scope: string; onScope: (v: string) => void; onAdd: () => void }) {
  const [share, setShare] = useState(60);
  const [users, setUsers] = useState(1);
  const [band, setBand] = useState('all');
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [must, setMust] = useState(80);
  const [common, setCommon] = useState(50);
  const [sizes, setSizes] = useState('1, 5, 10, 25');
  const [sizesText, setSizesText] = useState('1, 5, 10, 25');
  const [sampling, setSampling] = useState<string | null>(null);
  const [err, setErr] = useState('');
  // keep: changing a number below updates the figures in place; the page never blanks and redraws
  const { data: d, error, loading, reload } = useApi<any>(`/competitors/overview?threshold=${share}&users=${users}&must=${must}&common=${Math.min(common, must - 1)}&compare_users=${encodeURIComponent(sizes.replace(/\s+/g, ''))}${scope ? `&scope=${encodeURIComponent(scope)}` : ''}`, pid, { keep: true });
  const addSample = async () => { setErr(''); setSampling('Adding…'); try { await api('/competitors/sample', { method: 'POST', product: pid }); clearApiCache(); reload(); setSampling(null); } catch (e: any) { setSampling(null); setErr(String(e?.message || e)); } };
  const sampleButton = <button type="button" className="btn" disabled={!!sampling} onClick={addSample} title="Adds nine invented companies with plans, prices and features, so you can see how the dashboard works. Safe to press twice.">{sampling || 'Add sample competitors (fictional)'}</button>;

  const all: any[] = d?.common.features || [];
  const shown = all.filter((f) => (band === 'all' || f.band === band) && (!cat || (f.category || 'Other') === cat) && (!q || f.name.toLowerCase().includes(q.toLowerCase())));
  const pg = usePaged<any>(shown, 10);
  const mods = usePaged<any>(d?.modules?.rows || [], 10);
  if (loading && !d) return <Loading />;
  if (error || !d) return <ErrorBox message={error || 'No data'} />;
  const base = `/products/${pid}/competitors`;
  if (!d.analysed.total) {
    return (
      <Empty>
        {scope ? `No competitor is set for “${scope}” yet.` : 'No competitors yet.'}
        <div className="row wrap" style={{ marginTop: 10, justifyContent: 'center' }}><button className="btn primary" onClick={onAdd}>Add a competitor</button>{sampleButton}</div>{err && <div className="small" style={{ color: 'var(--bad)', marginTop: 6 }}>{err}</div>}
      </Empty>
    );
  }
  const a = d.analysed; const rec = d.recommended; const bundle = rec.bundle;
  const maxLadder = Math.max(1, ...rec.ladder.map((l: any) => l.price.avg_yearly_inr || 0));
  const tiers = d.tiers.filter((t: any) => t.competitors.length || ['T1', 'T2', 'T3'].includes(t.key));

  return (
    <div style={{ opacity: loading ? 0.65 : 1, transition: 'opacity .15s' }} aria-busy={loading}>
      {/* ---- 1. how much has been analysed */}
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Tile value={a.total} label={`competitor${a.total === 1 ? '' : 's'} analysed`} hint={`${a.with_plans} with plans · ${a.with_features} with features listed`} />
        <Tile value={a.plans} label="plans recorded" hint={d.plan_levels.length ? d.plan_levels.map((l: any) => `${l.plans} ${l.label.toLowerCase()}`).join(' · ') : 'no plan has a level yet'} />
        <Tile value={d.common.bands.must + d.common.bands.common} label="common features" hint={`${d.common.bands.must} must-have (${d.common.cut_offs.must}%+) · ${d.common.bands.common} common (${d.common.cut_offs.common}%+)`} />
        <Tile value={a.avg_completeness === null ? '-' : `${a.avg_completeness}%`} label="average profile filled in" hint="the bar under each name below" />
      </div>

      {/* ---- 1b. module by module (BoSS has many modules, each with its own competitors and prices) */}
      {!scope && d.modules.rows.length > 0 && (
        <>
          <Card title="By module" sub={`${d.modules.rows.length} modules · cheapest plan of each competitor, yearly, 1 user${d.modules.whole_product ? ` · ${d.modules.whole_product} competitor${d.modules.whole_product === 1 ? '' : 's'} not tied to a module count in every module` : ''}`} flush>
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl">
                <thead><tr><th>Module</th><th>Tier 1</th><th>Tier 2</th><th>Tier 3</th><th>With plans</th><th>With a price</th><th>Average</th><th>Range</th></tr></thead>
                <tbody>
                  {mods.rows.map((m: any) => (
                    <tr key={m.name}>
                      <td><button type="button" className="btn sm ghost" onClick={() => onScope(m.name)} title={`Show only ${m.name}`}>{m.name}</button>{m.competitors === 0 && <span className="xs muted"> no competitors yet</span>}</td>
                      <td>{m.T1 || '-'}</td><td>{m.T2 || '-'}</td><td>{m.T3 || '-'}</td>
                      <td>{m.with_plans ? `${m.with_plans} of ${m.competitors}` : '-'}</td>
                      <td>{m.priced ? `${m.priced} of ${m.competitors}` : '-'}</td>
                      <td>{rs(m.avg_yearly_inr)}</td>
                      <td className="small">{m.priced ? `${rs(m.min_yearly_inr)} – ${rs(m.max_yearly_inr)}` : '-'}</td>
                    </tr>))}
                </tbody>
              </table>
            </div>
            <Pager {...mods} />
          </Card>
          <div style={{ height: 14 }} />
        </>)}

      {/* ---- 2. who, by tier */}
      <Card title="Who we compared" sub={scope ? `for ${scope}` : undefined} right={<Link className="btn sm" href={`${base}/list`}>All competitors</Link>}>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
          {tiers.map((t: any) => (
            <div key={t.key} style={{ minWidth: 0 }}>
              <div className="row" style={{ marginBottom: 6, gap: 6 }}><span className="strong">{t.label}</span><Badge>{t.competitors.length}</Badge></div>
              <div className="xs muted" style={{ marginBottom: 6 }}>{t.hint}</div>
              {t.competitors.length === 0 ? <div className="small muted">None yet.</div> : <div className="row wrap" style={{ gap: 6 }}>{t.competitors.map((c: any) => <Chip key={c.id} href={`${base}/${c.id}`} c={c} />)}</div>}
            </div>
          ))}
        </div>
        {d.unassigned.length > 0 && <div className="small" style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--divider)' }}><span className="muted">No tier yet: </span>{d.unassigned.map((c: any, i: number) => <span key={c.id}>{i > 0 && ', '}<Link href={`${base}/${c.id}`}>{c.title}</Link></span>)}</div>}
      </Card>
      <div style={{ height: 14 }} />

      {/* ---- 3. common features, and what we recommend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ flex: '2 1 460px', minWidth: 0 }}>
          <Card title="Features competitors share" sub={`share of the ${d.common.competitor_count} competitors that offer each`} flush>
            <div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 10, borderBottom: '1px solid var(--divider)' }}>
              <div className="row wrap" style={{ gap: 8 }}>
                <div className="seg" role="group" aria-label="How common">
                  {[['all', 'All'], ['must', 'Must-have'], ['common', 'Common'], ['niche', 'Some have it']].map(([k, l]) => <button key={k} type="button" className={band === k ? 'on' : ''} onClick={() => { setBand(k); pg.setPage(1); }}>{l}</button>)}
                </div>
                {d.common.categories.length > 1 && (
                  <select value={cat} onChange={(e) => { setCat(e.target.value); pg.setPage(1); }} aria-label="Feature group"><option value="">All groups</option>{d.common.categories.map((c: any) => <option key={c.name} value={c.name}>{c.name} ({c.count})</option>)}</select>)}
                <input type="search" placeholder="Search features" aria-label="Search features" value={q} onChange={(e) => { setQ(e.target.value); pg.setPage(1); }} style={{ width: 170 }} />
              </div>
              <div className="xs muted row wrap" style={{ gap: 10 }}>
                <span><b style={{ color: BAND.must.color }}>Must-have</b>: offered by</span>
                <input type="number" min={2} max={100} value={must} aria-label="Must-have from this share" onChange={(e) => e.target.value !== '' && setMust(Math.min(100, Math.max(2, Number(e.target.value))))} style={{ width: 60 }} /><span>% or more.</span>
                <span><b style={{ color: BAND.common.color }}>Common</b>: from</span>
                <input type="number" min={1} max={must - 1} value={Math.min(common, must - 1)} aria-label="Common from this share" onChange={(e) => e.target.value !== '' && setCommon(Math.min(must - 1, Math.max(1, Number(e.target.value))))} style={{ width: 60 }} /><span>%. <b>Some have it</b>: less than that.</span>
              </div>
            </div>
            {all.length === 0 ? (
              <div className="card-b small muted">No feature is recorded yet. Import a file or open a competitor&apos;s “Plans and prices” tab and tick what each plan includes.</div>
            ) : shown.length === 0 ? <div className="card-b small muted">No feature matches.</div> : (
              <div role="list">
                {pg.rows.map((f) => {
                  const isRec = f.pct >= share; const b = BAND[f.band];
                  return (
                    <div key={f.key} role="listitem" style={{ borderBottom: '1px solid var(--divider)' }}>
                      <button type="button" onClick={() => setOpen(open === f.key ? null : f.key)} aria-expanded={open === f.key} style={{ all: 'unset', boxSizing: 'border-box', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(90px, 38%) 74px', alignItems: 'center', gap: 12, width: '100%', padding: '9px 16px', cursor: 'pointer', borderLeft: `3px solid ${isRec ? 'var(--sd-accent)' : 'transparent'}` }}>
                        <span style={{ minWidth: 0 }}>
                          <span className="strong" style={{ fontSize: 13 }}>{f.name}</span>
                          {f.category && <span className="xs muted"> · {f.category}</span>}
                        </span>
                        <span aria-hidden style={{ height: 8, borderRadius: 99, background: 'var(--surface-muted)' }}><span style={{ display: 'block', width: `${f.pct}%`, height: 8, borderRadius: 99, background: b.color }} /></span>
                        <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><span className="strong">{f.pct}%</span> <span className="xs muted">{f.offered_by}/{f.of_total}</span></span>
                      </button>
                      {open === f.key && (
                        <div className="small" style={{ padding: '0 16px 10px 19px' }}>
                          <Badge kind={f.band === 'must' ? 'ok' : ''}>{b.label}</Badge>{' '}
                          {f.missing.length === 0 ? <span className="muted">Every competitor offers it.</span> : <><span className="muted">Not offered by </span>{f.missing.map((m: any, i: number) => <span key={m.id}>{i > 0 && ', '}<Link href={`${base}/${m.id}`}>{m.title}</Link></span>)}{f.of_total - f.offered_by > f.missing.length && <span className="muted"> and {f.of_total - f.offered_by - f.missing.length} more</span>}</>}
                        </div>)}
                    </div>
                  );
                })}
                <Pager {...pg} />
              </div>
            )}
            <div className="card-b xs muted">A competitor counts as offering a feature when a plan of it includes the feature, or it is rated strong, same as ours or partial. The accent mark on the left means the feature is in our recommendation.{d.common.not_offered.length > 0 && <> {d.common.not_offered.length} feature{d.common.not_offered.length === 1 ? '' : 's'} on our list {d.common.not_offered.length === 1 ? 'is' : 'are'} offered by nobody yet.</>}</div>
          </Card>
        </div>

        <div style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card title="What we recommend" sub={`${rec.count} feature${rec.count === 1 ? '' : 's'}`}>
            <div className="small" style={{ marginBottom: 6 }}>Recommend a feature when at least</div>
            <div style={{ marginBottom: 12 }}><NumberPick value={share} onChange={(v) => { setShare(v); pg.setPage(1); }} presets={SHARES} min={1} max={100} label="Share of competitors" suffix="%" /></div>
            <div className="small" style={{ marginBottom: 6 }}>offer it. Price for</div>
            <div style={{ marginBottom: 14 }}><NumberPick value={users} onChange={setUsers} presets={USERS} min={1} max={100000} label="Number of users" plural /></div>

            {bundle ? (
              <>
                <div className="xs muted">Typical price of a plan with these features</div>
                <div className="strong" style={{ fontSize: 28, lineHeight: 1.15 }}>{rs(bundle.avg_yearly_inr)} <span className="small muted">a year</span></div>
                <div className="small muted">about {rs(bundle.avg_monthly_inr)} a month · range {rs(bundle.min_yearly_inr)} to {rs(bundle.max_yearly_inr)} · middle value {rs(bundle.median_yearly_inr)}</div>
                <div className="xs muted" style={{ marginTop: 6 }}>From {bundle.count} of {bundle.of} competitors: the cheapest plan of each that includes at least {bundle.coverage_min}% of the recommended features.</div>
                <details style={{ marginTop: 8 }}><summary className="small" style={{ cursor: 'pointer' }}>Which plans</summary>
                  <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'grid', gap: 3 }}>{bundle.contributors.map((x: any) => <li key={x.competitor.id} className="small row" style={{ gap: 6 }}><span style={{ flex: 1, minWidth: 0 }}><Link href={`${base}/${x.competitor.id}`}>{x.competitor.title}</Link> <span className="muted">{x.plan}</span></span><span className="xs muted">{x.coverage}%</span><span className="strong">{rs(x.yearly_inr)}</span></li>)}</ul></details>
              </>
            ) : <div className="small muted">{rec.count === 0 ? 'No feature is offered by that many competitors. Try a lower share.' : 'No plan holds enough of these features with a price yet. Tick the features each plan includes on the competitor pages.'}</div>}
          </Card>

          {rec.by_users && rec.by_users.length > 0 && (
            <Card title="Price by team size" sub="typical yearly price of a plan that has the recommended features" flush>
              <table className="tbl compact">
                <thead><tr><th>Users</th><th>A year</th><th>Per user a month</th><th>Based on</th></tr></thead>
                <tbody>{rec.by_users.map((r: any) => (
                  <tr key={r.users} style={r.users === users ? { fontWeight: 600 } : undefined}>
                    <td>{r.users}</td><td>{rs(r.avg_yearly_inr)}</td><td>{rs(r.avg_per_user_month_inr)}</td>
                    <td className="small muted">{r.count ? `${r.count} of ${a.total} competitors` : 'no price yet'}</td>
                  </tr>))}</tbody>
              </table>
              <div className="card-b small row wrap" style={{ gap: 6 }}>Team sizes to show
                <input type="text" value={sizesText} aria-label="Team sizes, separated by commas" onChange={(e) => setSizesText(e.target.value)}
                  onBlur={() => { const v = [...new Set(sizesText.split(/[,\s]+/).map(Number).filter((x) => x >= 1))].slice(0, 8); if (v.length) { setSizes(v.join(', ')); setSizesText(v.join(', ')); } else setSizesText(sizes); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} style={{ width: 150 }} />
                <span className="xs muted">for example 1, 5, 10, 25</span></div>
            </Card>)}

          <Card title="Price by plan level" sub={`yearly, ${users} user${users === 1 ? '' : 's'}`}>
            {rec.ladder.length === 0 ? <div className="small muted">No plan has a level yet. Give each plan a level (Free, Entry, Mid, Top, Enterprise) on the competitor page.</div> : (
              <div className="stack" style={{ gap: 10 }}>
                {rec.ladder.map((l: any) => (
                  <div key={l.tier_tag}>
                    <div className="row" style={{ gap: 8 }}><span className="strong" style={{ width: 82 }}>{l.label}</span>
                      <span aria-hidden style={{ flex: 1, height: 8, borderRadius: 99, background: 'var(--surface-muted)' }}><span style={{ display: 'block', width: `${l.price.avg_yearly_inr ? Math.max(4, (100 * l.price.avg_yearly_inr) / maxLadder) : 0}%`, height: 8, borderRadius: 99, background: 'var(--sd-accent)' }} /></span>
                      <span className="strong" style={{ minWidth: 70, textAlign: 'right' }}>{l.tier_tag === 'free' ? 'Free' : rs(l.price.avg_yearly_inr)}</span></div>
                    <div className="xs muted" style={{ marginLeft: 90 }}>{l.plans} plan{l.plans === 1 ? '' : 's'} · {l.feature_count} common feature{l.feature_count === 1 ? '' : 's'}{l.price.min_yearly_inr !== null && l.tier_tag !== 'free' ? ` · ${rs(l.price.min_yearly_inr)} to ${rs(l.price.max_yearly_inr)}` : ''}{l.price.once_count ? ` · ${l.price.once_count} paid once` : ''}</div>
                  </div>))}
              </div>)}
            <div style={{ marginTop: 12 }}><Link className="btn sm" href={`${base}/planner`}>Plan our own levels</Link></div>
          </Card>
        </div>
      </div>

      {(d.hints.length > 0 || a.with_features < 3) && (
        <div className="callout" style={{ marginTop: 14 }}>
          {d.hints.length > 0 && <><div className="small strong" style={{ marginBottom: 4 }}>To trust these numbers more</div>
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{d.hints.map((h: string) => <li key={h}>{h}</li>)}</ul></>}
          {a.with_features < 3 && <div className="row wrap" style={{ gap: 10, marginTop: d.hints.length ? 10 : 0 }}><span className="small">Want to see how this works with data in it?</span>{sampleButton}</div>}
          {err && <div className="small" style={{ color: 'var(--bad)', marginTop: 6 }}>{err}</div>}
        </div>)}
    </div>
  );
}
