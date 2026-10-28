'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { actor, api, errorMessage, setActor } from '@/lib/api';
import type { ProductsPage } from '@/features/home/types';
import { lastProduct } from './public';
import { markSignedIn } from './signed-in';

/**
 * "Sign in" until real login exists: the person says who they are, and the page sends them on.
 * Owns one product: straight to it. Owns several: the dashboard. Owns none: the idea page (a new person pitches an idea first).
 * This only routes. It does not check who the person is, and it does not touch how the app records who acts.
 */
export function SignInDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [none, setNone] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  useEffect(() => { if (open) { setName(actor()); setNone(false); setErr(null); setLast(lastProduct()); } }, [open]);

  const go = async () => {
    const n = name.trim();
    if (n.length < 2) { setErr('Type your name first.'); return; }
    setBusy(true); setErr(null);
    try {
      setActor(n);
      const mine = (await api<ProductsPage>(`/home/products?owner=${encodeURIComponent(n)}&limit=100`)).data;
      if (mine.length > 0) markSignedIn();
      if (mine.length === 1) router.push(`/products/${mine[0].slug}`);
      else if (mine.length > 1) router.push('/');
      else setNone(true);
    } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{none ? 'No product under this name yet' : 'Sign in'}</DialogTitle>
          <DialogDescription>{none ? `Nothing is owned by ${name.trim()}. Pitch an idea first. If the CEO approves it, it becomes your product.` : 'Say who you are. If you own a product, you go straight to it.'}</DialogDescription>
        </DialogHeader>
        {none ? (
          <div className="grid gap-2">
            <Button asChild><Link href="/ideas/new">Pitch your idea</Link></Button>
            {last && <Button asChild variant="outline"><Link href={`/products/${last}`} onClick={markSignedIn}>Continue where I left off</Link></Button>}
            <button type="button" className="text-sm text-[var(--text-muted)]" style={{ minHeight: 0, background: 'transparent', border: 0 }} onClick={() => setNone(false)}>Use a different name</button>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); go(); }} className="grid gap-3">
            <Label htmlFor="si-name">Your full name</Label>
            <Input id="si-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="For example: Asha Verma" />
            {err && <p role="alert" className="text-sm" style={{ color: 'var(--status-critical-fg)' }}>{err}</p>}
            <Button type="submit" disabled={busy || name.trim().length < 2}>{busy ? 'Checking…' : 'Continue'}</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
