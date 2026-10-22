'use client';
import { api, useApi } from '@/lib/api';
import type { ActivityPage, Calendar, IdeaList, Kpis, Me, ProductFilters, ProductsPage } from './types';

const qs = (o: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const useKpis = () => useApi<Kpis>('/home/kpis');
export const useMe = () => useApi<Me>('/me');
export const useIdeas = () => useApi<IdeaList>('/ideas');
export const useCalendar = (from: string | null, to: string | null) => useApi<Calendar>(from && to ? `/home/calendar${qs({ from, to })}` : null);
export const useProducts = (f: ProductFilters, pageSize = 10) =>
  useApi<ProductsPage>(`/home/products${qs({ q: f.q.trim(), stage: f.stage, kind: f.kind, health: f.health, owner: f.owner, sort: f.sort, order: f.order, page: f.page, limit: pageSize })}`);

export const fetchActivity = (cursor?: string, limit = 10) => api<ActivityPage>(`/home/activity${qs({ limit, cursor })}`);

export const ideaApi = {
  submit: (one_liner: string) => api('/ideas', { method: 'POST', body: { one_liner } }),
  shortlist: (id: string, on: boolean) => api(`/ideas/${id}/${on ? 'shortlist' : 'unshortlist'}`, { method: 'POST', body: {} }),
  reject: (id: string, reason: string) => api(`/ideas/${id}/reject`, { method: 'POST', body: { reason } }),
  accept: (id: string, body: Record<string, string>) => api<{ productSlug: string }>(`/ideas/${id}/accept`, { method: 'POST', body }),
};
