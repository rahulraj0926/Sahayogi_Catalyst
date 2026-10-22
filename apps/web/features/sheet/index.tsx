'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { FeatureProps } from '../types';
import { Badge, Card, Empty, ErrorBox, Loading, Page } from '@/components/ui';
import { Stat } from '@/components/kit';
import RecordForm from '@/components/RecordForm';
import { api, useApi } from '@/lib/api';

/** [sheet key, heading, engine type to add, columns] */
const SECTIONS: [string, string, string | null, [string, string][]][] = [
  ['features', 'Features', 'Feature', [['priority', 'Priority'], ['scope', 'In scope?'], ['module', 'Module']]],
  ['plans', 'Pricing plans', 'PricingPlan', [['price', 'Price'], ['audience', 'For']]],
  ['rules', 'Business rules', 'BusinessRule', [['text', 'Rule']]],
  ['duties', 'Legal and other duties', 'Obligation', [['text', 'Duty'], ['kind', 'Kind']]],
  ['targets', 'Quality targets', 'Metric', [['text', 'Target']]],
  ['questions', 'Open questions', 'Question', [['priority', 'Priority'], ['asked_of', 'Asked of']]],
  ['people', 'People involved', 'Stakeholder', [['text', 'Role']]],
];

/** Quick answers: the whole product on one page, with a search across all products. Prototype: sheet.js */
export default function Sheet({ pid }: FeatureProps) {
  const { data, error, loading, reload } = useApi<any>('/sheet', pid);
  const meta = useApi<any>('/meta', pid);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<any[] | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const types = useMemo(() => meta.data?.schema?.types || {}, [meta.data]);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error || 'No data'} />;
  const c = data.counts;
  const search = async () => { if (!q.trim()) return setHits(null); const r = await api<any>(`/search?q=${encodeURIComponent(q.trim())}`); setHits(r.hits || r.results || []); };
  return (
    <Page title="Quick answers" sub={`${data.product.name}: the facts people ask for, on one page.`}
      right={<span className="row"><input placeholder="Search every product…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} style={{ width: 230 }} /><button className="btn" onClick={search}>Search</button></span>}>
      {hits && (
        <Card title={`Search results for “${q}”`} sub={`${hits.length}`} right={<button className="btn sm" onClick={() => setHits(null)}>Clear</button>} flush>
          {hits.length === 0 ? <Empty>Nothing found.</Empty> : <table className="tbl compact"><tbody>{hits.map((h) => <tr key={h.product_id + h.id}><td className="small muted">{h.product}</td><td><Badge kind="outline">{h.label}</Badge></td><td><Link href={`/products/${h.product_id}/item/${h.id}`}>{h.title}</Link><div className="xs muted">{h.snippet}</div></td><td><Badge>{h.status}</Badge></td></tr>)}</tbody></table>}
        </Card>
      )}
      <div className="grid g4" style={{ margin: '12px 0' }}><Stat value={c.features} label="features" /><Stat value={c.competitors} label="competitors" /><Stat value={c.rules + c.duties} label="rules and duties" /><Stat value={c.questions} label="open questions" kind={c.questions ? 'warn' : undefined} /></div>
      {SECTIONS.map(([key, title, type, cols]) => {
        const rows: any[] = data[key] || [];
        return (
          <div key={key} style={{ marginBottom: 14 }}>
            <Card title={title} sub={`${rows.length}`} right={type && types[type] ? <button className="btn sm" onClick={() => setAdding(type)}>Add</button> : null} flush>
              {rows.length === 0 ? <Empty>None yet.</Empty> : (
                <table className="tbl compact"><tbody>{rows.map((r) => (
                  <tr key={r.id}><td className="mono xs"><Link href={`/products/${pid}/item/${r.id}`}>{r.id}</Link></td><td className="strong">{r.title}</td>{cols.map(([k]) => <td key={k} className="small">{String(r[k] ?? '')}</td>)}<td><Badge>{r.status}</Badge></td></tr>
                ))}</tbody></table>
              )}
            </Card>
          </div>
        );
      })}
      <Card title="Competitors and their prices" flush>
        <table className="tbl compact"><tbody>{(data.competitors || []).map((cp: any) => (
          <tr key={cp.id}><td><Link href={`/products/${pid}/competitors/${cp.id}`} className="strong">{cp.title}</Link><div className="xs muted">{cp.positioning}</div></td><td><Badge kind="outline">{cp.tier}</Badge></td><td className="small">{(cp.prices || []).map((p: any) => `${p.plan}: ${p.price}`).join('; ') || cp.pricing_na_reason || <span className="muted">no price</span>}</td></tr>
        ))}</tbody></table>
      </Card>
      {adding && <RecordForm pid={pid} typeDef={types[adding]} onCancel={() => setAdding(null)} onDone={() => { setAdding(null); reload(); }} />}
    </Page>
  );
}
