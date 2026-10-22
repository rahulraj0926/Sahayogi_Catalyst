'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Field, Modal, useAction } from '@/components/kit';
import { api } from '@/lib/api';

/** Create a product directly (without an idea). Uses the existing portfolio route until Products gets its own typed module. */
export function NewProduct({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ name: '', one_liner: '', kind: 'software', owner: '', mode: 'greenfield', depth_level: 'L2', structure: 'single' });
  const act = useAction();
  const create = () => act.run(async () => {
    const body: Record<string, string> = {};
    for (const [k, v] of Object.entries(f)) if (v !== '') body[k] = v;
    const r = await api<{ product: { slug: string } }>('/portfolio/products', { method: 'POST', body });
    onClose();
    router.push(`/products/${r.product.slug}/work`);
  });
  return (
    <Modal title="New product" onClose={onClose}>
      <Field label="Product name *"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="One line: what is it?"><input value={f.one_liner} onChange={(e) => setF({ ...f, one_liner: e.target.value })} /></Field>
      <div className="grid g2">
        <Field label="Kind"><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="software">Software</option><option value="hardware">Hardware</option><option value="service">Service</option></select></Field>
        <Field label="Owner"><input value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} placeholder="Who is accountable" /></Field>
        <Field label="Starting point"><select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}><option value="greenfield">Built from scratch</option><option value="existing_system">Replaces an existing system</option></select></Field>
        <Field label="How thorough?" help="Light asks fewer questions."><select value={f.depth_level} onChange={(e) => setF({ ...f, depth_level: e.target.value })}><option value="L1">Light</option><option value="L2">Standard</option><option value="L3">Thorough</option></select></Field>
      </div>
      <Field label="How is it built?" help="This decides how competitors are organised for it.">
        <div className="stack">
          {([['single', 'One product', 'Its competitors compete with the whole product.'], ['modules', 'A suite of modules', 'Parts such as CRM, HR or Payroll, each with its own competitors and prices.']] as const).map(([v, t, d]) => (
            <label key={v} className="card" style={{ padding: '8px 12px', cursor: 'pointer', borderColor: f.structure === v ? 'var(--sd-accent)' : undefined }}>
              <input type="radio" name="structure" checked={f.structure === v} onChange={() => setF({ ...f, structure: v })} /> <b>{t}</b><div className="small muted">{d}</div>
            </label>))}
        </div>
      </Field>
      {act.box}
      <button className="btn primary" disabled={!f.name.trim() || act.busy} onClick={create}>{act.busy ? 'Creating…' : 'Create and start'}</button>
    </Modal>
  );
}
