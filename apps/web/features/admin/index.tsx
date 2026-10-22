'use client';
import { useState } from 'react';
import type { FeatureProps } from '../types';
import { Badge, Card, Empty, ErrorBox, Loading, Page } from '@/components/ui';
import { Field, Tabs, useAction } from '@/components/kit';
import { api, useApi } from '@/lib/api';

/** History, import and export, settings. Prototype: admin.js */
export default function Admin({ pid }: FeatureProps) {
  const [tab, setTab] = useState('history');
  return (
    <Page title="History, import, export" sub="Every change is recorded. Export a product to a file, import it back, or change the settings.">
      <Tabs value={tab} onChange={setTab} tabs={[['history', 'History'], ['io', 'Import and export'], ['settings', 'Settings']]} />
      {tab === 'history' && <History pid={pid} />}
      {tab === 'io' && <ImportExport pid={pid} />}
      {tab === 'settings' && <Settings pid={pid} />}
    </Page>
  );
}

function History({ pid }: { pid: string }) {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const { data, error, loading } = useApi<any>(`/audit?limit=500&q=${encodeURIComponent(q)}&action=${encodeURIComponent(group)}`, pid);
  return (
    <Card flush>
      <div className="row" style={{ padding: 10 }}>
        <input placeholder="Search the history…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
        <select value={group} onChange={(e) => setGroup(e.target.value)}><option value="">All kinds</option>{(data?.groups || []).map((g: any) => <option key={g.id} value={g.id}>{g.label}</option>)}</select>
        <span className="small muted">{data ? `${data.entries.length} of ${data.total}` : ''}</span>
      </div>
      {loading ? <Loading /> : error || !data ? <ErrorBox message={error || 'No data'} /> : data.entries.length === 0 ? <Empty>Nothing matches.</Empty> : (
        <table className="tbl compact"><tbody>{data.entries.map((e: any, i: number) => <tr key={i}><td className="muted nowrap small">{String(e.at).replace('T', ' ').slice(0, 16)}</td><td><Badge kind="outline">{e.group_label}</Badge></td><td>{e.summary || e.text}</td><td className="small muted">{e.actor}</td></tr>)}</tbody></table>
      )}
    </Card>
  );
}

function ImportExport({ pid }: { pid: string }) {
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const act = useAction();
  const reset = async () => (await act.ask('Put this product back to its demonstration data? Everything you changed is lost.', 'Reset')) && act.run(async () => { const r = await api<any>('/reset', { method: 'POST', body: {}, product: pid }); setMsg(`Back to the demonstration data (${r.items} entries).`); });
  return (
    <div className="grid g2">
      <Card title="Export"><p className="small">Everything about this product (records, links, history, settings) as one JSON file.</p><a className="btn primary" href={`/api/v1/export?product=${pid}`} download>Download export</a></Card>
      <Card title="Import">
        <p className="small">Replaces this product’s data with the contents of an export file. Check the file first: this cannot be undone.</p>
        <input type="file" accept="application/json,.json" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} />
        <textarea rows={5} style={{ width: '100%', marginTop: 8 }} placeholder="…or paste the export here" value={text} onChange={(e) => setText(e.target.value)} />
        {act.box}{msg && <div className="callout ok">{msg}</div>}
        <button className="btn danger" disabled={!text.trim() || act.busy} onClick={async () => (await act.ask('Replace this product’s data with this file?', 'Replace')) && act.run(async () => { const r = await api<any>('/import', { method: 'POST', body: { data: JSON.parse(text) }, product: pid }); setMsg(`Imported ${r.items ?? ''} entries.`); setText(''); })}>Import and replace</button>
      </Card>
      <Card title="Reset"><p className="small">Only for products created from the demonstration seed.</p><button className="btn" disabled={act.busy} onClick={reset}>Back to demonstration data</button></Card>
    </div>
  );
}

function Settings({ pid }: { pid: string }) {
  const { data, error, loading, reload } = useApi<any>('/export', pid);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [depth, setDepth] = useState<number | null>(null);
  const act = useAction();
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error || 'No data'} />;
  const st = data.settings || {};
  return (
    <Card title="Settings" sub="Stored with the product">
      <Field label="Today’s date for this product (leave empty to use the real date)" help="The demonstration data is pinned to 9 October 2026 so freshness checks are repeatable."><input type="date" value={asOf ?? st.asOf ?? ''} onChange={(e) => setAsOf(e.target.value)} /></Field>
      <Field label="How far a change spreads before a record is flagged for a second look" help="Depth 3 is the default."><input type="number" min={1} max={6} value={depth ?? st.suspectDepth ?? 3} onChange={(e) => setDepth(Number(e.target.value))} style={{ width: 90 }} /></Field>
      {act.box}
      <button className="btn primary" disabled={act.busy} onClick={() => act.run(async () => { await api('/settings', { method: 'POST', body: { asOf: asOf ?? st.asOf ?? '', suspectDepth: depth ?? st.suspectDepth ?? 3 }, product: pid }); reload(); })}>Save</button>
      <div className="small muted" style={{ marginTop: 10 }}>Exchange rates ({st.fx?.date}): USD {st.fx?.USD}, EUR {st.fx?.EUR}. {st.fx?.source}</div>
    </Card>
  );
}
