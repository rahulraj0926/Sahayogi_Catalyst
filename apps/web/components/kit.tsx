'use client';
/** Small building blocks shared by the feature folders. Keep screens free of copy-pasted widgets. */
import { ReactNode, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { ErrorBox } from './ui';
import { errorMessage } from '@/lib/errors';

export function Tabs({ tabs, value, onChange }: { tabs: [string, ReactNode][]; value: string; onChange: (id: string) => void }) {
  return <div className="tabs">{tabs.map(([id, label]) => <button key={id} className={id === value ? 'on' : ''} onClick={() => onChange(id)}>{label}</button>)}</div>;
}

export function Stat({ value, label, kind }: { value: ReactNode; label: string; kind?: 'ok' | 'warn' | 'bad' }) {
  return <div className="card"><div className="card-b"><div className="kpi"><span className="v" style={kind ? { color: `var(--${kind})` } : undefined}>{value}</span><span className="l">{label}</span></div></div></div>;
}

export function Field({ label, children, help }: { label: string; children: ReactNode; help?: string }) {
  return <div className="f" style={{ marginBottom: 10 }}><label style={{ display: 'block', fontWeight: 600, fontSize: 12.5, marginBottom: 3 }}>{label}</label>{children}{help && <div className="xs muted">{help}</div>}</div>;
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="modal-bg" style={{ position: 'fixed', zIndex: 50 }} onClick={onClose}>
      <div className={wide ? 'modal wide' : 'modal'} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h"><h2>{title}</h2><button className="btn sm ghost" onClick={onClose}>Close</button></div>
        <div className="modal-b">{children}</div>
      </div>
    </div>
  );
}

/** Run an async action with busy + error state: const { run, busy, error } = useAction(); */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true); setError(null);
    try { return await fn(); } catch (e: any) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  const [ask, askDialog] = useConfirm();
  const [prompt, promptDialog] = usePrompt();
  const [say, sayDialog] = useNotice();
  const box = <>{error ? <ErrorBox message={error} /> : null}{askDialog}{promptDialog}{sayDialog}</>;
  return { run, busy, error, clear: () => setError(null), box, ask, prompt, say };
}

export const fmtDate = (s?: string) => (s ? String(s).slice(0, 10) : '');
export const words = (s: string) => String(s || '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** Collapsible box. `children` is a function so heavy content loads only when opened (like the prototype's UI.fold). */
export function Fold({ title, children, open: startOpen = false }: { title: ReactNode; children: () => ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <div className="card" style={{ marginTop: 10 }}>
      <button className="card-h" style={{ width: '100%', background: 'none', border: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left' }} onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="strong">{open ? '▾' : '▸'} {title}</span>
      </button>
      {open && <div className="card-b">{children()}</div>}
    </div>
  );
}

/** Ask for confirmation in a small modal. Usage: const [ask, dialog] = useConfirm(); if (await ask('Remove it?', 'Remove')) ... ; render {dialog} */
export function useConfirm(): [(msg: string, okText?: string) => Promise<boolean>, ReactNode] {
  const [st, setSt] = useState<{ msg: string; ok: string; res: (v: boolean) => void } | null>(null);
  const ask = (msg: string, ok = 'OK') => new Promise<boolean>((res) => setSt({ msg, ok, res }));
  const done = (v: boolean) => { st?.res(v); setSt(null); };
  const dialog = st ? (
    <Modal title="Please confirm" onClose={() => done(false)}>
      <p>{st.msg}</p>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}><button className="btn" onClick={() => done(false)}>Cancel</button><button className="btn primary" onClick={() => done(true)}>{st.ok}</button></div>
    </Modal>
  ) : null;
  return [ask, dialog];
}

/** Drop-down of the people known to the product (GET /people). */
export function PersonSelect({ value, onChange, none = 'Nobody yet', pid }: { value: string; onChange: (v: string) => void; none?: string; pid: string }) {
  const [people, setPeople] = useState<string[]>([]);
  useEffect(() => { api<any>('/people', { product: pid }).then((r) => setPeople((r.people || []).map((p: any) => p.name))).catch(() => {}); }, [pid]);
  const list = value && !people.includes(value) ? [value, ...people] : people;
  return <select value={value} onChange={(e) => onChange(e.target.value)}><option value="">{none}</option>{list.map((p) => <option key={p}>{p}</option>)}</select>;
}

/** Pull "ABC-123" ids out of a sentence and show them small and grey. */
export function Sentence({ text }: { text: string }) {
  const t = String(text || '').replace(/^\d{4}-\d{2}-\d{2}:\s*/, '');
  const parts = t.split(/(\b[A-Z]{2,4}-\d{3}\b)/);
  return <>{parts.map((p, i) => (/^[A-Z]{2,4}-\d{3}$/.test(p) ? <span key={i} className="mono xs muted">{p}</span> : <span key={i}>{p}</span>))}</>;
}

export const ago = (iso: string) => {
  const d = new Date(iso); if (isNaN(d.getTime())) return '';
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'today'; if (days === 1) return 'yesterday'; if (days < 30) return `${days} days ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};
export const mins = (m?: number | null) => (m === undefined || m === null ? '' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}`);

/** Ask for a line of text in a small modal (replaces window.prompt). Resolves to the text, or null if cancelled. */
export function usePrompt(): [(msg: string, okText?: string, opts?: { required?: boolean; initial?: string }) => Promise<string | null>, ReactNode] {
  const [st, setSt] = useState<{ msg: string; ok: string; required: boolean; res: (v: string | null) => void } | null>(null);
  const [text, setText] = useState('');
  const ask = (msg: string, ok = 'OK', opts: { required?: boolean; initial?: string } = {}) => new Promise<string | null>((res) => { setText(opts.initial || ''); setSt({ msg, ok, required: !!opts.required, res }); });
  const done = (v: string | null) => { st?.res(v); setSt(null); };
  const dialog = st ? (
    <Modal title="Please answer" onClose={() => done(null)}>
      <p>{st.msg}</p>
      <textarea rows={3} autoFocus style={{ width: '100%' }} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}><button className="btn" onClick={() => done(null)}>Cancel</button><button className="btn primary" disabled={st.required && !text.trim()} onClick={() => done(text.trim())}>{st.ok}</button></div>
    </Modal>
  ) : null;
  return [ask, dialog];
}

/** Tell the person something in a small modal (replaces window.alert). */
export function useNotice(): [(msg: string) => void, ReactNode] {
  const [msg, setMsg] = useState<string | null>(null);
  const dialog = msg ? <Modal title="Done" onClose={() => setMsg(null)}><p>{msg}</p><div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" onClick={() => setMsg(null)}>OK</button></div></Modal> : null;
  return [setMsg, dialog];
}

/** Paging for a long list: const pg = usePaged(rows, 10); render pg.rows, then <Pager {...pg} />. Goes back to page 1 when the list changes length. */
export function usePaged<T>(list: T[], per = 10) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(list.length / per));
  const cur = Math.min(page, pages);
  useEffect(() => { setPage(1); }, [list.length]);
  return { rows: list.slice((cur - 1) * per, cur * per), page: cur, pages, per, total: list.length, setPage };
}
export function Pager({ page, pages, per, total, setPage }: { page: number; pages: number; per: number; total: number; setPage: (n: number) => void }) {
  if (total <= per) return null;
  return (
    <div className="pager">
      <span>{(page - 1) * per + 1} to {Math.min(page * per, total)} of {total}</span>
      <span className="pager-nav">
        <button type="button" className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
        <span className="tabular">Page {page} of {pages}</span>
        <button type="button" className="btn sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
      </span>
    </div>
  );
}
