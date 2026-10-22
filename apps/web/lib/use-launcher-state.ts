'use client';
import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_FAVORITES } from './launcher-apps';

const KEY = 'sd_launcher';
type State = { favorites: string[]; lastUsed: Record<string, number> };

function read(): State {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && Array.isArray(raw.favorites)) return { favorites: raw.favorites.filter((x: unknown) => typeof x === 'string'), lastUsed: raw.lastUsed && typeof raw.lastUsed === 'object' ? raw.lastUsed : {} };
  } catch { /* storage blocked or damaged: start from the defaults */ }
  return { favorites: DEFAULT_FAVORITES, lastUsed: {} };
}

/** Favorites and last-used times of the launcher, kept in this browser only. */
export function useLauncherState() {
  const [state, setState] = useState<State>({ favorites: DEFAULT_FAVORITES, lastUsed: {} });
  useEffect(() => { setState(read()); }, []);
  const save = useCallback((next: State) => { setState(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked */ } }, []);
  const setFavoritesOrder = useCallback((favorites: string[]) => save({ ...read(), favorites }), [save]);
  const toggleFavorite = useCallback((id: string) => { const cur = read(); save({ ...cur, favorites: cur.favorites.includes(id) ? cur.favorites.filter((f) => f !== id) : [...cur.favorites, id] }); }, [save]);
  const recordUsed = useCallback((id: string) => { const cur = read(); save({ ...cur, lastUsed: { ...cur.lastUsed, [id]: Date.now() } }); }, [save]);
  return { favorites: state.favorites, lastUsed: state.lastUsed, toggleFavorite, setFavoritesOrder, recordUsed };
}
