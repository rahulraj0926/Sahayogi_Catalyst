'use client';
import { useEffect, useState } from 'react';
import { MyNotes } from '@/components/notes/MyNotes';
import { StickyBoard, type StickyNote } from '@/components/notes/StickyBoard';
import { ErrorBox, Loading } from '@/components/ui';
import { useAction } from '@/components/kit';
import { api, useApi } from '@/lib/api';
import { errorMessage } from '@/lib/errors';

/** Notes left about the tool across every product, as sticky notes. Read from each product's /feedback; the only change a person can make here is marking a note dealt with (the same call the product's own Notes page makes). */
export default function Notes() {
  const portfolio = useApi<any>('/portfolio');
  const [notes, setNotes] = useState<StickyNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const act = useAction();

  const load = async (live: () => boolean = () => true) => {
    const products = (portfolio.data?.products as any[])?.filter((p) => !p.archived) || [];
    try {
      const lists = await Promise.all(products.map((p) =>
        api<any>('/feedback', { product: p.id })
          .then((r) => (r.notes || []).map((n: any): StickyNote => ({ key: `${p.id}:${n.id}`, id: n.id, text: n.text, categories: n.categories || [], by: n.by || n.actor, at: n.at || n.created_at, done: !!n.done, productId: p.id, productName: p.name })))
          .catch(() => [] as StickyNote[])));
      if (live()) setNotes(lists.flat());
    } catch (e) { if (live()) setError(errorMessage(e)); }
  };
  useEffect(() => { if (!portfolio.data) return; let on = true; void load(() => on); return () => { on = false; }; /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [portfolio.data]);

  const [tab, setTab] = useState<'mine' | 'products'>('mine');
  const open = (notes || []).filter((n) => !n.done).length;
  const failed = portfolio.error || error;
  const waiting = !failed && (portfolio.loading || !notes);

  return (
    <div className="flex flex-col gap-[var(--space-md)] pb-4">
      <h1 className="sr-only">Notes</h1>
      <div role="tablist" aria-label="Notes" className="flex gap-1 border-b border-[var(--divider)]">
        {([['mine', 'My notes'], ['products', `From products${notes ? ` (${open})` : ''}`]] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" title={id === 'mine' ? 'Your own notes, saved in this browser only' : 'Notes left on products, shared with the team'} aria-selected={tab === id} onClick={() => setTab(id)} style={{ minHeight: 0 }}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${tab === id ? 'border-[var(--text-heading)] text-[var(--text-heading)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-heading)]'}`}>{label}</button>
        ))}
      </div>
      {tab === 'mine' ? <MyNotes /> : failed ? <ErrorBox message={failed} /> : waiting ? <Loading /> : (
        <>
          {act.box}
          <StickyBoard notes={notes || []} busy={act.busy} onDone={(n, done) => act.run(async () => {
            setNotes((cur) => (cur || []).map((x) => (x.key === n.key ? { ...x, done } : x)));
            try { await api(`/feedback/${n.id}/done`, { method: 'POST', body: { done }, product: n.productId }); }
            catch (e) { setNotes((cur) => (cur || []).map((x) => (x.key === n.key ? { ...x, done: n.done } : x))); throw e; }
          })} />
        </>
      )}
    </div>
  );
}
