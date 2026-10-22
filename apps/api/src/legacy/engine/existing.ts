/**
 * engine/existing.ts - the existing-system view: for a product that replaces or extends something already running.
 * One row per function of the old system: how it works today (AS-IS), what is wrong, a decision (keep, fix, drop, add, confirm first)
 * and how it should work in the new system (TO-BE). A second person confirms how it works today. A function that is kept, fixed or
 * added can become a feature in one step, linked back to the function it replaces.
 */
import { TERMINAL_STATUSES } from './schema';

const httpErr = (status, message) => Object.assign(new Error(message), { status });
const DECISIONS = { keep: 'Keep as it is', fix: 'Fix', drop: 'Drop', add: 'Add something new', confirm_first: 'Confirm first' };

const featureOf = (store, fn) => {
  for (const l of store.inn(fn.id, 'replaces')) { const f = store.get(l.source); if (f && !TERMINAL_STATUSES.has(f.status)) return f; }
  return null;
};

function overview(store, entry) {
  const mode = (entry && entry.mode) || '';
  const applies = mode === 'existing_system' || store.list('SystemFunction').length > 0;
  const list = store.list('SystemFunction', (i) => !TERMINAL_STATUSES.has(i.status)).sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true })).map((f) => {
    const feat = featureOf(store, f);
    return {
      id: f.id, title: f.title, area: f.area || '', how_it_works: f.how_it_works || '', whats_wrong: f.whats_wrong || '', decision: f.decision || '',
      decision_label: f.decision ? DECISIONS[f.decision] : 'No decision yet', target_behaviour: f.target_behaviour || '', owner: f.owner || '', evidence_note: f.evidence_note || '',
      status: f.status, confirmed: f.status === 'Validated', created_by: f.created_by || '', verified_by: f.verified_by || '',
      feature: feat ? { id: feat.id, title: feat.title, status: feat.status } : null,
      files: store.list('Attachment', (a) => a.target === f.id && a.status !== 'Deleted').map((a) => ({ id: a.id, name: a.filename || a.title })),
      next: nextFor(f, feat),
    };
  });
  const by = (d) => list.filter((f) => f.decision === d).length;
  return {
    applies, mode, functions: list, decisions: DECISIONS,
    counts: {
      total: list.length, confirmed: list.filter((f) => f.confirmed).length, undecided: list.filter((f) => !f.decision).length,
      keep: by('keep'), fix: by('fix'), drop: by('drop'), add: by('add'), confirm_first: by('confirm_first'),
      without_feature: list.filter((f) => ['keep', 'fix', 'add'].includes(f.decision) && !f.feature).length,
      without_target: list.filter((f) => ['fix', 'add'].includes(f.decision) && !f.target_behaviour).length,
    },
  };
}

/** The one thing still to do on a function, in plain words. */
function nextFor(f, feat) {
  if (!f.how_it_works) return 'Write how it works today';
  if (!f.decision) return 'Decide: keep, fix, drop or add';
  if (f.decision === 'confirm_first') return 'Find out, then decide again';
  if (['fix', 'add'].includes(f.decision) && !f.target_behaviour) return 'Write how it should work in the new system';
  if (f.status !== 'Validated') return 'Ask someone who knows the old system to confirm it';
  if (['keep', 'fix', 'add'].includes(f.decision) && !feat) return 'Turn it into a feature';
  return 'Done';
}

/** A second person confirms how the old function really works. The person who wrote it cannot confirm it. */
function confirm(store, id, actor) {
  const f = store.get(id);
  if (!f || f.type !== 'SystemFunction') throw httpErr(404, 'No such function of the old system.');
  if (f.status === 'Validated') return f;
  if (!f.how_it_works) throw httpErr(422, 'Write how it works today first. There is nothing to confirm yet.');
  if (f.created_by && f.created_by === actor) throw httpErr(403, 'You wrote this, so someone else must confirm it. Ask a person who knows the old system.');
  return store.update(id, { status: 'Validated', verification: 'verified', verified_by: actor, verified_on: store.today() }, { actor, strict: false });
}

/** Turn a kept, fixed or added function into a feature linked back to it. */
function makeFeature(store, id, actor) {
  const f = store.get(id);
  if (!f || f.type !== 'SystemFunction') throw httpErr(404, 'No such function of the old system.');
  if (!['keep', 'fix', 'add'].includes(f.decision)) throw httpErr(422, 'Only a function you keep, fix or add becomes a feature. Decide that first.');
  if (featureOf(store, f)) throw httpErr(409, 'This function already has a feature.');
  const desc = [f.decision === 'keep' ? 'Carried over as it works today.' : '', f.target_behaviour || f.how_it_works || ''].filter(Boolean).join(' ');
  const feat = store.create('Feature', { title: f.title, description: desc, priority: f.decision === 'add' ? 'Should' : 'Must', scope_status: 'in', level: 'feature' }, { actor, origin: 'derived' });
  store.link('replaces', feat.id, f.id, {}, { actor });
  return { feature: { id: feat.id, title: feat.title }, function: f.id };
}

export { overview, confirm, makeFeature, DECISIONS };
