'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Hourglass, UserCheck } from 'lucide-react';
import { Card } from '@/components/dashboard/Card';
import { KPITile } from '@/components/dashboard/KPITile';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { ErrorBox, Loading } from '@/components/ui';
import { actor, api, useApi } from '@/lib/api';
import { errorMessage } from '@/lib/errors';

type Approval = { productId: string; productName: string; id: string; title: string; approver: string; kindWord: string; forYou: boolean };

/** Everything waiting on an approval, across every product, read-only: fans out to each product's /approvals.
    Confirming, declining or withdrawing happens on that product's own Approvals page (real links, real actions). */
export default function Approvals() {
  const portfolio = useApi<any>('/portfolio');
  const [list, setList] = useState<Approval[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState('');
  useEffect(() => setMe(actor()), []);

  useEffect(() => {
    const products = (portfolio.data?.products as any[])?.filter((p) => !p.archived) || [];
    if (!portfolio.data) return;
    let live = true;
    Promise.all(
      products.map((p) =>
        api<any>('/approvals', { product: p.id })
          .then((r) => {
            const forYou = (r.for_you || []).map((a: any) => ({ productId: p.id, productName: p.name, id: a.id, title: a.title, approver: a.approver, kindWord: a.kind_word, forYou: true }));
            const waiting = (r.waiting || []).filter((a: any) => !forYou.some((f: any) => f.id === a.id)).map((a: any) => ({ productId: p.id, productName: p.name, id: a.id, title: a.title, approver: a.approver, kindWord: a.kind_word, forYou: false }));
            return [...forYou, ...waiting];
          })
          .catch(() => [] as Approval[])
      )
    ).then((lists) => { if (live) setList(lists.flat()); }).catch((e) => live && setError(errorMessage(e)));
    return () => { live = false; };
  }, [portfolio.data]);

  if (portfolio.loading || (!list && !error)) return <Loading />;
  if (portfolio.error || error) return <ErrorBox message={portfolio.error || error || 'No data'} />;

  const forYou = (list || []).filter((a) => a.forYou);
  const others = (list || []).filter((a) => !a.forYou);
  const Row = ({ a, mine }: { a: Approval; mine: boolean }) => (
    <li className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--text-heading)]">{a.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
          <StatusBadge status={mine ? 'warning' : 'neutral'} label={a.kindWord} />
          <Link href={`/products/${a.productId}`} className="font-medium">{a.productName}</Link>
          {!mine && <span>waiting for <b className="text-[var(--text-heading)]">{a.approver}</b></span>}
        </p>
      </div>
      <Link href={`/products/${a.productId}/approvals`} className={`btn sm ${mine ? 'primary' : ''}`}>{mine ? 'Decide' : 'Open'}</Link>
    </li>
  );

  return (
    <div className="flex flex-col gap-[var(--space-md)] pb-4">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text-heading)]">Approval</h1>
      </div>
      <div className="grid grid-cols-2 gap-[var(--space-md)]">
        <KPITile title="Waiting for you" value={forYou.length} status={forYou.length ? 'warning' : 'healthy'} note={me ? `as ${me}` : undefined} icon={<UserCheck />} />
        <KPITile title="Waiting for others" value={others.length} status="neutral" note="across every product" icon={<Hourglass />} />
      </div>
      <div className="grid grid-cols-1 gap-[var(--space-md)] xl:grid-cols-2">
        <Card title="Waiting for you">
          {forYou.length === 0 ? <p className="text-sm text-[var(--text-muted)]">Nothing is waiting for {me || 'you'}.</p> : <ul className="divide-y divide-[var(--divider)]">{forYou.map((a) => <Row key={`${a.productId}-${a.id}`} a={a} mine />)}</ul>}
        </Card>
        <Card title="Waiting for others">
          {others.length === 0 ? <p className="text-sm text-[var(--text-muted)]">Nothing is waiting for anybody else.</p> : <ul className="divide-y divide-[var(--divider)]">{others.map((a) => <Row key={`${a.productId}-${a.id}`} a={a} mine={false} />)}</ul>}
        </Card>
      </div>
    </div>
  );
}
