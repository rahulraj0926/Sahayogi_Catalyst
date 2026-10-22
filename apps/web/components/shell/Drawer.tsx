'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { isActive, type NavGroupDef, type NavLinkDef } from './groups';

const ROW = 'flex items-center gap-2 rounded-lg px-2 py-1 text-[13px] transition-colors';

function Row({ l, active, n, pct, now }: { l: NavLinkDef; active: boolean; n: number; pct?: number; now?: boolean }) {
  const Icon = l.icon;
  return (
    <Link href={l.href} title={l.hint} aria-current={active ? 'page' : undefined}
      className={`${ROW} ${active ? 'bg-[var(--sd-accent-soft)] font-semibold text-[var(--sd-accent)]' : 'text-[var(--text-secondary)] hover:bg-[var(--search-bg)] hover:text-[var(--text-heading)]'}`}>
      {Icon ? <Icon size={15} className="shrink-0" /> : <span aria-hidden className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md text-[10px] font-semibold ${active ? 'bg-[var(--sd-accent)] text-[var(--sd-accent-ink)]' : 'bg-[var(--surface-muted)] text-[var(--text-muted)]'}`}>{l.glyph}</span>}
      <span className="min-w-0 flex-1 truncate">{l.label}</span>
      {n > 0 && <span className="rounded-full bg-[var(--sd-accent)] px-1.5 text-[10px] font-semibold leading-4 text-[var(--sd-accent-ink)]">{n}</span>}
      {now && !active && <span aria-hidden title="You are here" className="h-2 w-2 shrink-0 rounded-full bg-[var(--sd-accent)]" />}
      {pct !== undefined && pct > 0 && <span className="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)]" title={`${pct}% complete`}>{pct}%</span>}
    </Link>
  );
}

/** The 13 phases as a short list: number, name and how far each one is. */
function Phases({ phases, path, current, percents }: { phases: NavLinkDef[]; path: string; current?: number; percents?: number[] }) {
  return (
    <ul className="flex flex-col gap-px" aria-label="The 13 phases">
      {phases.map((c, i) => <li key={c.href}><Row l={c} active={isActive(path, c)} n={0} pct={percents?.[i]} now={current === i} /></li>)}
    </ul>
  );
}

/** A sidebar section. Collapsible sections open by themselves when you are inside them and stay as you left them otherwise. */
function Group({ g, path, counts, phase, percents }: { g: NavGroupDef; path: string; counts: Record<string, number>; phase?: number; percents?: number[] }) {
  const Icon = g.icon;
  const active = g.items.some((l) => isActive(path, l)) || !!g.phases?.some((l) => isActive(path, l));
  const [open, setOpen] = useState(active || !!g.defaultOpen);
  useEffect(() => { if (active) setOpen(true); }, [active]);
  const waiting = g.items.reduce((n, l) => n + (l.count ? counts[l.count] || 0 : 0), 0);
  const list = (
    <>
      {g.items.length > 0 && (
        <ul className="flex flex-col gap-px">
          {g.items.map((l) => <li key={l.href}><Row l={l} active={isActive(path, l)} n={l.count ? counts[l.count] || 0 : 0} /></li>)}
        </ul>
      )}
      {g.phases && <Phases phases={g.phases} path={path} current={phase} percents={percents} />}
    </>
  );
  if (g.collapsible) {
    const id = `nav-${g.key}`;
    return (
      <section>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={id} title={g.hint}
          className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] font-semibold transition-colors hover:bg-[var(--search-bg)] ${active ? 'text-[var(--sd-accent)]' : 'text-[var(--text-heading)]'}`} style={{ minHeight: 0 }}>
          {Icon && <Icon size={16} className="shrink-0" />}
          <span className="min-w-0 flex-1 truncate">{g.label}</span>
          {!open && waiting > 0 && <span className="rounded-full bg-[var(--sd-accent)] px-1.5 text-[10px] font-semibold leading-4 text-[var(--sd-accent-ink)]">{waiting}</span>}
          <ChevronDown size={14} className={`shrink-0 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && <div id={id} className="mt-0.5 border-l border-[var(--divider)] pl-1.5 ml-3.5">{list}</div>}
      </section>
    );
  }
  return (
    <section>
      {g.label && <h3 className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{g.label}</h3>}
      {list}
    </section>
  );
}

export interface DrawerProduct { name: string; stageLabel?: string; readinessPercent?: number; kind?: string; phase?: number }

const MIN_W = 168; const MAX_W = 340; const DEF_W = 196; const ICON_W = 56;
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
};

interface Tip { label: string; hint?: string; x: number; y: number }

/** Icon-only link for the narrow sidebar. The name of the option shows beside it on hover or keyboard focus. */
function IconLink({ href, label, hint, active, n, icon: Icon, glyph, show, hide }: { href: string; label: string; hint?: string; active: boolean; n: number; icon?: NavLinkDef['icon']; glyph?: string; show: (e: React.SyntheticEvent<HTMLElement>, label: string, hint?: string) => void; hide: () => void }) {
  return (
    <Link href={href} aria-label={label} aria-current={active ? 'page' : undefined} onMouseEnter={(e) => show(e, label, hint)} onMouseLeave={hide} onFocus={(e) => show(e, label, hint)} onBlur={hide}
      className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${active ? 'bg-[var(--sd-accent-soft)] text-[var(--sd-accent)]' : 'text-[var(--text-secondary)] hover:bg-[var(--search-bg)] hover:text-[var(--text-heading)]'}`}>
      {Icon ? <Icon size={17} /> : <span aria-hidden className={`flex h-[20px] w-[20px] items-center justify-center rounded-md text-[10px] font-semibold ${active ? 'bg-[var(--sd-accent)] text-[var(--sd-accent-ink)]' : 'bg-[var(--surface-muted)] text-[var(--text-muted)]'}`}>{glyph}</span>}
      {n > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-[var(--sd-accent)] px-1 text-center text-[9px] font-semibold leading-4 text-[var(--sd-accent-ink)]">{n}</span>}
    </Link>
  );
}

/** The product's own sidebar. Beside the page on desktop (drag its edge to resize, or shrink it to icons); a sheet on a phone. */
export function Drawer({ product, groups, path, counts, percents, open, onClose }: { product?: DrawerProduct | null; groups: NavGroupDef[]; path: string; counts: Record<string, number>; percents?: number[]; open: boolean; onClose: () => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(DEF_W);
  const [tip, setTip] = useState<Tip | null>(null);
  const drag = useRef<{ x: number; w: number } | null>(null);
  useEffect(() => { setCollapsed(store.get('sd_drawer_collapsed') === '1'); const w = Number(store.get('sd_drawer_w')); if (w >= MIN_W && w <= MAX_W) setWidth(w); }, []);
  const toggle = () => { setTip(null); setCollapsed((c) => { store.set('sd_drawer_collapsed', c ? '0' : '1'); return !c; }); };
  const size = (w: number) => { const v = Math.min(MAX_W, Math.max(MIN_W, Math.round(w))); setWidth(v); return v; };
  const show = (e: React.SyntheticEvent<HTMLElement>, label: string, hint?: string) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ label, hint, x: r.right + 8, y: r.top + r.height / 2 }); };
  const hide = () => setTip(null);

  const expanded = (
    <>
      <div className="flex items-center gap-2 border-b border-[var(--divider)] px-2.5 py-2">
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Menu</span>
        <button type="button" onClick={onClose} aria-label="Close menu" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--search-bg)] screen-sm:hidden"><X size={16} /></button>
        <button type="button" onClick={toggle} aria-label="Shrink the menu to icons" title="Shrink to icons" className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--search-bg)] hover:text-[var(--text-heading)] screen-sm:inline-flex" style={{ minHeight: 0, padding: 0 }}><PanelLeftClose size={16} /></button>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-1.5 py-2">
        {groups.map((g) => g.key === 'history' ? <div key={g.key} className="mt-auto border-t border-[var(--divider)] pt-1"><Group g={g} path={path} counts={counts} phase={product?.phase} percents={percents} /></div> : <Group key={g.key} g={g} path={path} counts={counts} phase={product?.phase} percents={percents} />)}
      </nav>
    </>
  );

  const narrow = (
    <div className="hidden flex-1 flex-col items-center gap-1 px-1.5 py-2.5 screen-sm:flex">
      <button type="button" onClick={toggle} aria-label="Widen the menu" onMouseEnter={(e) => show(e, 'Widen the menu')} onMouseLeave={hide} onFocus={(e) => show(e, 'Widen the menu')} onBlur={hide}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--search-bg)] hover:text-[var(--text-heading)]" style={{ minHeight: 0, padding: 0 }}><PanelLeftOpen size={17} /></button>
      {groups.map((g) => {
        const chip = g.phases ? (g.phases.find((c) => isActive(path, c)) || g.phases[product?.phase ?? 0] || g.phases[0]) : null;
        return (
          <div key={g.key} className={`flex w-full flex-col items-center gap-1 ${g.collapsible || g.key === 'history' ? 'mt-1 border-t border-[var(--divider)] pt-1' : ''} ${g.key === 'history' ? 'mt-auto' : ''}`}>
            {g.items.map((l) => <IconLink key={l.href} href={l.href} label={l.label} hint={l.hint} active={isActive(path, l)} n={l.count ? counts[l.count] || 0 : 0} icon={l.icon} glyph={l.glyph} show={show} hide={hide} />)}
            {chip && g.phases && <IconLink href={chip.href} label={`${g.label}: ${chip.label}`} hint="Open the current phase" active={g.phases.some((c) => isActive(path, c))} n={0} icon={g.icon} glyph={g.label.charAt(0)} show={show} hide={hide} />}
          </div>);
      })}
    </div>
  );

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/40 screen-sm:hidden" onClick={onClose} aria-hidden />}
      <div className="contents screen-sm:relative screen-sm:block screen-sm:shrink-0 screen-sm:w-[var(--dw)]" style={{ ['--dw' as any]: `${collapsed ? ICON_W : width}px` }}>
        <aside aria-label="Product navigation" data-state="panel"
          className={`no-scrollbar fixed inset-x-2 bottom-[4.5rem] z-40 max-h-[70dvh] flex-col overflow-y-auto overscroll-y-contain rounded-[var(--card-radius)] border border-[var(--divider)] bg-[var(--surface)] shadow-xl screen-sm:static screen-sm:z-auto screen-sm:flex screen-sm:h-full screen-sm:max-h-none screen-sm:w-full screen-sm:rounded-none screen-sm:border-0 screen-sm:border-r screen-sm:shadow-none ${open ? 'flex' : 'hidden'}`}>
          <div className={collapsed ? 'screen-sm:hidden' : 'contents'}>{expanded}</div>
          {collapsed && narrow}
        </aside>
        {!collapsed && (
          <div role="separator" aria-orientation="vertical" aria-label="Resize the menu (arrow keys, or double-click to reset)" aria-valuemin={MIN_W} aria-valuemax={MAX_W} aria-valuenow={width} tabIndex={0}
            className="absolute right-[-3px] top-0 z-10 hidden h-full w-[6px] cursor-col-resize touch-none hover:bg-[var(--sd-accent)] focus-visible:bg-[var(--sd-accent)] focus-visible:outline-none screen-sm:block"
            style={{ opacity: 0.35 }}
            onPointerDown={(e) => { drag.current = { x: e.clientX, w: width }; e.currentTarget.setPointerCapture(e.pointerId); }}
            onPointerMove={(e) => { if (drag.current) size(drag.current.w + e.clientX - drag.current.x); }}
            onPointerUp={(e) => { if (drag.current) { store.set('sd_drawer_w', String(size(drag.current.w + e.clientX - drag.current.x))); drag.current = null; } }}
            onDoubleClick={() => { size(DEF_W); store.set('sd_drawer_w', String(DEF_W)); }}
            onKeyDown={(e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); store.set('sd_drawer_w', String(size(width + (e.key === 'ArrowRight' ? 16 : -16)))); } }} />)}
      </div>
      {tip && <div role="tooltip" className="pointer-events-none fixed z-[70] max-w-[16rem] rounded-lg bg-[var(--text-heading)] px-2.5 py-1.5 text-xs text-[var(--surface)] shadow-lg" style={{ left: tip.x, top: tip.y, transform: 'translateY(-50%)' }}><div className="font-semibold">{tip.label}</div>{tip.hint && <div className="opacity-75">{tip.hint}</div>}</div>}
    </>
  );
}
