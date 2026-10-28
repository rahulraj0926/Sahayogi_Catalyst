import type { IdeaCompetitorRecord, IdeaRecord } from '../types/legacy';
import { failed, inspectUrl } from './url-checker';

/** How many real competitors an idea needs before it may go to the CEO (gates.json params.min_competitors, levels L2 and L3). */
export const MIN_COMPETITORS = 3;
export const MAX_COMPETITORS = 12;
export const PROBLEM_MIN = 10;
export const WHO_FOR_MIN = 3;

export interface IdeaDoor { problem: boolean; who_for: boolean; competitors: { have: number; need: number }; ready: boolean }

/** What an idea still lacks before it can be sent. Computed on the server so the web app never guesses. */
export function doorOf(i: Pick<IdeaRecord, 'problem' | 'who_for' | 'competitors'>): IdeaDoor {
  const problem = (i.problem || '').trim().length >= PROBLEM_MIN;
  const who_for = (i.who_for || '').trim().length >= WHO_FOR_MIN;
  const have = (i.competitors || []).length;
  return { problem, who_for, competitors: { have, need: MIN_COMPETITORS }, ready: problem && who_for && have >= MIN_COMPETITORS };
}

const same = (a: unknown, b: unknown) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
/** Did this person pitch the idea? A plain business rule on the name the request carries; it is not a role. */
export const isPitcher = (idea: Pick<IdeaRecord, 'requester'>, actor: string | null | undefined) => !!actor && same(idea.requester, actor);

export type Normalised = { ok: true; url: string; host: string } | { ok: false; reason: 'bad' | 'unsafe' };

/** A website as a person types it ("acme.com", "https://www.acme.com/pricing#x") made into one absolute address. */
export function normaliseWebsite(raw: string): Normalised {
  const typed = String(raw ?? '').trim();
  if (!typed) return { ok: false, reason: 'bad' };
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(typed) ? typed : `https://${typed}`;
  const seen = inspectUrl(withScheme);
  if (failed(seen)) return seen;
  seen.url.hash = '';
  return { ok: true, url: seen.url.href, host: seen.host };
}

/** The host a competitor is compared by: a leading "www." does not make it a different company. */
export const hostKey = (host: string) => host.replace(/^www\./, '');

/** A link shown to the CEO (a demo or a sketch). It is never opened by the server, so it only has to be a plain http or https address. */
export function normaliseLink(raw: string | null | undefined): string | null | undefined {
  if (raw === null) return null;
  if (raw === undefined) return undefined;
  const typed = raw.trim();
  if (!typed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(typed) ? typed : `https://${typed}`;
  let url: URL;
  try { url = new URL(withScheme); } catch { return undefined; }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password || !url.hostname.includes('.')) return undefined;
  url.hash = '';
  return url.href.slice(0, 300);
}

/** The next competitor id of an idea: one more than the biggest number used so far, so a removed id is never given again. */
export function nextCompetitorId(list: IdeaCompetitorRecord[]): string {
  const biggest = list.reduce((m, c) => Math.max(m, Number(/^CMP-(\d+)$/.exec(c.id)?.[1] ?? 0)), 0);
  return `CMP-${biggest + 1}`;
}
