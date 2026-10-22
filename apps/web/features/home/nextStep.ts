import type { HomeProduct } from './types';

/** "Best next step: Name the sponsor (about 2 minutes)." is buried in a long sentence; pull out just the step. */
export function nextOf(p: HomeProduct): { text: string; min: number | null } {
  const m = /Best next step:\s*(.*?)\s*\(about (\d+) minutes?\)/i.exec(p.nextStep || '');
  if (m) return { text: m[1], min: +m[2] };
  return { text: p.blockers ? `${p.blockers} ${p.blockers === 1 ? 'thing is' : 'things are'} holding up sign-off` : 'Nothing is holding it up', min: null };
}
