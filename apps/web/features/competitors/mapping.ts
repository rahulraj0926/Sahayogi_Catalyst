import { api } from '@/lib/api';

/**
 * Point competitor ratings at one of OUR common features. Only a link is added; the rating keeps the name the competitor uses,
 * so nothing already checked has to be checked again. An old link (the rating already points somewhere) is removed first.
 */
export async function mapRatings(ratingIds: string[], capabilityId: string, oldLinks: Record<string, string> = {}) {
  for (const id of ratingIds) {
    if (oldLinks[id]) await api(`/links/${oldLinks[id]}`, { method: 'DELETE' });
    await api('/links', { method: 'POST', body: { type: 'maps_to', source: id, target: capabilityId } });
  }
}

export async function unmapRating(linkId: string) { await api(`/links/${linkId}`, { method: 'DELETE' }); }

/** Create one of our common features. Returns its id. */
export async function createFeature(name: string, extra: { category?: string; description?: string; aliases?: string[] } = {}) {
  const fields: Record<string, unknown> = { title: name.trim() };
  if (extra.category?.trim()) fields.category = extra.category.trim();
  if (extra.description?.trim()) fields.description = extra.description.trim();
  if (extra.aliases?.length) fields.aliases = extra.aliases;
  const r = await api<any>('/items', { method: 'POST', body: { type: 'Capability', fields } });
  return r.item.id as string;
}
