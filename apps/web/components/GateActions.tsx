'use client';
/** Sign-off actions for a phase gate: decide, sign off a check (attest), set a check aside (waive). Prototype: gates_forms.js */
import { useState } from 'react';
import { Badge, Card } from './ui';
import { Field, Modal, useAction } from './kit';
import { actor, api, useApi } from '@/lib/api';

export const DECISIONS: [string, string, string][] = [
  ['go', 'Sign off', 'Everything required is in place. The next phase opens and a snapshot of the records is saved.'],
  ['go_with_conditions', 'Sign off with follow-ups', 'Go ahead, but named follow-ups must be closed by a later phase.'],
  ['hold', 'Hold', 'Pause and look again in 14 days.'],
  ['recycle', 'Send back', 'Send the work back to an earlier phase.'],
  ['stop', 'Stop the product', 'End the product (it is marked as stopped).'],
];

export function usePeople(pid: string) {
  const { data } = useApi<any>('/people', pid);
  return ((data?.people as any[]) || []).map((p) => p.name) as string[];
}
const PersonSelect = ({ names, value, onChange, exclude }: { names: string[]; value: string; onChange: (v: string) => void; exclude?: string }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)}><option value="">Choose a person…</option>{names.filter((n) => n !== exclude).map((n) => <option key={n}>{n}</option>)}</select>
);

export function AttestModal({ pid, n, r, onClose, onDone }: { pid: string; n: number; r: any; onClose: () => void; onDone: () => void }) {
  const names = usePeople(pid);
  const [by, setBy] = useState(actor());
  const [note, setNote] = useState('');
  const act = useAction();
  const role = r.attest_required?.role || r.attest_required || '';
  return (
    <Modal title={`Sign off: ${r.text}`} onClose={onClose}>
      <div className="callout" style={{ marginBottom: 10 }}>This must be signed by a person acting as <b>{String(role)}</b>.</div>
      <Field label="Who signs (a named person)"><PersonSelect names={Array.from(new Set([actor(), ...names]))} value={by} onChange={setBy} /></Field>
      <Field label="Note"><textarea rows={3} value={note} placeholder="Say what you checked." onChange={(e) => setNote(e.target.value)} /></Field>
      {act.box}
      <button className="btn primary" disabled={!by || act.busy} onClick={() => act.run(async () => { await api(`/gates/${n}/attest`, { method: 'POST', body: { criterion: r.id, role: String(role), by, note: note.trim() }, product: pid }); onDone(); })}>Sign off</button>
    </Modal>
  );
}

export function WaiveModal({ pid, n, r, onClose, onDone }: { pid: string; n: number; r: any; onClose: () => void; onDone: () => void }) {
  const names = usePeople(pid);
  const [approver, setApprover] = useState('');
  const [why, setWhy] = useState('');
  const d = new Date(); d.setDate(d.getDate() + 30);
  const [until, setUntil] = useState(d.toISOString().slice(0, 10));
  const act = useAction();
  return (
    <Modal title="Set this aside for now" onClose={onClose}>
      <div className="callout warn" style={{ marginBottom: 10 }}><b>{r.text}</b><div className="small">Setting something aside does not make it true. The person you name must agree; until then it still counts as missing.</div></div>
      <Field label="Who approves this?" help={`Someone other than you (${actor()}).`}><PersonSelect names={names} value={approver} onChange={setApprover} exclude={actor()} /></Field>
      <Field label="Why is it acceptable?"><textarea rows={3} value={why} onChange={(e) => setWhy(e.target.value)} /></Field>
      <Field label="Until when?"><input type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></Field>
      {act.box}
      <button className="btn primary" disabled={!approver || !why.trim() || act.busy} onClick={() => act.run(async () => { await api(`/gates/${n}/waive`, { method: 'POST', body: { criterion_id: r.id, approver, rationale: why.trim(), expiry_on: until, requested_by: actor() }, product: pid }); onDone(); })}>Record it</button>
    </Modal>
  );
}

/** the decision on record + the form to record a new one */
export function DecisionPanel({ pid, n, live, onDone }: { pid: string; n: number; live: any; onDone: () => void }) {
  const names = usePeople(pid);
  const [choice, setChoice] = useState('');
  const [why, setWhy] = useState('');
  const [approver, setApprover] = useState('');
  const [recycle, setRecycle] = useState(Math.max(0, n - 1));
  const [conds, setConds] = useState<{ text: string; owner: string; due: number }[]>([{ text: '', owner: actor(), due: Math.min(12, n + 1) }]);
  const act = useAction();
  const rec = live.decision;
  const needsApprover = ['go', 'go_with_conditions'].includes(choice);
  const submit = () => act.run(async () => {
    const body: any = { decision: choice, rationale: why.trim(), submitted_by: actor(), expected_sig: live.sig };
    if (needsApprover) body.approver = approver;
    if (choice === 'go_with_conditions') body.conditions = conds.filter((c) => c.text.trim()).map((c) => ({ text: c.text.trim(), owner: c.owner || actor(), must_close_by_gate: c.due }));
    if (choice === 'recycle') body.recycle_to = recycle;
    const r = await api<any>(`/gates/${n}/decide`, { method: 'POST', body, product: pid });
    act.say(r.pending ? `Waiting for ${approver} to confirm the sign-off.` : `Recorded${r.warning ? '. ' + r.warning : ''}`);
    setChoice(''); setWhy(''); onDone();
  });
  return (
    <div>
      {rec && (
        <div className="callout" style={{ marginBottom: 10 }}>
          <b>Decision on record: {(DECISIONS.find((d) => d[0] === rec.decision) || [0, rec.decision])[1]}</b> <span className="small muted">by {rec.decided_by} on {String(rec.decided_at).slice(0, 10)}{rec.approved_by ? `, approved by ${rec.approved_by}` : ''}</span>
          <div>{rec.rationale || 'No reason recorded.'}</div>
          {(rec.snapshot?.failed || []).length > 0 && <div className="small">{rec.snapshot.failed.length} checks were still open.</div>}
        </div>
      )}
      <div className={`callout ${live.eligible.includes('go') ? 'ok' : 'warn'}`} style={{ marginBottom: 10 }}>{live.eligibleReason}</div>
      {DECISIONS.map(([id, label, desc]) => {
        const ok = live.eligible.includes(id);
        return <label key={id} style={{ display: 'block', margin: '5px 0', opacity: ok ? 1 : 0.5 }}><input type="radio" name={`dec${n}`} disabled={!ok} checked={choice === id} onChange={() => setChoice(id)} /> <b>{label}</b> <span className="small muted">{desc}</span>{!ok && <span className="small" style={{ color: 'var(--bad)' }}> not possible yet</span>}</label>;
      })}
      {needsApprover && <Field label="Who approves this?" help={`You (${actor()}) prepared it; nobody approves their own work.`}><PersonSelect names={names} value={approver} onChange={setApprover} exclude={actor()} /></Field>}
      {choice === 'recycle' && <Field label="Send back to phase"><select value={recycle} onChange={(e) => setRecycle(Number(e.target.value))}>{Array.from({ length: n + 1 }, (_, i) => <option key={i} value={i}>Phase {i}</option>)}</select></Field>}
      {choice === 'go_with_conditions' && (
        <Field label="Follow-ups (at least one)">
          {conds.map((c, i) => <div key={i} className="row" style={{ marginBottom: 6 }}><input placeholder="What must happen" value={c.text} onChange={(e) => setConds(conds.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)))} style={{ flex: 3 }} /><PersonSelect names={Array.from(new Set([actor(), ...names]))} value={c.owner} onChange={(v) => setConds(conds.map((x, k) => (k === i ? { ...x, owner: v } : x)))} /><select value={c.due} onChange={(e) => setConds(conds.map((x, k) => (k === i ? { ...x, due: Number(e.target.value) } : x)))}>{Array.from({ length: 13 - n }, (_, j) => <option key={j} value={n + j}>by phase {n + j}</option>)}</select></div>)}
          <button className="btn sm" onClick={() => setConds([...conds, { text: '', owner: actor(), due: Math.min(12, n + 1) }])}>Add a follow-up</button>
        </Field>
      )}
      <Field label="Reason"><textarea rows={2} value={why} placeholder="Why this decision? It is kept in the history." onChange={(e) => setWhy(e.target.value)} /></Field>
      {act.box}
      <div className="row"><span className="small muted">Recorded by <b>{actor()}</b> (change it with “Acting as”)</span><span className="spacer" /><button className="btn primary" disabled={!choice || (needsApprover && !approver) || act.busy} onClick={submit}>Record decision</button></div>
      {(live.decision?.conditions || []).filter((c: any) => c.status === 'Open').length > 0 && <div className="small muted" style={{ marginTop: 8 }}>Open follow-ups: {(live.decision.conditions as any[]).filter((c) => c.status === 'Open').map((c) => c.text).join('; ')}</div>}
    </div>
  );
}

/** Buttons for one criterion row (sign off / set aside) with their modals */
export function CriterionActions({ pid, n, r, onDone }: { pid: string; n: number; r: any; onDone: () => void }) {
  const [m, setM] = useState<'attest' | 'waive' | null>(null);
  const canAttest = r.status === 'ATTEST_PENDING';
  const canWaive = r.status === 'FAIL' && r.waivable;
  return (
    <>
      {canAttest && <button className="btn sm primary" onClick={() => setM('attest')}>Sign off</button>}
      {canWaive && <button className="btn sm ghost" onClick={() => setM('waive')}>Set aside</button>}
      {r.status === 'WAIVED' && <Badge kind="warn">set aside</Badge>}
      {m === 'attest' && <AttestModal pid={pid} n={n} r={r} onClose={() => setM(null)} onDone={() => { setM(null); onDone(); }} />}
      {m === 'waive' && <WaiveModal pid={pid} n={n} r={r} onClose={() => setM(null)} onDone={() => { setM(null); onDone(); }} />}
    </>
  );
}
export { Card };
