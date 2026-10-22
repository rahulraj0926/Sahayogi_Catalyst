/**
 * engine/stories.ts - finishing a user story by hand, and the honesty rules for drafts the tool wrote.
 *
 * A "draft" is a requirement, story, test or flow the tool wrote from the person's answers (origin 'derived'). The tool remembers the exact
 * words it wrote (drafted_text). A draft counts toward a sign-off only after a person has edited it or explicitly kept it as drafted.
 * Keeping it unchanged is allowed (also in bulk) but is recorded ("kept as drafted") and shown as a visible warning.
 *
 * "Complete this story": who it is for (picked from the user types of Stage 1, never a default), what they want, why it matters,
 * the business rules that apply, the tests (at least one normal case and one failure case, each as Given / When / Then) and the requirement it elaborates.
 */
import * as Q from './query';
import * as schema from './schema';
import * as ap from './approvals';
import * as approvals from './approvals';

const httpErr = (status, message, extra?) => Object.assign(new Error(message), { status }, extra || {});
const clean = (s) => String(s === undefined || s === null ? '' : s).replace(/\s+/g, ' ').trim();
const lower1 = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

// ------------------------------------------------------------------ the words the tool writes by itself
const BOILERPLATE = [
  /delivers? its intended value/i, /^\(?say why this matters/i, /^the preconditions? for .* hold/i, /^the user performs the action/i, /^the system fulfils?:/i,
  /^the input is invalid or the user lacks permission/i, /^the user attempts the action/i, /^the system refuses it with a clear error and changes nothing/i,
  /^(write|type) (it|this) here/i, /^to be decided$/i, /^tbd$/i,
];
const isBoilerplate = (t) => { const s = clean(t); return !s || BOILERPLATE.some((re) => re.test(s)); };

/** The words of a draft that a person would rewrite, as one comparable string. */
function signature(it) {
  switch (it.type) {
    case 'Requirement': return clean(it.statement);
    case 'Story': return [clean(it.want), clean(it.benefit)].join(' | ');
    case 'AcceptanceCriterion': return [clean(it.given), clean(it.when), clean(it.then)].join(' | ');
    case 'Flow': return clean(it.goal) + ' | ' + clean(it.title);
    default: return clean(it.title);
  }
}
const DRAFT_TYPES = ['Requirement', 'Story', 'AcceptanceCriterion', 'Flow'];
/** Remember what the tool wrote, so that a later check can tell "rewritten" from "kept as drafted". */
function markDrafted(it) { it.drafted_text = signature(it); return it; }
const isDrafted = (it) => it.origin === 'derived' && typeof it.drafted_text === 'string';
const isUnchanged = (it) => isDrafted(it) && signature(it) === it.drafted_text;
/** A draft that counts (a person accepted it) but still reads exactly as the tool wrote it. */
const isKeptUnchanged = (it) => isUnchanged(it) && !['Draft', 'Rejected', 'Deprecated'].includes(it.status);

/** How many accepted drafts are still word for word what the tool wrote. phase: only that stage (optional). */
function unchangedDraftCount(store, phase?) {
  return store.all().filter((i) => DRAFT_TYPES.includes(i.type) && (phase === undefined || i.phase === phase) && isKeptUnchanged(i)).length;
}
function draftSummary(store) {
  const rows = store.all().filter((i) => DRAFT_TYPES.includes(i.type) && isDrafted(i) && !schema.TERMINAL_STATUSES.has(i.status));
  const waiting = rows.filter((i) => i.status === 'Draft').length;
  const kept = rows.filter(isKeptUnchanged);
  const rewritten = rows.filter((i) => !isUnchanged(i) && i.status !== 'Draft').length;
  return { waiting, kept_unchanged: kept.length, rewritten, kept: kept.slice(0, 20).map((i) => ({ id: i.id, type: i.type, title: i.title })) };
}
const typeWord = { Requirement: 'requirements', Story: 'stories', AcceptanceCriterion: 'tests', Flow: 'flows' };
function draftWarning(store, phase) {
  const kept = store.all().filter((i) => DRAFT_TYPES.includes(i.type) && i.phase === phase && isKeptUnchanged(i));
  if (!kept.length) return null;
  const by = {}; for (const k of kept) by[k.type] = (by[k.type] || 0) + 1;
  const parts = Object.entries(by).map(([t, n]) => `${n} ${n === 1 ? typeWord[t].replace(/ies$/, 'y').replace(/s$/, '') : typeWord[t]}`);
  return { count: kept.length, text: `${kept.length} ${kept.length === 1 ? 'draft was' : 'drafts were'} kept exactly as the tool wrote them (${parts.join(', ')}). They count, but no person has put them in their own words.`, ids: kept.map((k) => k.id).slice(0, 30) };
}

/** Called when a person accepts drafts from a list: record that they were kept as drafted. */
function noteAccepted(store, id, actor) {
  const it = store.get(id);
  if (!it || !isDrafted(it)) return;
  if (isUnchanged(it)) store.update(id, { kept_as_drafted: true, kept_by: actor, kept_on: store.today() }, { actor, silent: true, strict: false });
}
/** Called after a person edits a draft: an edited draft counts, because a person has now put it in words. */
function noteEdited(store, before, actor) {
  const now = store.get(before.id);
  if (!now || !isDrafted(now) || before.status !== 'Draft') return;
  if (signature(now) !== before.drafted_text) store.update(now.id, { status: 'In review', edited_by: actor, edited_on: store.today() }, { actor, silent: true, strict: false });
}

// ------------------------------------------------------------------ the story as one form
const personasOf = (store) => store.list('Persona', (p) => !schema.TERMINAL_STATUSES.has(p.status));
const personaOfStory = (store, id) => { const l = store.out(id, 'for_persona')[0]; return l ? store.get(l.target) : null; };
const requirementOf = (store, id) => { const l = store.out(id, 'elaborates').map((x) => store.get(x.target)).find((x) => x && x.type === 'Requirement'); return l || null; };
const rulesOf = (store, id) => store.inn(id, 'applies').map((l) => store.get(l.source)).filter((x) => x && x.type === 'BusinessRule');
function testsOf(store, story, req) {
  const out = new Map();
  for (const l of store.inn(story.id, 'specifies')) { const a = store.get(l.source); if (a && a.type === 'AcceptanceCriterion') out.set(a.id, a); }
  if (req) for (const l of store.inn(req.id, 'specifies')) { const a = store.get(l.source); if (a && a.type === 'AcceptanceCriterion') out.set(a.id, a); }
  return [...out.values()].filter((a) => !['Rejected', 'Deprecated'].includes(a.status)).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}
const testKind = (a) => (a.scenario_type === 'happy' ? 'happy' : 'negative');

/** What is still missing on a story, in plain words, each with the part of the form that fixes it. */
function missingOf(store, story) {
  const m = [];
  const persona = personaOfStory(store, story.id);
  const req = requirementOf(store, story.id);
  const tests = testsOf(store, story, req);
  const draftedStory = isUnchanged(story) && !story.kept_as_drafted;
  if (!persona) m.push({ part: 'who', text: 'Who it is for: pick one of your user types.' });
  else if (isDrafted(story) && story.origin === 'derived' && !story.edited_by && !story.completed_by) m.push({ part: 'who', text: `Who it is for: the tool guessed "${persona.title}". Confirm it or pick another user type.` });
  if (!clean(story.want) || draftedStory) m.push({ part: 'want', text: 'What they want to do: write it in your own words.' });
  if (isBoilerplate(story.benefit)) m.push({ part: 'why', text: 'Why it matters to them: write the real reason, not the standard sentence.' });
  if (!req) m.push({ part: 'requirement', text: 'The requirement it fulfils: pick one.' });
  if (!tests.some((a) => a.scenario_type === 'happy')) m.push({ part: 'tests', text: 'Tests: write a normal case (what should happen when all goes well).' });
  if (!tests.some((a) => a.scenario_type !== 'happy')) m.push({ part: 'tests', text: 'Tests: write a failure case (what should happen when something goes wrong).' });
  const rough = tests.filter((a) => isBoilerplate(a.given) || isBoilerplate(a.when) || isBoilerplate(a.then) || (a.origin === 'derived' && isUnchanged(a) && !a.kept_as_drafted));
  if (rough.length && tests.length) m.push({ part: 'tests', text: `Tests: ${rough.length} ${rough.length === 1 ? 'test still reads' : 'tests still read'} like the tool's draft. Rewrite ${rough.length === 1 ? 'it' : 'them'} with real situations.` });
  return m;
}

function stateOf(store, story) {
  
  const pending = ap.pendingFor(store, 'story', story.id);
  const hand = store.out(story.id, 'handed_off_as').map((l) => store.get(l.target)).filter((h) => h && !['Superseded', 'Failed', 'Rejected'].includes(h.status));
  const missing = missingOf(store, story);
  let key; let text;
  if (hand.length) { key = 'handed_off'; text = 'Handed over to developers'; }
  else if (['Approved', 'Ready-for-handoff'].includes(story.status)) { key = 'approved'; text = 'Approved'; }
  else if (pending) { key = 'waiting'; text = `Waiting for ${pending.approver} to approve`; }
  else if (!missing.length && ['In review'].includes(story.status)) { key = 'complete'; text = 'Complete, not approved yet'; }
  else if (!missing.length) { key = 'complete'; text = 'Complete, not approved yet'; }
  else { key = 'draft'; text = story.origin === 'derived' && story.status === 'Draft' ? 'Draft, needs your rewrite' : 'Needs completing'; }
  return { key, text, missing, pending: pending ? { id: pending.id, approver: pending.approver } : null, handed_off: hand.map((h) => h.id) };
}

function listStories(store) {
  return store.list('Story', (s) => !['Rejected', 'Deprecated', 'Withdrawn'].includes(s.status)).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })).map((s) => {
    const st = stateOf(store, s); const persona = personaOfStory(store, s.id);
    return { id: s.id, title: s.title, priority: s.priority, status: s.status, persona: persona ? persona.title : null, state: st.key, state_text: st.text, missing: st.missing, pending: st.pending, handed_off: st.handed_off, draft: s.origin === 'derived' && s.status === 'Draft' };
  });
}

/** Everything the "Complete this story" screen shows. */
function storyForm(store, id) {
  const s = store.get(id);
  if (!s || s.type !== 'Story') throw httpErr(404, `No such story: ${id}`);
  const persona = personaOfStory(store, id); const req = requirementOf(store, id);
  const st = stateOf(store, s);
  const rules = rulesOf(store, id).map((r) => r.id);
  return {
    id: s.id, title: s.title, status: s.status, state: st.key, state_text: st.text, missing: st.missing, pending: st.pending, handed_off: st.handed_off,
    draft: s.origin === 'derived' && !s.edited_by && !s.completed_by && isUnchanged(s), draft_label: 'Draft, needs your rewrite',
    persona: persona && !(s.origin === 'derived' && !s.completed_by) ? persona.id : '', persona_guess: !!(persona && s.origin === 'derived' && !s.completed_by), persona_guess_id: persona ? persona.id : '',
    want: isUnchanged(s) && s.origin === 'derived' ? '' : s.want || '', want_draft: s.want || '', benefit: isBoilerplate(s.benefit) ? '' : s.benefit || '', benefit_draft: s.benefit || '',
    requirement: req ? req.id : '', rules,
    tests: testsOf(store, s, req).map((a) => ({ id: a.id, kind: testKind(a), given: a.given || '', when: a.when || '', then: a.then || '', draft: a.origin === 'derived' && isUnchanged(a) && !a.kept_as_drafted, status: a.status })),
    options: {
      personas: personasOf(store).map((p) => ({ value: p.id, label: p.title, hint: [p.primary ? 'main user type' : '', clean(p.goals)].filter(Boolean).join(' - ') })),
      requirements: Q.select(new Q.Ctx(store, {}), { type: 'Requirement', subtype: 'functional' }).map((r) => ({ value: r.id, label: r.title, hint: clean(r.statement).slice(0, 120) })),
      rules: store.list('BusinessRule', (r) => !schema.TERMINAL_STATUSES.has(r.status)).map((r) => ({ value: r.id, label: clean(r.statement).slice(0, 90) || r.title })),
    },
    needs_personas: !personasOf(store).length,
  };
}

/** Save the form. Everything is checked first; nothing is saved when anything is wrong. */
function completeStory(store, id, body, actor) {
  const s = store.get(id);
  if (!s || s.type !== 'Story') throw httpErr(404, `No such story: ${id}`);
  const problems = [];
  const persona = body.persona ? store.get(body.persona) : null;
  if (!persona || persona.type !== 'Persona') problems.push({ field: 'persona', message: 'Pick who this story is for. The list holds the user types you named in Stage 1.' });
  const want = clean(body.want).replace(/^(i want|to)\s+/i, '');
  if (want.length < 6 || isBoilerplate(want)) problems.push({ field: 'want', message: 'Say what they want to do, in your own words (at least a few words).' });
  const benefit = clean(body.benefit);
  if (isBoilerplate(benefit) || benefit.length < 12) problems.push({ field: 'benefit', message: benefit && /intended value/i.test(benefit) ? 'That is the standard sentence the tool writes. Say the real reason it matters to this person.' : 'Say why it matters to them, in a full sentence (at least 12 characters).' });
  const req = body.requirement ? store.get(body.requirement) : null;
  if (!req || req.type !== 'Requirement') problems.push({ field: 'requirement', message: 'Pick the requirement this story fulfils.' });
  const rules = [].concat(body.rules || []).filter(Boolean);
  for (const r of rules) { const it = store.get(r); if (!it || it.type !== 'BusinessRule') problems.push({ field: 'rules', message: 'One of the chosen business rules no longer exists.' }); }
  const tests = (body.tests || []).filter((t) => clean(t.given) || clean(t.when) || clean(t.then));
  tests.forEach((t, i) => {
    const row = i + 1;
    for (const k of ['given', 'when', 'then']) {
      const v = clean(t[k]);
      if (!v) problems.push({ field: 'tests', row, col: k, message: `Test ${row}: fill in the "${k[0].toUpperCase() + k.slice(1)}" sentence.` });
      else if (isBoilerplate(v)) problems.push({ field: 'tests', row, col: k, message: `Test ${row}: the "${k[0].toUpperCase() + k.slice(1)}" sentence is still the tool's standard wording. Write the real situation.` });
    }
  });
  if (!tests.some((t) => t.kind === 'happy')) problems.push({ field: 'tests', message: 'Write at least one normal-case test (everything goes well).' });
  if (!tests.some((t) => t.kind !== 'happy')) problems.push({ field: 'tests', message: 'Write at least one failure-case test (something goes wrong and the tool must cope).' });
  if (problems.length) { const e = httpErr(422, problems.length === 1 ? problems[0].message : `${problems.length} things need fixing: ${problems.slice(0, 3).map((p) => p.message).join(' ')}`, { errors: problems.map((p) => p.message) }); e.validation = { fields: problems }; throw e; }

  // ---- all good: write it
  const snap = JSON.stringify(store.data);
  try {
    store.update(id, { want, benefit, title: `As ${persona.title}, I want to ${want}`.slice(0, 200), status: ['Approved', 'Ready-for-handoff'].includes(s.status) ? s.status : 'In review', completed_by: actor, completed_on: store.today(), edited_by: actor, edited_on: store.today() }, { actor, strict: false });
    for (const l of store.out(id, 'for_persona')) if (l.target !== persona.id) store.unlink(l.id, { actor });
    store.ensureLink('for_persona', id, persona.id, {}, { actor });
    for (const l of store.out(id, 'elaborates')) { const t = store.get(l.target); if (t && t.type === 'Requirement' && t.id !== req.id) store.unlink(l.id, { actor }); }
    store.ensureLink('elaborates', id, req.id, {}, { actor });
    const wanted = new Set(rules);
    for (const l of store.inn(id, 'applies')) { const r = store.get(l.source); if (r && r.type === 'BusinessRule' && !wanted.has(r.id)) store.unlink(l.id, { actor }); }
    for (const r of rules) store.ensureLink('applies', r, id, {}, { actor });
    const keep = new Set();
    for (const t of tests) {
      const f = { given: clean(t.given), when: clean(t.when), then: clean(t.then), scenario_type: t.kind === 'happy' ? 'happy' : 'negative', kind: 'behavioural', verification_method: 'Test' };
      let a = t.id ? store.get(t.id) : null;
      if (a && a.type === 'AcceptanceCriterion') { store.update(a.id, { ...f, title: a.title && !/^(Happy|Failure) path:/.test(a.title) ? a.title : `${t.kind === 'happy' ? 'Normal case' : 'Failure case'}: ${want}`.slice(0, 120), status: ['Approved'].includes(a.status) ? a.status : 'In review', edited_by: actor, edited_on: store.today() }, { actor, strict: false }); } else {
        a = store.create('AcceptanceCriterion', { ...f, title: `${t.kind === 'happy' ? 'Normal case' : 'Failure case'}: ${want}`.slice(0, 120), status: 'In review' }, { actor, origin: 'human' });
      }
      keep.add(a.id);
      store.ensureLink('specifies', a.id, req.id, {}, { actor });
      store.ensureLink('specifies', a.id, id, {}, { actor });
    }
    // tests the person removed from the list (only ones tied to this story or its requirement)
    for (const a of testsOf(store, store.get(id), req)) if (!keep.has(a.id)) store.update(a.id, { status: 'Rejected' }, { actor, silent: true, strict: false });
  } catch (e) { store.replaceData(JSON.parse(snap)); throw e; }
  store.audit('story.completed', id, `${actor} completed the story "${store.get(id).title}"`, { actor });
  return storyForm(store, id);
}

/** Send a complete story to a second person for approval (or approve it at once when the acting person is that second person). */
function submitStory(store, id, approver, actor) {
  const s = store.get(id);
  if (!s || s.type !== 'Story') throw httpErr(404, `No such story: ${id}`);
  const miss = missingOf(store, s);
  if (miss.length) throw httpErr(409, `The story is not complete yet: ${miss[0].text}`, { missing: miss.map((m) => m.text) });
  if (['Approved', 'Ready-for-handoff'].includes(s.status)) throw httpErr(409, 'This story is already approved.');
  
  return approvals.requestStory(store, id, String(approver || '').trim() || (() => { throw httpErr(409, `${actor} completed this story, so someone else has to approve it. Pick the approver.`, { code: 'self_approval' }); })(), actor);
}

export { isBoilerplate, signature, markDrafted, isDrafted, isUnchanged, isKeptUnchanged, unchangedDraftCount, draftSummary, draftWarning, noteAccepted, noteEdited, missingOf, stateOf, listStories, storyForm, completeStory, submitStory, DRAFT_TYPES, lower1 };
