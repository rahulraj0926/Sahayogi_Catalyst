'use client';
import Link from 'next/link';
import { Badge, Bar, Card, ErrorBox, Loading } from '@/components/ui';
import { useApi } from '@/lib/api';
import { Pager, usePaged } from '@/components/kit';
import type { FeatureProps } from '../types';

export default function Rules({ pid }: FeatureProps) {

  const { data, error, loading } = useApi<any>('/trace/rules', pid);
  const pg = usePaged<any>(data?.rules ?? [], 6);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error || 'No data'} />;
  const rules: any[] = data.rules;
  const phaseOf = (id: string) => (/^CR-P(\d+)/.exec(id)?.[1] ? Number(/^CR-P(\d+)/.exec(id)![1]) : null);
  return (
    <>
      <div className="stack">
        {pg.rows.map((r) => (
          <Card key={r.id} title={<span><span className="mono xs muted">{r.id}</span> {r.name}</span>} sub={phaseOf(r.id) !== null ? `Phase ${phaseOf(r.id)}` : ''}
            right={r.vacuous ? <Badge>nothing to check</Badge> : <Badge kind={r.pass ? 'ok' : 'bad'}>{r.pass ? 'covered' : 'gaps'}</Badge>}>
            <div className="row"><div style={{ flex: 1 }}><Bar pct={r.vacuous ? 0 : r.pct} kind={r.pass ? 'ok' : 'bad'} /></div><span className="small">{r.met} of {r.population} {r.noun}(s)</span></div>
            {r.missing.length > 0 && <div className="small" style={{ marginTop: 6 }}>{r.missingText ? `${r.noun}s that ${r.missingText}: ` : 'Missing: '}{r.missing.slice(0, 8).map((m: any, i: number) => <span key={m.id}>{i > 0 && ', '}<Link href={`/products/${pid}/item/${m.id}`}>{m.id}</Link></span>)}{r.missing.length > 8 ? ` +${r.missing.length - 8} more` : ''}</div>}
          </Card>
        ))}
      </div>
      <Pager {...pg} />
    </>
  );
}
