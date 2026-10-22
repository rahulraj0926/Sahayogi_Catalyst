'use client';
import { useEffect, useMemo, useState } from 'react';
import { Globe2, Layers, Package, Plus, Search, Trash2, Users } from 'lucide-react';
import { Field, Modal, useAction } from '@/components/kit';
import { PHASE_SHORT } from '@/components/shell/groups';
import { api, useApi } from '@/lib/api';

type Scope = 'platform' | 'project' | 'phase';
interface Member { id: string; name: string; email?: string; role: string; scope: Scope; product_id?: string; product_name?: string; phase?: number | null; added_by?: string; added_at?: string }
interface MemberList { members: Member[]; counts: Record<string, number>; roles: string[]; scopes: string[]; last_phase: number }

const SCOPE_META: Record<Scope, { label: string; hint: string; icon: typeof Globe2 }> = {
  platform: { label: 'Whole platform', hint: 'Can work in every product', icon: Globe2 },
  project: { label: 'One project', hint: 'Every phase of the chosen product', icon: Package },
  phase: { label: 'One phase', hint: 'Only a single phase of one product', icon: Layers },
};
const phaseName = (n?: number | null) => (n === null || n === undefined ? '' : `Phase ${n} · ${PHASE_SHORT[n] ?? ''}`.trim());
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('') || '?';

function where(m: Member) {
  if (m.scope === 'platform') return 'Whole platform';
  if (m.scope === 'project') return m.product_name || m.product_id || 'Project';
  return `${m.product_name || m.product_id} · ${phaseName(m.phase)}`;
}

function AddMember({ roles, lastPhase, onClose, onDone }: { roles: string[]; lastPhase: number; onClose: () => void; onDone: () => void }) {
  const pf = useApi<any>('/portfolio');
  const products: { id: string; name: string }[] = pf.data?.products || [];
  const [f, setF] = useState({ name: '', email: '', role: roles[2] || roles[0] || 'Contributor', scope: 'project' as Scope, product_id: '', phase: 0 });
  const act = useAction();
  const needsProduct = f.scope !== 'platform';
  const ok = f.name.trim() && (!needsProduct || f.product_id);
  const save = () => act.run(async () => {
    const body: Record<string, unknown> = { name: f.name.trim(), role: f.role, scope: f.scope };
    if (f.email.trim()) body.email = f.email.trim();
    if (needsProduct) body.product_id = f.product_id;
    if (f.scope === 'phase') body.phase = f.phase;
    await api('/members', { method: 'POST', body });
    onDone(); onClose();
  });
  return (
    <Modal title="Add a member" onClose={onClose}>
      <Field label="Where should this person work?">
        <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {(Object.keys(SCOPE_META) as Scope[]).map((s) => {
            const M = SCOPE_META[s]; const on = f.scope === s;
            return (
              <button key={s} type="button" onClick={() => setF({ ...f, scope: s })} aria-pressed={on}
                style={{ textAlign: 'left', padding: 10, borderRadius: 10, minHeight: 0, border: `1.5px solid ${on ? 'var(--sd-accent)' : 'var(--divider)'}`, background: on ? 'var(--sd-accent-soft)' : 'var(--surface)' }}>
                <M.icon size={16} style={{ color: on ? 'var(--sd-accent)' : 'var(--text-muted)' }} />
                <div style={{ fontWeight: 600, fontSize: 12.5, marginTop: 4 }}>{M.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{M.hint}</div>
              </button>
            );
          })}
        </div>
      </Field>
      <div className="grid g2">
        <Field label="Name *"><input value={f.name} autoFocus onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Full name" /></Field>
        <Field label="Email"><input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="optional" /></Field>
        <Field label="Role"><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{roles.map((r) => <option key={r}>{r}</option>)}</select></Field>
        {needsProduct && (
          <Field label="Project *"><select value={f.product_id} onChange={(e) => setF({ ...f, product_id: e.target.value })}><option value="">Choose a project</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        )}
        {f.scope === 'phase' && (
          <Field label="Phase *"><select value={f.phase} onChange={(e) => setF({ ...f, phase: Number(e.target.value) })}>{Array.from({ length: lastPhase + 1 }, (_, i) => <option key={i} value={i}>{phaseName(i)}</option>)}</select></Field>
        )}
      </div>
      {act.box}
      <button className="btn primary" disabled={!ok || act.busy} onClick={save}>{act.busy ? 'Adding…' : 'Add member'}</button>
    </Modal>
  );
}

export default function MembersPage() {
  const [scope, setScope] = useState<'all' | Scope>('all');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const list = useApi<MemberList>('/members');
  const act = useAction();
  // /members?add=1 (the Quick actions menu) opens the form straight away
  useEffect(() => { try { if (new URLSearchParams(window.location.search).get('add') === '1') setAdding(true); } catch { /* no window */ } }, []);
  const d = list.data;
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (d?.members || []).filter((m) => (scope === 'all' || m.scope === scope) && (!s || `${m.name} ${m.email || ''} ${m.role} ${where(m)}`.toLowerCase().includes(s)));
  }, [d, scope, q]);
  const tabs: ['all' | Scope, string][] = [['all', 'All'], ['platform', 'Platform'], ['project', 'Project'], ['phase', 'Phase']];

  const setRole = (m: Member, role: string) => act.run(async () => { await api(`/members/${m.id}/role`, { method: 'POST', body: { role } }); list.reload(); });
  const remove = (m: Member) => act.run(async () => {
    if (!(await act.ask(`Remove ${m.name} from ${where(m)}?`, 'Remove'))) return;
    await api(`/members/${m.id}`, { method: 'DELETE' }); list.reload();
  });

  return (
    <div className="flex flex-col gap-[var(--space-md)] pb-4" data-tour="members-page">
      <h1 className="sr-only">Member</h1>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filter by scope">
          {tabs.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={scope === id} onClick={() => setScope(id)}
              style={{ minHeight: 0, padding: '5px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, border: '1px solid var(--divider)', background: scope === id ? 'var(--text-heading)' : 'var(--surface)', color: scope === id ? 'var(--surface)' : 'var(--text-secondary)' }}>
              {label} <span style={{ opacity: 0.65 }}>{id === 'all' ? d?.counts?.all ?? 0 : d?.counts?.[id] ?? 0}</span>
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 rounded-lg px-3" style={{ background: 'var(--search-bg)', height: 34 }}>
          <Search size={14} className="text-[var(--text-muted)]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search members" aria-label="Search members" style={{ background: 'transparent', border: 0, outline: 0, minHeight: 0, width: 160, padding: 0 }} />
        </label>
        <button className="btn primary" onClick={() => setAdding(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Plus size={14} />Add member</button>
      </div>

      {list.error ? <div className="card"><div className="card-b">{list.error}</div></div> : null}
      {act.box}

      <div className="card" style={{ overflow: 'hidden' }}>
        {rows.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            <Users size={28} style={{ margin: '0 auto 8px' }} />
            <div style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{list.loading ? 'Loading…' : (d?.members.length ? 'No member matches' : 'No members yet')}</div>
            {!list.loading && !d?.members.length && <div style={{ fontSize: 13 }}>Use “Add member” to give someone access to the whole platform, one project, or a single phase.</div>}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 560 }}>
              <thead><tr><th style={{ textAlign: 'left' }}>Member</th><th style={{ textAlign: 'left' }}>Works on</th><th style={{ textAlign: 'left' }}>Role</th><th style={{ textAlign: 'left' }}>Added</th><th aria-label="Actions" /></tr></thead>
              <tbody>
                {rows.map((m) => {
                  const M = SCOPE_META[m.scope];
                  return (
                    <tr key={m.id}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold" style={{ background: 'var(--avatar-bg)', color: 'var(--avatar-text)' }}>{initials(m.name)}</span>
                          <div className="min-w-0"><div style={{ fontWeight: 600 }}>{m.name}</div>{m.email && <div className="xs muted">{m.email}</div>}</div>
                        </div>
                      </td>
                      <td><span className="inline-flex items-center gap-1.5"><M.icon size={14} className="text-[var(--text-muted)]" />{where(m)}</span></td>
                      <td><select value={m.role} onChange={(e) => setRole(m, e.target.value)} aria-label={`Role of ${m.name}`} style={{ minHeight: 0, padding: '3px 6px' }}>{(d?.roles || []).map((r) => <option key={r}>{r}</option>)}</select></td>
                      <td className="xs muted">{m.added_at ? String(m.added_at).slice(0, 10) : ''}{m.added_by ? ` · ${m.added_by}` : ''}</td>
                      <td style={{ textAlign: 'right' }}><button className="btn sm ghost" onClick={() => remove(m)} aria-label={`Remove ${m.name}`} title="Remove" style={{ minHeight: 0 }}><Trash2 size={14} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="xs muted">This is the team record for who works where. It does not create a login.</p>
      {adding && d && <AddMember roles={d.roles} lastPhase={d.last_phase} onClose={() => setAdding(false)} onDone={list.reload} />}
    </div>
  );
}
