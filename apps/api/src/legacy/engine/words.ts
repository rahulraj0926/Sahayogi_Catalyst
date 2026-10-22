/**
 * engine/words.ts - small word helpers for the guided Work screens (record type names in plain words, clipping, lists).
 * The wider "business language" rules (stage sign-offs, what each check needs) live in engine/plain.js; text() here
 * runs those rules first and then swaps record type names for what a layman calls them.
 */
import * as plain from './plain';

/** Record type -> what a layman calls it (singular). */
export const TYPE_WORD: Record<string, string> = {
  IntakeBrief: 'intake summary', PricePoint: 'price', ScopeEntry: 'scope line', CompetitorCapability: 'competitor ability', CompetitorNote: 'competitor note',
  AcceptanceCriterion: 'acceptance test', Story: 'user story', UserStory: 'user story', BusinessRule: 'business rule', Question: 'question', Assumption: 'assumption',
  Constraint: 'limit', Stakeholder: 'person', Evidence: 'source', Obligation: 'law or standard', Requirement: 'requirement', Persona: 'type of user',
  Segment: 'customer group', Job: 'customer job', Opportunity: 'opportunity', Objective: 'goal', Metric: 'success measure', Module: 'part of the product',
  Feature: 'feature', Release: 'release', Capacity: 'team capacity', Flow: 'flow', FlowStep: 'flow step', Entity: 'thing with a life cycle', State: 'state',
  Transition: 'move between states', Decision: 'decision', Experiment: 'test', Risk: 'risk', Artifact: 'document', Insight: 'insight', Problem: 'problem',
  Waiver: 'exception', Condition: 'follow-up', PhaseBudget: 'budget', Competitor: 'competitor', Product: 'product', Actor: 'person or system',
};

export function text(s: unknown): string {
  let out = plain.clean(s);
  for (const [k, v] of Object.entries(TYPE_WORD)) out = out.replace(new RegExp(`\b${k}\b`, 'g'), v);
  return out.replace(/\bID\b/g, 'reference').replace(/\s{2,}/g, ' ').trim();
}
export const typeWord = (t: string | undefined, plural?: boolean): string => {
  const w = TYPE_WORD[t as string] || String(t || 'record').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  if (!plural) return w;
  return /y$/.test(w) ? w.replace(/y$/, 'ies') : /(s|x)$/.test(w) ? w + 'es' : w + 's';
};
export const clip = (s: unknown, n: number): string => { const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '\u2026' : t; };
export const list = (arr: Array<string | null | undefined | false>, max = 4): string => { const a = arr.filter(Boolean); if (a.length <= max) return a.join(', '); return `${a.slice(0, max).join(', ')} and ${a.length - max} more`; };

