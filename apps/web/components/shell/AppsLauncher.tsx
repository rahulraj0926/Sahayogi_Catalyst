'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Star } from 'lucide-react';
import { LAUNCHER_APPS, isLinked, type LauncherApp } from '@/lib/launcher-apps';
import { useLauncherState } from '@/lib/use-launcher-state';

type SortMode = 'alpha' | 'recent';
type Zone = 'favorites' | 'all';
type DropTarget = { zone: Zone; index: number };

function sortApps(apps: LauncherApp[], mode: SortMode, lastUsed: Record<string, number>): LauncherApp[] {
  const copy = [...apps];
  if (mode === 'alpha') copy.sort((a, b) => a.name.localeCompare(b.name));
  else copy.sort((a, b) => (lastUsed[b.id] ?? 0) - (lastUsed[a.id] ?? 0));
  return copy;
}

function AppIcon({ app, size }: { app: LauncherApp; size: number }) {
  const [errored, setErrored] = useState(false);
  const tint = app.fg ?? 'var(--sd-accent)';
  if (app.logoUrl && !errored) {
    return (
      <span className="pointer-events-none block shrink-0 overflow-hidden rounded-xl" style={{ width: size, height: size }}>
        <img src={app.logoUrl} alt="" width={size} height={size} style={{ width: size, height: size }} className="block object-cover" draggable={false} onError={() => setErrored(true)} />
      </span>
    );
  }
  const Icon = app.icon;
  return (
    <span className="pointer-events-none flex shrink-0 items-center justify-center rounded-xl text-sm font-semibold" style={{ width: size, height: size, background: `color-mix(in srgb, ${tint} 14%, transparent)`, color: tint }}>
      {Icon ? <Icon size={Math.round(size * 0.5)} /> : (app.mark ?? app.name.charAt(0).toUpperCase())}
    </span>
  );
}

/** The 9-dot menu: your favorite apps on top, every app below. Edit (pencil) lets you pick favorites and drag them into order. */
export default function AppsLauncher({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { favorites, lastUsed, toggleFavorite, setFavoritesOrder, recordUsed } = useLauncherState();
  const [sortMode, setSortMode] = useState<SortMode>('alpha');
  const [editMode, setEditMode] = useState(false);

  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<DropTarget | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const dragMoved = useRef(false);
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);
  const tileRefs = useRef(new Map<string, HTMLElement>());
  const favoritesGridRef = useRef<HTMLDivElement>(null);
  const allGridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const dragEnabled = editMode;

  const favoriteApps = useMemo(() => favorites.map((id) => LAUNCHER_APPS.find((app) => app.id === id)).filter((app): app is LauncherApp => Boolean(app)), [favorites]);
  const otherApps = useMemo(() => sortApps(LAUNCHER_APPS.filter((app) => !favorites.includes(app.id)), sortMode, lastUsed), [favorites, sortMode, lastUsed]);

  function openApp(app: LauncherApp) {
    recordUsed(app.id);
    onClose();
    if (app.liveUrl) window.open(app.liveUrl, '_blank', 'noopener,noreferrer');
    else if (app.href) router.push(app.href);
  }

  const registerTile = useCallback((id: string, el: HTMLElement | null) => {
    if (el) tileRefs.current.set(id, el);
    else tileRefs.current.delete(id);
  }, []);

  const findInZone = useCallback((x: number, y: number, zone: Zone, list: LauncherApp[], container: HTMLElement | null): DropTarget | null => {
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
    for (let i = 0; i < list.length; i++) {
      const el = tileRefs.current.get(list[i].id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return { zone, index: x < r.left + r.width / 2 ? i : i + 1 };
    }
    return { zone, index: list.length };
  }, []);

  const findDropTarget = useCallback((x: number, y: number): DropTarget | null =>
    findInZone(x, y, 'favorites', favoriteApps, favoritesGridRef.current) ?? findInZone(x, y, 'all', otherApps, allGridRef.current), [findInZone, favoriteApps, otherApps]);

  function commitDrop(id: string, target: DropTarget) {
    if (target.zone === 'all') {
      if (favorites.includes(id)) setFavoritesOrder(favorites.filter((f) => f !== id));
      return;
    }
    const withoutId = favorites.filter((f) => f !== id);
    const index = Math.min(target.index, withoutId.length);
    setFavoritesOrder([...withoutId.slice(0, index), id, ...withoutId.slice(index)]);
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLElement>, app: LauncherApp) {
    if (!dragEnabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragOrigin.current = { x: e.clientX, y: e.clientY };
    dragMoved.current = false;
    setDragId(app.id);
    setPointer({ x: e.clientX, y: e.clientY });
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLElement>) {
    if (!dragId) return;
    if (dragOrigin.current) {
      const dx = e.clientX - dragOrigin.current.x;
      const dy = e.clientY - dragOrigin.current.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragMoved.current = true;
    }
    setPointer({ x: e.clientX, y: e.clientY });
    if (dragMoved.current) setDragOver(findDropTarget(e.clientX, e.clientY));
  }

  function handlePointerUp() {
    if (dragId && dragMoved.current && dragOver) commitDrop(dragId, dragOver);
    setDragId(null);
    setDragOver(null);
    setPointer(null);
    dragOrigin.current = null;
  }

  function handleTileClick(app: LauncherApp) {
    if (dragMoved.current) { dragMoved.current = false; return; }
    if (editMode) { toggleFavorite(app.id); return; }
    if (!isLinked(app)) return;
    openApp(app);
  }

  const draggedApp = dragId ? LAUNCHER_APPS.find((app) => app.id === dragId) ?? null : null;
  const jiggleStyle = (index: number): CSSProperties | undefined => (dragEnabled ? ({ '--jiggle-delay': `${(index % 3) * 0.06}s` } as CSSProperties) : undefined);
  const sortBtn = (mode: SortMode, text: string) => (
    <button type="button" onClick={() => setSortMode(mode)} aria-pressed={sortMode === mode}
      className={`px-2 py-0.5 font-medium transition-colors ${sortMode === mode ? 'bg-[var(--sd-accent)] text-[var(--sd-accent-ink)]' : 'text-[var(--text-muted)] hover:bg-[var(--search-bg)]'}`} style={{ minHeight: 0 }}>{text}</button>
  );

  return (
    <div role="dialog" aria-label="Sahayogi Apps" className="absolute right-[0.3rem] top-[calc(100%+var(--page-pad-y))] z-50 flex max-h-[42rem] w-[28rem] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-xl border border-[var(--divider)] bg-[var(--surface)] shadow-xl">
      <div className="flex shrink-0 items-center justify-between px-4 pt-4">
        <p className="text-sm font-semibold text-[var(--text-heading)]">Sahayogi Apps</p>
        <button type="button" title={editMode ? 'Done editing' : 'Edit favorites'} aria-label={editMode ? 'Done editing' : 'Edit favorites'} onClick={() => setEditMode((v) => !v)}
          className={`tap-pop flex h-7 w-7 items-center justify-center rounded-full transition-colors ${editMode ? 'bg-[var(--sd-accent)] text-[var(--sd-accent-ink)]' : 'text-[var(--text-muted)] hover:bg-[var(--search-bg)]'}`} style={{ minHeight: 0, padding: 0 }}>
          <Pencil size={14} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-3"
        onPointerMove={dragId ? handlePointerMove : undefined} onPointerUp={dragId ? handlePointerUp : undefined} onPointerCancel={dragId ? handlePointerUp : undefined}>
        {favoriteApps.length > 0 && (
          <div className="mb-2 rounded-2xl bg-[var(--search-bg)] p-3">
            <p className="px-1 pb-2 pt-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Your favorites</p>
            <div ref={favoritesGridRef} data-zone="favorites" style={{ gap: 4 }} className={`grid grid-cols-3 rounded-lg pb-1 transition-colors ${dragOver?.zone === 'favorites' ? 'ring-2 ring-[var(--sd-accent)]/30' : ''}`}>
              {favoriteApps.map((app, index) => (
                <button key={app.id} ref={(el) => registerTile(app.id, el)} type="button" onClick={() => handleTileClick(app)} onPointerDown={(e) => handlePointerDown(e, app)}
                  style={{ touchAction: dragEnabled ? 'none' : undefined, minHeight: 0, ...jiggleStyle(index) }}
                  className={`tap-pop flex flex-col items-center gap-2 rounded-lg border-0 bg-transparent px-2 py-3 text-center transition-colors hover:bg-[var(--surface)] ${dragEnabled && dragId !== app.id ? 'launcher-jiggle' : ''} ${dragId === app.id ? 'opacity-30' : !isLinked(app) ? 'opacity-60' : ''}`} title={isLinked(app) ? undefined : 'Not linked yet'}>
                  <span className="relative">
                    <AppIcon app={app} size={52} />
                    {editMode && <span className="pointer-events-none absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--kpi-bad)] text-[0.5rem] text-white">&minus;</span>}
                  </span>
                  <span className="text-[0.6875rem] font-medium leading-tight text-[var(--text-secondary)]">{app.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between px-1 pb-1 pt-2">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--text-muted)]">All apps</p>
          {editMode ? (
            <p className="text-[0.625rem] text-[var(--text-muted)]">Tap to add or remove a favorite, drag to arrange</p>
          ) : (
            <div className="flex overflow-hidden rounded-full border border-[var(--divider)] text-[0.625rem]">{sortBtn('alpha', 'A–Z')}{sortBtn('recent', 'Recent')}</div>
          )}
        </div>

        <div ref={allGridRef} data-zone="all" style={{ gap: 4 }} className={`grid grid-cols-3 rounded-lg pb-2 transition-colors ${dragOver?.zone === 'all' ? 'ring-2 ring-[var(--sd-accent)]/30' : ''}`}>
          {otherApps.map((app, index) => (
            <div key={app.id} ref={(el) => registerTile(app.id, el)} role="button" tabIndex={0} onClick={() => handleTileClick(app)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTileClick(app); } }} onPointerDown={(e) => handlePointerDown(e, app)}
              style={{ touchAction: dragEnabled ? 'none' : undefined, ...jiggleStyle(index) }}
              className={`group relative flex cursor-pointer flex-col items-center gap-2 rounded-lg px-2 py-3 text-center transition-colors hover:bg-[var(--search-bg)] ${dragEnabled && dragId !== app.id ? 'launcher-jiggle' : ''} ${dragId === app.id ? 'opacity-30' : !isLinked(app) ? 'opacity-60' : ''}`} title={isLinked(app) ? undefined : 'Not linked yet'}>
              <button type="button" title="Add to favorites" aria-label={`Add ${app.name} to favorites`} onClick={(e) => { e.stopPropagation(); toggleFavorite(app.id); }}
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border-0 bg-transparent text-[var(--text-muted)] opacity-0 transition-opacity hover:text-[var(--sd-accent)] focus-visible:opacity-100 group-hover:opacity-100" style={{ minHeight: 0, padding: 0 }}>
                <Star size={12} />
              </button>
              <AppIcon app={app} size={46} />
              <span className="text-[0.6875rem] font-medium leading-tight text-[var(--text-secondary)]">{app.name}</span>
            </div>
          ))}
          {otherApps.length === 0 && <p className="col-span-3 px-2 py-4 text-center text-xs text-[var(--text-muted)]">Every app is a favorite.</p>}
        </div>
      </div>

      {draggedApp && pointer && (
        <div className="pointer-events-none fixed z-[60] flex flex-col items-center gap-1 opacity-90" style={{ left: pointer.x - 22, top: pointer.y - 22 }}>
          <AppIcon app={draggedApp} size={44} />
        </div>
      )}
    </div>
  );
}
