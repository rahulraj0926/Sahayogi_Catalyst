'use client';
import { useState } from 'react';
import Link from 'next/link';

/** A wrapped row of item links with short titles; long lists collapse behind a toggle. */
export function ItemLinks({ pid, items, limit = 12 }: { pid: string; items: any[]; limit?: number }) {
  const [all, setAll] = useState(false);
  return (
    <div className="row wrap" style={{ gap: 10 }}>
      {(all ? items : items.slice(0, limit)).map((i) => (
        <span key={i.id} className="small"><Link href={`/products/${pid}/item/${i.id}`}>{i.id}</Link><span className="muted"> {(i.title || '').slice(0, 34)}{(i.title || '').length > 34 ? '…' : ''}</span></span>
      ))}
      {items.length > limit && <a href="#" className="small" onClick={(e) => { e.preventDefault(); setAll(!all); }}>{all ? 'show fewer' : `+${items.length - limit} more`}</a>}
    </div>
  );
}
