'use client';
/** Link panels of a record: chains (upstream / downstream), the links table, and "Add link". Prototype: item_links.js */
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Badge, Card } from '@/components/ui';
import { Modal, useAction, useConfirm } from '@/components/kit';
import { api, useApi } from '@/lib/api';

function Node({ n, pid }: { n: any; pid: string }) {
  const bad = n.state === 'suspect';
  return (
    <li style={{ padding: '3px 0 3px 6px' }}>
      <span className="row wrap" style={{ background: bad ? 'var(--bad-bg)' : undefined, borderRadius: 6, display: 'inline-flex' }}>
        <span className="chip">{String(n.via || '').replace(/_/g, ' ')}</span><Link href={`/products/${pid}/item/${n.id}`} className="mono">{n.id}</Link><span className="small">{n.title}</span><span className="xs muted">{n.type}</span><Badge>{n.status}</Badge>
        {bad && <Badge kind="bad">suspect link</Badge>}
      </span>
      {n.children?.length > 0 && <ul style={{ listStyle: 'none', margin: 0, paddingLeft: 22, borderLeft: '1px dashed var(--line-2)' }}>{n.children.map((c: any) => <Node key={c.link || c.id} n={c} pid={pid} />)}</ul>}
    </li>
  );
}
const Tree = ({ list, empty, pid }: { list: any[]; empty: string; pid: string }) => list?.length ? <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{list.map((n) => <Node key={n.link || n.id} n={n} pid={pid} />)}</ul> : <div className="muted small">{empty}</div>;

export function Chains({ d, pid }: { d: any; pid: string }) {
  return (
    <div className="grid g2">
      <Card title="Upstream" sub="what this item rests on"><Tree pid={pid} list={d.upstream} empty="Nothing upstream: this item does not derive from anything." /></Card>
      <Card title="Downstream" sub="what depends on this item"><Tree pid={pid} list={d.downstream} empty="Nothing downstream yet." /></Card>
    </div>
  );
}

export function LinksPanel({ d, pid, reload }: { d: any; pid: string; reload: () => void }) {
  const id = d.item.id; const act = useAction(); const [ask, dialog] = useConfirm(); const [adding, setAdding] = useState(false); const [note, setNote] = useState('');
  const remove = (l: any) => act.run(async () => { if (!(await ask(`Remove link ${l.id} (${l.type}) between ${id} and ${l.other}?`, 'Remove'))) return; await api(`/links/${l.id}`, { method: 'DELETE', product: pid }); setNote(`Link ${l.id} removed`); reload(); });
  const clear = (l: any) => act.run(async () => { await api(`/links/${l.id}/clear`, { method: 'POST', body: { note: 'confirmed still valid' }, product: pid }); setNote(`Link ${l.id} confirmed valid`); reload(); });
  return (
    <Card title="Links" sub={`${d.links.length}`} flush right={<button className="btn sm primary" onClick={() => setAdding(true)}>+ Add link</button>}>
      {act.box}{dialog}{note && <div className="callout ok" style={{ margin: 8 }}>{note}</div>}
      <table className="tbl compact"><thead><tr><th>Link type</th><th>Direction</th><th>Other item</th><th>Attributes</th><th>State</th><th /></tr></thead><tbody>
        {d.links.length === 0 && <tr><td colSpan={6} className="muted">No links yet.</td></tr>}
        {d.links.map((l: any) => (
          <tr key={l.id}>
            <td><span className="strong">{l.direction === 'out' ? l.type : l.inverse}</span> <span className="xs muted">{l.type}</span></td>
            <td><Badge kind="outline">{l.direction === 'out' ? 'outgoing' : 'incoming'}</Badge></td>
            <td><Link href={`/products/${pid}/item/${l.other}`}>{l.other}</Link> <span className="small">{l.otherTitle}</span> <span className="xs muted">{l.otherType}</span></td>
            <td>{Object.entries(l.attrs || {}).map(([k, v]) => <span key={k} className="chip">{k}: {String(v)}</span>)}</td>
            <td>{l.state === 'suspect' ? <span title={l.cause ? `${l.cause.item} changed (${(l.cause.fields || []).join(', ')})` : ''}><Badge kind="bad">suspect</Badge></span> : <Badge kind="ok">valid</Badge>}</td>
            <td className="nowrap"><span className="row" style={{ gap: 4 }}>{l.state === 'suspect' && <button className="btn sm" title="Confirm this link is still valid" onClick={() => clear(l)}>Confirm</button>}<button className="btn sm danger" onClick={() => remove(l)}>Remove</button></span></td>
          </tr>))}
      </tbody></table>
      {adding && <AddLink d={d} pid={pid} onClose={() => setAdding(false)} onDone={(m) => { setAdding(false); setNote(m); reload(); }} />}
    </Card>
  );
}

function AddLink({ d, pid, onClose, onDone }: { d: any; pid: string; onClose: () => void; onDone: (m: string) => void }) {
  const id = d.item.id; const t = d.item.type;
  const meta = useApi<any>('/meta', pid); const items = useApi<any>('/items?limit=5000', pid);
  const opts = useMemo(() => {
    const out: any[] = [];
    for (const lt of meta.data?.links || []) {
      const outT = new Set<string>(); const inT = new Set<string>();
      for (const p of lt.pairs) { if (p.sources.includes(t)) p.targets.forEach((x: string) => outT.add(x)); if (p.targets.includes(t)) p.sources.forEach((x: string) => inT.add(x)); }
      if (outT.size) out.push({ key: lt.name + '|out', lt, dir: 'out', label: `${lt.name}  (this item -> other)`, others: outT });
      if (inT.size) out.push({ key: lt.name + '|in', lt, dir: 'in', label: `${lt.inverse}  (other -> this item, link "${lt.name}")`, others: inT });
    }
    return out;
  }, [meta.data, t]);
  const [key, setKey] = useState(''); const [q, setQ] = useState(''); const [target, setTarget] = useState(''); const [attrs, setAttrs] = useState<Record<string, any>>({}); const [err, setErr] = useState<string[]>([]);
  const cur = opts.find((o) => o.key === key) || opts[0];
  const cands = useMemo(() => (items.data?.items || []).filter((i: any) => cur?.others.has(i.type) && i.id !== id && (!q || `${i.id} ${i.title}`.toLowerCase().includes(q.toLowerCase()))).slice(0, 200), [items.data, cur, q, id]);
  const submit = async () => {
    if (!target) return setErr(['Pick the other item from the list.']);
    const body: any = { type: cur.lt.name, source: cur.dir === 'out' ? id : target, target: cur.dir === 'out' ? target : id, attrs: Object.fromEntries(Object.entries(attrs).filter(([, v]) => v !== undefined && v !== '')) };
    try { const r = await api<any>('/links', { method: 'POST', body, product: pid }); onDone(`Link ${r.link.id} created: ${body.source} ${body.type} ${body.target}`); }
    catch (e: any) { setErr([e.message, ...(e.data?.errors || []).slice(0, 6).map((x: string) => '- ' + x)]); }
  };
  return (
    <Modal title={`Add link for ${id}`} onClose={onClose}>
      {!opts.length ? <div className="loading">{meta.loading ? 'Loading…' : `No link type allows a ${t} here`}</div> : (
        <div className="stack">
          <label className="strong small">Link type<select value={cur.key} onChange={(e) => { setKey(e.target.value); setTarget(''); setAttrs({}); }} style={{ width: '100%' }}>{opts.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></label>
          <div className="small muted">{cur.lt.description} Cardinality {cur.lt.card}. Allowed other types: {[...cur.others].join(', ')}.</div>
          <label className="strong small">Other item<input type="text" placeholder="Search id or title" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: '100%' }} /></label>
          <select size={9} value={target} onChange={(e) => setTarget(e.target.value)} style={{ width: '100%' }}>
            {cands.length === 0 ? <option disabled>no matching items</option> : cands.map((i: any) => <option key={i.id} value={i.id}>{`${i.id}  ${i.title}  [${i.type}]`}</option>)}</select>
          {(cur.lt.attrs || []).length > 0 && <div><div className="strong small">Link attributes</div>
            {cur.lt.attrs.map((a: any) => <label key={a.name} className="small" style={{ display: 'block', margin: '4px 0' }}>{a.label || a.name}{a.kind === 'enum' ? <select value={attrs[a.name] ?? ''} onChange={(e) => setAttrs({ ...attrs, [a.name]: e.target.value })}><option value="">–</option>{(a.values || []).map((v: string) => <option key={v}>{v}</option>)}</select> : <input type={a.kind === 'number' ? 'number' : 'text'} value={attrs[a.name] ?? ''} onChange={(e) => setAttrs({ ...attrs, [a.name]: a.kind === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value })} style={{ width: '100%' }} />}</label>)}</div>}
          {err.length > 0 && <div style={{ color: 'var(--bad)', fontSize: 12.5 }}>{err.map((e, i) => <div key={i}>{e}</div>)}</div>}
          <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={submit}>Create link</button></div>
        </div>)}
    </Modal>
  );
}
