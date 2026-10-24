'use client';
/**
 * The files kept for one competitor (price lists, decks, PDFs), with upload right on the card: choose files or drop them here.
 * Used on the overview; the Files tab uses the same upload.
 */
import { useRef, useState } from 'react';
import Link from 'next/link';
import { fmtDate, useAction, useConfirm } from '@/components/kit';
import { actor, api } from '@/lib/api';
import { CARD, CARD_ACTION } from './overviewStyle';

/** Upload files to a competitor, one after the other. Throws with the server's words if one is refused. */
export async function uploadFiles(files: File[], target: string, pid: string) {
  for (const file of files) {
    const res = await fetch(`/api/v1/attachments?target=${encodeURIComponent(target)}&name=${encodeURIComponent(file.name)}&product=${encodeURIComponent(pid)}`, {
      method: 'POST', headers: { 'x-actor': actor(), 'content-type': file.type || 'application/octet-stream' }, body: file,
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `Could not upload ${file.name} (${res.status})`);
  }
}

const size = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export default function FilesCard({ id, pid, files, onSaved }: { id: string; pid: string; files: any[]; onSaved: () => void }) {
  const pick = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [ask, dialog] = useConfirm();
  const act = useAction();
  const send = (list: FileList | File[] | null) => { const fl = list ? Array.from(list) : []; if (fl.length) act.run(async () => { await uploadFiles(fl, id, pid); onSaved(); }); };
  return (
    <section className={`flex h-full min-w-0 flex-col p-6 ${CARD} ${over ? 'outline outline-2 outline-[var(--sd-accent)]' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); send(e.dataTransfer.files); }}>
      {dialog}
      <div className="mb-4 flex items-center gap-2">
        <h3 className="m-0 flex-1 text-[18px] font-bold text-[var(--text-heading)]">Files</h3>
        <input ref={pick} type="file" multiple hidden onChange={(e) => { send(e.target.files); e.target.value = ''; }} />
        <button type="button" className={CARD_ACTION} disabled={act.busy} onClick={() => pick.current?.click()}>{act.busy ? 'Uploading…' : '+ Upload'}</button>
      </div>
      {act.box}
      {files.length === 0 ? <p className="m-0 text-[14px] text-[var(--text-muted)]">No files yet. Choose files, or drop them here.</p> : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {files.map((a) => (
            <li key={a.id} className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <Link href={`/products/${pid}/files/${a.id}`} className="block truncate text-[15px] font-bold leading-6 text-[var(--text-heading)]" title={a.filename}>{a.filename}</Link>
                <div className="text-[13px] text-[var(--text-muted)]">{[size(a.size_bytes), a.uploaded_on ? fmtDate(a.uploaded_on) : '', a.uploaded_by].filter(Boolean).join(' · ')}</div>
              </div>
              <button type="button" className="shrink-0 text-[13px] leading-6 text-[var(--text-muted)] hover:text-[var(--status-critical-fg)]" disabled={act.busy}
                onClick={async () => { if (await ask(`Remove ${a.filename} from this competitor? The file stays in history but is no longer listed.`, 'Remove')) act.run(async () => { await api(`/attachments/${a.id}`, { method: 'DELETE' }); onSaved(); }); }}>Remove</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
