'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { FeatureProps } from '../types';
import { Badge, Bar, EmbedContext, ErrorBox, Loading } from '@/components/ui';
import { Modal, Pager, useAction, usePaged } from '@/components/kit';
import { api, useApi } from '@/lib/api';
import { STATUS, WHAT } from '../documents/labels';
import { FileList } from '../files';
import { fileUrl } from '../files/Extras';
import { Menu } from '../doc';
import { PHASE_SHORT } from '@/components/shell/groups';

type Row = { key: string; kind: 'doc' | 'file'; name: string; note?: string; phase: number | 'research' | null; status: React.ReactNode; pct?: number; href: string; file?: any };

/** The documents the tool writes and the files a person uploads, in one list. */
export default function Library({ pid }: FeatureProps) {
  const docs = useApi<any>('/documents', pid);
  const files = useApi<any>('/attachments', pid);
  const items = useApi<any>('/items?limit=2000', pid);
  const meta = useApi<any>('/meta', pid);
  const [kind, setKind] = useState<'all' | 'doc' | 'file'>('all');
  const [phase, setPhase] = useState('all');
  const [q, setQ] = useState('');
  const [add, setAdd] = useState(false);
  const act = useAction();

  const rows: Row[] = useMemo(() => {
    const types: Record<string, any> = meta.data?.schema?.types || {};
    const byId = new Map<string, any>((items.data?.items || []).map((i: any) => [i.id, i]));
    const phaseOfFile = (a: any): number | 'research' | null => {
      if ((a.targets || []).some((t: string) => byId.get(t)?.type === 'Competitor')) return 'research';
      if (typeof a.phase === 'number') return a.phase;
      for (const t of a.targets || []) { const n = types[byId.get(t)?.type]?.phase; if (typeof n === 'number') return n; }
      return null;
    };
    const d: Row[] = (docs.data?.documents || []).map((x: any) => ({ key: `d-${x.key}`, kind: 'doc', name: x.title, note: WHAT[x.key], phase: x.phase, status: <Badge kind={STATUS[x.status]?.kind}>{STATUS[x.status]?.label}</Badge>, pct: x.completeness, href: `/products/${pid}/documents/${x.key}` }));
    const f: Row[] = (files.data?.attachments || []).map((a: any) => ({ key: `f-${a.id}`, kind: 'file', name: a.filename, note: `${Math.round(a.size_bytes / 1024)} KB · added by ${a.uploaded_by}`, phase: phaseOfFile(a), status: <Badge kind={a.extracted_text_status === 'ok' ? 'ok' : 'warn'}>{a.extracted_text_status === 'ok' ? 'Read by the assistant' : 'Could not be read'}</Badge>, href: `/products/${pid}/files/${a.id}`, file: a }));
    return [...d, ...f];
  }, [docs.data, files.data, items.data, meta.data, pid]);

  const shown = rows.filter((r) => (kind === 'all' || r.kind === kind) && (phase === 'all' || String(r.phase) === phase) && (!q || `${r.name} ${r.note || ''}`.toLowerCase().includes(q.toLowerCase())));
  const pg = usePaged(shown, 10);
  if (docs.loading || files.loading) return <Loading />;
  if (docs.error || !docs.data) return <ErrorBox message={docs.error || 'No data'} />;
  const avg = docs.data.documents?.length ? Math.round(docs.data.documents.reduce((m: number, d: any) => m + d.completeness, 0) / docs.data.documents.length) : 0;
  const phaseLabel = (p: Row['phase']) => (p === 'research' ? 'Research' : p === null ? '' : `${p}. ${PHASE_SHORT[p] || ''}`);

  return (
    <div>
      {act.box}
      <div className="flex flex-wrap items-center gap-3" style={{ marginBottom: 12 }}>
        <div className="flex items-center gap-2"><div style={{ width: 140 }}><Bar pct={avg} /></div><b className="small">{avg}%</b><span className="small muted">{docs.data.approved} of {docs.data.total} documents approved</span></div>
        <span className="spacer" />
        <button className="btn primary" onClick={() => setAdd(true)}>Add a file</button>
        <Menu label="Download all" items={[{ label: 'HTML (opens in Word)', href: `/api/v1/dossier?format=html&download=1&product=${pid}` }, { label: 'Markdown', href: `/api/v1/dossier?format=md&download=1&product=${pid}` }]} />
      </div>
      <div className="flex flex-wrap items-center gap-3" style={{ marginBottom: 12 }}>
        <div className="seg" role="group" aria-label="Show">
          {([['all', 'All'], ['doc', 'Documents'], ['file', 'Uploaded files']] as const).map(([k, l]) => <button key={k} className={kind === k ? 'on' : ''} aria-pressed={kind === k} onClick={() => setKind(k)}>{l}</button>)}
        </div>
        <select aria-label="Phase" value={phase} onChange={(e) => setPhase(e.target.value)}><option value="all">All phases</option>{PHASE_SHORT.map((n, i) => <option key={i} value={String(i)}>{i}. {n}</option>)}<option value="research">Research</option></select>
        <input type="search" placeholder="Search" aria-label="Search documents and files" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 200 }} />
      </div>
      {shown.length === 0 ? <div className="loading">Nothing matches. <button className="btn sm" onClick={() => { setKind('all'); setPhase('all'); setQ(''); }}>Show all</button></div> : (
        <table className="tbl">
          <thead><tr><th>Name</th><th>Phase</th><th>Status</th><th style={{ width: 150 }}>Complete</th><th /></tr></thead>
          <tbody>
            {pg.rows.map((r) => (
              <tr key={r.key}>
                <td><Link className="strong" href={r.href}>{r.name}</Link> <span className="xs muted">{r.kind === 'doc' ? 'Document' : 'Uploaded file'}</span>{r.note && <div className="xs muted" style={{ maxWidth: '60ch' }}>{r.note}</div>}</td>
                <td className="small muted" style={{ whiteSpace: 'nowrap' }}>{phaseLabel(r.phase)}</td>
                <td>{r.status}</td>
                <td>{r.pct !== undefined ? <div className="flex items-center gap-2"><div style={{ flex: 1 }}><Bar pct={r.pct} /></div><b className="small tabular" style={{ width: 34, textAlign: 'right' }}>{r.pct}%</b></div> : null}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{r.file && <>
                  <a className="btn ghost sm" href={fileUrl(pid, r.file.id, 'download')}>Download</a>{' '}
                  <button className="btn ghost sm" onClick={async () => (await act.ask(`Delete ${r.name}?`, 'Delete')) && act.run(async () => { await api(`/attachments/${r.file.id}`, { method: 'DELETE', product: pid }); files.reload(); })}>Delete</button></>}</td>
              </tr>))}
          </tbody>
        </table>)}
      <Pager {...pg} />
      {add && <Modal title="Add a file" onClose={() => setAdd(false)}><EmbedContext.Provider value><FileList pid={pid} addOnly onAdded={() => { files.reload(); }} /></EmbedContext.Provider></Modal>}
    </div>
  );
}
