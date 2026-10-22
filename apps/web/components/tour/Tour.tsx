'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';

interface Step { route: string; target?: string; title: string; body: string; side?: 'right' | 'bottom' | 'left' | 'top' }

/** The walk-through. Each step may move to another page first, then points at one part of it. */
export const TOUR_STEPS: Step[] = [
  { route: '/', title: 'Welcome to Sahayogi', body: 'A two-minute walk through the platform. Use Next and Back, or the arrow keys. Press Esc any time to leave.' },
  { route: '/', target: '[data-workspace-rail]', side: 'right', title: 'Your places', body: 'The bar on the left takes you to Home, Products, Tasks, Notes, Approvals, Members and Reports. The coloured marker shows where you are.' },
  { route: '/', target: '[aria-label="Quick actions"]', side: 'bottom', title: 'Quick actions', body: 'The + button holds your shortcuts: add a member, start a note, open your tasks, or take this tour again.' },
  { route: '/', target: '[data-tour="kpis"]', side: 'bottom', title: 'The numbers', body: 'Each tile is computed from the saved records. Click one to see the products behind it.' },
  { route: '/', target: '[data-tour="calendar"]', side: 'left', title: 'Calendar', body: 'Dates that matter are marked with dots. Pick a day to see what falls on it.' },
  { route: '/', target: '[data-tour="products"]', side: 'top', title: 'All products', body: 'Search, and filter from the column headings. Open a row to go into that product and its stages. “Add product” at the top right starts a new one.' },
  { route: '/', target: '[data-tour="charts"]', side: 'top', title: 'Health and readiness', body: 'See at a glance which products are healthy, blocked or close to ready.' },
  { route: '/', target: '[data-tour="feed"]', side: 'top', title: 'Ideas and activity', body: 'Ideas waiting to become products on one side, the latest changes by everyone on the other.' },
  { route: '/notes', title: 'Notes', body: 'Two kinds live here. “My notes” is your private board, kept in this browser. “From products” are notes saved inside a product.' },
  { route: '/members', target: '[data-tour="members-page"]', side: 'bottom', title: 'Members', body: 'Add a person to the whole platform, to one project, or to a single phase of a project, and set their role. Change or remove them from the same list.' },
  { route: '/', target: '[data-rail-item][aria-label="How to use"]', side: 'right', title: 'You are set', body: 'Click How to use whenever you want to run this tour again. The written guide stays at /help (Ctrl-click How to use opens it).' },
];

export const TOUR_EVENT = 'sd:tour';
export const startTour = () => { try { window.dispatchEvent(new Event(TOUR_EVENT)); } catch { /* no window */ } };

type Box = { top: number; left: number; width: number; height: number };

export function Tour() {
  const router = useRouter();
  const path = usePathname();
  const [at, setAt] = useState<number | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [vp, setVp] = useState({ w: 1200, h: 800 });
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(180);
  const step = at === null ? null : TOUR_STEPS[at];

  useEffect(() => { const f = () => setAt(0); window.addEventListener(TOUR_EVENT, f); return () => window.removeEventListener(TOUR_EVENT, f); }, []);
  // every "How to use" link (rail, profile menu) points at /help: catch the click and start the walk-through instead.
  // The written guide is still on the Help page, reached with Ctrl/Cmd+click or from the tour's last step.
  useEffect(() => {
    const f = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.('a[href="/help"]');
      if (!a || a.hasAttribute('data-no-tour')) return;
      e.preventDefault(); e.stopPropagation(); setAt(0);
    };
    document.addEventListener('click', f, true); return () => document.removeEventListener('click', f, true);
  }, []);
  // /?tour=1 also starts it (handy for a link)
  useEffect(() => { if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tour') === '1') { setAt(0); router.replace(path || '/'); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const close = useCallback(() => { setAt(null); setBox(null); }, []);
  const go = useCallback((n: number) => { if (n < 0) return; if (n >= TOUR_STEPS.length) { close(); return; } setAt(n); }, [close]);

  // move to the step's page, then find its target (it may take a moment to load)
  useEffect(() => {
    if (!step) return;
    if (step.route !== path) { router.push(step.route); return; }
    let stop = false; let tries = 0; let timer: ReturnType<typeof setTimeout>;
    const find = () => {
      if (stop) return;
      if (!step.target) { setBox(null); return; }
      const el = document.querySelector<HTMLElement>(step.target);
      if (!el) { if (tries++ < 40) timer = setTimeout(find, 100); else setBox(null); return; }
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      timer = setTimeout(measure, 350);
    };
    const measure = () => {
      if (stop || !step.target) return;
      const el = document.querySelector<HTMLElement>(step.target); if (!el) return;
      const r = el.getBoundingClientRect();
      setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    find();
    const on = () => measure();
    window.addEventListener('resize', on); window.addEventListener('scroll', on, true);
    return () => { stop = true; clearTimeout(timer); window.removeEventListener('resize', on); window.removeEventListener('scroll', on, true); };
  }, [step, path, router]);

  useLayoutEffect(() => { if (cardRef.current) setCardH(cardRef.current.offsetHeight); });
  useEffect(() => { const f = () => setVp({ w: window.innerWidth, h: window.innerHeight }); f(); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  useEffect(() => {
    if (at === null) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); go(at + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(at - 1); }
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [at, close, go]);

  if (at === null || !step) return null;
  const last = at === TOUR_STEPS.length - 1;
  const W = Math.min(340, vp.w - 24);
  const pad = 6;
  let top = Math.max(12, (vp.h - cardH) / 2); let left = (vp.w - W) / 2;
  if (box && vp.w >= 640) {
    const gap = 14;
    const side = step.side || 'bottom';
    if (side === 'right') { left = box.left + box.width + gap; top = box.top; }
    else if (side === 'left') { left = box.left - W - gap; top = box.top; }
    else if (side === 'top') { left = box.left + 16; top = box.top - cardH - gap; }
    else { left = box.left + 16; top = box.top + box.height + gap; }
    // not enough room on that side: fall back to the middle of the screen's lower part
    if (top < 12 || top + cardH > vp.h - 12) top = Math.min(Math.max(12, top), vp.h - cardH - 12);
    left = Math.min(Math.max(12, left), vp.w - W - 12);
  } else if (box) { top = vp.h - cardH - 76; left = 12; }

  return (
    <div role="dialog" aria-modal="true" aria-label={`Tour step ${at + 1} of ${TOUR_STEPS.length}`} style={{ position: 'fixed', inset: 0, zIndex: 80 }}>
      {box ? (
        <div aria-hidden onClick={close} style={{ position: 'fixed', top: box.top - pad, left: box.left - pad, width: box.width + pad * 2, height: box.height + pad * 2, borderRadius: 12, boxShadow: '0 0 0 9999px rgba(8,10,16,0.55)', outline: '2px solid var(--sd-accent)', transition: 'all 250ms ease' }} />
      ) : (
        <div aria-hidden onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(8,10,16,0.55)' }} />
      )}
      <div ref={cardRef} style={{ position: 'fixed', top, left, width: W, background: 'var(--surface)', color: 'var(--text-heading)', border: '1px solid var(--divider)', borderRadius: 14, boxShadow: '0 18px 50px rgba(0,0,0,.35)', padding: 16, transition: 'top 250ms ease, left 250ms ease' }}>
        <div className="flex items-start gap-2">
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Step {at + 1} of {TOUR_STEPS.length}</div>
          <button type="button" onClick={close} aria-label="Close tour" className="ml-auto" style={{ minHeight: 0, padding: 2, background: 'transparent', border: 0, color: 'var(--text-muted)' }}><X size={16} /></button>
        </div>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '4px 0 6px' }}>{step.title}</h2>
        <p style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--text-secondary)', margin: 0 }}>{step.body}</p>
        <div className="mt-3 flex items-center gap-1" aria-hidden>
          {TOUR_STEPS.map((_, i) => <span key={i} style={{ height: 4, flex: 1, borderRadius: 4, background: i <= at ? 'var(--sd-accent)' : 'var(--divider)' }} />)}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={close} style={{ minHeight: 0, background: 'transparent', border: 0, color: 'var(--text-muted)', fontSize: 12.5 }}>{last ? '' : 'Skip tour'}</button>
          <span className="ml-auto" />
          {at > 0 && <button type="button" className="btn" onClick={() => go(at - 1)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><ArrowLeft size={14} />Back</button>}
          <button type="button" className="btn primary" autoFocus onClick={() => go(at + 1)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{last ? 'Finish' : 'Next'}{!last && <ArrowRight size={14} />}</button>
        </div>
      </div>
    </div>
  );
}
