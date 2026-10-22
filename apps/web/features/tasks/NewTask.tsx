'use client';
import { useEffect, useState } from 'react';
import { Field, Modal, useAction } from '@/components/kit';
import { PHASE_SHORT } from '@/components/shell/groups';
import { api, actor } from '@/lib/api';

export type NewTaskResult = { productId: string; productName: string; id: string; title: string; phase: number; assignee: string; priority: 'Must' | 'Should' | 'Could'; due: string };

/** Add a task: a saved question assigned to a person, for one phase of one product. It shows up in the Tasks table straight away. */
export function NewTask({ products, defaultProduct, onClose, onCreated }: { products: [string, string][]; defaultProduct?: string; onClose: () => void; onCreated: (t: NewTaskResult) => void }) {
  const [title, setTitle] = useState('');
  const [pid, setPid] = useState(defaultProduct && products.some(([id]) => id === defaultProduct) ? defaultProduct : products[0]?.[0] || '');
  const [phase, setPhase] = useState(0);
  const [who, setWho] = useState('');
  const [priority, setPriority] = useState<'Must' | 'Should' | 'Could'>('Should');
  const [due, setDue] = useState('');
  const [people, setPeople] = useState<string[]>([]);
  const act = useAction();

  useEffect(() => {
    let on = true;
    api<any>('/members').then((r) => { if (on) setPeople([...new Set<string>((r.members || r.data || []).map((m: any) => String(m.name || m.person || '')).filter(Boolean))].sort()); }).catch(() => {});
    return () => { on = false; };
  }, []);

  const save = () => act.run(async () => {
    const fields: Record<string, unknown> = { title: title.trim(), priority, category: 'other', needed_by_gate: phase };
    if (who) { fields.asked_of = who; fields.owner = who; }
    if (due) fields.due_on = due;
    const r = await api<any>('/items', { method: 'POST', body: { type: 'Question', fields }, product: pid });
    const id = r?.item?.id || r?.id;
    if (!id) throw new Error('The task was not saved.');
    onCreated({ productId: pid, productName: products.find(([i]) => i === pid)?.[1] || pid, id, title: title.trim(), phase, assignee: who, priority, due });
  });

  return (
    <Modal title="Add a task" onClose={onClose}>
      <Field label="What needs to be done *"><input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="For example: Confirm the dealer list with the sponsor" style={{ width: '100%' }} /></Field>
      <div className="grid g2">
        <Field label="Product"><select value={pid} onChange={(e) => setPid(e.target.value)} style={{ width: '100%' }}>{products.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></Field>
        <Field label="Phase"><select value={phase} onChange={(e) => setPhase(Number(e.target.value))} style={{ width: '100%' }}>{PHASE_SHORT.map((n, i) => <option key={i} value={i}>{i}. {n}</option>)}</select></Field>
        <Field label="Assign to"><select value={who} onChange={(e) => setWho(e.target.value)} style={{ width: '100%' }}><option value="">Nobody yet</option>{people.map((p) => <option key={p}>{p}</option>)}{who && !people.includes(who) && <option>{who}</option>}</select></Field>
        <Field label="Priority"><select value={priority} onChange={(e) => setPriority(e.target.value as any)} style={{ width: '100%' }}><option value="Must">High (must be done)</option><option value="Should">Medium</option><option value="Could">Low (nice to have)</option></select></Field>
      </div>
      <Field label="Due date (optional)"><input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
      {act.box}
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!title.trim() || !pid || act.busy} onClick={save}>{act.busy ? 'Saving…' : 'Add task'}</button>
      </div>
    </Modal>
  );
}
