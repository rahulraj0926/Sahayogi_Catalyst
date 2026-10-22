'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';

/** Schema-driven form: builds inputs from the engine's field definitions (GET /api/meta). */
export default function RecordForm({ pid, typeDef, item, onDone, onCancel }: { pid: string; typeDef: any; item?: any; onDone: () => void; onCancel: () => void }) {
  const init = () => {
    if (!item) return { status: typeDef.statuses[0] } as Record<string, any>;
    const o: Record<string, any> = { title: item.title, status: item.status };
    for (const f of typeDef.fields) { const v = item[f.name]; if (v !== undefined && v !== null) o[f.name] = Array.isArray(v) ? v.join('\n') : v; }
    return o;
  };
  const [vals, setVals] = useState<Record<string, any>>(init);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fields = typeDef.fields.filter((f: any) => !f.hidden && f.name !== 'title');
  const set = (k: string, v: any) => setVals((o) => ({ ...o, [k]: v }));
  const submit = async () => {
    setBusy(true); setErr(null);
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(vals)) {
      if (v === '' || v === undefined) continue;
      const f = typeDef.fields.find((x: any) => x.name === k);
      if (f?.kind === 'number') out[k] = Number(v);
      else if (f?.kind === 'list' || f?.kind === 'refs') out[k] = String(v).split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
      else out[k] = v;
    }
    try {
      if (item) { const { status, ...fields } = out; await api(`/items/${item.id}`, { method: 'PATCH', body: { fields, expected_rev: item.rev }, product: pid }); if (status && status !== item.status) await api(`/items/${item.id}/status`, { method: 'POST', body: { status }, product: pid }); }
      else await api('/items', { method: 'POST', body: { type: typeDef.name, fields: out }, product: pid });
      onDone();
    }
    catch (e: any) { setErr(e.data?.errors?.join('; ') || errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <div className="modal-bg" style={{ position: 'fixed', zIndex: 50 }}>
      <div className="modal">
        <div className="modal-h"><h2>{item ? 'Edit' : 'Add'} {typeDef.name.replace(/([A-Z])/g, ' $1').trim().toLowerCase()}</h2><button className="btn sm" onClick={onCancel}>Close</button></div>
        <div className="modal-b form">
          <div className="field"><label className="req">Title</label><input type="text" style={{ width: '100%' }} value={vals.title || ''} onChange={(e) => set('title', e.target.value)} /></div>
          <div className="field"><label>Status</label><select value={vals.status} onChange={(e) => set('status', e.target.value)}>{typeDef.statuses.map((s: string) => <option key={s}>{s}</option>)}</select></div>
          <div className="form-grid">
            {fields.map((f: any) => (
              <div className="field" key={f.name} style={f.kind === 'longtext' ? { gridColumn: '1 / -1' } : undefined}>
                <label className={f.required ? 'req' : ''}>{f.label}</label>
                {f.kind === 'enum' ? <select value={vals[f.name] ?? ''} onChange={(e) => set(f.name, e.target.value)}><option value="">–</option>{f.values.map((v: any) => <option key={v}>{v}</option>)}</select>
                  : f.kind === 'longtext' || f.kind === 'list' || f.kind === 'refs' ? <textarea value={vals[f.name] ?? ''} onChange={(e) => set(f.name, e.target.value)} />
                  : f.kind === 'bool' ? <select value={vals[f.name] === undefined ? '' : String(vals[f.name])} onChange={(e) => set(f.name, e.target.value === '' ? undefined : e.target.value === 'true')}><option value="">–</option><option value="true">Yes</option><option value="false">No</option></select>
                  : <input type={f.kind === 'date' ? 'date' : f.kind === 'number' ? 'number' : 'text'} style={{ width: '100%' }} value={vals[f.name] ?? ''} onChange={(e) => set(f.name, e.target.value)} />}
                {f.help && <div className="help">{f.help}</div>}
              </div>
            ))}
          </div>
          {err && <div className="err">{err}</div>}
          <div className="row" style={{ marginTop: 10 }}><button className="btn primary" disabled={busy || !vals.title} onClick={submit}>Save</button><button className="btn" onClick={onCancel}>Cancel</button></div>
        </div>
      </div>
    </div>
  );
}
