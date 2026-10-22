'use client';
import Link from 'next/link';
import { Badge, Card, ErrorBox, Loading } from '@/components/ui';
import { useApi } from '@/lib/api';
import { ItemLinks } from './Links';
import { Pager, usePaged } from '@/components/kit';

const LISTS: [string, string, string][] = [
  ['requirementsWithoutAC', 'Requirements without acceptance criteria', 'Behaviour is not yet specified by a reviewed criterion.'],
  ['requirementsWithoutStory', 'Requirements without a story', 'Functional requirements must be elaborated by a story.'],
  ['requirementsWithoutProvenance', 'Requirements without provenance', 'No derives_from link back to a feature, objective or obligation.'],
  ['mustRequirementsNotInFlow', 'Must requirements not in a flow', 'Flow-applicable Must requirements that no flow step covers.'],
  ['storiesWithoutFlowCoverage', 'Stories without flow coverage', 'No flow step covers the story or its requirements.'],
  ['storiesIncomplete', 'Incomplete stories', 'Missing persona, acceptance criteria or a happy-path scenario.'],
  ['nfrUnscopedOrUnverified', 'NFRs unscoped or unverified', 'Neither global nor applies_to a target, or no threshold acceptance criterion.'],
  ['orphans', 'Orphans (no links at all)', 'Items nothing refers to and that refer to nothing.'],
];

export default function Gaps({ pid }: { pid: string }) {
  const { data: g, error, loading } = useApi<any>('/trace/gaps', pid);
  const pgN = usePaged<any>(g?.nfrs ?? [], 8);
  if (loading) return <Loading />;
  if (error || !g) return <ErrorBox message={error || 'No data'} />;
  const total = LISTS.reduce((a, l) => a + (g[l[0]] || []).length, 0);
  const big = LISTS.map((l) => [l[1], (g[l[0]] || []).length] as [string, number]).sort((a, b) => b[1] - a[1])[0];
  const nfrs: any[] = g.nfrs || []; const entities: any[] = g.entities || []; const flows: any[] = g.flows || [];
  return (
    <div>
      <div className={`callout ${total ? 'warn' : 'ok'}`} style={{ marginBottom: 12 }}><b>{total ? `${total} gaps found. The biggest group: ${big[0].toLowerCase()} (${big[1]}).` : 'No gaps found: everything is linked up.'}</b></div>
      <div className="grid g2">
        {LISTS.map(([key, title, help]) => {
          const items: any[] = g[key] || [];
          return (
            <Card key={key} title={title}>
              <div className="row top" title={help}><span style={{ fontSize: 22, fontWeight: 700, color: items.length ? 'var(--bad)' : 'var(--ok)' }}>{items.length}</span><span className="small muted">{items.length ? 'to fix' : 'all good'}</span></div>
              {items.length > 0 && <div style={{ marginTop: 8 }}><ItemLinks pid={pid} items={items} /></div>}
            </Card>
          );
        })}
      </div>
      <div style={{ marginTop: 16 }}>
        <Card title="Non-functional requirements and where they apply" flush>
          <table className="tbl compact"><thead><tr><th>NFR</th><th>Priority</th><th>Scope (applies_to)</th><th>Threshold ACs</th></tr></thead><tbody>
            {nfrs.length === 0 && <tr><td colSpan={4} className="muted">No non-functional requirements.</td></tr>}
            {pgN.rows.map((n) => (
              <tr key={n.id}>
                <td><Link href={`/products/${pid}/item/${n.id}`}>{n.id}</Link><div className="small muted">{n.title}</div></td>
                <td>{n.priority && <span className={`chip ${String(n.priority).toLowerCase()}`}>{n.priority}</span>}</td>
                <td>{n.global ? <Badge kind="info">global</Badge> : n.scope?.length ? n.scope.map((s: any) => <span key={s.id} className="small" style={{ marginRight: 8 }}><Link href={`/products/${pid}/item/${s.id}`}>{s.id}</Link> {s.title}</span>) : <Badge kind="bad">unscoped</Badge>}</td>
                <td className={n.ac ? 'cell-ok' : 'cell-gap'}>{n.ac}</td>
              </tr>
            ))}
          </tbody></table>
          <Pager {...pgN} />
        </Card>
      </div>
      <div className="grid g2" style={{ marginTop: 16 }}>
        <Card title="Entities structurally incomplete">
          {entities.length === 0 ? <div className="small muted">None.</div> : <ul className="list">{entities.map((e) => <li key={e.id}><Link href={`/products/${pid}/flows/entity/${e.id}`} className="mono">{e.id}</Link> {e.title}<ul className="small muted">{(e.problems || []).map((p: string, i: number) => <li key={i}>{p}</li>)}</ul></li>)}</ul>}
        </Card>
        <Card title="Flows structurally incomplete">
          {flows.length === 0 ? <div className="small muted">None.</div> : <ul className="list">{flows.map((f) => <li key={f.id}><Link href={`/products/${pid}/flows/${f.id}`} className="mono">{f.id}</Link> {f.title}<div className="small">{(f.failing || []).map((c: string) => <Badge key={c} kind="bad">{c}</Badge>)}</div></li>)}</ul>}
        </Card>
      </div>
    </div>
  );
}
