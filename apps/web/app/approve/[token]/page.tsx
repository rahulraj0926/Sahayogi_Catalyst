'use client';
import { use, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';

/** The page a named approver opens from an approval link. No product, no sidebar. Prototype: approve.js */
export default function ApprovePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [choice, setChoice] = useState<'approve' | 'note' | 'decline'>('approve');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState<{ decision: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showDoc, setShowDoc] = useState(false);
  useEffect(() => { api<any>(`/approve/${encodeURIComponent(token)}`).then(setD).catch((e) => setErr(errorMessage(e))); }, [token]);
  useEffect(() => { document.body.classList.add('bare'); return () => document.body.classList.remove('bare'); }, []);
  const send = async () => {
    setMsg(null);
    if (!name.trim()) return setMsg('Type your name first, so it is clear who decided.');
    if (choice !== 'approve' && !note.trim()) return setMsg(choice === 'decline' ? 'Say why you are declining.' : 'Write your note, or choose plain Approve.');
    setBusy(true);
    try { const r = await api<any>(`/approve/${encodeURIComponent(token)}/decide`, { method: 'POST', body: { decision: choice === 'decline' ? 'decline' : 'approve', name: name.trim(), note: note.trim() } }); setDone({ decision: choice, message: r.message }); }
    catch (e: any) { setMsg(errorMessage(e)); } finally { setBusy(false); }
  };
  const Wrap = ({ children }: { children: React.ReactNode }) => <div style={{ maxWidth: 760, margin: '0 auto', padding: '18px 16px 60px' }}><div className="row" style={{ margin: '6px 0 18px' }}><div className="brand-mark">S</div><span className="muted small">Sahayogi Platform: an approval request</span></div>{children}</div>;
  if (err) return <Wrap><div className="card"><div className="card-b"><h1>This link does not work</h1><p>{err}</p><p className="small muted">Nothing was approved or declined.</p></div></div></Wrap>;
  if (!d) return <Wrap><div className="loading">Loading…</div></Wrap>;
  if (done) return <Wrap><div className={`callout ${done.decision === 'decline' ? 'warn' : 'ok'}`}><h1>{done.decision === 'decline' ? 'You declined it' : 'You approved it'}</h1><p>{done.message}</p><p className="small muted">This request is now closed. You can close this page.</p></div></Wrap>;
  if (d.status !== 'waiting') return <Wrap><h1>{d.title}</h1><div className="callout"><b>{d.status === 'approved' ? 'Already approved' : d.status === 'declined' ? 'Already declined' : d.status === 'expired' ? 'This request has expired' : 'This request was withdrawn'}</b><p>{d.explain}</p></div></Wrap>;
  return (
    <Wrap>
      <h1 style={{ fontSize: 22 }}>{d.title}</h1>
      <p className="muted">For {d.approver}. Valid until {String(d.expires_at).slice(0, 10)}.</p>
      <div className="card"><div className="card-b">
        <p style={{ fontSize: 16, margin: 0 }}>{d.statement}</p>
        {(d.warnings || []).map((w: string, i: number) => <div key={i} className="callout warn" style={{ marginTop: 8 }}>{w}</div>)}
        <details style={{ marginTop: 10 }}><summary className="strong">Details</summary>
          <dl className="kv"><dt>Product</dt><dd>{d.product}</dd><dt>Kind</dt><dd>{d.kind_word}</dd>{d.stage != null && <><dt>Stage</dt><dd>Stage {d.stage}</dd></>}<dt>Asked by</dt><dd>{d.prepared_by}, on {String(d.created_at).slice(0, 10)}</dd></dl>
          {(d.lines || []).length > 0 && <ul>{d.lines.map((l: string, i: number) => <li key={i}>{l}</li>)}</ul>}
          {d.has_document && <><button className="btn" onClick={() => setShowDoc(!showDoc)}>{showDoc ? 'Hide the document' : 'Read the full document'}</button>{showDoc && <iframe sandbox="" title="document" src={d.document_url} style={{ width: '100%', height: 460, border: '1px solid var(--line)', borderRadius: 8, background: '#fff', marginTop: 8 }} />}</>}
        </details>
      </div></div>
      <div className="card" style={{ marginTop: 14 }}><div className="card-b">
        <h2 style={{ fontSize: 13, textTransform: 'uppercase' }}>Your decision</h2>
        <div className="row wrap" style={{ margin: '8px 0 12px' }}>
          {([['approve', 'Approve'], ['note', 'Approve with a note'], ['decline', 'Decline with a reason']] as const).map(([id, t]) => <button key={id} className={`btn ${choice === id ? (id === 'decline' ? 'danger' : 'primary') : ''}`} onClick={() => setChoice(id)}>{t}</button>)}
        </div>
        {choice !== 'approve' && <><label className="strong">{choice === 'decline' ? 'Why are you declining? (needed)' : 'Your note (needed)'}</label><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} style={{ width: '100%' }} /></>}
        <label className="strong" style={{ display: 'block', marginTop: 10 }}>Type your name to confirm that you are <b>{d.approver}</b></label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" style={{ width: '100%' }} />
        {msg && <div className="err-box" style={{ marginTop: 8 }}>{msg}</div>}
        <div style={{ marginTop: 12 }}><button className="btn primary" disabled={busy} onClick={send}>Send my decision</button></div>
        <p className="xs muted">A link proves that you hold the link and typed a name. It does not prove who you are. {d.honesty}</p>
      </div></div>
    </Wrap>
  );
}
