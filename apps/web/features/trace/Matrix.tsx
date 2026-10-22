'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Badge, Card, ErrorBox, Loading } from '@/components/ui';
import { useApi } from '@/lib/api';
import { Pager, usePaged } from '@/components/kit';

const GLYPH: Record<string, [string, string]> = { ok: ['✓', 'cell-ok'], draft: ['draft', 'cell-draft'], gap: ['gap', 'cell-gap'], exempt: ['exempt', 'cell-exempt'], na: ['-', 'cell-na'] };
const KEYS = ['provenance', 'story', 'ac', 'flow'];
const WHAT: Record<string, string> = { provenance: 'a link back to where it came from', story: 'a user story', ac: 'acceptance criteria', flow: 'a place in a flow' };

export default function Matrix({ pid }: { pid: string }) {
  const m = useApi<any>('/trace/matrix', pid);
  const g = useApi<any>('/trace/gaps', pid);
  const [sub, setSub] = useState(''); const [pri, setPri] = useState(''); const [gapsOnly, setGapsOnly] = useState(false);
  const rowsAll: any[] = m.data?.rows ?? [];
  const pg = usePaged(rowsAll.filter((r) => (!sub || r.subtype === sub) && (!pri || r.priority === pri) && (!gapsOnly || KEYS.some((k) => r[k].state === 'gap'))), 10);
  if (m.loading || g.loading) return <Loading />;
  if (m.error || !m.data) return <ErrorBox message={m.error || 'No data'} />;
  const rows: any[] = m.data.rows;
  const nfr: Record<string, any> = Object.fromEntries(((g.data?.nfrs as any[]) || []).map((n) => [n.id, n]));
  const isGap = (r: any) => KEYS.some((k) => r[k].state === 'gap');
  const subs = Array.from(new Set(rows.map((r) => r.subtype))).sort() as string[];
  const pris = Array.from(new Set(rows.map((r) => r.priority).filter(Boolean))) as string[];
  const list = rows.filter((r) => (!sub || r.subtype === sub) && (!pri || r.priority === pri) && (!gapsOnly || isGap(r)));
  const nGap = rows.filter(isGap).length;
  const worst = KEYS.map((k) => [k, rows.filter((r) => r[k].state === 'gap').length] as [string, number]).sort((a, b) => b[1] - a[1])[0];
  const Cell = ({ c, fallback, label, extra }: { c: any; fallback: string; label: string; extra?: string }) => {
    const [t, cls] = GLYPH[c.state] || ['?', ''];
    const target = (c.ids && c.ids[0]) || fallback;
    const tip = `${label}: ${c.state}${c.ids?.length ? ' (' + c.ids.join(', ') + ')' : ''}${extra ? ' - ' + extra : ''}. Click to open ${target}.`;
    return <Link className={`tr-cell ${cls}`} title={tip} href={`/products/${pid}/item/${target}`}>{t}{c.n > 1 && (c.state === 'ok' || c.state === 'draft') ? ` ${c.n}` : ''}</Link>;
  };
  const Last = ({ r }: { r: any }) => {
    if (r.flow.mode === 'scope') {
      const n = nfr[r.id]; const ok = r.flow.state === 'ok';
      const label = ok ? (n?.global ? 'global' : 'scoped') : 'unscoped';
      const first = n?.scope?.[0]?.id || r.id;
      return <Link className={`tr-cell ${ok ? 'cell-ok' : 'cell-gap'}`} href={`/products/${pid}/item/${first}`} title={n?.global ? 'NFR scope: applies globally.' : `NFR scope: applies to ${(n?.scope || []).map((s: any) => s.id).join(', ') || 'nothing yet'}.`}>{ok ? '✓ ' : ''}{label}</Link>;
    }
    return <Cell c={r.flow} fallback={r.id} label={r.flow.mode === 'exempt' ? 'Flow (exempt)' : 'Flow step'} extra={r.flow.reason} />;
  };
  return (
    <div>
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <div className="card"><div className="card-b"><div className="kpi"><span className="v">{rows.length}</span><span className="l">requirements</span></div></div></div>
        <div className="card"><div className="card-b"><div className="kpi"><span className="v" style={{ color: 'var(--ok)' }}>{rows.length - nGap}</span><span className="l">fully linked</span></div></div></div>
        <div className="card"><div className="card-b"><div className="kpi"><span className="v" style={{ color: nGap ? 'var(--bad)' : undefined }}>{nGap}</span><span className="l">with a gap</span></div></div></div>
        <div className="card"><div className="card-b"><div className="kpi"><span className="v" style={{ fontSize: 15, lineHeight: '30px' }}>{worst?.[1] ? WHAT[worst[0]] : 'none'}</span><span className="l">{worst?.[1] ? `most often missing (${worst[1]})` : 'nothing missing'}</span></div></div></div>
      </div>
      <div className="flex flex-wrap items-center gap-3 small muted" style={{ marginBottom: 8 }}>
        <span><span className="tr-cell cell-ok">✓</span> counted</span><span><span className="tr-cell cell-draft">draft</span> exists, not counted yet</span><span><span className="tr-cell cell-gap">gap</span> missing</span><span><span className="tr-cell cell-exempt">exempt</span> covered elsewhere</span><span><span className="tr-cell cell-na">-</span> not applicable</span>
      </div>
      <div className="row wrap tr-filters" style={{ marginBottom: 8 }}>
        <label>Subtype <select value={sub} onChange={(e) => setSub(e.target.value)}><option value="">All</option>{subs.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label>Priority <select value={pri} onChange={(e) => setPri(e.target.value)}><option value="">All</option>{pris.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label><input type="checkbox" checked={gapsOnly} onChange={(e) => setGapsOnly(e.target.checked)} /> Gaps only</label>
        <span className="small muted">{list.length} of {rows.length} shown, {nGap} with at least one gap</span>
      </div>
      <Card title="" flush>
        <table className="tbl compact matrix"><thead><tr><th>Requirement</th><th>Subtype</th><th>Priority</th><th>Status</th><th>Provenance</th><th>Story</th><th>Acceptance criteria</th><th>Flow / scope</th></tr></thead><tbody>
          {list.length === 0 && <tr><td colSpan={8} className="muted">No requirement matches the filters.</td></tr>}
          {pg.rows.map((r) => (
            <tr key={r.id} className={isGap(r) ? 'tr-row-gap' : ''}>
              <td><Link href={`/products/${pid}/item/${r.id}`}>{r.id}</Link>{r.suspect && <span className="badge warn" style={{ marginLeft: 6 }}>suspect</span>}<div className="small muted">{r.title}</div></td>
              <td className="small">{String(r.subtype).replace('_', '-')}</td>
              <td>{r.priority && <span className={`chip ${String(r.priority).toLowerCase()}`}>{r.priority}</span>}</td>
              <td><Badge>{r.status}</Badge></td>
              <td><Cell c={r.provenance} fallback={r.id} label="Provenance (derives_from)" /></td>
              <td><Cell c={r.story} fallback={r.id} label="Story" /></td>
              <td><Cell c={r.ac} fallback={r.id} label="Acceptance criteria" /></td>
              <td><Last r={r} /></td>
            </tr>
          ))}
        </tbody></table>
        <Pager {...pg} />
      </Card>
    </div>
  );
}
