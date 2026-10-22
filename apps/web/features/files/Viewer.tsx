'use client';
/** File viewer: read the file, ask the assistant, keep quotes as evidence. Prototype: fileviewer.js */
import Link from 'next/link';
import { useState } from 'react';
import { Badge, Card, Empty, ErrorBox, Loading, Page } from '@/components/ui';
import { Tabs, useAction } from '@/components/kit';
import { api, useApi } from '@/lib/api';
import { CostBar, EvidenceModal, PasteBox, fileUrl, useAssist } from './Extras';

const GOALS: [string, string, boolean][] = [
  ['requirements_from_document', 'Requirements', false], ['stakeholders', 'People who matter', false], ['competitor_profile', 'Competitor profile', true], ['competitor_prices', 'Competitor prices', true], ['capabilities', 'Competitor capabilities', true],
];

function Assist({ pid, id, comps, onDone }: { pid: string; id: string; comps: any[]; onDone: (r: any) => void }) {
  const [goal, setGoal] = useState(GOALS[0][0]);
  const [comp, setComp] = useState('');
  const act = useAction();
  const assist = useAssist(pid);
  const needs = GOALS.find((g) => g[0] === goal)![2];
  return (
    <span className="row wrap">
      <select value={goal} onChange={(e) => setGoal(e.target.value)}>{GOALS.map((g) => <option key={g[0]} value={g[0]}>Find: {g[1]}</option>)}</select>
      {needs && <select value={comp} onChange={(e) => setComp(e.target.value)}><option value="">Which competitor?</option>{comps.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>}
      <button className="btn sm primary" disabled={act.busy || (needs && !comp)} onClick={() => act.run(async () => { const r = await assist.run(id, { goal, ...(needs ? { target: comp } : {}) }); if (r) onDone(r); })}>{act.busy ? 'Reading…' : 'Ask the assistant to read it'}</button>
      {act.box}{assist.dialog}
    </span>
  );
}

export default function Viewer({ pid, id, query }: { pid: string; id: string; query: URLSearchParams }) {
  const [sheet, setSheet] = useState(query.get('sheet') || '');
  const { data: v, error, loading, reload } = useApi<any>(`/attachments/${id}/view${sheet ? `?sheet=${encodeURIComponent(sheet)}` : ''}`, pid);
  const items = useApi<any>('/items?type=Competitor&limit=200', pid);
  const [found, setFound] = useState<any>(null);
  const [tab, setTab] = useState('content');
  const [ev, setEv] = useState<{ locator: any; quote: string } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [paste, setPaste] = useState(false);
  const act = useAction();
  if (loading && !v) return <Loading />;
  if (error || !v) return <ErrorBox message={error || 'No data'} />;
  const a = v.attachment;
  const canPaste = v.extraction_status !== 'ok' || (v.warnings || []).length > 0;
  const Use = ({ locator, quote }: { locator: any; quote: string }) => <button className="btn xs ghost" style={{ marginLeft: 6 }} title="Keep this as evidence" onClick={() => setEv({ locator, quote })}>Use as evidence</button>;
  const blocks = (list: any[], fallback?: any) => list.map((b: any, i: number) => <p key={i} style={{ margin: '4px 0' }}>{b.text}{b.locator && b.text?.trim() && <Use locator={b.locator} quote={b.text} />}</p>);
  const pointerAct = (p: any, kind: 'reject' | 'remove') => act.run(async () => { if (kind === 'remove') await api(`/pointers/${p.id}`, { method: 'DELETE', product: pid }); else await api(`/pointers/${p.id}`, { method: 'PATCH', body: { status: 'rejected' }, product: pid }); reload(); });
  return (
    <Page title={a.filename} sub={`${a.id} · ${a.mime} · ${Math.round(a.size_bytes / 1024)} KB · added by ${a.uploaded_by} on ${a.uploaded_on}`} right={<span className="row"><Link className="btn sm" href={`/products/${pid}/files`}>All files</Link><a className="btn sm" href={fileUrl(pid, id, 'download')}>Download</a></span>}>
      <CostBar pid={pid} />
      {v.pasted && <div className="callout" style={{ marginBottom: 10 }}>Pasted by {v.pasted.by}{v.pasted.on ? ` on ${String(v.pasted.on).slice(0, 10)}` : ''}, not read from the file.</div>}
      <Card title="Let the assistant read it" sub={`${v.pointers?.length || 0} pieces of evidence already attached`}>
        <Assist pid={pid} id={id} comps={items.data?.items || []} onDone={setFound} />
        {found && <div className="callout ok" style={{ marginTop: 8 }}>{found.added?.length || 0} proposals added{found.merged ? `, ${found.merged} repeat(s) merged` : ''}{found.rejected_hallucinations?.length ? `, ${found.rejected_hallucinations.length} thrown out (quote not in the file)` : ''}{found.conflicts ? `, ${found.conflicts} with numbers that disagree: check before accepting` : ''}{found.cost ? `. Cost: about Rs ${found.cost.actual_cost_inr ?? found.cost.estimated?.cost_inr}` : ''}. <Link href={`/products/${pid}/inbox`}>Review them in the inbox</Link></div>}
        {v.warnings?.length > 0 && <div className="callout warn" style={{ marginTop: 8 }}>{v.warnings.join('; ')}</div>}
        {(canPaste || v.pasted) && <div style={{ marginTop: 8 }}>{paste ? <PasteBox pid={pid} id={id} again={!!v.pasted} onSaved={() => { setPaste(false); reload(); }} /> : <button className="btn sm" onClick={() => setPaste(true)}>{v.pasted ? 'Paste the text again' : 'Paste the text instead'}</button>}</div>}
      </Card>
      <div style={{ height: 14 }} />
      {saved && <div className="callout ok" style={{ marginBottom: 10 }}>{saved}</div>}
      <Tabs value={tab} onChange={setTab} tabs={[['content', 'Content'], ['evidence', `Evidence (${v.pointers?.length || 0})`]]} />
      {act.box}
      {tab === 'evidence' ? (
        <Card flush>
          {(v.pointers || []).length === 0 ? <Empty>No evidence kept from this file yet. Open the Content tab and choose “Use as evidence” next to a line.</Empty> : (
            <table className="tbl compact"><tbody>{(v.pointers as any[]).map((p) => (
              <tr key={p.id}><td className="mono xs">{p.id}</td><td>“{p.quote}”<div className="xs muted">{p.locator_label || ''}</div></td><td><Badge>{p.status}</Badge></td>
                <td>{(p.targets || p.cited_by || []).map((t: string) => <Link key={t} className="mono xs" style={{ marginRight: 6 }} href={`/products/${pid}/item/${t}`}>{t}</Link>)}</td>
                <td className="nowrap">{p.status !== 'rejected' && <button className="btn xs" onClick={() => pointerAct(p, 'reject')}>Reject</button>} <button className="btn xs danger" onClick={() => pointerAct(p, 'remove')}>Remove</button></td></tr>
            ))}</tbody></table>
          )}
        </Card>
      ) : (
        <Card>
          {v.viewer === 'grid' && (v.sheets || []).length > 1 && (
            <div className="row wrap" style={{ marginBottom: 8 }}>{(v.sheets as any[]).map((s) => <button key={s.title} className={`btn sm ${s.title === (sheet || v.sheet) ? 'primary' : ''}`} onClick={() => setSheet(s.title)}>{s.title}</button>)}</div>
          )}
          {v.viewer === 'image' && <img alt={a.filename} src={fileUrl(pid, id, 'raw')} style={{ maxWidth: '100%' }} />}
          {v.viewer === 'pdf' && <iframe title="pdf" src={fileUrl(pid, id, 'raw')} style={{ width: '100%', height: '70vh', border: '1px solid var(--line)' }} />}
          {v.viewer === 'slides' && v.slides.map((s: any) => <div key={s.index} className="card" style={{ marginBottom: 10 }}><div className="card-h"><h2>Slide {s.index}{s.title ? `: ${s.title}` : ''}</h2></div><div className="card-b">{blocks(s.blocks || [])}{s.notes && <div className="small muted">Notes: {s.notes}</div>}</div></div>)}
          {v.viewer === 'document' && v.sections.map((s: any) => <div key={s.index} style={{ marginBottom: 12 }}><h3>{s.title}</h3>{(s.elements || []).map((e: any, i: number) => e.type === 'table' ? <table key={i} className="tbl compact"><tbody>{e.rows.map((r: any, j: number) => <tr key={j}>{(Array.isArray(r) ? r : r.cells || []).map((c: any, k: number) => <td key={k}>{typeof c === 'string' ? c : c.text}{c?.locator && c.text && <Use locator={c.locator} quote={c.text} />}</td>)}</tr>)}</tbody></table> : <p key={i} style={{ margin: '4px 0', fontWeight: e.type === 'heading' ? 700 : 400 }}>{e.text}{e.locator && e.text?.trim() && <Use locator={e.locator} quote={e.text} />}</p>)}</div>)}
          {v.viewer === 'grid' && (
            <div style={{ overflow: 'auto', maxHeight: '70vh' }}><table className="tbl compact"><thead><tr><th />{v.grid.columns.map((c: string) => <th key={c}>{c}</th>)}</tr></thead><tbody>{v.grid.rows.map((r: any) => <tr key={r.row}><td className="muted">{r.row}</td>{r.cells.map((c: any) => <td key={c.ref}>{String(c.value ?? '')}{c.locator && String(c.value ?? '').trim() && <Use locator={c.locator} quote={String(c.value)} />}</td>)}</tr>)}</tbody></table>{v.grid.has_more && <div className="small muted">Showing rows {v.grid.offset + 1} to {v.grid.offset + v.grid.rows.length} of {v.grid.total_rows}.</div>}</div>
          )}
          {(v.viewer === 'text' || v.viewer === 'pdf') && (v.pages || []).map((p: any) => <div key={p.index} style={{ marginBottom: 10 }}>{v.viewer === 'pdf' ? <div className="xs muted">Text of page {p.index}</div> : null}{blocks(p.blocks || [{ text: p.text }])}</div>)}
          {v.viewer === 'none' && <Empty>This file type cannot be shown. Download it instead.</Empty>}
        </Card>
      )}
      {ev && <EvidenceModal pid={pid} attId={id} filename={a.filename} locator={ev.locator} quote={ev.quote} onClose={() => setEv(null)} onDone={(r) => { setEv(null); setSaved(r.target || r.created_item ? `Saved as evidence for ${r.created_item?.id || r.target?.id}.` : 'Saved. It is kept as a note on this file.'); reload(); }} />}
    </Page>
  );
}
