'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CheckSquare, ClipboardCheck, HelpCircle, LogOut, Menu, Plus, Search, StickyNote, UserPlus } from 'lucide-react';
import { api, setActor, useApi } from '@/lib/api';
import { ThemeToggle } from '@/theme/ThemeToggle';
import { FEATURES } from '@/features/registry';
import { startTour } from '../tour/Tour';
import AppsLauncher from './AppsLauncher';

type Hit = { key: string; href: string; title: string; sub: string };

// `type` is here so review/request/mention notifications can plug into the same list
// later (tagging a user will land as type 'mention') without changing this shape.
type InboxItem = { type: 'approval'; productId: string; productName: string; id: string; title: string; href: string };

function initials(name: string) {
  return name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
}

function emailFor(name: string) {
  return `${name.trim().toLowerCase().replace(/\s+/g, '.')}@sahayogi.app`;
}

/** For you to decide, scoped to the open product, or fanned out across every product on the portfolio view. */
function useInboxItems(pid?: string): InboxItem[] {
  const scoped = useApi<any>(pid ? '/approvals' : null, pid);
  const portfolio = useApi<any>(pid ? null : '/portfolio');
  const [items, setItems] = useState<InboxItem[]>([]);

  useEffect(() => {
    if (pid) {
      const list = (scoped.data?.for_you || []).map((a: any): InboxItem => ({ type: 'approval', productId: pid, productName: '', id: a.id, title: a.title, href: `/products/${pid}/approvals` }));
      setItems(list);
      return;
    }
    const products = (portfolio.data?.products as any[])?.filter((p) => !p.archived) || [];
    if (!portfolio.data) return;
    let live = true;
    Promise.all(
      products.map((p) =>
        api<any>('/approvals', { product: p.id })
          .then((r) => (r.for_you || []).map((a: any): InboxItem => ({ type: 'approval', productId: p.id, productName: p.name, id: a.id, title: a.title, href: `/products/${p.id}/approvals` })))
          .catch(() => [] as InboxItem[])
      )
    ).then((lists) => { if (live) setItems(lists.flat()); });
    return () => { live = false; };
  }, [pid, scoped.data, portfolio.data]);

  return items;
}

function CommandPalette({ pid, open, onClose }: { pid?: string; open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Hit[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const pages = useMemo<Hit[]>(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2 || !pid) return [];
    return FEATURES.filter((f) => f.label.toLowerCase().includes(t)).slice(0, 4).map((f) => ({ key: `f-${f.id}`, href: f.id === 'overview' ? `/products/${pid}` : `/products/${pid}/${f.id}`, title: f.label, sub: 'Page' }));
  }, [q, pid]);
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2 || !pid) { setItems([]); return; }
    let live = true;
    const h = setTimeout(() => {
      api<any>(`/search?q=${encodeURIComponent(t)}`, { product: pid }).then((r) => {
        if (!live) return;
        const hits: Hit[] = [];
        for (const g of r.groups || []) for (const i of g.items || []) hits.push({ key: `${i.product_id}-${i.id}`, href: `/products/${i.product_id}/item/${i.id}`, title: i.title || i.id, sub: `${g.label} · ${i.id}` });
        setItems(hits.slice(0, 8));
      }).catch(() => live && setItems([]));
    }, 250);
    return () => { live = false; clearTimeout(h); };
  }, [q, pid]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  const results = [...pages, ...items];
  const done = () => { setQ(''); onClose(); };
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 px-4 pt-[12vh]">
      <div className="absolute inset-0" onClick={done} />
      <div className="relative z-10 flex w-full max-w-[36rem] flex-col overflow-hidden rounded-xl border border-[var(--divider)] bg-[var(--surface)] shadow-xl">
        <div className="flex items-center gap-2 border-b border-[var(--divider)] px-4 py-3.5">
          <Search size={20} className="shrink-0" color="var(--search-placeholder)" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && done()} disabled={!pid}
            placeholder={pid ? 'Search this product…' : 'Open a product to search'} aria-label="Search this product"
            className="w-full min-w-0 bg-transparent text-sm text-[var(--text-secondary)] outline-none placeholder:text-[var(--search-placeholder)]" />
          <button type="button" onClick={done} className="shrink-0 text-xs font-medium text-[var(--text-muted)] hover:underline">Esc</button>
        </div>
        {results.length > 0 && (
          <ul className="max-h-[22rem] divide-y divide-[var(--divider)] overflow-y-auto">
            {results.map((r) => (
              <li key={r.key}>
                <Link href={r.href} onClick={done} className="block px-4 py-2.5 hover:bg-[var(--search-bg)]">
                  <div className="truncate text-sm font-medium text-[var(--text-heading)]">{r.title}</div>
                  <div className="truncate text-xs text-[var(--text-muted)]">{r.sub}</div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {q.trim().length >= 2 && results.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">No results for &ldquo;{q}&rdquo;</p>
        )}
      </div>
    </div>
  );
}

const QUICK_ROW = 'flex items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--search-bg)] hover:text-[var(--text-heading)]';

export function Header({ pid, who, onWho, approvals, onMenu, edge = 0 }: { edge?: number; pid?: string; who: string; onWho: (v: string) => void; approvals: number; onMenu?: () => void }) {
  const [openMenu, setOpenMenu] = useState<'profile' | 'inbox' | 'quick' | 'apps' | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const inboxItems = useInboxItems(pid);
  const inboxCount = inboxItems.length || approvals;

  function toggle(menu: 'profile' | 'inbox' | 'quick' | 'apps') {
    setOpenMenu((cur) => (cur === menu ? null : menu));
  }

  // Cmd+K (Mac) / Ctrl+K (Windows/Linux) opens the command palette from anywhere.
  // Win+K is intercepted by Windows itself before it reaches the browser, so Ctrl+K
  // is the practical Windows equivalent of Cmd+K.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpenMenu(null);
        setSearchOpen(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <header className="relative z-30 flex h-[var(--header-h)] shrink-0 items-center gap-2 bg-[var(--shell-bg)] pl-[var(--page-pad-x)]" style={{ paddingRight: `calc(var(--page-pad-x) - 0.3rem + ${edge}px)` }}>
      {openMenu && <div className="fixed inset-0 z-40" onClick={() => setOpenMenu(null)} />}

      <Link href="/" aria-label="Sahayogi portfolio" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--sd-accent)] text-sm font-bold text-[var(--sd-accent-ink)] screen-sm:hidden">S</Link>

      {onMenu && <button type="button" onClick={onMenu} aria-label="Product menu" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--search-bg)] screen-sm:hidden"><Menu size={20} /></button>}

      {/* Search trigger — click, or Cmd+K / Ctrl+K from anywhere, opens the command palette. */}
      <div className="flex min-w-0 flex-1 items-center justify-center px-1 screen-sm:px-2">
        <button type="button" onClick={() => { setOpenMenu(null); setSearchOpen(true); }}
          className="flex h-10 w-full min-w-0 max-w-[24rem] items-center gap-2 rounded-lg border border-transparent bg-[var(--search-bg)] px-3 text-left screen-sm:max-w-[360px] screen-sm:border-[var(--divider)]">
          <Search size={18} className="shrink-0" color="var(--search-placeholder)" />
          <span className="min-w-0 w-full truncate text-xs text-[var(--search-placeholder)] screen-sm:text-sm">
            {pid ? 'Search this product…' : 'Open a product to search'}
          </span>
          <span className="hidden shrink-0 items-center gap-0.5 rounded-md border border-[var(--divider)] px-1.5 py-0.5 text-[0.6875rem] font-medium text-[var(--text-muted)] screen-sm:flex">Ctrl K</span>
        </button>
      </div>
      <CommandPalette pid={pid} open={searchOpen} onClose={() => setSearchOpen(false)} />

      <div className="relative ml-auto flex h-full shrink-0 items-center gap-1.5 screen-sm:gap-2">
        {/* Quick actions: the company's shortcuts. Adding a product lives on the Products table. */}
        <div className="flex h-full items-center">
          <button type="button" title="Quick actions" aria-label="Quick actions" aria-haspopup="menu" aria-expanded={openMenu === 'quick'} onClick={() => toggle('quick')}
            className="tap-pop flex h-[2.875rem] w-[2.875rem] shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--search-bg)] hover:text-[var(--text-heading)]">
            <Plus size={22} />
          </button>
          {openMenu === 'quick' && (
            <div role="menu" className="absolute right-[0.3rem] top-[calc(100%+var(--page-pad-y))] z-50 w-[15rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-[var(--divider)] bg-[var(--surface)] py-1 shadow-xl">
              <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Quick actions</p>
              <Link role="menuitem" href="/members?add=1" onClick={() => setOpenMenu(null)} className={QUICK_ROW}><UserPlus size={16} />Add a member</Link>
              <Link role="menuitem" href="/notes" onClick={() => setOpenMenu(null)} className={QUICK_ROW}><StickyNote size={16} />New note</Link>
              <Link role="menuitem" href="/tasks" onClick={() => setOpenMenu(null)} className={QUICK_ROW}><CheckSquare size={16} />Open my tasks</Link>
              <button role="menuitem" type="button" onClick={() => { setOpenMenu(null); startTour(); }} className={`${QUICK_ROW} w-full text-left`}><HelpCircle size={16} />Take the tour</button>
            </div>
          )}
        </div>
        {/* Notifications: what is waiting for this person to decide */}
        <div className="flex h-full items-center">
          <button type="button" title="Notifications" aria-label={`Notifications${inboxCount ? `, ${inboxCount} waiting` : ''}`}
            onClick={() => toggle('inbox')}
            className="tap-pop relative flex h-[2.875rem] w-[2.875rem] shrink-0 items-center justify-center rounded-lg hover:bg-[var(--search-bg)]">
            <Bell size={20} color="var(--text-secondary)" />
            {inboxCount > 0 && <span className="absolute right-1.5 top-1.5 min-w-[1rem] rounded-full bg-[var(--sd-accent)] px-1 text-center text-[10px] font-semibold leading-4 text-[var(--sd-accent-ink)]">{inboxCount}</span>}
          </button>

          {openMenu === 'inbox' && (
            <div className="absolute right-[0.3rem] top-[calc(100%+var(--page-pad-y))] z-50 flex max-h-[26rem] w-[21rem] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-xl border border-[var(--divider)] bg-[var(--surface)] shadow-xl screen-2xl:w-[26rem]">
              <div className="flex shrink-0 items-center justify-between px-4 py-3.5">
                <p className="text-base font-semibold text-[var(--text-heading)]">Notifications</p>
                <span className="text-xs text-[var(--text-muted)]">{inboxItems.length} waiting</span>
              </div>
              {inboxItems.length === 0 ? (
                <p className="border-t border-[var(--divider)] px-4 py-5 text-sm text-[var(--text-muted)]">Nothing waiting on you.</p>
              ) : (
                <ul className="divide-y divide-[var(--divider)] overflow-y-auto border-t border-[var(--divider)]">
                  {inboxItems.map((item) => (
                    <li key={`${item.productId}-${item.id}`}>
                      <Link href={item.href} onClick={() => setOpenMenu(null)} className="flex items-start gap-2.5 px-4 py-3 hover:bg-[var(--search-bg)]">
                        <ClipboardCheck size={16} className="mt-0.5 shrink-0 text-[var(--text-muted)]" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-[var(--text-heading)]">{item.title}</span>
                          <span className="text-xs text-[var(--text-muted)]">{item.productName || 'Approval'}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Sahayogi Apps: the 9-dot launcher */}
        <button type="button" title="Sahayogi Apps" aria-label="Sahayogi Apps" aria-haspopup="dialog" aria-expanded={openMenu === 'apps'} onClick={() => toggle('apps')}
          className="tap-pop flex h-[2.875rem] w-[2.875rem] shrink-0 items-center justify-center rounded-lg transition-all duration-150 hover:scale-105 hover:bg-[var(--search-bg)]">
          <AppsGridIcon color="var(--text-secondary)" />
        </button>
        {openMenu === 'apps' && <AppsLauncher onClose={() => setOpenMenu(null)} />}

        {/* Profile */}
        <div>
          <button type="button" onClick={() => toggle('profile')} title={who}
            className="tap-pop flex h-[2.875rem] w-[2.875rem] shrink-0 items-center justify-center rounded-full transition-all duration-150 hover:bg-[var(--search-bg)]">
            <span className="flex h-[2.3rem] w-[2.3rem] shrink-0 items-center justify-center rounded-full bg-[var(--avatar-bg)] text-xs font-semibold text-[var(--avatar-text)]">{initials(who)}</span>
          </button>

          {openMenu === 'profile' && (
            <div className="absolute right-[0.3rem] top-[calc(100%+var(--page-pad-y))] z-50 w-[20rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-[var(--divider)] bg-[var(--surface)] shadow-xl">
              {/* Account summary */}
              <div className="flex items-start gap-3 px-4 py-5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--avatar-bg)] text-lg font-semibold text-[var(--avatar-text)]">
                  {initials(who)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-[var(--text-heading)]">{who}</p>
                  <p className="truncate text-sm text-[var(--text-muted)]">{emailFor(who)}</p>
                  <label className="mt-2 block text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">Acting as</label>
                  <input value={who} onChange={(e) => { onWho(e.target.value); setActor(e.target.value); }} aria-label="Acting as"
                    className="mt-1 h-9 w-full rounded-lg border border-[var(--divider)] bg-[var(--surface)] px-2 text-sm text-[var(--text-heading)]" />
                </div>
              </div>

              {/* Appearance */}
              <div className="flex items-center justify-between border-t border-[var(--divider)] px-4 py-3.5">
                <span className="text-sm text-[var(--text-secondary)]">Appearance</span>
                <ThemeToggle />
              </div>
              <Link href="/help" onClick={() => setOpenMenu(null)} className="flex items-center gap-2 border-t border-[var(--divider)] px-4 py-3.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--search-bg)]"><HelpCircle size={16} />How to use</Link>

              <button type="button" onClick={() => { try { localStorage.removeItem('sd_actor'); } catch { /* storage blocked */ } window.location.assign('/'); }}
                className="flex w-full items-center gap-2 border-t border-[var(--divider)] px-4 py-3.5 text-sm font-medium text-[var(--kpi-bad)] hover:bg-[var(--search-bg)]"><LogOut size={16} />Sign out</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

/** Google-style 3x3 dots. */
function AppsGridIcon({ color }: { color: string }) {
  const positions = [0, 1, 2];
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      {positions.map((row) => positions.map((col) => <circle key={`${row}-${col}`} cx={3 + col * 7} cy={3 + row * 7} r="2" fill={color} />))}
    </svg>
  );
}
