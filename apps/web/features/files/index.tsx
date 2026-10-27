'use client';
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import type { FeatureProps } from '../types';
import { Badge, Card, Empty, ErrorBox, Loading, Page } from '@/components/ui';
import { Field, Pager, useAction, usePaged } from '@/components/kit';
import { CostBar } from './Extras';
import Viewer from './Viewer';
import { fileUrl } from './Extras';
import { actor, api, useApi } from '@/lib/api';
import { PHASE_SHORT } from '@/components/shell/groups';


/** Files: upload, let the assistant read, view. Prototype: files.js, fileviewer.js */
export default function Files({ pid, args, query }: FeatureProps) {
  return args[0] ? <Viewer pid={pid} id={args[0]} query={query} /> : <FileList pid={pid} />;
}

export function FileList({ pid, addOnly, onAdded }: { pid: string; addOnly?: boolean; onAdded?: () => void }) {
  const { data, error, loading, reload } = useApi<any>('/attachments', pid);
  const items = useApi<any>('/items?limit=2000', pid);
  const meta = useApi<any>('/meta', pid);
  const life = useApi<any>('/lifecycle', pid);
  const [phase, setPhase] = useState<number | 'research' | ''>('');   // where a new file goes: a phase, or research
  const [target, setTarget] = useState('');
  const [filter, setFilter] = useState<number | 'all'>('all');
  const [msg, setMsg] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const act = useAction();

  const all: any[] = items.data?.items || [];
  const types: Record<string, any> = meta.data?.schema?.types || {};
  const phaseOfType = (t: string) => { const n = types[t]?.phase; return typeof n === 'number' ? n : null; };
  const byId = useMemo(() => new Map(all.map((i) => [i.id, i])), [all]);
  const phaseOfFile = (a: any): number | null => { if (typeof a.phase === 'number') return a.phase; for (const t of a.targets || []) { const it = byId.get(t); const n = it ? phaseOfType(it.type) : null; if (n !== null) return n; } return null; };
  const phases: { n: number; name: string }[] = (life.data?.phases || []).map((p: any, n: number) => ({ n, name: p.name }));
  // Only records a person would think of attaching a file to; small detail records (single prices, ratings, steps) are left out.
  const SKIP = new Set(['Attachment', 'CompetitorCapability', 'PricePoint', 'CompetitorNote', 'Evidence', 'Pointer', 'Transition', 'State', 'FlowStep', 'AcceptanceCriterion', 'Baseline', 'Handoff']);
  const typeLabel = (t: string) => String(types[t]?.label || t).replace(/([a-z])([A-Z])/g, '$1 $2');
  const choices = phase === '' ? [] : phase === 'research' ? all.filter((i) => ['Competitor', 'SystemFunction'].includes(i.type)) : all.filter((i) => !SKIP.has(i.type) && phaseOfType(i.type) === phase);
  const groups = [...new Set(choices.map((i) => i.type))].sort().map((t) => [t, choices.filter((i) => i.type === t)] as const);
  const files: any[] = data?.attachments ?? [];
  const shownFiles = files.filter((a) => filter === 'all' || phaseOfFile(a) === filter);
  const pg = usePaged<any>(shownFiles, 10);
  const counts = new Map<number, number>(); files.forEach((a) => { const n = phaseOfFile(a); if (n !== null) counts.set(n, (counts.get(n) || 0) + 1); });

  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error || 'No data'} />;
  const canUpload = phase !== '' && (phase === 'research' ? !!target : true);
  const upload = (file: File) => act.run(async () => {
    const res = await fetch(`/api/v1/attachments?${target ? `target=${encodeURIComponent(target)}&` : ''}${typeof phase === 'number' ? `phase=${phase}&` : ''}name=${encodeURIComponent(file.name)}&product=${encodeURIComponent(pid)}`, { method: 'POST', headers: { 'x-actor': actor(), 'content-type': file.type || 'application/octet-stream' }, body: file });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `Upload failed (${res.status})`);
    setMsg(`${file.name} added to ${phase === 'research' ? 'research' : `phase ${phase}`}.`); reload(); onAdded?.();
  });
  return (
    <Page title="Files">
      {!addOnly && <CostBar pid={pid} />}
      <Card title="Add a file">
        <div className="grid g3" style={{ alignItems: 'end' }}>
          <Field label="1. Where does it go?"><select value={phase} onChange={(e) => { const v = e.target.value; setPhase(v === '' ? '' : v === 'research' ? 'research' : Number(v)); setTarget(''); }} style={{ width: '100%' }}><option value="">Choose a phase…</option>{phases.map((p) => <option key={p.n} value={p.n}>Phase {p.n}: {p.name}</option>)}<option value="research">Research (competitors, old system)</option></select></Field>
          <Field label={phase === 'research' ? '2. Which competitor or function?' : '2. A specific record (optional)'}><select value={target} disabled={phase === ''} onChange={(e) => setTarget(e.target.value)} style={{ width: '100%' }}><option value="">{phase === '' ? 'Choose where it goes first' : phase === 'research' ? (choices.length ? 'Choose one…' : 'No competitors yet') : 'The whole phase'}</option>{groups.map(([t, list]) => <optgroup key={t} label={typeLabel(t)}>{list.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}</optgroup>)}</select></Field>
          <div style={{ marginBottom: 10 }}>
            <input ref={input} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
            <button className="btn primary" disabled={!canUpload || act.busy} onClick={() => input.current?.click()}>{act.busy ? 'Uploading…' : 'Choose a file'}</button>
          </div>
        </div>
        <div className="small" style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--surface-muted)', marginBottom: 6 }}>
          {phase === '' ? <span className="muted">Pick where the file belongs first. Then choose the file from your computer.</span>
            : phase === 'research'
              ? <span><b>Purpose: research.</b> The file is kept as evidence for {target ? <b>{byId.get(target)?.name || byId.get(target)?.title || target}</b> : 'a competitor or system function (pick one in step 2)'}. It is read for facts and does not belong to a phase.</span>
              : <span><b>Purpose: phase {phase} · {PHASE_SHORT[phase] || ''}.</b> The file is filed under this phase{target ? <> and linked to <b>{byId.get(target)?.name || byId.get(target)?.title || target}</b></> : ', not linked to one record'}. It will show in the list below with this phase.</span>}
          {' '}Source: a file from your computer.
        </div>
        <div className="xs muted">Word, PowerPoint, Excel, CSV, PDF, text and images, up to 25 MB.</div>
        {act.box}{msg && <div className="callout ok" style={{ marginTop: 8 }}>{msg}</div>}
      </Card>
      {!addOnly && <><div style={{ height: 14 }} />
      <Card title={`Files (${data.total})`} flush
        right={<div className="seg" role="group" aria-label="Phase"><button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>All</button>{PHASE_SHORT.map((_, n) => n).map((n) => <button key={n} className={filter === n ? 'on' : ''} onClick={() => setFilter(n)}>Phase {n}</button>)}</div>}>
        {shownFiles.length === 0 ? <Empty>{files.length ? 'No files for this phase.' : 'No files yet.'}</Empty> : (
          <table className="tbl"><thead><tr><th>File</th><th>Phase</th><th>Attached to</th><th>Text</th><th>Added</th><th /></tr></thead><tbody>
            {pg.rows.map((a: any) => {
              const n = phaseOfFile(a);
              return (
                <tr key={a.id}>
                  <td><Link className="strong" href={`/products/${pid}/files/${a.id}`}>{a.filename}</Link><div className="xs muted">{Math.round(a.size_bytes / 1024)} KB</div></td>
                  <td className="small" style={{ whiteSpace: 'nowrap' }}>{(a.targets || []).some((t: string) => byId.get(t)?.type === 'Competitor') ? 'Research' : n === null ? '' : `${n}. ${phases[n]?.name || ''}`}</td>
                  <td>{(a.targets || []).map((t: string) => <Link key={t} href={`/products/${pid}/item/${t}`} className="xs" style={{ display: 'block' }}>{byId.get(t)?.title || t}</Link>)}</td>
                  <td><Badge kind={a.extracted_text_status === 'ok' ? 'ok' : 'warn'}>{a.extracted_text_status}</Badge></td>
                  <td className="small muted">{a.uploaded_by}<br />{a.uploaded_on}</td>
                  <td style={{ whiteSpace: 'nowrap' }}><a className="btn ghost sm" href={fileUrl(pid, a.id, 'download')}>Download</a> <button className="btn ghost sm" onClick={async () => (await act.ask(`Delete ${a.filename}?`, 'Delete')) && act.run(async () => { await api(`/attachments/${a.id}`, { method: 'DELETE', product: pid }); reload(); })}>Delete</button></td>
                </tr>
              );
            })}
          </tbody></table>
        )}
        <Pager {...pg} />
      </Card></>}
    </Page>
  );
}
