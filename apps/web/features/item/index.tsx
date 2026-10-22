'use client';
import type { FeatureProps } from '../types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Card, ErrorBox, Loading, Page } from '@/components/ui';
import { useAction, useConfirm } from '@/components/kit';
import RecordForm from '@/components/RecordForm';
import { actor, api, useApi } from '@/lib/api';
import { Chains, LinksPanel } from './Links';

const SYSTEM = new Set(['id', 'type', 'subtype', 'status', 'phase', 'origin', 'verification', 'proposed_by', 'rev', 'created_at', 'updated_at', 'created_by', 'fp', 'title', 'agent', 'provenance', 'verified_by', 'verified_on', 'verified_note', 'requested_by']);
const ORIGIN: Record<string, string> = { human: 'Entered by a person', invented: 'Example, not real evidence', document: 'Read from a document', agent: 'Found by the assistant', derived: 'Worked out by the tool' };
const LAB: Record<string, string> = { origin: 'Where it came from', verification: 'Checked?', proposed_by: 'Asked for by', created_by: 'Created by', created_at: 'Created', updated_at: 'Last changed', rev: 'Version', fp: 'Fingerprint' };
const empty = (v: any) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
const ID = /^[A-Z]+-\d+$/;

function Show({ f, v, pid }: { f: any; v: any; pid: string }) {
  const idl = (x: string) => ID.test(x) ? <Link href={`/products/${pid}/item/${x}`}>{x}</Link> : <>{x}</>;
  if (Array.isArray(v)) {
    if (f && (f.kind === 'refs' || f.kind === 'ref')) return <span>{v.map((x, k) => <span key={k}>{k ? ', ' : ''}{idl(String(x))}</span>)}</span>;
    return <>{v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join('\n')}</>;
  }
  if (typeof v === 'boolean') return <>{v ? 'yes' : 'no'}</>;
  if (v && typeof v === 'object') return <>{JSON.stringify(v)}</>;
  if (f?.kind === 'ref' && ID.test(v)) return idl(v);
  if (f?.kind === 'number' && f.unit) return <>{v} {f.unit}</>;
  return <>{String(v)}</>;
}

/** One record with its fields, status, links, chains, history and where it is used. Prototype: item.js, item_links.js */
export default function ItemPage({ pid, args, query }: FeatureProps) {
  const id = args[0]; const router = useRouter();
  const { data: d, error, loading, reload } = useApi<any>(`/items/${id}`, pid);
  const meta = useApi<any>('/meta', pid);
  const [edit, setEdit] = useState(false); const act = useAction(); const [ask, dialog] = useConfirm(); const [msg, setMsg] = useState('');
  const [sel, setSel] = useState('');
  useEffect(() => { if (d?.item.type === 'Competitor' && !query.get('raw')) router.replace(`/products/${pid}/competitors/${id}`); }, [d, query, pid, id, router]);
  const def = useMemo(() => d ? { ...(meta.data?.schema?.types?.[d.item.type] || {}), ...(d.def || {}) } : {}, [meta.data, d]);
  if (loading || meta.loading) return <Loading />;
  if (error || !d) return <ErrorBox message={error || 'Item not found'} />;
  const it = d.item; const phase = it.phase ?? def.phase;
  const setStatus = (s: string) => act.run(async () => { await api(`/items/${id}/status`, { method: 'POST', body: { status: s }, product: pid }); reload(); });
  const remove = () => act.run(async () => { if (!(await ask(`Delete ${it.id} "${it.title}"? This is recorded in the history.`, 'Delete'))) return; await api(`/items/${id}`, { method: 'DELETE', product: pid }); router.push(`/products/${pid}/phase/${phase}`); });
  const clearSuspect = () => act.run(async () => { const r = await api<any>(`/items/${id}/clear`, { method: 'POST', body: { note: 'confirmed still valid from item page' }, product: pid }); setMsg(`Confirmed still valid (${r.cleared} link(s) cleared)`); reload(); });
  const known = new Set<string>(); const rows: [string, any, any][] = [];
  (def.fields || []).forEach((f: any) => { known.add(f.name); if (f.name === 'title' || empty(it[f.name])) return; rows.push([(f.label || f.name) + (f.required ? ' *' : ''), f, it[f.name]]); });
  Object.keys(it).filter((k) => !known.has(k) && !SYSTEM.has(k) && !k.startsWith('_') && !empty(it[k])).forEach((k) => rows.push([k.replace(/_/g, ' '), null, it[k]]));
  const sysRows = ['origin', 'verification', 'proposed_by', 'created_by', 'created_at', 'updated_at', 'rev', 'fp'].filter((k) => !empty(it[k])).map((k) => [LAB[k] || k, k.endsWith('_at') ? String(it[k]).replace('T', ' ').slice(0, 16) : k === 'origin' ? ORIGIN[it[k]] || it[k] : typeof it[k] === 'object' ? JSON.stringify(it[k]) : String(it[k])]);
  const hist = [...(d.history || [])].sort((a: any, b: any) => String(b.at).localeCompare(String(a.at)));
  const u = d.usedBy || { criteria: [], requests: [], tiles: [] };
  const gl = (g: any) => (/^[0-4]$/.test(String(g)) ? `/products/${pid}/gates/${g}` : `/products/${pid}/gates`);
  return (
    <Page title={<span><span className="mono">{it.id}</span>  {it.title}</span>}
      sub={<span>
        <Link href={`/products/${pid}/phase/${phase}`}>Phase {phase} workspace</Link> / {it.type}
        <span className="row wrap" style={{ marginTop: 6 }}><Badge kind="info">{it.type}</Badge>{it.subtype && <Badge kind="outline">{it.subtype.replace(/_/g, ' ')}</Badge>}<Badge>{it.status}</Badge>
          <Badge kind="outline">{ORIGIN[it.origin] || it.origin}</Badge>
          {d.counted ? <Badge kind="ok">counted toward gates</Badge> : <span className="badge outline" title="Draft/Rejected status, or unreviewed agent / derived item">not counted toward gates</span>}
          {d.freshness && <Badge kind={d.freshness.state === 'stale' ? 'bad' : d.freshness.state === 'due' ? 'warn' : 'ok'}>freshness: {d.freshness.state}</Badge>}
          {d.suspect?.length > 0 && <Badge kind="bad">suspect</Badge>}{d.stale && <Badge kind="warn">stale</Badge>}
          {def.v2Ref && <span className="small muted">v2 spec: {def.v2Ref.join(', ')}</span>}</span></span>}
      right={<span className="row"><button className="btn" onClick={() => router.back()}>Back</button><button className="btn danger" onClick={remove}>Delete</button></span>}>
      {act.box}{dialog}{msg && <div className="callout ok" style={{ marginBottom: 10 }}>{msg}</div>}
      <div className="grid g-main">
        <div className="stack" style={{ gap: 16 }}>
          <Card title="Fields" right={def.fields ? <button className="btn sm primary" onClick={() => setEdit(true)}>Edit</button> : null}>
            {rows.length ? <dl className="kv">{rows.map(([k, f, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd style={{ whiteSpace: 'pre-wrap' }}><Show f={f} v={v} pid={pid} /></dd></div>)}</dl> : <div className="muted">No fields filled.</div>}
            <div className="small strong" style={{ margin: '14px 0 4px' }}>Record</div>
            <dl className="kv">{sysRows.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></div>)}
              {it.verified_by && <div style={{ display: 'contents' }}><dt>Checked by</dt><dd>{it.verified_by}{it.verified_on ? ' on ' + String(it.verified_on).slice(0, 10) : ''}{it.verified_note && <div className="small muted">Where the fact was checked: {it.verified_note}</div>}</dd></div>}
              {it.provenance && <div style={{ display: 'contents' }}><dt>provenance</dt><dd className="mono" style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(it.provenance, null, 1)}</dd></div>}</dl>
          </Card>
          <LinksPanel d={d} pid={pid} reload={reload} />
          <Chains d={d} pid={pid} />
          <Card title="History" flush>{hist.length ? <table className="tbl compact"><tbody>{hist.map((e: any, i: number) => <tr key={i}><td className="muted mono nowrap">{String(e.at).replace('T', ' ').slice(0, 16)}</td><td><Badge kind="outline">{e.action}</Badge></td><td>{e.summary}</td></tr>)}</tbody></table> : <div className="loading">No audit entries.</div>}</Card>
        </div>
        <div className="stack" style={{ gap: 16 }}>
          <Card title="Status" sub={it.type}><div className="stack">
            <div className="row">Now: <Badge>{it.status}</Badge><span className="small muted">{d.counted ? 'counted toward gates' : 'not counted toward gates'}</span></div>
            <div className="row"><select value={sel || it.status} onChange={(e) => setSel(e.target.value)}>{(def.statuses || []).map((s: string) => <option key={s}>{s}</option>)}</select>
              <button className="btn sm primary" disabled={act.busy} onClick={() => (sel && sel !== it.status ? setStatus(sel) : setMsg('Status is already ' + it.status))}>Change status</button></div>
            <div className="small muted">{def.countedStatuses ? `Counted statuses for ${it.type}: ${def.countedStatuses.join(', ')}.` : 'Gates count items that are reviewed by a person (not Draft or Rejected, and not unverified agent output).'}</div></div></Card>
          <Card title="Suspect / stale">
            {!(d.suspect?.length || d.stale || d.freshness) ? <div className="row"><Badge kind="ok">clean</Badge><span className="muted">No upstream change is waiting for confirmation.</span></div> : (
              <div className="stack">
                {d.suspect?.length > 0 && <div className="callout bad"><div className="strong">Suspect: an upstream item changed after this link was last confirmed.</div>
                  <ul className="list">{d.suspect.map((s: any, i: number) => <li key={i}><Link href={`/products/${pid}/item/${s.driver}`}>{s.driver}</Link> changed {s.cause?.fields ? `(${s.cause.fields.join(', ')})` : ''} <span className="muted small">via {s.linkType} {s.link}; {s.cause ? `by ${s.cause.by}, ${String(s.cause.at).slice(0, 10)}` : ''}</span></li>)}</ul>
                  <div className="row"><button className="btn primary sm" disabled={act.busy} onClick={clearSuspect}>Clear: confirm still valid</button><span className="small">Only a named person can clear this; an AI agent cannot clear suspect flags. Acting as: {actor()}</span></div></div>}
                {d.stale && <div className="callout warn"><div className="strong">Stale: {d.stale.hops} hop(s) from a changed item</div><div className="small">Reached via {(d.stale.via || []).map((x: string, k: number) => <span key={x}>{k ? ', ' : ''}<Link href={`/products/${pid}/item/${x}`}>{x}</Link></span>)}. Review it, then change its status or edit it to refresh.</div></div>}
                {d.freshness && <div className={`callout ${d.freshness.state === 'stale' ? 'bad' : d.freshness.state === 'due' ? 'warn' : ''}`}><div className="strong">Freshness: {d.freshness.state}</div><div className="small">{[d.freshness.ageDays !== undefined ? `${d.freshness.ageDays} days old` : '', d.freshness.retrieved_on ? `retrieved ${d.freshness.retrieved_on}` : ''].filter(Boolean).join(', ')}</div></div>}
              </div>)}
          </Card>
          <Card title="Gates and dashboards that use it"><div className="stack">
            <div><div className="small strong">Gate criteria</div>{u.criteria.length ? u.criteria.map((c: any) => <Link key={c.id} className={`chip ${c.severity === 'must' ? 'must' : 'should'}`} href={gl(c.gate)} title={`${c.text} (gate ${c.gate}, ${c.severity}, ${c.depth_level})`}>{c.id}</Link>) : <span className="muted small">none</span>}</div>
            <div><div className="small strong">Requests that create this type</div>{u.requests.length ? u.requests.map((r: any) => <Link key={r.id} className="chip" href={`/products/${pid}/plan?request=${r.id}`} title={`${r.title} (${r.owner_kind})`}>{r.id}</Link>) : <span className="muted small">none</span>}</div>
            <div><div className="small strong">Dashboard tiles</div>{u.tiles.length ? u.tiles.map((t: string) => <Badge key={t} kind="outline">{t}</Badge>) : <span className="muted small">none</span>}</div>
            <div className="small muted">Criteria are shown by type: hover a chip for its wording. Click to open the gate page.</div></div></Card>
        </div>
      </div>
      {edit && def.fields && <RecordForm pid={pid} typeDef={{ ...def, name: it.type }} item={it} onCancel={() => setEdit(false)} onDone={() => { setEdit(false); reload(); }} />}
    </Page>
  );
}
