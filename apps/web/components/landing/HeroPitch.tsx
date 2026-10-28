'use client';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { useState, type CSSProperties, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion } from './motion';
import { WARP_KEY } from './public';

/**
 * The one thing on the landing page to press. Nothing is typed here: "Pitch" opens the pitch page, which has its own form.
 * Colour spreads from the button over the screen first, and the pitch page fades it away.
 */
export function HeroPitch() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [warp, setWarp] = useState<{ x: number; y: number } | null>(null);

  const go = (e: MouseEvent<HTMLButtonElement>) => {
    if (warp) return;
    if (reduced) { router.push('/ideas/new'); return; }
    const b = e.currentTarget.getBoundingClientRect();
    setWarp({ x: b.left + b.width / 2, y: b.top + b.height / 2 });
    try { sessionStorage.setItem(WARP_KEY, '1'); } catch { /* storage blocked */ }
    setTimeout(() => router.push('/ideas/new'), 620);
  };

  return (
    <>
      {warp && createPortal(<div className="lp-warp" aria-hidden style={{ '--wx': `${warp.x}px`, '--wy': `${warp.y}px` } as CSSProperties} />, document.body)}
      <button type="button" onClick={go} className="lp-cta lp-beckon inline-flex h-14 items-center gap-2.5 rounded-full bg-[var(--sd-accent)] px-10 text-lg font-semibold text-[var(--sd-accent-ink)] hover:bg-[var(--sd-accent-2)]" style={{ minHeight: 0 }}>
        Pitch your idea<ArrowRight size={18} />
      </button>
    </>
  );
}
