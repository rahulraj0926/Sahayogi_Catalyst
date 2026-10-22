'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { BarChart3, CheckSquare, ClipboardCheck, HelpCircle, Home, Package, StickyNote, Swords, Users, type LucideIcon } from 'lucide-react';
import { isActive, isCompetitorsPath } from './groups';

export interface RailLink { href: string; label: string; icon: LucideIcon; active: boolean; hue?: string }

/** The eight places of the app. Competitors opens the competitors of the product you were last in (the product list if there is none yet). Each has its own icon and its own name; nothing here repeats in the product sidebar. */
export function globalLinks(path: string, pid?: string): RailLink[] {
  const comp = isCompetitorsPath(path);
  return [
    { href: '/', label: 'Home', hue: '#3b82f6', icon: Home, active: path === '/' },
    { href: '/products', label: 'Product', hue: '#8b5cf6', icon: Package, active: path.startsWith('/products') && !comp },
    { href: pid ? `/products/${pid}/competitors` : '/products', label: 'Competitors', hue: '#ec4899', icon: Swords, active: comp },
    { href: '/tasks', label: 'Task', hue: '#10b981', icon: CheckSquare, active: path.startsWith('/tasks') },
    { href: '/notes', label: 'Notes', hue: '#f59e0b', icon: StickyNote, active: path.startsWith('/notes') },
    { href: '/approvals', label: 'Approval', hue: '#f43f5e', icon: ClipboardCheck, active: path.startsWith('/approvals') },
    { href: '/members', label: 'Member', hue: '#6366f1', icon: Users, active: path.startsWith('/members') },
    { href: '/reports', label: 'Report', hue: '#06b6d4', icon: BarChart3, active: path.startsWith('/reports') },
  ];
}

/** Links to /help are caught by the guided tour (see components/tour/Tour.tsx), which starts the walk-through instead. */
export const howToUseLink: RailLink = { href: '/help', label: 'How to use', icon: HelpCircle, active: false, hue: '#64748b' };

const ITEM = 'group tap-pop no-underline hover:no-underline flex shrink-0 flex-col items-center gap-1 screen-sm:w-full';
const ICON = 'flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-200 group-hover:scale-110';
const LABEL = 'hidden min-h-[1.5rem] w-full overflow-hidden text-center text-[0.6875rem] font-medium leading-[0.875rem] tracking-tight [overflow-wrap:anywhere] screen-sm:[display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]';

function Item({ l }: { l: RailLink }) {
  const hue = l.hue ?? 'var(--sd-accent)';
  return (
    <Link href={l.href} title={l.label} aria-label={l.label} aria-current={l.active ? 'page' : undefined} data-rail-item="" data-active={l.active ? '1' : undefined} className={ITEM}>
      <span className={ICON} style={{ color: hue, background: `color-mix(in srgb, ${hue} ${l.active ? 26 : 15}%, transparent)`, boxShadow: l.active ? `0 0 0 1.5px color-mix(in srgb, ${hue} 45%, transparent)` : undefined }}><l.icon size={20} /></span>
      <span className={`${LABEL} ${l.active ? 'font-semibold text-[var(--sidebar-active)]' : 'text-[var(--text-muted)]'}`}>{l.label}</span>
    </Link>
  );
}

export function Rail({ path }: { path: string }) {
  const here = /^\/products\/([^/]+)/.exec(path)?.[1];
  const [last, setLast] = useState<string | undefined>();
  useEffect(() => { try { if (here) localStorage.setItem('sahayogi.lastProduct', here); setLast(here || localStorage.getItem('sahayogi.lastProduct') || undefined); } catch { setLast(here); } }, [here]);
  const help = { ...howToUseLink, active: path.startsWith(howToUseLink.href) };
  const asideRef = useRef<HTMLElement>(null);
  const [bar, setBar] = useState<{ top: number; height: number; hue: string; show: boolean }>({ top: 0, height: 0, hue: '#3b82f6', show: false });
  const place = useCallback((el: HTMLElement | null) => {
    const host = asideRef.current;
    if (!el || !host) { setBar((b) => ({ ...b, show: false })); return; }
    const h = host.getBoundingClientRect(); const r = el.getBoundingClientRect();
    const icon = (el.firstElementChild as HTMLElement | null)?.getBoundingClientRect() ?? r;
    setBar({ top: icon.top - h.top, height: icon.height, hue: (el.firstElementChild as HTMLElement | null)?.style.color || '#3b82f6', show: true });
  }, []);
  const rest = useCallback(() => place(asideRef.current?.querySelector<HTMLElement>('[data-rail-item][data-active="1"]') ?? null), [place]);
  useLayoutEffect(() => { rest(); }, [rest, path]);
  useEffect(() => { const f = () => rest(); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, [rest]);
  return (
    <aside ref={asideRef} onMouseOver={(e) => { const el = (e.target as HTMLElement).closest<HTMLElement>('[data-rail-item]'); if (el) place(el); }} onMouseLeave={rest} aria-label="Primary navigation" data-workspace-rail=""
      className="fixed inset-x-0 bottom-0 z-40 flex h-[4rem] w-full flex-row items-center justify-around gap-1 overflow-x-auto bg-[var(--shell-bg)] px-1 py-1 no-scrollbar screen-sm:relative screen-sm:h-full screen-sm:w-[var(--sidebar-w)] screen-sm:flex-col screen-sm:items-center screen-sm:justify-start screen-sm:gap-1 screen-sm:overflow-visible screen-sm:px-0 screen-sm:py-0">
      <span aria-hidden className="pointer-events-none absolute left-0 hidden w-[3px] rounded-r-full transition-[top,height,background-color,opacity] duration-300 ease-out screen-sm:block" style={{ top: bar.top, height: bar.height, background: bar.hue, opacity: bar.show ? 1 : 0 }} />
      <Link href="/" aria-label="Sahayogi portfolio" className="hidden w-full shrink-0 items-center justify-center screen-sm:flex screen-sm:h-[var(--header-h)]">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--sd-accent)] text-base font-bold text-[var(--sd-accent-ink)]">S</span>
      </Link>
      <nav className="relative flex w-full flex-row items-center justify-around gap-1 no-scrollbar screen-sm:min-h-0 screen-sm:flex-1 screen-sm:flex-col screen-sm:justify-start screen-sm:gap-2.5 screen-sm:overflow-y-auto screen-sm:overflow-x-hidden screen-sm:px-1 screen-sm:pt-1">
        {globalLinks(path, here || last).map((l) => <Item key={l.href} l={l} />)}
        <div className="hidden screen-sm:mb-2 screen-sm:mt-auto screen-sm:block screen-sm:w-full screen-sm:pt-2"><Item l={help} /></div>
      </nav>
    </aside>
  );
}

export { isActive };
